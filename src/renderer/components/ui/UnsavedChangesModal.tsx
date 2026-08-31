import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

export const UnsavedChangesModal: React.FC = () => {
  const {
    pendingCloseFile,
    cancelCloseFile,
    saveAndCloseFile,
    discardAndCloseFile,
    workspacePath,
  } = useWorkspaceStore();

  if (!pendingCloseFile) return null;

  const fileName = pendingCloseFile.split(/[/\\]/).pop() || pendingCloseFile;
  const relPath = workspacePath
    ? pendingCloseFile.replace(workspacePath, '').replace(/^[/\\]+/, '')
    : pendingCloseFile;

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-editor-bg border border-editor-border rounded-xl shadow-2xl max-w-[460px] w-full p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-editor-text truncate">
              ¿Deseas guardar los cambios en {fileName}?
            </h3>
            <p className="text-[12px] text-editor-textDark leading-relaxed">
              Tus cambios en <span className="font-mono text-editor-text/90">{relPath}</span> se perderán si no los guardas antes de cerrar la pestaña.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-editor-border/40">
          <button
            onClick={() => cancelCloseFile()}
            className="px-3.5 py-1.5 rounded-lg border border-editor-border hover:bg-editor-hover text-editor-text text-[12px] font-medium transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={() => discardAndCloseFile(pendingCloseFile)}
            className="px-3.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-[12px] font-medium transition-colors cursor-pointer"
          >
            No guardar
          </button>
          <button
            onClick={() => saveAndCloseFile(pendingCloseFile)}
            className="px-4 py-1.5 rounded-lg bg-editor-accent hover:bg-editor-accent/90 text-white text-[12px] font-semibold shadow-sm transition-colors cursor-pointer"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
