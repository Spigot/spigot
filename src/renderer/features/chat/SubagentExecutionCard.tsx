import React, { useState } from 'react';
import { Bot, Check, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { GENTLE_ROLE_LABELS, type GentleRoleId } from '../../../shared/modelConfiguration';

export interface SubagentExecutionCardProps {
  role?: string;
  model?: string;
  status: 'running' | 'completed' | 'error';
  task?: string;
  output?: string;
  error?: string;
}

export const SubagentExecutionCard: React.FC<SubagentExecutionCardProps> = ({
  role = 'subagent',
  model,
  status,
  task,
  output,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const roleLabel = GENTLE_ROLE_LABELS[role as GentleRoleId] || role;
  const hasDetails = Boolean((output && output.trim()) || (task && task.trim()) || error);

  return (
    <div className="my-1.5 rounded border border-editor-border bg-editor-bg/70 overflow-hidden text-[11px] font-sans">
      <div
        onClick={() => hasDetails && setIsOpen(!isOpen)}
        className={`flex items-center justify-between px-2.5 py-1.5 select-none ${
          hasDetails ? 'cursor-pointer hover:bg-editor-hover/50' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-editor-active/60 text-editor-accent shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-semibold text-editor-text truncate">
              {roleLabel}
            </span>
            <code className="px-1 py-0.2 rounded bg-editor-active font-mono text-[10px] text-editor-textDark border border-editor-border">
              {role}
            </code>
            {model && (
              <span className="text-[10px] text-editor-textDark truncate">
                ({model})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {status === 'running' && (
            <span className="flex items-center gap-1 text-sky-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Ejecutando</span>
            </span>
          )}
          {status === 'completed' && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Check className="w-3 h-3" />
              <span>Completado</span>
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-editor-error font-medium">
              <AlertCircle className="w-3 h-3" />
              <span>Error</span>
            </span>
          )}
          {hasDetails && (
            <button
              type="button"
              className="p-0.5 text-editor-textDark hover:text-editor-text"
              aria-label={isOpen ? 'Ocultar detalles' : 'Ver detalles'}
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {isOpen && hasDetails && (
        <div className="border-t border-editor-border bg-editor-sidebar/50 px-2.5 py-2 flex flex-col gap-1.5 text-[10.5px]">
          {task && (
            <div>
              <span className="font-semibold text-editor-textDark uppercase tracking-wider text-[9.5px]">
                Tarea delegada:
              </span>
              <p className="text-editor-text mt-0.5 whitespace-pre-wrap font-sans">{task}</p>
            </div>
          )}
          {output && (
            <div>
              <span className="font-semibold text-editor-textDark uppercase tracking-wider text-[9.5px]">
                Salida del subagente:
              </span>
              <pre className="mt-0.5 p-2 rounded bg-editor-active/40 text-editor-text font-mono text-[10px] whitespace-pre-wrap max-h-60 overflow-y-auto border border-editor-border/60">
                {output}
              </pre>
            </div>
          )}
          {error && (
            <div className="text-editor-error font-mono text-[10px]">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
