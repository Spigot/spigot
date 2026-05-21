import React from 'react';
import ReactDOM from 'react-dom/client';
import TitleBar from './features/title-bar/TitleBar';
import ActivityBar from './features/activity-bar/ActivityBar';
import Sidebar from './features/sidebar/Sidebar';
import EditorTabs from './features/editor/EditorTabs';
import EditorContainer from './features/editor/EditorContainer';
import ConsolePanel from './features/terminal/ConsolePanel';
import AIPanel from './features/ai-panel/AIPanel';
import StatusBar from './features/status-bar/StatusBar';
import './index.css';

const App: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-editor-bg">
      {/* 1. Custom Frameless Title Bar */}
      <TitleBar />

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Leftmost Activity Bar */}
        <ActivityBar />

        {/* Dynamic Left Sidebar panel (Filetree, Search, etc.) */}
        <Sidebar />

        {/* Center/Right Main Editor and Console Panel */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* Editor Header tabs & Buffer View container */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
            <EditorTabs />
            <EditorContainer />
          </div>

          {/* Integrated terminal console drawer panel */}
          <ConsolePanel />
        </main>

        {/* Rightmost AI Agent Panel (with dynamic resizer) */}
        <AIPanel />
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar />
    </div>
  );
};


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
