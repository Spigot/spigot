import { describe, expect, it } from 'vitest';
import { findRunningSubagent } from './activeSubagent';
import type { ToolCallState } from '../../store/aiStore';

function tool(overrides: Partial<ToolCallState>): ToolCallState {
  return {
    id: overrides.id ?? 'tool-1',
    name: overrides.name ?? 'read_file',
    status: overrides.status ?? 'end',
    data: overrides.data,
    timestamp: overrides.timestamp ?? 1_000,
  };
}

describe('findRunningSubagent', () => {
  it('returns null when there are no tools or no subagent events', () => {
    expect(findRunningSubagent(undefined)).toBeNull();
    expect(findRunningSubagent([])).toBeNull();
    expect(findRunningSubagent([tool({ name: 'read_file', status: 'start' })])).toBeNull();
  });

  it('detects a running subagent with its role, model and task', () => {
    const running = findRunningSubagent([
      tool({ name: 'delegate_subagent', status: 'end' }),
      tool({
        id: 'subagent-sdd-apply-turn-1',
        name: 'subagent:sdd-apply',
        status: 'start',
        timestamp: 5_000,
        data: {
          role: 'sdd-apply',
          roleName: 'SDD: Aplicación',
          group: 'SDD',
          provider: 'minimax',
          model: 'MiniMax-M3',
          input: { task: 'Implementar el módulo de pagos', context: 'src/payments' },
        },
      }),
    ]);

    expect(running).not.toBeNull();
    expect(running?.id).toBe('subagent-sdd-apply-turn-1');
    expect(running?.role).toBe('sdd-apply');
    expect(running?.roleName).toBe('SDD: Aplicación');
    expect(running?.model).toBe('MiniMax-M3');
    expect(running?.task).toBe('Implementar el módulo de pagos');
    expect(running?.startedAt).toBe(5_000);
    expect(running?.status).toBe('running');
  });

  it('returns null when the most recent subagent already finished', () => {
    expect(findRunningSubagent([
      tool({
        id: 'subagent-sdd-apply-turn-1',
        name: 'subagent:sdd-apply',
        status: 'start',
        data: { role: 'sdd-apply' },
      }),
      tool({
        id: 'subagent-sdd-apply-turn-1',
        name: 'subagent:sdd-apply',
        status: 'end',
        data: { role: 'sdd-apply', success: true },
      }),
    ])).toBeNull();
  });

  it('picks the running delegate during sequential delegations', () => {
    const running = findRunningSubagent([
      tool({ id: 'a', name: 'subagent:sdd-explore', status: 'end' }),
      tool({ id: 'b', name: 'subagent:sdd-spec', status: 'end' }),
      tool({ id: 'c', name: 'subagent:jd-judge-a', status: 'start', timestamp: 9_000, data: { role: 'jd-judge-a' } }),
    ]);

    expect(running?.id).toBe('c');
    expect(running?.role).toBe('jd-judge-a');
  });

  it('falls back to the role embedded in the event name when data is missing', () => {
    const running = findRunningSubagent([
      tool({ id: 'x', name: 'subagent:review-risk', status: 'start' }),
    ]);

    expect(running?.role).toBe('review-risk');
    expect(running?.roleName).toBeUndefined();
  });
});
