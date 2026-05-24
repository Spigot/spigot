import { describe, expect, it } from 'vitest';

import { EngineHistoryStore } from './historyStore';

describe('EngineHistoryStore', () => {
  it('persists and loads session and file history entries', async () => {
    const store = new EngineHistoryStore();

    await store.append('workspace-a', 'session-1', {
      messages: [{ role: 'assistant', content: 'done' }],
      fileHistory: [{ path: 'src/main.ts', action: 'snapshot' }],
    });

    const loaded = await store.load('workspace-a', 'session-1');
    expect(loaded.messages).toEqual([{ role: 'assistant', content: 'done' }]);
    expect(loaded.fileHistory).toEqual([{ path: 'src/main.ts', action: 'snapshot' }]);
  });
});
