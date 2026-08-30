import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTerminalStore } from '../../store/terminalStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useDiagnosticsStore } from '../../store/diagnosticsStore';
import { 
  Trash2, Plus, Terminal as TermIcon, Minimize2, Maximize2, 
  AlertCircle, AlertTriangle, X
} from 'lucide-react';
import 'xterm/css/xterm.css';

// Xterm adaptive themes mapping
const getXtermTheme = (themeName: 'spigot-dark' | 'grayish-dark' | 'solarized-dark') => {
  switch (themeName) {
    case 'grayish-dark':
      return {
        background: '#14161d',
        foreground: '#d4d4d8',
        cursor: '#9ca3af',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
      };
    case 'solarized-dark':
      return {
        background: '#002b36',
        foreground: '#eee8d5',
        cursor: '#268bd2',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
      };
    case 'spigot-dark':
    default:
      return {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#007acc',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
      };
  }
};

const getRelativePath = (fullPath: string, rootPath: string | null) => {
  if (!rootPath) return fullPath;
  const root = rootPath.replace(/\\/g, '/');
  const full = fullPath.replace(/\\/g, '/');
  if (full.startsWith(root)) {
    return full.slice(root.length).replace(/^\/+/, '');
  }
  return full;
};

const getFileParts = (filePath: string, rootPath: string | null) => {
  const relativePath = getRelativePath(filePath, rootPath);
  const normalized = relativePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) {
    return { name: normalized, dir: '' };
  }
  return {
    name: normalized.slice(lastSlash + 1),
    dir: normalized.slice(0, lastSlash)
  };
};

