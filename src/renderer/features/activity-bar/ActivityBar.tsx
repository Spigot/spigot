import React from 'react';
import { useLayoutStore, SidebarTab } from '../../store/layoutStore';
import { useAIStore } from '../../store/aiStore';
import { Files, Search, Terminal, GitBranch, Bot, GitPullRequest, Settings } from 'lucide-react';

const QuotaIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12,6a1,1,0,0,0-1,1V17a1,1,0,0,0,2,0V7A1,1,0,0,0,12,6ZM7,12a1,1,0,0,0-1,1v4a1,1,0,0,0,2,0V13A1,1,0,0,0,7,12Zm10-2a1,1,0,0,0-1,1v6a1,1,0,0,0,2,0V11A1,1,0,0,0,17,10Zm2-8H5A3,3,0,0,0,2,5V19a3,3,0,0,0,3,3H19a3,3,0,0,0,3-3V5A3,3,0,0,0,19,2Zm1,17a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V5A1,1,0,0,1,5,4H19a1,1,0,0,1,1,1Z" />
  </svg>
);

export const ActivityBar: React.FC = () => {
  const { 
    activeSidebarTab, setSidebarTab, isSidebarOpen, 
    isConsoleOpen, toggleConsole,
    isAIPanelOpen, toggleAIPanel,
    setSettingsModalOpen
  } = useLayoutStore();
  const oauthAccounts = useAIStore((state) => state.oauthAccounts);
  const providers = useAIStore((state) => state.providers);
  const isGoogleConnected =
    oauthAccounts.length > 0 ||
    Boolean(providers.gemini?.authType === 'oauth' && providers.gemini?.key?.trim());

  const menuItems = [
    { id: 'explorer' as SidebarTab, icon: Files, label: 'Explorador' },
    { id: 'search' as SidebarTab, icon: Search, label: 'Buscar' },
    { id: 'source-control' as SidebarTab, icon: GitBranch, label: 'Control de Código Fuente' },
    { id: 'pull-request' as SidebarTab, icon: GitPullRequest, label: 'Crear pull request' },
    ...(isGoogleConnected ? [{ id: 'quota' as SidebarTab, icon: QuotaIcon as any, label: 'Cuota y Límites (Antigravity)' }] : []),
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
