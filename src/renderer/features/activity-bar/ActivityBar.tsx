import React from 'react';
import { useLayoutStore, SidebarTab } from '../../store/layoutStore';
import { Files, Search, Terminal, GitBranch, Bot, GitPullRequest, Settings } from 'lucide-react';

export const ActivityBar: React.FC = () => {
  const { 
    activeSidebarTab, setSidebarTab, isSidebarOpen, 
    isConsoleOpen, toggleConsole,
    isAIPanelOpen, toggleAIPanel,
    setSettingsModalOpen
  } = useLayoutStore();

  const menuItems = [
    { id: 'explorer' as SidebarTab, icon: Files, label: 'Explorador' },
    { id: 'search' as SidebarTab, icon: Search, label: 'Buscar' },
    { id: 'source-control' as SidebarTab, icon: GitBranch, label: 'Control de Código Fuente' },
    { id: 'pull-request' as SidebarTab, icon: GitPullRequest, label: 'Crear pull request' },
  ];

  return (
    <aside className="w-12 bg-editor-titleBar flex flex-col justify-between items-center py-1 select-none z-40 shrink-0">
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

        {/* Manage / Settings popup trigger button (VS Code style Gear icon) */}
        <button
          onClick={() => setSettingsModalOpen(true)}
          className="w-12 h-11 flex items-center justify-center transition-all-custom text-editor-textDark hover:text-editor-text group"
          title="Configuración (Ctrl+,)"
        >
          <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
        </button>
      </div>
    </aside>
  );
};
export default ActivityBar;

