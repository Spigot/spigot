import React from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { FileTree } from './FileTree';

export const Sidebar: React.FC = () => {
  const { activeSidebarTab, isSidebarOpen } = useLayoutStore();

  if (!isSidebarOpen) return null;

  return (
    <aside className="w-60 bg-editor-sidebar border-r border-editor-border flex flex-col select-none z-30">
      {activeSidebarTab === 'explorer' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-10 px-4 flex items-center justify-between border-b border-editor-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-editor-text">Explorador</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        </div>
      )}

      {activeSidebarTab === 'search' && (
        <div className="flex-1 flex flex-col p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3 text-editor-text">Buscar</h2>
          <div className="flex gap-2 flex-col">
            <input
              type="text"
              placeholder="Buscar..."
              className="bg-editor-bg border border-editor-border text-xs px-2.5 py-1.5 rounded outline-none text-white focus:border-editor-accent transition-all-custom"
            />
            <input
              type="text"
              placeholder="Reemplazar..."
              className="bg-editor-bg border border-editor-border text-xs px-2.5 py-1.5 rounded outline-none text-white focus:border-editor-accent transition-all-custom"
            />
            <button className="bg-editor-accent text-white text-xs py-1.5 rounded font-medium hover:bg-blue-600 transition-all-custom">
              Reemplazar todo
            </button>
          </div>
        </div>
      )}

      {activeSidebarTab === 'extensions' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-10 px-4 flex items-center border-b border-editor-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-editor-text">Extensiones</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {/* Premium Mock Extensions list */}
            {[
              { name: 'Python LSP', desc: 'Soporte inteligente para Python', author: 'Microsoft', inst: true },
              { name: 'GitLens', desc: 'Visualizá el historial de Git', author: 'GitKraken', inst: false },
              { name: 'Prettier', desc: 'Formateador de código automático', author: 'Prettier Org', inst: true },
              { name: 'Dracula Theme', desc: 'Tema oscuro premium', author: 'Dracula', inst: false },
            ].map((ext) => (
              <div key={ext.name} className="p-2.5 bg-editor-bg rounded border border-editor-border flex flex-col gap-1.5 hover:border-editor-textDark transition-all-custom">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xs font-semibold text-white">{ext.name}</h3>
                    <p className="text-[10px] text-editor-textDark font-medium">por {ext.author}</p>
                  </div>
                  <button className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all-custom ${
                    ext.inst ? 'bg-zinc-700 text-zinc-300' : 'bg-editor-accent text-white hover:bg-blue-600'
                  }`}>
                    {ext.inst ? 'Instalado' : 'Instalar'}
                  </button>
                </div>
                <p className="text-[10px] text-editor-textDark leading-relaxed">{ext.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSidebarTab === 'settings' && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-editor-text">Configuración</h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-editor-textDark font-bold uppercase">Tema de color</label>
              <select className="bg-editor-bg border border-editor-border text-xs px-2 py-1 rounded text-white outline-none">
                <option>Spigot Dark (Por defecto)</option>
                <option>VS Code Classic Dark</option>
                <option>Light Theme</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-editor-textDark font-bold uppercase">Tamaño de fuente</label>
              <input type="number" defaultValue={14} className="bg-editor-bg border border-editor-border text-xs px-2 py-1 rounded text-white outline-none w-20" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded border-editor-border accent-editor-accent" />
              <span className="text-xs text-editor-text">Auto-Guardado</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
export default Sidebar;
