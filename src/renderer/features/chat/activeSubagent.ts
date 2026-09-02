import type { ToolCallState } from '../../store/aiStore';

export interface ActiveSubagentInfo {
  id: string;
  role: string;
  roleName?: string;
  group?: string;
  provider?: string;
  model?: string;
  task?: string;
  startedAt: number;
  status: 'running';
}

const SUBAGENT_PREFIX = 'subagent:';

/**
 * Finds the subagent currently executing within a turn's tool stream.
 * SubagentRoleRunner emits `subagent:<role>` tool events with status start/end;
 * scanning backwards, only the most recent subagent event matters because the
 * orchestrator delegates sequentially.
 */
export function findRunningSubagent(tools: ToolCallState[] | undefined | null): ActiveSubagentInfo | null {
  if (!tools || tools.length === 0) return null;

  for (let index = tools.length - 1; index >= 0; index--) {
    const tool = tools[index];
    if (!tool.name?.startsWith(SUBAGENT_PREFIX)) continue;

    if (tool.status !== 'start') return null;

    const data = (tool.data ?? {}) as Record<string, unknown>;
    const input = (data.input ?? {}) as Record<string, unknown>;
    return {
      id: tool.id,
      role: typeof data.role === 'string' ? data.role : tool.name.slice(SUBAGENT_PREFIX.length),
      roleName: typeof data.roleName === 'string' ? data.roleName : undefined,
      group: typeof data.group === 'string' ? data.group : undefined,
      provider: typeof data.provider === 'string' ? data.provider : undefined,
      model: typeof data.model === 'string' ? data.model : undefined,
      task: typeof input.task === 'string' ? input.task : undefined,
      startedAt: tool.timestamp,
      status: 'running',
    };
  }
  return null;
}
