import { describe, expect, it } from 'vitest';

import { SpigotChatsEngineAdapter } from './SpigotChatsEngineAdapter';

describe('SpigotChatsEngineAdapter', () => {
  it('emits tool and bridge activity events from runtime hooks (mcp/plugins path)', async () => {
    const adapter = new SpigotChatsEngineAdapter({
      runtime: {
        executeTurn: async ({ onEvent }) => {
          onEvent({ type: 'content', text: 'starting' });
          onEvent({ type: 'tool', id: 'tool-1', name: 'mcp.search', status: 'start' });
          onEvent({ type: 'bridge', name: 'plugin:activity', data: { plugin: 'code-review' } });
          onEvent({ type: 'tool', id: 'tool-1', name: 'mcp.search', status: 'end' });
          onEvent({ type: 'end', aborted: false });
          return true;
        },
      },
    });

    const events: string[] = [];
    const success = await adapter.startTurn(
      {
        turnId: 'turn-1',
        sessionId: 'session-1',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'hi',
        history: [],
        workspacePath: 'C:/repo',
        signal: new AbortController().signal,
      },
      event => events.push(event.type),
    );

    expect(success).toBe(true);
    expect(events).toEqual(['content', 'part', 'tool', 'bridge', 'tool', 'end']);
  });

  it('ignores runtime events after terminal event', async () => {
    const adapter = new SpigotChatsEngineAdapter({
      runtime: {
        executeTurn: async ({ onEvent }) => {
          onEvent({ type: 'end', aborted: false });
          onEvent({ type: 'content', text: 'must-not-forward' });
          return true;
        },
      },
    });

    const events: string[] = [];
    await adapter.startTurn(
      {
        turnId: 'turn-2',
        sessionId: 'session-2',
        mode: 'plan',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'k',
        prompt: 'hi',
        history: [],
        workspacePath: 'C:/repo',
        signal: new AbortController().signal,
      },
      event => events.push(event.type),
    );

    expect(events).toEqual(['end']);
  });

  it('forwards the engine mode to the legacy runner', async () => {
    let receivedMode: string | undefined;
    const adapter = new SpigotChatsEngineAdapter({
      legacyRunner: async (options) => {
        receivedMode = options.mode;
        options.sendEnd();
        return true;
      },
    });

    await adapter.startTurn(
      {
        turnId: 'turn-3', sessionId: 'session-3', mode: 'review', provider: 'openai', model: 'gpt-5',
        apiKey: 'k', prompt: 'hi', history: [], workspacePath: 'C:/repo', signal: new AbortController().signal,
      },
      () => undefined,
    );

    expect(receivedMode).toBe('review');
  });
});
