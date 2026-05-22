import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useTerminalStore } from '../../store/terminalStore';
import logoSpigotUrl from '../../assets/logoSpigot.png';
import { 
  Minus, Square, X, Plus, Folder, Save, LogOut,
  Sparkles, Terminal, Settings, LayoutGrid,
  ZoomIn, ZoomOut, RefreshCw, Server, Key
} from 'lucide-react';




export const TitleBar: React.FC = () => {
  const { 
    activeTabPath, 
    selectWorkspace, 
    saveActiveFile, 
    createItem, 
    workspacePath,
    setWorkspacePath
  } = useWorkspaceStore();

  const {
    isConsoleOpen, toggleConsole,
    isAIPanelOpen, toggleAIPanel,
    setSidebarTab, setSidebarOpen, setConsoleOpen
  } = useLayoutStore();
  const { createSshSession } = useTerminalStore();
  
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [updateReady, setUpdateReady] = useState<{ version?: string } | null>(null);

  useEffect(() => {
    const unsubscribe = (window as any).api.updater?.onUpdateReady?.((payload: { version?: string }) => {
      setUpdateReady(payload || {});
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const loadRecentProjects = async () => {
    try {
      const list = await (window as any).api.store.getRecentWorkspaces();
      setRecentProjects(list || []);
    } catch (err) {
      console.error('Error loading recent projects:', err);
    }
  };

  interface SSHServer {
    id: string;
    name: string;
    host: string;
    user: string;
    port?: number;
    identityFile?: string;
  }

  const [sshServers, setSshServers] = useState<SSHServer[]>([]);

  const loadSshServers = async () => {
    try {
      const list = await (window as any).api.store.getSSHServers();
      setSshServers(list || []);
    } catch (err) {
      console.error('Error loading SSH servers:', err);
    }
  };

  const handleNewSSHConnection = async () => {
    const name = prompt('Ingresá el alias o nombre del servidor VPS:', 'mi-servidor-vps');
    if (!name || !name.trim()) return;

    const host = prompt('Ingresá la dirección IP o dominio del servidor (ej: 186.23.12.9 o vps.midominio.com):');
    if (!host || !host.trim()) return;

    const user = prompt('Ingresá el usuario de conexión SSH (ej: ubuntu o root):', 'ubuntu');
    if (!user || !user.trim()) return;

    const portInput = prompt('Puerto SSH:', '22');
    const port = Number(portInput || '22');
    if (!Number.isInteger(port) || port <= 0) {
      alert('Puerto SSH inválido.');
      return;
    }

    const identityFile = prompt('Ruta de clave privada opcional (.pem/.ppk convertido/OpenSSH). Dejalo vacío para usar password o ssh-agent:', '');

    try {
      const newServer = {
        id: Date.now().toString(),
        name: name.trim(),
        host: host.trim(),
        user: user.trim(),
        port,
        identityFile: identityFile?.trim() || undefined,
      };
      const list = await (window as any).api.store.addSSHServer(newServer);
      setSshServers(list || []);
      await handleConnectSSH(newServer);
    } catch (err) {
      console.error('Error adding SSH server:', err);
      alert('No se pudo guardar o abrir la conexión SSH.');
    }
  };

  const handleConnectSSH = async (server: SSHServer) => {
    try {
      setActiveDropdown(null);
      setConsoleOpen(true);
      await createSshSession(100, 30, server);
    } catch (err) {
      console.error('Error connecting SSH server:', err);
      alert('No se pudo abrir la conexión SSH. Revisá que OpenSSH esté instalado y que los datos sean correctos.');
    }
  };




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

  const handleInstallUpdate = async () => {
    await (window as any).api.updater.installUpdate();
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
          <img src={logoSpigotUrl} alt="Spigot" width="16" height="16" className="w-4.5 h-4.5 select-none pointer-events-none object-contain opacity-80" />
        </div>



        {/* Layout indicator */}
        <button title="Layout" className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors mr-2">
          <LayoutGrid className="w-4 h-4" />
        </button>
        
        {/* Top-bar Navigation Menus */}
        <nav className="hidden lg:flex items-center gap-1 text-[12px] text-zinc-500 font-normal relative">
          {['Archivo', 'Ver', 'Proyectos', 'Tools', 'MCP', 'SSH', 'Ayuda'].map((menu) => {
            const hasDropdown = menu === 'Archivo' || menu === 'Proyectos' || menu === 'Ver' || menu === 'SSH';
            const isOpen = activeDropdown === menu;
            return (
              <div key={menu} className="relative">
                <button
                  onClick={async () => {
                    if (hasDropdown) {
                      if (isOpen) {
                        setActiveDropdown(null);
                      } else {
                        setActiveDropdown(menu);
                        if (menu === 'Proyectos') {
                          await loadRecentProjects();
                        } else if (menu === 'SSH') {
                          await loadSshServers();
                        }
                      }
                    }
                  }}
                  className={`px-2 py-0.5 rounded transition-all-custom hover:bg-zinc-900/40 hover:text-zinc-200 ${
                    isOpen ? 'bg-zinc-900/60 text-white' : ''
                  }`}
                >
                  {menu}
                </button>
                
                {menu === 'Archivo' && isOpen && (
                  <>
                    {/* Transparent Click-Outside Overlay */}
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setActiveDropdown(null)} 
                    />
                    
                    {/* Glassmorphic Dropdown Menu */}
                    <div className="absolute left-0 mt-1 w-52 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-md shadow-2xl py-1 z-50 text-[12px] text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await handleNewFile();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4 text-zinc-400" />
                        <span>Nuevo Archivo</span>
                      </button>
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await selectWorkspace();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors"
                      >
                        <Folder className="w-4 h-4 text-zinc-400" />
                        <span>Abrir Carpeta...</span>
                      </button>
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
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
                        <span>Guardar</span>
                      </button>
                      
                      <div className="my-1 border-t border-zinc-800/60" />
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.close();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-650/20 hover:text-red-400 flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-red-400" />
                        <span>Salir</span>
                      </button>
                    </div>
                  </>
                )}

                {menu === 'Ver' && isOpen && (
                  <>
                    {/* Transparent Click-Outside Overlay */}
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setActiveDropdown(null)} 
                    />
                    
                    {/* Glassmorphic Dropdown Menu */}
                    <div className="absolute left-0 mt-1 w-44 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-md shadow-2xl py-1 z-50 text-[12px] text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.zoomIn();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ZoomIn className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Zoom In</span>
                        </div>
                        <span className="text-zinc-500 text-[10px]">Ctrl+</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.zoomOut();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ZoomOut className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Zoom Out</span>
                        </div>
                        <span className="text-zinc-500 text-[10px]">Ctrl-</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.zoomReset();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Reset Zoom</span>
                        </div>
                        <span className="text-zinc-500 text-[10px]">Ctrl0</span>
                      </button>
                    </div>
                  </>
                )}


                {menu === 'Proyectos' && isOpen && (
                  <>
                    {/* Transparent Click-Outside Overlay */}
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setActiveDropdown(null)} 
                    />
                    
                    {/* Glassmorphic Dropdown Menu */}
                    <div className="absolute left-0 mt-1 w-64 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-md shadow-2xl py-1.5 z-50 text-[12px] text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <div className="px-3 py-1 text-[10px] text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-800/60 pb-1.5 mb-1.5">
                        Proyectos Recientes
                      </div>
                      
                      {recentProjects.length === 0 ? (
                        <div className="px-3 py-2 text-zinc-500 italic text-[11px]">
                          No hay proyectos abiertos recientemente
                        </div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                          {recentProjects.map((p) => {
                            const folderName = p.replace(/\\/g, '/').split('/').pop() || p;
                            const isCurrent = workspacePath === p;
                            return (
                              <button
                                key={p}
                                onClick={async () => {
                                  setActiveDropdown(null);
                                  await setWorkspacePath(p);
                                }}
                                className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors ${
                                  isCurrent ? 'bg-indigo-500/10 text-indigo-300 font-semibold border-l-2 border-indigo-400 pl-2.5' : ''
                                }`}
                                title={p}
                              >
                                <Folder className={`w-3.5 h-3.5 ${isCurrent ? 'text-indigo-400' : 'text-zinc-500'}`} />
                                <span className="truncate text-[12.5px] font-medium">{folderName}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      
                      <div className="my-1.5 border-t border-zinc-800/60" />
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await selectWorkspace();
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors font-medium"
                      >
                        <Folder className="w-4 h-4 text-zinc-400" />
                        <span>Abrir otra carpeta...</span>
                      </button>
                    </div>
                  </>
                )}

                {menu === 'SSH' && isOpen && (
                  <>
                    {/* Transparent Click-Outside Overlay */}
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setActiveDropdown(null)} 
                    />
                    
                    {/* Glassmorphic Dropdown Menu */}
                    <div className="absolute left-0 mt-1 w-64 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-md shadow-2xl py-1.5 z-50 text-[12px] text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <div className="px-3 py-1 text-[10px] text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-800/60 pb-1.5 mb-1.5">
                        Conexión SSH
                      </div>
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await handleNewSSHConnection();
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors font-medium text-[12.5px]"
                      >
                        <Plus className="w-4 h-4 text-emerald-400" />
                        <span>Nueva Conexión VPS...</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          alert('Spigot usa OpenSSH del sistema. Podés usar password interactivo, ssh-agent o indicar una clave privada al crear la conexión.');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors font-medium text-[12.5px]"
                      >
                        <Key className="w-4 h-4 text-zinc-400" />
                        <span>Claves y Credenciales...</span>
                      </button>

                      <div className="my-1.5 border-t border-zinc-800/60" />

                      <div className="px-3 py-1 text-[10px] text-zinc-500 font-bold uppercase tracking-wider pb-1">
                        Servidores Recientes
                      </div>

                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        {sshServers.length === 0 ? (
                          <div className="px-3 py-2 text-zinc-500 italic text-[11px]">
                            No hay servidores recientes
                          </div>
                        ) : (
                          sshServers.map((server) => (
                            <button
                              key={server.id}
                              onClick={() => {
                                setActiveDropdown(null);
                                void handleConnectSSH(server);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-white flex flex-col transition-colors animate-in fade-in-5 duration-150"
                            >
                              <div className="flex items-center gap-2">
                                <Server className="w-3.5 h-3.5 text-zinc-400" />
                                <span className="font-semibold text-zinc-200">{server.name}</span>
                              </div>
                              <span className="text-[10px] text-zinc-500 pl-[22px]">{server.user}@{server.host}:{server.port || 22}</span>
                            </button>
                          ))
                        )}
                      </div>
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
        {updateReady && (
          <button
            onClick={handleInstallUpdate}
            className="h-7 px-3 mr-2 rounded-md bg-emerald-500 text-black text-[12px] font-semibold hover:bg-emerald-400 transition-all-custom shadow-lg shadow-emerald-950/30"
            title={updateReady.version ? `Instalar versi?n ${updateReady.version}` : 'Instalar actualizaci?n descargada'}
          >
            Actualizar versi?n
          </button>
        )}

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
