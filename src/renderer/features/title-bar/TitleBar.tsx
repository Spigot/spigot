import React from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Minus, Square, X, Compass } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const { activeTabPath } = useWorkspaceStore();
  
  // Extract active file name for title text
  const activeFileName = activeTabPath 
    ? activeTabPath.split(/[/\\]/).pop() 
    : 'Sin título';

  const handleMinimize = () => {
    (window as any).api.app.minimize();
  };

  const handleMaximize = () => {
    (window as any).api.app.maximize();
  };

  const handleClose = () => {
    (window as any).api.app.close();
  };

  return (
    <header className="h-9 bg-editor-titleBar flex items-center justify-between border-b border-editor-border select-none app-draggable z-50">
      {/* Left: Brand Icon and menus */}
      <div className="flex items-center gap-3 px-3 h-full app-non-draggable">
        <div className="flex items-center gap-1.5 text-editor-accent">
          <Compass className="w-4 h-4 animate-spin-slow" />
          <span className="font-semibold text-xs tracking-wider text-white">SPIGOT</span>
        </div>
        
        {/* Mock Top-bar Navigation Menus */}
        <nav className="hidden md:flex items-center gap-1 text-[11px] text-editor-textDark font-medium">
          {['Archivo', 'Editar', 'Selección', 'Ver', 'Ayuda'].map((menu) => (
            <button
              key={menu}
              className="px-2 py-0.5 rounded hover:bg-editor-hover hover:text-white transition-all-custom"
            >
              {menu}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: File name indicator */}
      <div className="text-[11px] text-editor-text font-normal flex items-center gap-1.5">
        <span className="font-semibold">{activeFileName}</span>
        <span className="text-editor-textDark">- Spigot Code</span>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center h-full app-non-draggable">
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-editor-hover text-editor-text hover:text-white transition-all-custom"
          title="Minimizar"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-editor-hover text-editor-text hover:text-white transition-all-custom"
          title="Maximizar"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-600 text-editor-text hover:text-white transition-all-custom"
          title="Cerrar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
export default TitleBar;
