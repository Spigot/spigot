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

interface TerminalInstance {
  term: XTerm;
  fit: FitAddon;
  host: HTMLDivElement;
  dispose: () => void;
}

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
  const { sessions, activeSessionId, createSession, closeSession, setActiveSession } = useTerminalStore();
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

  // Each session gets its own container div — no shared ref
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermInstances = useRef<Record<string, TerminalInstance>>({});

  const disposeTerminal = (sessionId: string) => {
    const instance = xtermInstances.current[sessionId];
    if (!instance) return;
    delete xtermInstances.current[sessionId];
    instance.dispose();
  };

  const fitTerminal = (sessionId: string, focus = false) => {
    if (!isConsoleOpen || activePanelTab !== 'terminal' || activeSessionId !== sessionId) return;

    const instance = xtermInstances.current[sessionId];
    if (!instance) return;

    const { width, height } = instance.host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    try {
      instance.fit.fit();
      (window as any).api?.terminal?.resize?.(sessionId, instance.term.cols, instance.term.rows);
      instance.term.refresh(0, instance.term.rows - 1);
      if (focus) instance.term.focus();
    } catch (_) {}
  };

  // Ensure activeSessionId is always valid when sessions exist
  useEffect(() => {
    if (sessions.length > 0 && (!activeSessionId || !sessions.some(s => s.id === activeSessionId))) {
      setActiveSession(sessions[sessions.length - 1].id);
    }
  }, [sessions, activeSessionId, setActiveSession]);

  // Ensure terminal session exists and active instance fits/focuses whenever console opens or tab changes
  useEffect(() => {
    if (isConsoleOpen && activePanelTab === 'terminal') {
      if (sessions.length === 0) {
        createSession(80, 24, workspacePath || '');
      }
    }
  }, [isConsoleOpen, activePanelTab, sessions.length, createSession, workspacePath]);

  // Fit after visible layout changes. ResizeObserver handles dimensions that settle later.
  useEffect(() => {
    if (activeSessionId) fitTerminal(activeSessionId, true);
  }, [isConsoleOpen, isConsoleMaximized, consoleHeight, activeSessionId, activePanelTab, sessions.length]);

  // Dynamic ResizeObserver to auto-fit whenever the container div has actual pixel dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0 && activeSessionId) {
          fitTerminal(activeSessionId);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isConsoleOpen, activePanelTab, activeSessionId]);

  // Mount xterm instances into their individual container divs
  useEffect(() => {
    if (!containerRef.current) return;

    const liveSessionIds = new Set(sessions.map((session) => session.id));
    for (const sessionId of Object.keys(xtermInstances.current)) {
      if (!liveSessionIds.has(sessionId)) disposeTerminal(sessionId);
    }

    for (const sess of sessions) {
      const el = containerRef.current.querySelector(`[data-session-id="${sess.id}"]`) as HTMLDivElement | null;
      if (!el) continue;

      // A live session owns one xterm instance and one persistent host.
      if (xtermInstances.current[sess.id]) continue;

      const sessionId = sess.id;
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
      term.open(el);

      // Enable copy with Ctrl+C/Ctrl+Shift+C and paste with Ctrl+V/Ctrl+Shift+V
      term.attachCustomKeyEventHandler((e) => {
        if (e.type === 'keydown') {
          // Copy: Ctrl+C (when selection exists) or Ctrl+Shift+C
          if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            if (e.shiftKey || term.hasSelection()) {
              const selection = term.getSelection();
              if (selection) {
                navigator.clipboard.writeText(selection);
                return false;
              }
            }
          }

          // Paste: Ctrl+V or Ctrl+Shift+V
          if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
            navigator.clipboard.readText().then((text) => {
              if (text) {
                (window as any).api.terminal.write(sessionId, text);
              }
            }).catch(() => {});
            return false;
          }
        }
        return true;
      });

      // Right-click support: copy if text selected, paste if no selection (VS Code / Windows Terminal style)
      const handleContextMenu = async (e: MouseEvent) => {
        e.preventDefault();
        if (term.hasSelection()) {
          const selection = term.getSelection();
          if (selection) {
            await navigator.clipboard.writeText(selection);
            term.clearSelection();
          }
        } else {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              (window as any).api.terminal.write(sessionId, text);
            }
          } catch (err) {}
        }
      };

      el.addEventListener('contextmenu', handleContextMenu);

      const onDataDisposable = term.onData((data) => {
        (window as any).api.terminal.write(sessionId, data);
      });

      const removeIncomingListener = (window as any).api.terminal.onData(sessionId, (data: string) => {
        term.write(data);
      });

      const removeCloseListener = (window as any).api.terminal.onClose?.(sessionId, () => {
        disposeTerminal(sessionId);
        closeSession(sessionId);
        const remaining = useTerminalStore.getState().sessions;
        if (remaining.length === 0) {
          if (useLayoutStore.getState().isConsoleOpen) {
            useLayoutStore.getState().toggleConsole();
          }
        }
      });

      let disposed = false;
      xtermInstances.current[sessionId] = {
        term,
        fit,
        host: el,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          el.removeEventListener('contextmenu', handleContextMenu);
          onDataDisposable.dispose();
          removeIncomingListener?.();
          removeCloseListener?.();
          term.dispose();
        },
      };

      // Replay buffered output only while this renderer still owns the session.
      (window as any).api?.terminal?.getHistory?.(sessionId).then((history: string[]) => {
        if (xtermInstances.current[sessionId]?.term !== term) return;
        for (const chunk of history || []) term.write(chunk);
      }).catch(() => {});

      fitTerminal(sessionId);
    }
  }, [sessions]);

  // StrictMode replays effects without disconnecting this owner. Dispose only on true DOM removal.
  useEffect(() => {
    const owner = containerRef.current;
    return () => {
      if (owner?.isConnected) return;
      for (const sessionId of Object.keys(xtermInstances.current)) disposeTerminal(sessionId);
    };
  }, []);

  // Handle closing a terminal session — kills backend PTY and disposes xterm
  const handleCloseTerminal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Kill backend PTY process
    try { (window as any).api.terminal.close(id); } catch (_) {}
    // Dispose xterm frontend
    disposeTerminal(id);
    // If this is the last session, close the panel automatically
    if (sessions.length === 1) {
      if (isConsoleOpen) {
        toggleConsole();
      }
    }
    closeSession(id);
  };

  // Add a new terminal session
  const handleAddNewTerminal = async () => {
    await createSession(80, 24, workspacePath || '');
  };

  // Update theme dynamically in mounted xterm instance
  useEffect(() => {
    for (const instance of Object.values(xtermInstances.current)) {
      instance.term.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

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
      style={{
        display: isConsoleOpen ? 'flex' : 'none',
        height: isConsoleMaximized ? '100%' : `${consoleHeight}px`
      }}
      aria-hidden={!isConsoleOpen}
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
      <div className="flex-1 overflow-hidden bg-editor-bg relative flex">
        {/* Terminal Tab Container with Viewport on Left and VS Code Instances Sidebar on Right */}
        <div
          className="flex-1 w-full h-full overflow-hidden"
          style={{ display: activePanelTab === 'terminal' ? 'flex' : 'none' }}
          aria-hidden={activePanelTab !== 'terminal'}
        >
            {/* Terminal Viewport — one div per session, only active one visible */}
            <div ref={containerRef} className="flex-1 h-full overflow-hidden p-1 relative">
              {sessions.length === 0 ? (
                <div className="absolute inset-0 flex flex-col justify-center items-center text-center opacity-40 select-none text-editor-textDark">
                  <TermIcon className="w-8 h-8 mb-2" />
                  <p className="text-xs">No hay terminales activas</p>
                </div>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.id}
                    data-session-id={sess.id}
                    className={`w-full h-full ${
                      sess.id === activeSessionId
                        ? 'relative block'
                        : 'absolute inset-0 invisible pointer-events-none'
                    }`}
                  />
                ))
              )}
            </div>

            {/* VS Code Terminal Instances Sidebar on the Right */}
            {sessions.length > 0 && (
              <div className="w-[140px] min-w-[140px] border-l border-editor-border bg-editor-sidebar flex flex-col select-none shrink-0">
                <div className="h-[26px] border-b border-editor-border/60 px-2 flex items-center justify-between text-[10.5px] font-bold text-editor-textDark uppercase tracking-wider">
                  <span>Terminales</span>
                  <button
                    onClick={handleAddNewTerminal}
                    className="p-0.5 hover:bg-editor-hover hover:text-white rounded"
                    title="Nueva Terminal (+)"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-1 flex flex-col gap-0.5 custom-scrollbar">
                  {sessions.map((sess, idx) => {
                    const isActive = sess.id === activeSessionId;
                    const displayName = sess.name || `Terminal ${idx + 1}`;
                    return (
                      <div
                        key={sess.id}
                        onClick={() => setActiveSession(sess.id)}
                        className={`h-[24px] px-2 rounded-[3px] flex items-center justify-between cursor-pointer transition-colors group text-[11.5px] ${
                          isActive
                            ? 'bg-editor-active text-white font-medium border-l-2 border-editor-accent'
                            : 'text-editor-textDark hover:bg-editor-hover hover:text-editor-text'
                        }`}
                        title={displayName}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <TermIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-editor-accent' : 'text-editor-textDark'}`} />
                          <span className="truncate">{displayName}</span>
                        </div>
                        <button
                          onClick={(e) => handleCloseTerminal(e, sess.id)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-red-400 text-editor-textDark transition-all"
                          title="Cerrar sesión"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
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
