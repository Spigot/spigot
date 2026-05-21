import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTerminalStore } from '../../store/terminalStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { Trash2, Plus, Terminal as TermIcon, Minimize2, Maximize2 } from 'lucide-react';
import 'xterm/css/xterm.css'; // Make sure styling imports exist

export const ConsolePanel: React.FC = () => {
  const { 
    isConsoleOpen, isConsoleMaximized, toggleConsole, toggleConsoleMaximize,
    consoleHeight, setConsoleHeight 
  } = useLayoutStore();
  const { sessions, activeSessionId, createSession, closeSession, setActiveSession } = useTerminalStore();
  const { workspacePath } = useWorkspaceStore();

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

  // Initialize a terminal session if none exist on open (transition lock)
  const prevConsoleOpen = useRef(isConsoleOpen);

  useEffect(() => {
    if (isConsoleOpen && !prevConsoleOpen.current && sessions.length === 0) {
      handleAddNewTerminal();
    }
    prevConsoleOpen.current = isConsoleOpen;
  }, [isConsoleOpen, sessions.length]);

  const handleAddNewTerminal = async () => {
    const cwd = workspacePath || '';
    // Temporary columns and rows before fitaddon fits it
    await createSession(80, 24, cwd);
  };

  const handleCloseTerminal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // Cleanup native and JS objects
    const instance = xtermInstances.current[id];
    if (instance) {
      instance.disposeData();
      instance.term.dispose();
      delete xtermInstances.current[id];
    }
    
    // Call backend destroy session
    (window as any).api.terminal.write(id, '\u0003'); // send Ctrl+C to PTY to quit shell gracefully
    closeSession(id);

    // If this was the last terminal session, close the console panel automatically
    if (sessions.length === 1) {
      toggleConsole();
    }
  };

  // Setup actual XTerm.js bindings for active session
  useEffect(() => {
    if (!isConsoleOpen || !activeSessionId || !terminalRef.current) return;

    // Skip if already mounted
    if (mountedSession === activeSessionId && xtermInstances.current[activeSessionId]) {
      // Re-fit in case window resized
      setTimeout(() => {
        try {
          xtermInstances.current[activeSessionId].fit.fit();
        } catch (e) {}
      }, 50);
      return;
    }

    // Clean up previous visual mount
    if (terminalRef.current) {
      terminalRef.current.innerHTML = '';
    }

    const sessionId = activeSessionId;

    // Instantiate XTerm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Consolas, Menlo, monospace',
      theme: {
        background: '#1e1e1e', // Match editor background
        foreground: '#cccccc',
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
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    // Small delay to ensure xterm is properly measured
    setTimeout(() => {
      try {
        fitAddon.fit();
        // Resize native backend PTY process
        (window as any).api.terminal.resize(sessionId, term.cols, term.rows);
      } catch (err) {}
    }, 100);

    // Stream native PTY data output into the xterm client
    const disposeOnData = (window as any).api.terminal.onData(sessionId, (data: string) => {
      term.write(data);
    });

    // Stream user inputs from client into the PTY process
    const termDataListener = term.onData((data) => {
      (window as any).api.terminal.write(sessionId, data);
    });

    // Save instance reference
    xtermInstances.current[sessionId] = {
      term,
      fit: fitAddon,
      disposeData: () => {
        disposeOnData();
        termDataListener.dispose();
      }
    };

    setMountedSession(sessionId);

    // Handle window resize dynamically
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

  // Handle auto-fit when maximizing or resizing the sidebar panel
  useEffect(() => {
    if (activeSessionId && xtermInstances.current[activeSessionId]) {
      setTimeout(() => {
        try {
          xtermInstances.current[activeSessionId].fit.fit();
        } catch (e) {}
      }, 100);
    }
  }, [isConsoleMaximized, isConsoleOpen, activeSessionId]);

  if (!isConsoleOpen) return null;

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
      {/* Console panel Header menu */}
      <div className="h-8 bg-editor-sidebar border-b border-editor-border px-4 flex items-center justify-between select-none">
        {/* Left: Console tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <div className="flex items-center gap-1.5 text-editor-accent mr-3">
            <TermIcon className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-editor-text">Terminal</span>
          </div>

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

        {/* Right: Terminal action panel */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddNewTerminal}
            className="p-1 rounded hover:bg-editor-hover text-editor-textDark hover:text-white transition-all-custom"
            title="Nueva Sesión de Terminal"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          
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

      {/* Terminal View Body */}
      <div className="flex-1 p-2 overflow-hidden bg-editor-bg relative">
        {activeSessionId ? (
          <div ref={terminalRef} className="w-full h-full" />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center opacity-40 select-none">
            <TermIcon className="w-10 h-10 mb-2" />
            <p className="text-xs">No hay terminales activas</p>
          </div>
        )}
      </div>
    </div>
  );
};
export default ConsolePanel;
