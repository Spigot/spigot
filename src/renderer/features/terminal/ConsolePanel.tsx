import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTerminalStore } from '../../store/terminalStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useDiagnosticsStore } from '../../store/diagnosticsStore';
import { 
  Trash2, Plus, Terminal as TermIcon, Minimize2, Maximize2, 
  AlertCircle, AlertTriangle 
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
        cursor: '#b58900',
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
    consoleHeight, setConsoleHeight 
  } = useLayoutStore();
  const { sessions, activeSessionId, createSession, closeSession, setActiveSession } = useTerminalStore();
  const { workspacePath, theme, openFile, setPendingSelection } = useWorkspaceStore();
  
  // Subscribe to LSP Diagnostics store reactively
  const fileDiagnostics = useDiagnosticsStore((state) => state.fileDiagnostics);
  const [activePanelTab, setActivePanelTab] = useState<'problems' | 'terminal'>('problems');
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const toggleFileCollapsed = (uri: string) => {
    setCollapsedFiles(prev => ({
      ...prev,
      [uri]: !prev[uri]
    }));
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = consoleHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(100, Math.min(600, startHeight - deltaY));
      setConsoleHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstances = useRef<Record<string, { term: XTerm; fit: FitAddon; disposeData: () => void }>>({});
  
  // Track terminal mount state
  const [mountedSession, setMountedSession] = useState<string | null>(null);

  // Initialize a terminal session if none exist on open
  const prevConsoleOpen = useRef(isConsoleOpen);

  useEffect(() => {
    if (isConsoleOpen && !prevConsoleOpen.current && sessions.length === 0) {
      handleAddNewTerminal();
    }
    prevConsoleOpen.current = isConsoleOpen;
  }, [isConsoleOpen, sessions.length]);

  const handleAddNewTerminal = async () => {
    const cwd = workspacePath || '';
    await createSession(80, 24, cwd);
  };

  const handleCloseTerminal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    const instance = xtermInstances.current[id];
    if (instance) {
      instance.disposeData();
      instance.term.dispose();
      delete xtermInstances.current[id];
    }
    
    (window as any).api.terminal.write(id, '\u0003');
    closeSession(id);

    if (sessions.length === 1) {
      toggleConsole();
    }
  };

  // Setup XTerm.js bindings for active session (runs regardless of activePanelTab to keep terminal alive)
  useEffect(() => {
    if (!isConsoleOpen || !activeSessionId || !terminalRef.current) return;

    if (mountedSession === activeSessionId && xtermInstances.current[activeSessionId]) {
      setTimeout(() => {
        try {
          xtermInstances.current[activeSessionId].fit.fit();
        } catch (e) {}
      }, 50);
      return;
    }

    if (terminalRef.current) {
      terminalRef.current.innerHTML = '';
    }

    const sessionId = activeSessionId;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Consolas, Menlo, monospace',
      theme: getXtermTheme(theme),
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    setTimeout(() => {
      try {
        fitAddon.fit();
        (window as any).api.terminal.resize(sessionId, term.cols, term.rows);
      } catch (err) {}
    }, 100);

    const disposeOnData = (window as any).api.terminal.onData(sessionId, (data: string) => {
      term.write(data);
    });

    const termDataListener = term.onData((data) => {
      (window as any).api.terminal.write(sessionId, data);
    });

    xtermInstances.current[sessionId] = {
      term,
      fit: fitAddon,
      disposeData: () => {
        disposeOnData();
        termDataListener.dispose();
      }
    };

    setMountedSession(sessionId);

    const handleResize = () => {
      try {
        fitAddon.fit();
        (window as any).api.terminal.resize(sessionId, term.cols, term.rows);
      } catch (err) {}
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [activeSessionId, isConsoleOpen, mountedSession]);

  // Dynamically update terminal theme on editor theme changes
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
          // Resize backend PTY process to match the newly fitted dimensions
          (window as any).api.terminal.resize(activeSessionId, term.cols, term.rows);
          // Force xterm to completely refresh the screen contents
          term.refresh(0, term.rows - 1);
        } catch (e) {}
      };

      // Perform immediately
      performResize();
      
      // Perform after minor timeouts to account for layout engine transitions
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
        warningsCount++; // Severity 2 (Warning) or other
      }
    }
  }
  const totalProblemsCount = errorsCount + warningsCount;

  // Navigates directly to the problem in editor
  const handleProblemClick = async (filePath: string, line: number, character: number) => {
    await openFile(filePath);
    setPendingSelection({
      filePath,
      line: line + 1, // 1-based indexing in Monaco
      column: character + 1,
      length: 1
    });
  };

  return (
    <div 
      style={isConsoleMaximized ? { height: '100%' } : { height: `${consoleHeight}px` }}
      className="bg-editor-panel border-t border-editor-border flex flex-col z-20 relative"
    >
      {/* Drag Resize Handle */}
      {!isConsoleMaximized && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize bg-transparent hover:bg-editor-accent/30 z-30 transition-colors"
        />
      )}

      {/* Header menu with VS Code-style Tabs */}
      <div className="h-8 bg-editor-sidebar border-b border-editor-border px-4 flex items-center justify-between select-none">
        {/* Left: View Tabs (PROBLEMS / TERMINAL) */}
        <div className="flex items-center h-full overflow-x-auto no-scrollbar py-0.5 gap-4">
          <div className="flex items-center gap-4 h-full">
            <button
              onClick={() => setActivePanelTab('problems')}
              className={`h-full flex items-center gap-1.5 px-0.5 border-b-2 text-[11px] font-medium tracking-wide transition-all-custom ${
                activePanelTab === 'problems'
                  ? 'text-editor-text border-editor-accent font-semibold'
                  : 'text-editor-textDark border-transparent hover:text-editor-text'
              }`}
            >
              <span>Problemas</span>
              {totalProblemsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                  {totalProblemsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActivePanelTab('terminal')}
              className={`h-full flex items-center gap-1.5 px-0.5 border-b-2 text-[11px] font-medium tracking-wide transition-all-custom ${
                activePanelTab === 'terminal'
                  ? 'text-editor-text border-editor-accent font-semibold'
                  : 'text-editor-textDark border-transparent hover:text-editor-text'
              }`}
            >
              <span>Terminal</span>
            </button>
          </div>

          {/* Show shell instances list only when Terminal tab is active */}
          {activePanelTab === 'terminal' && (
            <div className="flex items-center gap-1.5">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => setActiveSession(sess.id)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer text-[10px] font-medium transition-all-custom ${
                      isActive 
                        ? 'bg-zinc-800 text-white font-semibold' 
                        : 'text-editor-textDark hover:bg-zinc-800/40 hover:text-editor-text'
                    }`}
                  >
                    <span>{sess.name}</span>
                    <button
                      onClick={(e) => handleCloseTerminal(e, sess.id)}
                      className="p-0.5 rounded hover:bg-zinc-700 text-editor-textDark hover:text-white"
                      title="Cerrar Terminal"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Terminal action panel */}
        <div className="flex items-center gap-2">
          {activePanelTab === 'terminal' && (
            <button
              onClick={handleAddNewTerminal}
              className="p-1 rounded hover:bg-editor-hover text-editor-textDark hover:text-white transition-all-custom"
              title="Nueva Sesión de Terminal"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          
          <button
            onClick={toggleConsoleMaximize}
            className="p-1 rounded hover:bg-editor-hover text-editor-textDark hover:text-white transition-all-custom"
            title={isConsoleMaximized ? "Minimizar Consola" : "Maximizar Consola"}
          >
            {isConsoleMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={toggleConsole}
            className="p-1 rounded hover:bg-editor-hover text-editor-textDark hover:text-white transition-all-custom"
            title="Ocultar Panel"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 p-2 overflow-hidden bg-editor-bg relative flex flex-col">
        {/* PTY Terminal Container (Maintained alive in background via CSS visibility toggling) */}
        <div 
          style={{ display: activePanelTab === 'terminal' ? 'block' : 'none' }}
          className="w-full h-full"
        >
          {activeSessionId ? (
            <div ref={terminalRef} className="w-full h-full" />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center items-center text-center opacity-40 select-none">
              <TermIcon className="w-10 h-10 mb-2" />
              <p className="text-xs">No hay terminales activas</p>
            </div>
          )}
        </div>

        {/* Problems View Tab Container */}
        {activePanelTab === 'problems' && (
          <div className="w-full h-full overflow-y-auto px-4 py-2 select-text selection:bg-zinc-850 absolute inset-0 bg-editor-bg z-10">
            {problemsList.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full w-full select-none text-center">
                <span className="text-zinc-500 text-xs font-normal">
                  No se han detectado problemas en el espacio de trabajo.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 w-full text-xs font-sans">
                {problemsList.map((file) => {
                  const { name: fileName, dir: fileDir } = getFileParts(file.filePath, workspacePath);
                  const isCollapsed = !!collapsedFiles[file.uri];
                  
                  return (
                    <div key={file.uri} className="flex flex-col mb-1.5">
                      {/* File Header Row */}
                      <div 
                        onClick={() => {
                          toggleFileCollapsed(file.uri);
                          openFile(file.filePath);
                        }}
                        className="flex items-center px-2 py-1 hover:bg-editor-hover/40 cursor-pointer select-none rounded group transition-colors"
                      >
                        {/* Down Arrow / Chevron for file group */}
                        <svg 
                          className={`w-3.5 h-3.5 text-zinc-400 mr-1.5 shrink-0 transition-transform duration-100 ${
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>

                        {/* File Name */}
                        <span className="font-semibold text-zinc-200 truncate">{fileName}</span>

                        {/* Relative Directory Path next to it */}
                        {fileDir && (
                          <span className="text-zinc-500 text-[10px] font-normal truncate ml-1.5 font-sans">
                            {fileDir}
                          </span>
                        )}

                        {/* Total Count Badge on the right */}
                        <span className="ml-auto text-[9px] font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded-full shrink-0 border border-zinc-700/50">
                          {file.diagnostics.length}
                        </span>
                      </div>

                      {/* Problems items of this file */}
                      {!isCollapsed && (
                        <div className="flex flex-col pl-4 mt-0.5">
                          {file.diagnostics.map((diag, index) => {
                            const isError = diag.severity === 1;
                            
                            return (
                              <div 
                                key={index} 
                                onClick={() => handleProblemClick(file.filePath, diag.range.start.line, diag.range.start.character)}
                                className="flex items-start gap-2 px-3 py-1 hover:bg-editor-hover/20 cursor-pointer rounded transition-colors group select-text"
                              >
                                {/* Error or Warning Icon */}
                                {isError ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                                ) : (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                )}

                                {/* Message & Source */}
                                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5">
                                  <span className="text-zinc-300 leading-normal font-sans">
                                    {diag.message}
                                  </span>
                                  
                                  {diag.source && (
                                    <span className="text-zinc-500 text-[9px] bg-zinc-800/40 px-1 rounded border border-zinc-700/20 font-sans">
                                      {diag.source}
                                    </span>
                                  )}
                                </div>

                                {/* Position inside file [Lín. line, Col. col] */}
                                <span className="text-zinc-500 text-[10px] font-mono shrink-0 ml-2 select-none">
                                  [Lín. {diag.range.start.line + 1}, Col. {diag.range.start.character + 1}]
                                </span>
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
      </div>
    </div>
  );
};
export default ConsolePanel;
