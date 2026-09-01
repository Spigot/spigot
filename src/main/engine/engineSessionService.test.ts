import { describe, expect, it, vi } from 'vitest';

import {
  mapEngineEventToIpc,
  normalizeEngineEvents,
  type EngineEvent,
} from './types';
import { EngineSessionService } from './EngineSessionService';
import { EngineHistoryStore } from './historyStore';

describe('normalizeEngineEvents', () => {
  it('preserves interleaved typed part ordering', () => {
    const turnId = 'turn-parts';
    const base = { conversationId: 'conversation-1', turnId };
    const events: EngineEvent[] = [
      { type: 'part', turnId, part: { ...base, partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'start', ordinal: 0 } },
      { type: 'part', turnId, part: { ...base, partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'delta', ordinal: 1, text: 'First.' } },
      { type: 'part', turnId, part: { ...base, partId: 'text-1', kind: 'text', lifecycle: 'delta', ordinal: 2, text: 'Answer' } },
      { type: 'part', turnId, part: { ...base, partId: 'reasoning-2', kind: 'reasoning', lifecycle: 'start', ordinal: 3 } },
      { type: 'end', turnId },
    ];

    expect(normalizeEngineEvents(events)).toEqual(events);
    const reasoningDelta = events[1] as Extract<EngineEvent, { type: 'part' }>;
    expect(mapEngineEventToIpc(reasoningDelta)).toEqual({ channel: 'ai:stream-part', payload: reasoningDelta.part });
  });
  it('keeps content/tool/bridge order and appends terminal event last', () => {
    const turnId = 'turn-1';
    const events: EngineEvent[] = [
      { type: 'content', turnId, text: 'hello' },
      { type: 'tool', turnId, id: 'tool-1', name: 'read_file', status: 'start' },
      { type: 'bridge', turnId, name: 'thinking', data: { step: 1 } },
      { type: 'end', turnId, aborted: false },
    ];

    const normalized = normalizeEngineEvents(events);

    expect(normalized.map(event => event.type)).toEqual([
      'content',
      'tool',
      'bridge',
      'end',
    ]);
  });

  it('drops content/tool/bridge events after terminal event', () => {
    const turnId = 'turn-1';
    const events: EngineEvent[] = [
      { type: 'content', turnId, text: 'hello' },
      { type: 'error', turnId, message: 'boom' },
      { type: 'content', turnId, text: 'must-not-pass' },
    ];

    const normalized = normalizeEngineEvents(events);

    expect(normalized).toEqual([
      { type: 'content', turnId, text: 'hello' },
      { type: 'error', turnId, message: 'boom' },
    ]);
  });
});

describe('mapEngineEventToIpc', () => {
  it('keeps current renderer stream channels stable', () => {
    expect(mapEngineEventToIpc({ type: 'content', turnId: 't1', text: 'A' })).toEqual({
      channel: 'ai:stream-chunk',
      payload: 'A',
    });

    expect(mapEngineEventToIpc({
      type: 'tool',
      turnId: 't1',
      id: 'subagent-tool-1',
      name: 'subagent:sdd-propose',
      status: 'start',
      data: { role: 'sdd-propose', model: 'claude-sonnet-4-6' },
    })).toEqual({
      channel: 'ai:stream-tool',
      payload: {
        id: 'subagent-tool-1',
        name: 'subagent:sdd-propose',
        status: 'start',
        data: { role: 'sdd-propose', model: 'claude-sonnet-4-6' },
      },
    });

    expect(mapEngineEventToIpc({ type: 'error', turnId: 't1', message: 'x' })).toEqual({
      channel: 'ai:stream-error',
      payload: 'x',
    });

    expect(mapEngineEventToIpc({ type: 'end', turnId: 't1', aborted: true })).toEqual({
      channel: 'ai:stream-end',
      payload: true,
    });
  });
});

