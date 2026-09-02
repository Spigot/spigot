import React from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useTerminalStore } from '../../store/terminalStore';
import { X, Globe, Play } from 'lucide-react';
import { findPath, isPathAtOrWithin, normalizedPath, pathsEqual } from '../../pathIdentity';

export const EditorTabs: React.FC = () => {
  const { openTabs, activeTabPath, setActiveTab, requestCloseFile, dirtyFiles, activeDiffFile, workspacePath } = useWorkspaceStore();
  const { isConsoleOpen, toggleConsole } = useLayoutStore();
  const { sessions, activeSessionId, createSession } = useTerminalStore();

  if (openTabs.length === 0) return null;

  const getRunnableCommand = (filePath: string | null) => {
    if (!filePath || filePath.startsWith('browser://')) return null;
    
    let targetPath = filePath;
    if (workspacePath && isPathAtOrWithin(filePath, workspacePath)) {
      const rel = normalizedPath(filePath).slice(normalizedPath(workspacePath).length).replace(/^\/+/, '');
      targetPath = `./${rel}`;
    }

    const lower = filePath.toLowerCase();
    if (lower.endsWith('.py')) return `python "${targetPath}"`;
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return `node "${targetPath}"`;
    if (lower.endsWith('.ts')) return `npx ts-node "${targetPath}"`;
    if (lower.endsWith('.sh')) return `bash "${targetPath}"`;
    if (lower.endsWith('.ps1')) return `powershell -ExecutionPolicy Bypass -File "${targetPath}"`;
    return null;
  };

  const activeCommand = getRunnableCommand(activeTabPath);

  const handleRunActiveFile = async () => {
    if (!activeCommand) return;

    if (!isConsoleOpen) {
      toggleConsole();
    }

    let isNew = false;
    let targetSessionId = activeSessionId;
    if (!targetSessionId || sessions.length === 0) {
      isNew = true;
      targetSessionId = await createSession(80, 24, workspacePath || '');
    }

    if (targetSessionId) {
      setTimeout(() => {
        try {
          (window as any).api?.terminal?.write?.(targetSessionId, `${activeCommand}\r`);
        } catch (err) {
          console.error('Error running active file in terminal:', err);
        }
      }, isNew ? 400 : 50);
    }
  };

  return (
    <div className="h-9 bg-editor-sidebar border-b border-editor-border flex items-center justify-between select-none overflow-hidden">
      {/* Tabs scroll area */}
      <div className="flex items-center h-full overflow-x-auto no-scrollbar flex-1">
        {openTabs.map((path) => {
          const isBrowser = path.startsWith('browser://');
          const fileName = isBrowser ? 'Navegador Web' : (path.split(/[/\\]/).pop() || '');
          const isActive = activeTabPath !== null && pathsEqual(activeTabPath, path);
          const isDirty = findPath(dirtyFiles, path) !== undefined;
          const isDiffActive = activeDiffFile !== null && pathsEqual(activeDiffFile.filePath, path);

          return (
            <div
              key={path}
              onClick={() => setActiveTab(path)}
              className={`h-full flex items-center gap-2 px-3 border-r border-editor-border cursor-pointer group text-xs transition-all-custom shrink-0 ${
                isActive 
                  ? 'bg-editor-bg text-white border-t-2 border-t-editor-accent font-semibold' 
                  : 'bg-editor-tabInactive text-editor-textDark hover:bg-zinc-800/60 hover:text-editor-text'
              }`}
            >
              {/* File Icon or Diff indicator > or browser globe */}
              {isBrowser ? (
                <Globe className="w-3.5 h-3.5 shrink-0 mr-0.5 text-zinc-400 select-none" />
              ) : (
                <span className={`font-bold text-[12px] shrink-0 select-none mr-0.5 transition-colors ${isDiffActive ? 'text-amber-500 font-extrabold' : isActive ? 'text-sky-400' : 'text-editor-textDark group-hover:text-sky-400'}`}>
                  &gt;
                </span>
              )}
              
              {/* File Name */}
              <span className="truncate max-w-[120px]">{fileName}</span>

              {/* Dirty Marker / Tab Close Actions */}
              <div className="w-4 h-4 flex items-center justify-center relative">
                {isDirty ? (
                  // Pulse dot indicating unsaved changes
                  <span className="w-2.5 h-2.5 bg-editor-accent rounded-full shrink-0 group-hover:hidden animate-pulse" />
                ) : null}

                {/* Close Button (shows on hover or always if active) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    requestCloseFile(path);
                  }}
                  className={`p-0.5 rounded hover:bg-editor-hover text-editor-textDark hover:text-white shrink-0 ${
                    isActive || isDirty ? 'flex' : 'hidden group-hover:flex'
                  }`}
                  title="Cerrar pestaña"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Run Code in Integrated Terminal button */}
      {activeCommand && (
        <div className="flex items-center px-2 shrink-0 border-l border-editor-border bg-editor-sidebar h-full">
          <button
            onClick={handleRunActiveFile}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold transition-all shadow-sm cursor-pointer"
            title={`Ejecutar directamente en la terminal integrada (${activeCommand})`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Ejecutar</span>
          </button>
        </div>
      )}
    </div>
  );
};
export default EditorTabs;
