import { describe, expect, it, vi } from 'vitest';

import {
  mapEngineEventToIpc,
  normalizeEngineEvents,
  type EngineEvent,
} from './types';
import { EngineSessionService } from './EngineSessionService';

describe('normalizeEngineEvents', () => {
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
    let resolveTurn: ((value: boolean) => void) | null = null;
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
        mode: 'chat',
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

    expect(emitted).toEqual(['content']);

    service.abortActiveTurn();
    expect(adapter.abortTurn).toHaveBeenCalledTimes(1);

    resolveTurn?.(false);
    const success = await pending;
    expect(success).toBe(false);
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
        mode: 'chat',
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
        mode: 'chat',
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
});
