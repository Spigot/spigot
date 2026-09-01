import { describe, expect, it } from 'vitest';
import {
  hasUnresolvedToolCalls,
  recoverMessageHistory,
  SYNTHETIC_TOOL_CANCEL_MESSAGE,
} from './historyRecovery';
import type { UnifiedMessage } from './types';

describe('historyRecovery', () => {
  it('identifies clean history as having no unresolved tool calls', () => {
    const history: UnifiedMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: 'I will list directory',
        tool_calls: [{ id: 'call_1', name: 'list_dir', input: { dirPath: '.' } }],
      },
      {
        role: 'user',
        content: 'Results',
        tool_results: [{ tool_use_id: 'call_1', name: 'list_dir', content: 'file1.txt' }],
      },
    ];

    expect(hasUnresolvedToolCalls(history)).toBe(false);
    const recovered = recoverMessageHistory(history);
    expect(recovered).toHaveLength(3);
    expect(recovered[2].tool_results).toHaveLength(1);
  });

  it('detects dangling tool calls at the end of conversation history', () => {
    const history: UnifiedMessage[] = [
      { role: 'user', content: 'Create a file' },
      {
        role: 'assistant',
        content: 'Writing file now',
        tool_calls: [
          { id: 'call_a', name: 'write_file', input: { filePath: 'a.txt', content: 'hello' } },
          { id: 'call_b', name: 'read_file', input: { filePath: 'a.txt' } },
        ],
      },
    ];

    expect(hasUnresolvedToolCalls(history)).toBe(true);

    const recovered = recoverMessageHistory(history);
    expect(recovered).toHaveLength(3);
    expect(recovered[2].role).toBe('user');
    expect(recovered[2].tool_results).toHaveLength(2);
    expect(recovered[2].tool_results?.[0]).toEqual({
      tool_use_id: 'call_a',
      name: 'write_file',
      content: SYNTHETIC_TOOL_CANCEL_MESSAGE,
    });
    expect(recovered[2].tool_results?.[1]).toEqual({
      tool_use_id: 'call_b',
      name: 'read_file',
      content: SYNTHETIC_TOOL_CANCEL_MESSAGE,
    });
    expect(hasUnresolvedToolCalls(recovered)).toBe(false);
  });

  it('injects synthetic response when assistant tool call is directly followed by a new user message', () => {
    const history: UnifiedMessage[] = [
      { role: 'user', content: 'Check status' },
      {
        role: 'assistant',
        content: 'Running git status',
        tool_calls: [{ id: 'call_git', name: 'git_status', input: {} }],
      },
      { role: 'user', content: 'Nevermind, do something else' },
    ];

    expect(hasUnresolvedToolCalls(history)).toBe(true);

    const recovered = recoverMessageHistory(history);
    expect(recovered).toHaveLength(4);
    expect(recovered[1].role).toBe('assistant');
    expect(recovered[2].role).toBe('user');
    expect(recovered[2].tool_results).toHaveLength(1);
    expect(recovered[2].tool_results?.[0].tool_use_id).toBe('call_git');
    expect(recovered[3].content).toBe('Nevermind, do something else');
    expect(hasUnresolvedToolCalls(recovered)).toBe(false);
  });

  it('fills in missing tool results when next message has only partial results', () => {
    const history: UnifiedMessage[] = [
      { role: 'user', content: 'Do multiple actions' },
      {
        role: 'assistant',
        content: 'Doing action 1 and 2',
        tool_calls: [
          { id: 'call_1', name: 'read_file', input: { filePath: 'f1.txt' } },
          { id: 'call_2', name: 'read_file', input: { filePath: 'f2.txt' } },
        ],
      },
      {
        role: 'user',
        content: 'Results',
        tool_results: [{ tool_use_id: 'call_1', name: 'read_file', content: 'content of f1' }],
      },
    ];

    expect(hasUnresolvedToolCalls(history)).toBe(true);

    const recovered = recoverMessageHistory(history);
    expect(recovered).toHaveLength(3);
    expect(recovered[2].tool_results).toHaveLength(2);
    expect(recovered[2].tool_results?.[0].tool_use_id).toBe('call_1');
    expect(recovered[2].tool_results?.[0].content).toBe('content of f1');
    expect(recovered[2].tool_results?.[1].tool_use_id).toBe('call_2');
    expect(recovered[2].tool_results?.[1].content).toBe(SYNTHETIC_TOOL_CANCEL_MESSAGE);
    expect(hasUnresolvedToolCalls(recovered)).toBe(false);
  });
});
