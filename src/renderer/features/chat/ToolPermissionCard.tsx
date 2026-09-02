import React from 'react';
import { Check, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useAIStore, type PendingPermission } from '../../store/aiStore';

const TOOL_LABELS: Record<string, string> = {
  run_command: 'Ejecutar comando en la terminal',
  move_file: 'Mover o renombrar un archivo',
};

function describeInput(tool: string, input: PendingPermission['input']): string | null {
  if (!input || typeof input !== 'object') return null;
  if (tool === 'run_command' && typeof (input as any).command === 'string') {
    return `$ ${(input as any).command}`;
  }
  if (tool === 'move_file') {
    const source = (input as any).sourcePath;
    const target = (input as any).targetPath;
    if (typeof source === 'string' || typeof target === 'string') {
      return `${source ?? '?'} → ${target ?? '?'}`;
    }
  }
  return null;
}

const BUTTON_CLASS = 'flex items-center gap-1 rounded px-2 py-1 font-semibold transition-colors cursor-pointer';

/**
 * In-chat tool confirmation, like VS Code agent mode: gated tools pause the
 * turn until the user allows them once, always (this conversation), grants
 * full permission, or rejects the call.
 */
export const ToolPermissionCard: React.FC = () => {
  const pendingPermissions = useAIStore(state => state.pendingPermissions);
  const respondPermission = useAIStore(state => state.respondPermission);

  if (pendingPermissions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" aria-label="Confirmaciones de herramientas pendientes">
      {pendingPermissions.map((permission) => {
        const detail = describeInput(permission.tool, permission.input);
        return (
          <div
            key={permission.id}
            data-testid="tool-permission-card"
            className="rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-[11px]"
            role="alertdialog"
            aria-label={`Confirmar ${permission.tool}`}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-semibold text-amber-200">{TOOL_LABELS[permission.tool] ?? permission.tool}</span>
              <span className="text-amber-200/70">— ¿Lo permitís?</span>
            </div>
            {detail && (
              <pre className="mt-1.5 px-2 py-1 rounded bg-black/30 font-mono text-[11px] text-editor-text overflow-x-auto whitespace-pre-wrap select-text">
                {detail}
              </pre>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => respondPermission(permission.id, 'once')}
                className={`${BUTTON_CLASS} bg-editor-accent text-editor-sidebar hover:brightness-110`}
              >
                <Check className="w-3 h-3" />
                Permitir una vez
              </button>
              <button
                type="button"
                onClick={() => respondPermission(permission.id, 'always')}
                title="Auto-aprobar esta herramienta para esta conversación durante la sesión"
                className={`${BUTTON_CLASS} border border-editor-border text-editor-text hover:bg-editor-hover`}
              >
                <ShieldCheck className="w-3 h-3" />
                Permitir siempre
              </button>
              <button
                type="button"
                onClick={() => respondPermission(permission.id, 'full')}
                title="Auto-aprobar todas las herramientas con confirmación para esta conversación durante la sesión"
                className={`${BUTTON_CLASS} border border-editor-border text-editor-text hover:bg-editor-hover`}
              >
                <Sparkles className="w-3 h-3" />
                Permiso total
              </button>
              <button
                type="button"
                onClick={() => respondPermission(permission.id, 'denied')}
                title="El agente continuará sin ejecutar esta herramienta"
                className={`${BUTTON_CLASS} border border-editor-border text-editor-error hover:bg-editor-hover`}
              >
                <X className="w-3 h-3" />
                Rechazar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ToolPermissionCard;
