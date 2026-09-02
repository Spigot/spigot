import React, { useEffect, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { GENTLE_ROLE_LABELS, type GentleRoleId } from '../../../shared/modelConfiguration';
import { useAIStore } from '../../store/aiStore';
import { findRunningSubagent } from './activeSubagent';

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, '0')}s` : `${rest}s`;
}

/**
 * Live strip shown right below the chat header while a subagent delegated by
 * the orchestrator is working (VS Code-style agent status).
 */
export const SubagentStatusBar: React.FC = () => {
  const tools = useAIStore(state => state.activeStreams[state.activeConversationId ?? '']?.tools);
  const running = findRunningSubagent(tools);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running?.id]);

  if (!running) return null;

  const elapsedSeconds = Math.max(0, Math.round((now - running.startedAt) / 1000));
  const label = running.roleName || GENTLE_ROLE_LABELS[running.role as GentleRoleId] || running.role;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-editor-border bg-editor-bg/80 text-[11px] select-none"
      role="status"
      aria-label="Subagente en ejecución"
      data-testid="subagent-status-bar"
    >
      <div className="p-1 rounded bg-editor-active/60 text-editor-accent shrink-0">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <span className="font-semibold text-editor-text shrink-0">Subagente:</span>
      <span className="font-semibold text-editor-accent truncate">{label}</span>
      <code className="px-1 rounded bg-editor-active font-mono text-[10px] text-editor-textDark border border-editor-border shrink-0">
        {running.role}
      </code>
      {running.model && (
        <span className="text-[10px] text-editor-textDark truncate shrink-0">· {running.model}</span>
      )}
      {running.task && (
        <span className="text-editor-textDark truncate min-w-0 flex-1" title={running.task}>
          — {running.task}
        </span>
      )}
      <span className="ml-auto flex items-center gap-1.5 shrink-0 text-sky-400 font-medium">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Trabajando</span>
        <span className="text-editor-textDark font-normal tabular-nums">{formatElapsed(elapsedSeconds)}</span>
      </span>
    </div>
  );
};

export default SubagentStatusBar;
