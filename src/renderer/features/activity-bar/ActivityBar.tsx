import React from 'react';
import { useLayoutStore, SidebarTab } from '../../store/layoutStore';
import { Files, Search, Blocks, Terminal, GitBranch, Bot } from 'lucide-react';

export const ActivityBar: React.FC = () => {
  const { 
    activeSidebarTab, setSidebarTab, isSidebarOpen, 
    isConsoleOpen, toggleConsole,
    isAIPanelOpen, toggleAIPanel
  } = useLayoutStore();

  const menuItems = [
    { id: 'explorer' as SidebarTab, icon: Files, label: 'Explorador' },
    { id: 'search' as SidebarTab, icon: Search, label: 'Buscar' },
    { id: 'source-control' as SidebarTab, icon: GitBranch, label: 'Control de Código Fuente' },
    { id: 'extensions' as SidebarTab, icon: Blocks, label: 'Extensiones' },
  ];

  return (
    <aside className="w-12 bg-editor-activity border-r border-editor-border flex flex-col justify-between items-center py-2 select-none z-40">
      {/* Top Sidebar triggers */}
      <div className="flex flex-col gap-2 w-full items-center">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSidebarTab === item.id && isSidebarOpen;
          return (
            <button
              key={item.id}
              onClick={() => setSidebarTab(item.id)}
              className={`relative w-12 h-11 flex items-center justify-center transition-all-custom group ${
                isActive ? 'text-white' : 'text-editor-textDark hover:text-editor-text'
              }`}
              title={item.label}
            >
              {/* Highlight bar to the left */}
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-editor-accent" />
              )}
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Bottom Option Triggers */}
      <div className="flex flex-col gap-2 w-full items-center">
        {/* Toggle right AI Agent Panel quick button */}
        <button
          onClick={toggleAIPanel}
          className={`relative w-12 h-11 flex items-center justify-center transition-all-custom group ${
            isAIPanelOpen ? 'text-white' : 'text-editor-textDark hover:text-editor-text'
          }`}
          title="Modo Agente (Toggle)"
        >
          {isAIPanelOpen && (
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-editor-accent" />
          )}
          <Bot className="w-5 h-5 text-amber-500 hover:text-amber-400" />
        </button>

        {/* Toggle integrated terminal console quick button */}
        <button
          onClick={toggleConsole}
          className={`w-12 h-11 flex items-center justify-center transition-all-custom ${
            isConsoleOpen ? 'text-editor-accent hover:text-blue-400' : 'text-editor-textDark hover:text-editor-text'
          }`}
          title="Consola Integrada"
        >
          <Terminal className="w-5 h-5" />
        </button>


      </div>
    </aside>
  );
};
export default ActivityBar;