export const ConsolePanel: React.FC = () => {
  const { 
    isConsoleOpen, isConsoleMaximized, toggleConsole, toggleConsoleMaximize,
    consoleHeight 
  } = useLayoutStore();
  const { sessions, activeSessionId, createSession, closeSession } = useTerminalStore();
  const { workspacePath, theme, openFile, setPendingSelection } = useWorkspaceStore();
  
  // Subscribe to LSP Diagnostics store reactively
  const fileDiagnostics = useDiagnosticsStore((state) => state.fileDiagnostics);
  const [activePanelTab, setActivePanelTab] = useState<'problems' | 'output' | 'debug' | 'terminal' | 'ports'>('terminal');
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const toggleFileCollapsed = (uri: string) => {
    setCollapsedFiles(prev => ({
      ...prev,
      [uri]: !prev[uri]
    }));
  };

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstances = useRef<Record<string, { term: XTerm; fit: FitAddon; disposeData: () => void }>>({});

  // Initialize terminal session if none exists on open
  useEffect(() => {
    if (isConsoleOpen && sessions.length === 0) {
      createSession(80, 24, workspacePath || '');
    }
  }, [isConsoleOpen, sessions.length, createSession, workspacePath]);

  // Handle active session mount or switch
  useEffect(() => {
    if (!isConsoleOpen || !activeSessionId || !terminalRef.current) return;

    // Check if terminal instance for this activeSessionId exists
    if (!xtermInstances.current[activeSessionId]) {
      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "Consolas, 'Courier New', monospace",
        theme: getXtermTheme(theme),
        allowTransparency: true,
        convertEol: true,
        rows: 24,
        cols: 80,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      // Mount into the DOM container
      term.open(terminalRef.current);
      
      // Delay initial fit slightly to ensure parent dimensions are computed
      setTimeout(() => {
        try {
          fit.fit();
          (window as any).api.terminal.resize(activeSessionId, term.cols, term.rows);
        } catch (e) {}
      }, 30);

      // Listen for data from the browser xterm frontend and forward to IPC
      const onDataDisposable = term.onData((data) => {
        (window as any).api.terminal.write(activeSessionId, data);
      });

      // Listen for data from the node-pty backend process and write to xterm
      const removeIncomingListener = (window as any).api.terminal.onData(activeSessionId, (data: string) => {
        term.write(data);
      });

      xtermInstances.current[activeSessionId] = {
        term,
        fit,
        disposeData: () => {
          onDataDisposable.dispose();
          removeIncomingListener();
          term.dispose();
        }
      };
    } else {
      // Re-attach existing terminal to the container if activeSessionId changed
      const { term, fit } = xtermInstances.current[activeSessionId];
      if (terminalRef.current && term.element && !terminalRef.current.contains(term.element)) {
        terminalRef.current.innerHTML = '';
        terminalRef.current.appendChild(term.element);
        setTimeout(() => {
          try {
            fit.fit();
          } catch (e) {}
        }, 30);
      }
    }
  }, [isConsoleOpen, activeSessionId]);

  // Handle closing a terminal session
  const handleCloseTerminal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (xtermInstances.current[id]) {
      xtermInstances.current[id].disposeData();
      delete xtermInstances.current[id];
    }
    closeSession(id);
  };

  // Add a new terminal session
  const handleAddNewTerminal = async () => {
    await createSession(80, 24, workspacePath || '');
  };

  // Update theme dynamically in mounted xterm instance
  useEffect(() => {
    if (activeSessionId && xtermInstances.current[activeSessionId]) {
      const term = xtermInstances.current[activeSessionId].term;
      term.options.theme = getXtermTheme(theme);
    }
  }, [theme, activeSessionId]);

  // Handle auto-fit when maximizing, resizing, or switching tabs
  useEffect(() => {
    let t1: NodeJS.Timeout | undefined;
    let t2: NodeJS.Timeout | undefined;

    if (activeSessionId && xtermInstances.current[activeSessionId]) {
      const { term, fit } = xtermInstances.current[activeSessionId];
      
      const performResize = () => {
        try {
          fit.fit();
          (window as any).api.terminal.resize(activeSessionId, term.cols, term.rows);
          term.refresh(0, term.rows - 1);
        } catch (e) {}
      };

      performResize();
      t1 = setTimeout(performResize, 50);
      t2 = setTimeout(performResize, 150);
    }

    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [isConsoleMaximized, isConsoleOpen, activeSessionId, activePanelTab]);

  if (!isConsoleOpen) return null;

  // Process LSP Problems counts and groups reactively
  const problemsList = Object.values(fileDiagnostics).filter(f => f.diagnostics.length > 0);
  let errorsCount = 0;
  let warningsCount = 0;
  for (const file of problemsList) {
    for (const diag of file.diagnostics) {
      if (diag.severity === 1) {
        errorsCount++;
      } else {
        warningsCount++;
      }
    }
  }
  const totalProblemsCount = errorsCount + warningsCount;

  // Navigates directly to the problem in editor
  const handleProblemClick = async (filePath: string, line: number, character: number) => {
    await openFile(filePath);
    setPendingSelection({
      filePath,
      line: line + 1,
      column: character + 1,
      length: 1
    });
  };

  return (
    <div 
      style={isConsoleMaximized ? { height: '100%' } : { height: `${consoleHeight}px` }}
      className="bg-editor-bg border border-editor-border rounded-[6px] flex flex-col z-20 relative overflow-hidden font-sans shadow-sm shrink-0"
    >
      {/* Header menu with VS Code-style Tabs (Problems, Output, Debug, Terminal, Ports) */}
      <div className="h-[30px] min-h-[30px] bg-editor-bg border-b border-editor-border px-3 flex items-center justify-between select-none text-[12px]">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActivePanelTab('problems')}
            className={`px-2 py-0.5 rounded-[3px] transition-colors flex items-center gap-1.5 ${
              activePanelTab === 'problems'
                ? 'text-white font-medium bg-editor-hover/70'
                : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover/40'
            }`}
          >
            <span>Problems</span>
            {totalProblemsCount > 0 && (
              <span className="px-1.5 py-0 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300">
                {totalProblemsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActivePanelTab('output')}
            className={`px-2 py-0.5 rounded-[3px] transition-colors ${
              activePanelTab === 'output'
                ? 'text-white font-medium bg-editor-hover/70'
                : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover/40'
            }`}
          >
            <span>Output</span>
          </button>

          <button
            onClick={() => setActivePanelTab('debug')}
            className={`px-2 py-0.5 rounded-[3px] transition-colors ${
              activePanelTab === 'debug'
                ? 'text-white font-medium bg-editor-hover/70'
                : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover/40'
            }`}
          >
            <span>Debug Console</span>
          </button>

          <button
            onClick={() => setActivePanelTab('terminal')}
            className={`px-2 py-0.5 rounded-[3px] transition-colors ${
              activePanelTab === 'terminal'
                ? 'text-white font-medium bg-editor-hover/70'
                : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover/40'
            }`}
          >
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActivePanelTab('ports')}
            className={`px-2 py-0.5 rounded-[3px] transition-colors ${
              activePanelTab === 'ports'
                ? 'text-white font-medium bg-editor-hover/70'
                : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover/40'
            }`}
          >
            <span>Ports</span>
          </button>
        </div>

        {/* Right: Terminal action panel */}
        <div className="flex items-center gap-1 text-editor-textDark">
          {activePanelTab === 'terminal' && (
            <button
              onClick={handleAddNewTerminal}
              className="p-1 rounded hover:bg-editor-hover hover:text-white transition-colors"
              title="Nueva Terminal (+)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {activePanelTab === 'terminal' && activeSessionId && (
            <button
              onClick={(e) => handleCloseTerminal(e, activeSessionId)}
              className="p-1 rounded hover:bg-editor-hover hover:text-white transition-colors"
              title="Cerrar Terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          
          <button
            onClick={toggleConsoleMaximize}
            className="p-1 rounded hover:bg-editor-hover hover:text-white transition-colors"
            title={isConsoleMaximized ? "Restaurar tamaño" : "Maximizar panel"}
          >
            {isConsoleMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={toggleConsole}
            className="p-1 rounded hover:bg-editor-hover hover:text-white transition-colors"
            title="Cerrar panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-hidden bg-editor-bg relative flex flex-col p-1">
        {/* PTY Terminal Container */}
        <div 
          style={{ display: activePanelTab === 'terminal' ? 'block' : 'none' }}
          className="w-full h-full"
        >
          {activeSessionId ? (
            <div ref={terminalRef} className="w-full h-full" />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center items-center text-center opacity-40 select-none text-editor-textDark">
              <TermIcon className="w-8 h-8 mb-2" />
              <p className="text-xs">No hay terminales activas</p>
            </div>
          )}
        </div>

        {/* Problems View Tab Container */}
        {activePanelTab === 'problems' && (
          <div className="w-full h-full overflow-y-auto px-3 py-2 select-text absolute inset-0 bg-editor-bg z-10 custom-scrollbar">
            {problemsList.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full w-full select-none text-center">
                <span className="text-editor-textDark text-xs font-normal">
                  No se han detectado problemas en el espacio de trabajo.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 w-full text-xs font-sans">
                {problemsList.map((file) => {
                  const { name: fileName, dir: fileDir } = getFileParts(file.filePath, workspacePath);
                  const isCollapsed = !!collapsedFiles[file.uri];
                  
                  return (
                    <div key={file.uri} className="flex flex-col mb-1">
                      {/* File Header Row */}
                      <div 
                        onClick={() => {
                          toggleFileCollapsed(file.uri);
                          openFile(file.filePath);
                        }}
                        className="flex items-center px-2 py-1 hover:bg-editor-hover cursor-pointer select-none rounded group transition-colors"
                      >
                        <span className="font-semibold text-editor-text truncate">{fileName}</span>
                        {fileDir && (
                          <span className="text-editor-textDark text-[10px] font-normal truncate ml-1.5 font-sans">
                            {fileDir}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-editor-textDark font-mono">
                          {file.diagnostics.length}
                        </span>
                      </div>

                      {/* File Diagnostics Items List */}
                      {!isCollapsed && (
                        <div className="flex flex-col pl-4 border-l border-editor-border/40 ml-2 mt-0.5 gap-0.5">
                          {file.diagnostics.map((diag: any, dIdx: number) => {
                            const isError = diag.severity === 1;
                            return (
                              <div
                                key={dIdx}
                                onClick={() => handleProblemClick(file.filePath, diag.range.start.line, diag.range.start.character)}
                                className="flex items-start gap-2 py-0.5 px-1 hover:bg-editor-hover cursor-pointer rounded transition-colors group"
                              >
                                {isError ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                ) : (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                )}
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-editor-text text-[12px] leading-tight group-hover:text-white">
                                    {diag.message}
                                  </span>
                                  <div className="flex items-center gap-2 text-[10px] text-editor-textDark font-mono mt-0.5">
                                    <span>[{diag.range.start.line + 1}, {diag.range.start.character + 1}]</span>
                                    {diag.source && <span>({diag.source})</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Output View Container */}
        {activePanelTab === 'output' && (
          <div className="w-full h-full overflow-y-auto p-3 text-editor-text text-[12px] font-mono select-text bg-editor-bg">
            <span className="text-editor-textDark">[Spigot Output Window - Listo]</span>
          </div>
        )}

        {/* Debug Console Container */}
        {activePanelTab === 'debug' && (
          <div className="w-full h-full overflow-y-auto p-3 text-editor-text text-[12px] font-mono select-text bg-editor-bg">
            <span className="text-editor-textDark">[Debug Console - No hay sesión de depuración activa]</span>
          </div>
        )}

        {/* Ports View Container */}
        {activePanelTab === 'ports' && (
          <div className="w-full h-full overflow-y-auto p-3 text-editor-text text-[12px] select-text bg-editor-bg">
            <span className="text-editor-textDark">No hay puertos reenviados actualmente.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsolePanel;
