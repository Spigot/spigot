import React from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useTerminalStore } from '../../store/terminalStore';
import { GitBranch, RefreshCw, AlertCircle, Wifi } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { activeTabPath, dirtyFiles } = useWorkspaceStore();
  const { sessions } = useTerminalStore();

  // Extract file extension and format language nicely
  const getLanguageLabel = (path: string | null): string => {
    if (!path) return 'Text';
    const ext = path.split('.').pop()?.toUpperCase();
    if (ext === 'TS' || ext === 'TSX') return 'TypeScript';
    if (ext === 'JS' || ext === 'JSX') return 'JavaScript';
    return ext || 'Plain Text';
  };

  const activeLang = getLanguageLabel(activeTabPath);
  const dirtyCount = dirtyFiles.length;

  return (
    <footer className="h-5.5 bg-editor-statusBarBg text-editor-text flex items-center justify-between px-3 text-[11px] select-none z-40 shrink-0 font-medium border-t border-editor-border">
      {/* Left section: Git, syncing status */}
      <div className="flex items-center gap-4 text-editor-textDark">
        {/* Mock Git Status */}
        <div className="flex items-center gap-1.5 hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom">
          <GitBranch className="w-3.5 h-3.5 text-editor-text" />
          <span className="text-editor-text font-normal">main</span>
        </div>
        
        {/* Synced status indicator */}
        <div className="flex items-center gap-1.5 hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom">
          <RefreshCw className="w-3 h-3 animate-spin-slow text-editor-text" />
          <span className="font-normal">Sincronizado</span>
        </div>

        {/* Unsaved changes alert banner */}
        {dirtyCount > 0 && (
          <div className="flex items-center gap-1 text-amber-400 animate-pulse font-semibold">
            <AlertCircle className="w-3 h-3" />
            <span>{dirtyCount} archivo(s) sin guardar</span>
          </div>
        )}
      </div>

      {/* Right section: encoding, language, cursor alignment, connection */}
      <div className="flex items-center gap-4 text-editor-textDark">
        {/* Terminal Sessions Status */}
        {sessions.length > 0 && (
          <div className="hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom font-normal">
            PTY Activas: <span className="text-editor-text font-semibold">{sessions.length}</span>
          </div>
        )}

        {/* Text encoding metrics */}
        <div className="hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom font-normal">
          UTF-8
        </div>
        
        {/* Spacings */}
        <div className="hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom font-normal">
          Espacios: 2
        </div>

        {/* Active Monaco Language */}
        <div className="hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom font-semibold text-editor-text">
          {activeLang}
        </div>

        {/* Connection status indicator */}
        <div className="flex items-center gap-1 hover:bg-editor-hover hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-all-custom">
          <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="font-normal">Conectado</span>
        </div>
      </div>
    </footer>
  );
};
export default StatusBar;
