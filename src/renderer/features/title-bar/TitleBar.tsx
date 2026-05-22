import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { 
  Minus, Square, X, Plus, Folder, Save, LogOut,
  ChevronLeft, ChevronRight, Sparkles, Terminal, Settings, LayoutGrid
} from 'lucide-react';

export const TitleBar: React.FC = () => {
  const { 
    activeTabPath, 
    selectWorkspace, 
    saveActiveFile, 
    createItem, 
    workspacePath 
  } = useWorkspaceStore();

  const {
    isConsoleOpen, toggleConsole,
    isAIPanelOpen, toggleAIPanel,
    setSidebarTab, setSidebarOpen
  } = useLayoutStore();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Extract active file name for title text
  const activeFileName = activeTabPath 
    ? activeTabPath.split(/[/\\]/).pop() 
    : '';

  const workspaceName = workspacePath 
    ? workspacePath.replace(/\\/g, '/').split('/').pop() 
    : 'spigot';

  const handleMinimize = () => {
    (window as any).api.app.minimize();
  };

  const handleMaximize = () => {
    (window as any).api.app.maximize();
  };

  const handleClose = () => {
    (window as any).api.app.close();
  };

  const handleNewFile = async () => {
    if (!workspacePath) {
      alert('Por favor, abrí una carpeta o espacio de trabajo primero.');
      await selectWorkspace();
      return;
    }
    const name = prompt('Ingresá el nombre del nuevo archivo (con extensión):', 'archivo.txt');
    if (name && name.trim()) {
      await createItem(name.trim(), 'file');
    }
  };

  return (
    <header className="h-10 bg-zinc-950/40 backdrop-blur-md flex items-center justify-between border-b border-editor-border select-none app-draggable z-50 px-2">
      {/* Left: Brand Icon, navigation and menus */}
      <div className="flex items-center gap-2.5 h-full app-non-draggable">
        {/* Brand Icon */}
        <div className="flex items-center text-editor-accent pl-1">
          <img src="/logoSpigot.png" alt="Spigot" width="16" height="16" className="w-4.5 h-4.5 select-none pointer-events-none object-contain opacity-80" />
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center gap-1 text-zinc-500 mr-1.5">
          <button title="Atrás" className="p-1 hover:bg-zinc-900/50 hover:text-zinc-300 rounded transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button title="Adelante" className="p-1 hover:bg-zinc-900/50 hover:text-zinc-300 rounded transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Layout indicator */}
        <button title="Layout" className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors mr-2">
          <LayoutGrid className="w-4 h-4" />
        </button>
        
        {/* Top-bar Navigation Menus */}
        <nav className="hidden lg:flex items-center gap-1 text-[12px] text-zinc-500 font-normal relative">
          {['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'].map((menu) => {
            const isFile = menu === 'File';
            return (
              <div key={menu} className="relative">
                <button
                  onClick={() => {
                    if (isFile) {
                      setIsMenuOpen(!isMenuOpen);
                    }
                  }}
                  className={`px-2 py-0.5 rounded transition-all-custom hover:bg-zinc-900/40 hover:text-zinc-200 ${
                    isFile && isMenuOpen ? 'bg-zinc-900/60 text-white' : ''
                  }`}
                >
                  {menu}
                </button>
                
                {isFile && isMenuOpen && (
                  <>
                    {/* Transparent Click-Outside Overlay */}
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setIsMenuOpen(false)} 
                    />
                    
                    {/* Glassmorphic Dropdown Menu */}
                    <div className="absolute left-0 mt-1 w-52 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-md shadow-2xl py-1 z-50 text-[12px] text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <button
                        onClick={async () => {
                          setIsMenuOpen(false);
                          await handleNewFile();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4 text-zinc-400" />
                        <span>New File</span>
                      </button>
                      
                      <button
                        onClick={async () => {
                          setIsMenuOpen(false);
                          await selectWorkspace();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <Folder className="w-4 h-4 text-zinc-400" />
                        <span>Open Folder...</span>
                      </button>
                      
                      <button
                        onClick={async () => {
                          setIsMenuOpen(false);
                          await saveActiveFile();
                        }}
                        disabled={!activeTabPath}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                          activeTabPath 
                            ? 'hover:bg-zinc-800 hover:text-white' 
                            : 'opacity-40 cursor-not-allowed text-zinc-500'
                        }`}
                      >
                        <Save className="w-4 h-4 text-zinc-400" />
                        <span>Save</span>
                      </button>
                      
                      <div className="my-1 border-t border-zinc-800/60" />
                      
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          (window as any).api.app.close();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-650/20 hover:text-red-400 flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-red-400" />
                        <span>Exit</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Center: Workspace name and file name indicator */}
      <div className="text-[12.5px] font-normal flex items-center gap-1.5 absolute left-1/2 -translate-x-1/2 pointer-events-none">
        <span className="font-semibold text-zinc-200">{workspaceName}</span>
        {activeFileName && (
          <>
            <span className="text-zinc-600 font-light">&gt;</span>
            <span className="text-zinc-400 font-medium">{activeFileName}</span>
          </>
        )}
      </div>

      {/* Right: Premium Actions & Window Controls */}
      <div className="flex items-center h-full app-non-draggable">
        {/* Upgrade to Pro Button */}
        <button className="text-[11px] font-bold text-amber-500/90 hover:text-amber-400 border border-amber-500/20 hover:border-amber-400/40 bg-amber-500/5 hover:bg-amber-500/10 px-2.5 py-1 rounded-md mr-2.5 transition-all-custom font-sans tracking-wide">
          Upgrade to Pro
        </button>

        {/* Quick Drawer Toggles */}
        <div className="flex items-center border-r border-zinc-800/60 pr-1.5 mr-1 text-zinc-400">
          <button 
            onClick={toggleConsole}
            title="Consola/Terminal (Toggle)"
            className={`p-1 rounded hover:bg-zinc-900/50 hover:text-white transition-all-custom mr-0.5 ${
              isConsoleOpen ? 'text-white bg-zinc-800/40' : ''
            }`}
          >
            <Terminal className="w-4 h-4" />
          </button>
          <button 
            onClick={toggleAIPanel}
            title="Agente IA (Toggle)"
            className={`p-1 rounded hover:bg-zinc-900/50 hover:text-white transition-all-custom mr-0.5 ${
              isAIPanelOpen ? 'text-amber-500 hover:text-amber-400 bg-zinc-800/40' : ''
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              setSidebarTab('settings');
              setSidebarOpen(true);
            }}
            title="Ajustes (Toggle)"
            className="p-1 rounded hover:bg-zinc-900/50 hover:text-white transition-all-custom"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* OS Standard Controls */}
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-zinc-900/45 text-zinc-400 hover:text-white transition-all-custom"
          title="Minimizar"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-zinc-900/45 text-zinc-400 hover:text-white transition-all-custom"
          title="Maximizar"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-650/85 text-zinc-400 hover:text-white transition-all-custom"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
