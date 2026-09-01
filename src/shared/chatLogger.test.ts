import { describe, expect, it, vi } from 'vitest';
import { createChatLogger, resolveChatLogLevel, safeChatMetrics } from './chatLogger';

describe('chatLogger', () => {
  it('keeps correlation fields while excluding sensitive values', () => {
    const sink = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = createChatLogger({ console: sink, now: () => 140 });
    const record = log('info', { conversationId: 'conv-1', turnId: 'turn-1', mode: 'build', providerModelId: 'openai/gpt', startedAt: 100 }, 'renderer.stream', 'terminal.accepted', { chunkCount: 3, prompt: 'never log this', outputBytes: 10 });

    expect(record).toMatchObject({ conversationId: 'conv-1', turnId: 'turn-1', mode: 'build', providerModelId: 'openai/gpt', phase: 'renderer.stream', eventType: 'terminal.accepted', elapsedMs: 40, metrics: { chunkCount: 3, prompt: null, outputBytes: 10 } });
    expect(JSON.stringify(sink.info.mock.calls)).not.toContain('never log this');
  });

  it('gates debug diagnostics at the configured level', () => {
    const sink = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = createChatLogger({ level: 'info', console: sink });
    expect(log('debug', {}, 'renderer.stream', 'chunk.batch')).toBeUndefined();
    expect(sink.debug).not.toHaveBeenCalled();
    expect(resolveChatLogLevel('debug')).toBe('debug');
    expect(safeChatMetrics({ apiKey: 'secret', contextBytes: 2, enabled: true, label: 'nope' })).toEqual({ apiKey: null, contextBytes: 2, enabled: true, label: null });
  });
});
