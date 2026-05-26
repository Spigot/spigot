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
        mode: 'chat',
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
    expect(events).toEqual(['content', 'tool', 'bridge', 'tool', 'end']);
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
        mode: 'chat',
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
});
