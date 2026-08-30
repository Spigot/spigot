import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import TitleBar from './features/title-bar/TitleBar';
import Sidebar from './features/sidebar/Sidebar';
import ActivityBar from './features/activity-bar/ActivityBar';
import EditorTabs from './features/editor/EditorTabs';
import EditorContainer from './features/editor/EditorContainer';
import ConsolePanel from './features/terminal/ConsolePanel';
import AIPanel from './features/ai-panel/AIPanel';
import StatusBar from './features/status-bar/StatusBar';
import AgentModeView from './features/agent-mode/AgentModeView';
import { useWorkspaceStore } from './store/workspaceStore';
import { useLayoutStore } from './store/layoutStore';
import { useGlobalShortcuts } from './features/keyboard/useGlobalShortcuts';
import './index.css';

const VerticalSash: React.FC<{
  onResize: (delta: number) => void;
}> = ({ onResize }) => {
  const startXRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      startXRef.current = moveEvent.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-2 h-full cursor-ew-resize flex items-center justify-center select-none group shrink-0 transition-colors z-30"
      title="Arrastrar para redimensionar"
    >
      <div className="flex flex-col gap-[2px] items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity">
        <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#e2c08d]" />
        <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#e2c08d]" />
        <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#e2c08d]" />
      </div>
    </div>
  );
};

const HorizontalSash: React.FC<{
  onResize: (delta: number) => void;
}> = ({ onResize }) => {
  const startYRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startYRef.current = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startYRef.current;
      startYRef.current = moveEvent.clientY;
      onResize(deltaY);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-2 w-full cursor-ns-resize flex items-center justify-center select-none group shrink-0 transition-colors z-30"
      title="Arrastrar para redimensionar"
    >
      <div className="flex gap-[2px] items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity">
        <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#e2c08d]" />
        <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#e2c08d]" />
        <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#e2c08d]" />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const restoreLastWorkspace = useWorkspaceStore((state) => state.restoreLastWorkspace);
  const workspacePath = useWorkspaceStore((state) => state.workspacePath);
  const refreshWorkspace = useWorkspaceStore((state) => state.refreshWorkspace);
  const isAgentModeOpen = useLayoutStore((state) => state.isAgentModeOpen);

  const isSidebarOpen = useLayoutStore((state) => state.isSidebarOpen);
  const setSidebarWidth = useLayoutStore((state) => state.setSidebarWidth);

  const isAIPanelOpen = useLayoutStore((state) => state.isAIPanelOpen);
  const setAIPanelWidth = useLayoutStore((state) => state.setAIPanelWidth);

  const isConsoleOpen = useLayoutStore((state) => state.isConsoleOpen);
  const isConsoleMaximized = useLayoutStore((state) => state.isConsoleMaximized);
  const setConsoleHeight = useLayoutStore((state) => state.setConsoleHeight);

  useGlobalShortcuts();

  useEffect(() => {
    restoreLastWorkspace();
  }, [restoreLastWorkspace]);

  useEffect(() => {
    if (!workspacePath) return;

    let refreshTimer: number | undefined;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshWorkspace();
      }, 250);
    };

    (window as any).api?.fs?.watchWorkspace?.(workspacePath);
    const dispose = (window as any).api?.fs?.onWorkspaceChanged?.(scheduleRefresh);

    return () => {
      window.clearTimeout(refreshTimer);
      dispose?.();
      (window as any).api?.fs?.unwatchWorkspace?.();
    };
  }, [refreshWorkspace, workspacePath]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-editor-titleBar">
      {/* 1. Custom Frameless Title Bar */}
      <TitleBar />

      {/* 2. Main View (either standard workspace or agent mode) */}
      {isAgentModeOpen ? (
        <AgentModeView />
      ) : (
        <>
          {/* Main Workspace Layout with seamless ActivityBar and modular rounded panels */}
          <div className="flex-1 flex overflow-hidden w-full relative bg-editor-titleBar items-stretch">
            {/* Vertical Left Activity Bar (Files, Search, etc.) integrated with TitleBar */}
            <ActivityBar />

            {/* Inner Workspace Container with padding and sash dividers for the modular cards */}
            <div className="flex-1 flex overflow-hidden relative p-1.5 gap-0 items-stretch bg-editor-titleBar">
              {/* Dynamic Left Sidebar panel (Filetree, Search, etc.) */}
              {isSidebarOpen && (
                <>
                  <Sidebar />
                  <VerticalSash
                    onResize={(delta) => {
                      const current = useLayoutStore.getState().sidebarWidth;
                      setSidebarWidth(Math.max(160, Math.min(600, current + delta)));
                    }}
                  />
                </>
              )}

              {/* Center/Right Main Editor and Console Panel */}
              <main className="flex-1 flex flex-col overflow-hidden relative min-h-0 rounded-[8px] border border-editor-border bg-editor-bg shadow-sm">
                {/* Editor Header tabs & Buffer View container */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
                  <EditorTabs />
                  <EditorContainer />
                </div>

                {/* Horizontal Sash between Editor and Console */}
                {isConsoleOpen && !isConsoleMaximized && (
                  <HorizontalSash
                    onResize={(delta) => {
                      const current = useLayoutStore.getState().consoleHeight;
                      setConsoleHeight(Math.max(100, Math.min(600, current - delta)));
                    }}
                  />
                )}

                {/* Integrated terminal console drawer panel */}
                <ConsolePanel />
              </main>

              {/* Rightmost AI Agent Panel (with dynamic resizer) */}
              {isAIPanelOpen && (
                <>
                  <VerticalSash
                    onResize={(delta) => {
                      const current = useLayoutStore.getState().aiPanelWidth;
                      setAIPanelWidth(Math.max(260, Math.min(700, current - delta)));
                    }}
                  />
                  <AIPanel />
                </>
              )}
            </div>
          </div>

          {/* 3. Bottom Status Bar */}
          <StatusBar />
        </>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
