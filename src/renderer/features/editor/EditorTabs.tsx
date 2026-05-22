import React from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { X } from 'lucide-react';

export const EditorTabs: React.FC = () => {
  const { openTabs, activeTabPath, setActiveTab, closeFile, dirtyFiles, activeDiffFile } = useWorkspaceStore();

  if (openTabs.length === 0) return null;

  return (
    <div className="h-9 bg-editor-sidebar border-b border-editor-border flex items-center overflow-x-auto select-none no-scrollbar">
      {openTabs.map((path) => {
        const fileName = path.split(/[/\\]/).pop() || '';
        const isActive = activeTabPath === path;
        const isDirty = dirtyFiles.includes(path);
        const isDiffActive = activeDiffFile !== null && activeDiffFile.filePath === path;

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
            {/* File Icon or Diff indicator > */}
            <span className={`font-bold text-[12px] shrink-0 select-none mr-0.5 transition-colors ${isDiffActive ? 'text-amber-500 font-extrabold' : isActive ? 'text-sky-400' : 'text-editor-textDark group-hover:text-sky-400'}`}>
              &gt;
            </span>
            
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
                  closeFile(path);
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
  );
};
export default EditorTabs;