describe('EngineSessionService', () => {
  it('uses provided workspace path in request context and aborts active turn', async () => {
    let resolveTurn: (value: boolean) => void = () => {};
    const startTurn = vi.fn(async (request, onEvent) => {
      expect(request.workspacePath).toBe('C:/repo');
      expect(request.signal.aborted).toBe(false);
      onEvent({ type: 'content', turnId: request.turnId, text: 'ok' });
      return await new Promise<boolean>(resolve => {
        resolveTurn = resolve;
      });
    });

    const adapter = {
      startTurn,
      abortTurn: vi.fn(),
    };

    const service = new EngineSessionService(adapter);
    const emitted: string[] = [];

    const pending = service.startTurn(
      {
        sessionId: 's1',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'hello',
        contextText: null,
        history: [],
        workspacePath: 'C:/repo',
      },
      event => {
        emitted.push(event.type);
      },
    );

    await Promise.resolve();

    expect(emitted).toEqual(['content']);

    service.abortActiveTurn();
    expect(adapter.abortTurn).toHaveBeenCalledTimes(1);

    resolveTurn(false);
    const success = await pending;
    expect(success).toBe(false);
  });

  it('persists content emitted by an enabled engine turn', async () => {
    const historyStore = new EngineHistoryStore();
    const service = new EngineSessionService(
      {
        startTurn: vi.fn(async (request, onEvent) => {
          onEvent({ type: 'content', turnId: request.turnId, text: 'engine response' });
          onEvent({ type: 'end', turnId: request.turnId, aborted: false });
          return true;
        }),
        abortTurn: vi.fn(),
      },
      { enabled: true, historyStore },
    );

    await service.startTurn(
      {
        sessionId: 'content-history',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'hello',
        history: [],
        workspacePath: 'C:/repo',
      },
      () => {},
    );

    await expect(historyStore.load('C:/repo', 'content-history')).resolves.toEqual({
      messages: [{ role: 'assistant', content: 'engine response' }],
      fileHistory: [],
    });
  });

  it('falls back to legacy runner when engine flag is disabled', async () => {
    const legacyRunner = vi.fn(async options => {
      options.sendChunk('legacy');
      options.sendEnd(false);
      return true;
    });

    const service = new EngineSessionService(
      {
        startTurn: vi.fn(),
        abortTurn: vi.fn(),
      },
      { enabled: false, legacyRunner },
    );

    const events: string[] = [];
    const success = await service.startTurn(
      {
        sessionId: 's1',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'hello',
        contextText: null,
        history: [],
        workspacePath: 'C:/repo',
      },
      event => events.push(event.type),
    );

    expect(success).toBe(true);
    expect(legacyRunner).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['content', 'end']);
  });

  it('forwards ordered typed legacy parts with session and turn metadata', async () => {
    const legacyRunner = vi.fn(async options => {
      options.sendPart?.({ partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'start' });
      options.sendPart?.({ partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'delta', text: 'Thinking' });
      options.sendPart?.({ partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'end' });
      options.sendPart?.({ partId: 'text-1', kind: 'text', lifecycle: 'delta', text: 'Answer' });
      options.sendEnd(false);
      return true;
    });
    const service = new EngineSessionService(
      { startTurn: vi.fn(), abortTurn: vi.fn() },
      { enabled: false, legacyRunner },
    );
    const events: EngineEvent[] = [];

    await service.startTurn({
      sessionId: 'conversation-legacy',
      turnId: 'turn-legacy',
      mode: 'plan',
      provider: 'openai',
      model: 'gpt-5',
      apiKey: 'k',
      prompt: 'hello',
      history: [],
      workspacePath: 'C:/repo',
    }, event => events.push(event));

    const parts = events.filter((event): event is Extract<EngineEvent, { type: 'part' }> => event.type === 'part');
    expect(parts.map(event => event.part)).toEqual([
      { partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'start', ordinal: 0, conversationId: 'conversation-legacy', turnId: 'turn-legacy' },
      { partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'delta', text: 'Thinking', ordinal: 1, conversationId: 'conversation-legacy', turnId: 'turn-legacy' },
      { partId: 'reasoning-1', kind: 'reasoning', lifecycle: 'end', ordinal: 2, conversationId: 'conversation-legacy', turnId: 'turn-legacy' },
      { partId: 'text-1', kind: 'text', lifecycle: 'delta', text: 'Answer', ordinal: 3, conversationId: 'conversation-legacy', turnId: 'turn-legacy' },
    ]);
    expect(events.map(event => event.type)).toEqual(['part', 'part', 'part', 'part', 'end']);
  });

  it('opens and closes a no-op staged-change boundary for a legacy turn', async () => {
    const changeSetService = {
      beginTurn: vi.fn(async () => ({ id: 'changeset-1' })),
      closeTurn: vi.fn(),
    };
    const service = new EngineSessionService(
      { startTurn: vi.fn(), abortTurn: vi.fn() },
      {
        enabled: false,
        changeSetService,
        legacyRunner: async options => {
          options.sendEnd(false);
          return true;
        },
      },
    );

    await service.startTurn({
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      mode: 'build',
      provider: 'openai',
      model: 'gpt-5',
      apiKey: 'k',
      prompt: 'hello',
      history: [],
      workspacePath: 'C:/workspace',
    }, () => {});

    expect(changeSetService.beginTurn).toHaveBeenCalledWith({
      turnId: 'turn-1', conversationId: 'conversation-1', workspacePath: 'C:/workspace',
    });
    expect(changeSetService.closeTurn).toHaveBeenCalledWith('turn-1');
  });

  it('emits inline permission request/result events and resolves grant', async () => {
    const adapter = {
      startTurn: vi.fn(async (request, onEvent) => {
        const permissionId = await request.requestToolPermission?.({
          tool: 'read_file',
          input: { filePath: 'README.md' },
        });
        onEvent({ type: 'content', turnId: request.turnId, text: permissionId ? 'granted' : 'denied' });
        onEvent({ type: 'end', turnId: request.turnId, aborted: false });
        return true;
      }),
      abortTurn: vi.fn(),
    };

    const service = new EngineSessionService(adapter);
    const events: string[] = [];

    const run = service.startTurn(
      {
        sessionId: 's1',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'hello',
        contextText: null,
        history: [],
        workspacePath: 'C:/repo',
      },
      event => {
        events.push(event.type);
        if (event.type === 'permission:request') {
          service.resolvePermissionRequest(event.id, 'grant');
        }
      },
    );

    const success = await run;
    expect(success).toBe(true);
    expect(events).toEqual(['permission:request', 'permission:result', 'content', 'end']);
  });

  it('does not duplicate renderer-provided chat history and preserves file-history replay', async () => {
    const histories: unknown[][] = [];
    const fileHistories: unknown[][] = [];
    const adapter = {
      startTurn: vi.fn(async (request, onEvent) => {
        histories.push(request.history);
        fileHistories.push(request.fileHistory ?? []);
        onEvent({ type: 'content', turnId: request.turnId, text: 'assistant-1' });
        if (request.prompt === 'first') {
          onEvent({ type: 'history:file', turnId: request.turnId, path: 'src/main.ts', action: 'snapshot' });
        }
        onEvent({ type: 'end', turnId: request.turnId, aborted: false });
        return true;
      }),
      abortTurn: vi.fn(),
    };

    const service = new EngineSessionService(adapter);

    await service.startTurn(
      {
        sessionId: 's-history',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'first',
        contextText: null,
        history: [{ role: 'user', content: 'first' }],
        workspacePath: 'C:/repo',
      },
      () => {},
    );

    await service.startTurn(
      {
        sessionId: 's-history',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'second',
        contextText: null,
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'assistant-1' },
          { role: 'user', content: 'second' },
        ],
        workspacePath: 'C:/repo',
      },
      () => {},
    );

    expect(histories[0]).toEqual([{ role: 'user', content: 'first' }]);
    expect(histories[1]).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'assistant-1' },
      { role: 'user', content: 'second' },
    ]);
    expect(fileHistories[1]).toEqual([{ path: 'src/main.ts', action: 'snapshot' }]);

    await service.startTurn(
      {
        sessionId: 's-history',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'third',
        contextText: null,
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'assistant-1' },
          { role: 'user', content: 'second' },
          { role: 'assistant', content: 'assistant-1' },
          { role: 'user', content: 'third' },
        ],
        workspacePath: 'C:/repo',
      },
      () => {},
    );

    expect(fileHistories[2]).toEqual([{ path: 'src/main.ts', action: 'snapshot' }]);
  });

  it('suppresses stale events from a replaced turn', async () => {
    const captured: Array<(event: EngineEvent) => void> = [];
    const adapter = {
      startTurn: vi.fn(async (request, onEvent) => {
        captured.push(onEvent);
        if (request.prompt === 'second') {
          onEvent({ type: 'content', turnId: request.turnId, text: 'second-active' });
          onEvent({ type: 'end', turnId: request.turnId, aborted: false });
          return true;
        }

        return await new Promise<boolean>(() => {});
      }),
      abortTurn: vi.fn(),
    };

    const service = new EngineSessionService(adapter);
    const events: string[] = [];

    void service.startTurn(
      {
        sessionId: 's-replace',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'first',
        contextText: null,
        history: [],
        workspacePath: 'C:/repo',
      },
      event => events.push(event.type === 'content' ? event.text : event.type),
    );

    await Promise.resolve();

    await service.startTurn(
      {
        sessionId: 's-replace',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'second',
        contextText: null,
        history: [],
        workspacePath: 'C:/repo',
      },
      event => events.push(event.type === 'content' ? event.text : event.type),
    );

    captured[0]?.({ type: 'content', turnId: 'stale-turn', text: 'stale-content' });
    captured[0]?.({ type: 'tool', turnId: 'stale-turn', id: 'late-tool', name: 'x', status: 'progress' });

    expect(events).toEqual(['second-active', 'end']);
  });

  it('stops forwarding events after cancellation ack', async () => {
    let capturedOnEvent: (event: EngineEvent) => void = () => {};
    let capturedTurnId = '';
    const adapter = {
      startTurn: vi.fn(async (request, onEvent) => {
        capturedOnEvent = onEvent;
        capturedTurnId = request.turnId;
        onEvent({ type: 'content', turnId: request.turnId, text: 'before-cancel' });
        return true;
      }),
      abortTurn: vi.fn(),
    };

    const service = new EngineSessionService(adapter);
    const events: string[] = [];

    await service.startTurn(
      {
        sessionId: 's-cancel',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'first',
        contextText: null,
        history: [],
        workspacePath: 'C:/repo',
      },
      event => events.push(event.type),
    );

    service.abortActiveTurn();
    capturedOnEvent({ type: 'tool', turnId: capturedTurnId, id: 'late-tool', name: 'x', status: 'progress' });
    capturedOnEvent({ type: 'content', turnId: capturedTurnId, text: 'late-content' });

    expect(events).toEqual(['content']);
  });
});
