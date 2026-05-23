import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useTerminalStore } from '../../store/terminalStore';
import logoSpigotUrl from '../../assets/logoSpigot.png';
import { 
  Minus, Square, X, Plus, Folder, Save, LogOut,
  Terminal, Settings, LayoutGrid,
  ZoomIn, ZoomOut, RefreshCw, Server, Key, HelpCircle, Github, FolderClosed, Bot
} from 'lucide-react';




export const TitleBar: React.FC = () => {
  const { 
    activeTabPath, 
    selectWorkspace, 
    createNewProject,
    saveActiveFile, 
    createItem, 
    workspacePath,
    setWorkspacePath
  } = useWorkspaceStore();

  const {
    isConsoleOpen, toggleConsole,
    isAIPanelOpen, toggleAIPanel,
    setSidebarTab, setSidebarOpen, setConsoleOpen,
    isAgentModeOpen, toggleAgentMode
  } = useLayoutStore();
  const { createSshSession } = useTerminalStore();
  
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [updateReady, setUpdateReady] = useState<{ version?: string } | null>(null);
  const [appInfo, setAppInfo] = useState<any>(null);
  const [isSshFormOpen, setIsSshFormOpen] = useState(false);
  const [sshDraft, setSshDraft] = useState({
    name: '',
    host: '',
    user: 'ubuntu',
    port: '22',
    identityFile: '',
  });

  useEffect(() => {
    const unsubscribe = (window as any).api.updater?.onUpdateReady?.((payload: { version?: string }) => {
      setUpdateReady(payload || {});
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const loadAppInfo = async () => {
    try {
      const info = await (window as any).api.app.getInfo();
      setAppInfo(info);
    } catch (err) {
      console.error('Error loading app info:', err);
    }
  };

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
    setActiveDropdown(null);
    setSshDraft({
      name: '',
      host: '',
      user: 'ubuntu',
      port: '22',
      identityFile: '',
    });
    setIsSshFormOpen(true);
  };

  const handleSaveSSHConnection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const port = Number(sshDraft.port || '22');
    if (!sshDraft.host.trim() || !sshDraft.user.trim()) {
      alert('Host y usuario SSH son obligatorios.');
      return;
    }
    if (!Number.isInteger(port) || port <= 0) {
      alert('Puerto SSH inv?lido.');
      return;
    }

    try {
      const newServer: SSHServer = {
        id: Date.now().toString(),
        name: sshDraft.name.trim() || `${sshDraft.user.trim()}@${sshDraft.host.trim()}`,
        host: sshDraft.host.trim(),
        user: sshDraft.user.trim(),
        port,
        identityFile: sshDraft.identityFile.trim() || undefined,
      };
      const list = await (window as any).api.store.addSSHServer(newServer);
      setSshServers(list || []);
      setIsSshFormOpen(false);
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
    <header className="h-10 bg-editor-titleBar flex items-center justify-between border-b border-editor-border select-none app-draggable z-50 px-2">
      {/* Left: Brand Icon, navigation and menus */}
      <div className="flex items-center gap-2.5 h-full app-non-draggable">
        {/* Brand Icon */}
        <div className="flex items-center text-editor-accent pl-1">
          <img src={logoSpigotUrl} alt="Spigot" width="16" height="16" className="w-4.5 h-4.5 select-none pointer-events-none object-contain opacity-80" />
        </div>



        {/* Layout indicator */}
        <button title="Layout" className="p-1 text-editor-textDark hover:text-editor-text rounded transition-colors mr-2">
          <LayoutGrid className="w-4 h-4" />
        </button>
        
        {/* Top-bar Navigation Menus */}
        <nav className="hidden lg:flex items-center gap-1 text-[12px] text-editor-text font-medium relative">
          {['Archivo', 'Ver', 'Proyectos', 'Tools', 'MCP', 'SSH', 'Ayuda'].map((menu) => {
            const hasDropdown = menu === 'Archivo' || menu === 'Proyectos' || menu === 'Ver' || menu === 'SSH' || menu === 'Ayuda';
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
                        } else if (menu === 'Ayuda') {
                          await loadAppInfo();
                        }
                      }
                    }
                  }}
                  className={`px-2 py-0.5 rounded transition-all-custom hover:bg-editor-hover hover:text-editor-text ${
                    isOpen ? 'bg-editor-active text-white' : ''
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
                    <div className="absolute left-0 mt-1 w-52 bg-editor-bg border border-editor-border rounded-md shadow-2xl py-1 z-50 text-[12px] text-editor-text font-medium animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await handleNewFile();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4 text-editor-textDark" />
                        <span>Nuevo Archivo</span>
                      </button>

                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await createNewProject();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors"
                      >
                        <FolderClosed className="w-4 h-4 text-editor-textDark" />
                        <span>Nuevo Proyecto...</span>
                      </button>
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await selectWorkspace();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors"
                      >
                        <Folder className="w-4 h-4 text-editor-textDark" />
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
                            ? 'hover:bg-editor-hover hover:text-editor-accent' 
                            : 'opacity-40 cursor-not-allowed text-editor-textDark'
                        }`}
                      >
                        <Save className="w-4 h-4 text-editor-textDark" />
                        <span>Guardar</span>
                      </button>
                      
                      <div className="my-1 border-t border-editor-border" />
                      
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
                    <div className="absolute left-0 mt-1 w-44 bg-editor-bg border border-editor-border rounded-md shadow-2xl py-1 z-50 text-[12px] text-editor-text font-medium animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.zoomIn();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ZoomIn className="w-3.5 h-3.5 text-editor-textDark" />
                          <span>Zoom In</span>
                        </div>
                        <span className="text-editor-textDark text-[10px]">Ctrl+</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.zoomOut();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ZoomOut className="w-3.5 h-3.5 text-editor-textDark" />
                          <span>Zoom Out</span>
                        </div>
                        <span className="text-editor-textDark text-[10px]">Ctrl-</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).api.app.zoomReset();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-editor-textDark" />
                          <span>Reset Zoom</span>
                        </div>
                        <span className="text-editor-textDark text-[10px]">Ctrl0</span>
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
                    <div className="absolute left-0 mt-1 w-64 bg-editor-bg border border-editor-border rounded-md shadow-2xl py-1.5 z-50 text-[12px] text-editor-text font-medium animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <div className="px-3 py-1 text-[10px] text-editor-textDark font-bold uppercase tracking-wider border-b border-editor-border pb-1.5 mb-1.5">
                        Proyectos Recientes
                      </div>
                      
                      {recentProjects.length === 0 ? (
                        <div className="px-3 py-2 text-editor-textDark italic text-[11px]">
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
                                className={`w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors ${
                                  isCurrent ? 'bg-indigo-500/10 text-indigo-300 font-semibold border-l-2 border-indigo-400 pl-2.5' : ''
                                }`}
                                title={p}
                              >
                                <Folder className={`w-3.5 h-3.5 ${isCurrent ? 'text-indigo-400' : 'text-editor-textDark'}`} />
                                <span className="truncate text-[12.5px] font-medium">{folderName}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      
                      <div className="my-1.5 border-t border-editor-border" />
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await createNewProject();
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors font-medium"
                      >
                        <FolderClosed className="w-4 h-4 text-editor-textDark" />
                        <span>Nuevo Proyecto...</span>
                      </button>

                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await selectWorkspace();
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors font-medium"
                      >
                        <Folder className="w-4 h-4 text-editor-textDark" />
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
                    <div className="absolute left-0 mt-1 w-64 bg-editor-bg border border-editor-border rounded-md shadow-2xl py-1.5 z-50 text-[12px] text-editor-text font-medium animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <div className="px-3 py-1 text-[10px] text-editor-textDark font-bold uppercase tracking-wider border-b border-editor-border pb-1.5 mb-1.5">
                        Conexión SSH
                      </div>
                      
                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          await handleNewSSHConnection();
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors font-medium text-[12.5px]"
                      >
                        <Plus className="w-4 h-4 text-emerald-400" />
                        <span>Nueva Conexión VPS...</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          alert('Spigot usa OpenSSH del sistema. Podés usar password interactivo, ssh-agent o indicar una clave privada al crear la conexión.');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors font-medium text-[12.5px]"
                      >
                        <Key className="w-4 h-4 text-editor-textDark" />
                        <span>Claves y Credenciales...</span>
                      </button>

                      <div className="my-1.5 border-t border-editor-border" />

                      <div className="px-3 py-1 text-[10px] text-editor-textDark font-bold uppercase tracking-wider pb-1">
                        Servidores Recientes
                      </div>

                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        {sshServers.length === 0 ? (
                          <div className="px-3 py-2 text-editor-textDark italic text-[11px]">
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
                              className="w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex flex-col transition-colors animate-in fade-in-5 duration-150"
                            >
                              <div className="flex items-center gap-2">
                                <Server className="w-3.5 h-3.5 text-editor-textDark" />
                                <span className="font-semibold text-editor-text">{server.name}</span>
                              </div>
                              <span className="text-[10px] text-editor-textDark pl-[22px]">{server.user}@{server.host}:{server.port || 22}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}


                {menu === 'Ayuda' && isOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setActiveDropdown(null)}
                    />
                    <div className="absolute left-0 mt-1 w-80 bg-editor-bg border border-editor-border rounded-md shadow-2xl py-2 z-50 text-[12px] text-editor-text font-medium animate-in fade-in slide-in-from-top-1 duration-100 ease-out font-sans">
                      <div className="px-3 pb-2 border-b border-editor-border flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-indigo-400" />
                        <div>
                          <div className="text-zinc-100 font-semibold">Ayuda de Spigot</div>
                          <div className="text-[10px] text-editor-textDark">Versión actual: {appInfo?.version || 'cargando...'}</div>
                        </div>
                      </div>

                      <div className="px-3 py-2 space-y-2">
                        <div className="rounded-md bg-editor-active border border-editor-border p-2">
                          <div className="text-[10px] uppercase tracking-wider text-editor-textDark font-bold mb-1">Sistema</div>
                          <div>App: {appInfo?.name || 'Spigot'}</div>
                          <div>Versión: {appInfo?.version || '...'}</div>
                        </div>

                        <button
                          onClick={() => {
                            setActiveDropdown(null);
                            (window as any).api.app.openExternal('https://github.com/Spigot/spigot');
                          }}
                          className="w-full rounded-md bg-editor-active border border-editor-border p-2 hover:bg-editor-hover hover:text-editor-accent transition-colors flex items-center gap-2 text-left"
                        >
                          <Github className="w-4 h-4 text-editor-textDark" />
                          <span>GitHub</span>
                        </button>
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
        <span className="font-semibold text-editor-text">{workspaceName}</span>
        {activeFileName && (
          <>
            <span className="text-editor-textDark font-light">&gt;</span>
            <span className="text-editor-textDark font-medium">{activeFileName}</span>
          </>
        )}
      </div>

      {/* Right: Premium Actions & Window Controls */}
      <div className="flex items-center h-full app-non-draggable">
        {updateReady && (
          <button
            onClick={handleInstallUpdate}
            className="h-7 px-3 mr-2 rounded-md bg-emerald-500 text-black text-[12px] font-semibold hover:bg-emerald-400 transition-all-custom shadow-lg shadow-emerald-950/30"
            title={updateReady.version ? `Instalar versión ${updateReady.version}` : 'Instalar actualización descargada'}
          >
            Actualizar versión
          </button>
        )}

        {/* Quick Drawer Toggles */}
        <div className="flex items-center border-r border-editor-border pr-1.5 mr-1 text-editor-textDark">
          <button
            onClick={toggleAgentMode}
            title="Spy Agent"
            className={`p-1 rounded flex items-center justify-center hover:bg-editor-hover hover:text-editor-accent transition-all-custom mr-0.5 ${
              isAgentModeOpen ? 'text-white bg-editor-active' : ''
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 507.965 507.965"
              className="w-4 h-4"
              fill="currentColor"
              stroke="none"
              style={{ display: 'block', width: '16px', height: '16px' }}
            >
              <path d="M507.083,238.166c-2.7-7.3-10.8-11-18.1-8.3c-20,7.4-40.4,13.7-61,19.1l-35.7-172.3c-8-40.8-50.9-67.6-93.8-52.7c-28.7,10.3-60.3,10.3-89,0c-40.6-13.9-84,8.8-93.9,52.7l-35.6,172.3c-20.7-5.4-41-11.7-61-19.1c-7.3-2.7-15.4,1-18.1,8.3c-2.7,7.3,1,15.4,8.3,18.1c160.5,57.6,328.9,57.8,489.6,0C506.083,253.566,509.783,245.466,507.083,238.166z M107.483,255.566l13.1-63.2h35.6c7.8,0,14.1-6.3,14.1-14.1c0-7.8-6.3-14.1-14.1-14.1h-29.7l5.8-28.2h59.2c7.8,0,14.1-6.3,14.1-14.1s-6.3-14.1-14.1-14.1h-53.3l5.2-25.3c4.4-22.1,29-41.2,56.7-31.8c34.8,12.5,73.2,12.5,108,0c29.3-9.5,52.5,10.7,56.7,31.8l35.8,173.1C304.483,276.466,203.483,276.466,107.483,255.566z" />
              <path d="M450.183,399.566c-8.2-34.8-46.9-61.3-93.3-61.3c-44.3,0-81.4,24-91.9,56.4c-7.7-1.8-14.1-1.8-21.8,0c-10.5-32.4-47.7-56.5-92-56.5c-46.5,0-85.2,26.5-93.3,61.3c-6.2,1.5-10.9,7-10.9,13.7s4.7,12.2,10.9,13.7c8.2,34.8,46.9,61.3,93.3,61.3c48,0,87.7-28.3,94-64.8c7-2.4,10.7-2.5,17.6-0.1c6.2,36.6,46,64.9,94.1,64.9c46.5,0,85.1-26.5,93.3-61.3c6.2-1.5,10.9-7,10.9-13.7C461.083,406.666,456.383,401.066,450.183,399.566z M151.183,460.066c-36.2,0-66.8-21.4-66.8-46.7c0-25.3,30.6-46.8,66.8-46.8s66.8,21.4,66.8,46.8C217.983,438.766,187.383,460.066,151.183,460.066z M356.783,460.066c-36.2,0-66.8-21.4-66.8-46.7c0-25.3,30.6-46.8,66.8-46.8c36.2,0,66.8,21.4,66.8,46.8C423.583,438.766,392.983,460.066,356.783,460.066z" />
            </svg>
          </button>
          
          <button 
            onClick={toggleConsole}
            title="Consola/Terminal (Toggle)"
            className={`p-1 rounded hover:bg-editor-hover hover:text-editor-accent transition-all-custom mr-0.5 ${
              isConsoleOpen ? 'text-white bg-editor-active' : ''
            }`}
          >
            <Terminal className="w-4 h-4" />
          </button>

          {!isAgentModeOpen && (
            <button 
              onClick={toggleAIPanel}
              title="Modo Agente (Toggle)"
              className={`p-1 rounded hover:bg-editor-hover hover:text-editor-accent transition-all-custom mr-0.5 ${
                isAIPanelOpen ? 'text-amber-500 hover:text-amber-400 bg-editor-active' : ''
              }`}
            >
              <Bot className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={() => {
              setSidebarTab('settings');
              setSidebarOpen(true);
            }}
            title="Ajustes (Toggle)"
            className="p-1 rounded hover:bg-editor-hover hover:text-editor-accent transition-all-custom"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* OS Standard Controls */}
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-editor-sidebar/45 text-editor-textDark hover:text-editor-accent transition-all-custom"
          title="Minimizar"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-editor-sidebar/45 text-editor-textDark hover:text-editor-accent transition-all-custom"
          title="Maximizar"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-650/85 text-editor-textDark hover:text-editor-accent transition-all-custom"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isSshFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 pt-14 app-non-draggable">
          <form onSubmit={handleSaveSSHConnection} className="w-[420px] max-h-[calc(100vh-72px)] overflow-y-auto rounded-xl border border-editor-border bg-editor-bg p-4 shadow-2xl text-sm text-editor-text">
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-emerald-400" />
              <div>
                <h2 className="font-semibold text-white">Nueva conexión SSH</h2>
                <p className="text-[11px] text-editor-textDark">Guardá un host y abrilo en la terminal integrada.</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] text-editor-textDark">Alias</span>
                <input value={sshDraft.name} onChange={(e) => setSshDraft({ ...sshDraft, name: e.target.value })} className="mt-1 w-full rounded-md border border-editor-border bg-editor-sidebar px-3 py-2 outline-none focus:border-emerald-500" placeholder="mi-servidor-vps" />
              </label>
              <label className="block">
                <span className="text-[11px] text-editor-textDark">Host / IP</span>
                <input value={sshDraft.host} onChange={(e) => setSshDraft({ ...sshDraft, host: e.target.value })} className="mt-1 w-full rounded-md border border-editor-border bg-editor-sidebar px-3 py-2 outline-none focus:border-emerald-500" placeholder="186.23.12.9 o vps.midominio.com" autoFocus />
              </label>
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <label className="block">
                  <span className="text-[11px] text-editor-textDark">Usuario</span>
                  <input value={sshDraft.user} onChange={(e) => setSshDraft({ ...sshDraft, user: e.target.value })} className="mt-1 w-full rounded-md border border-editor-border bg-editor-sidebar px-3 py-2 outline-none focus:border-emerald-500" placeholder="ubuntu" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-editor-textDark">Puerto</span>
                  <input value={sshDraft.port} onChange={(e) => setSshDraft({ ...sshDraft, port: e.target.value })} className="mt-1 w-full rounded-md border border-editor-border bg-editor-sidebar px-3 py-2 outline-none focus:border-emerald-500" placeholder="22" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] text-editor-textDark">Clave privada opcional</span>
                <input value={sshDraft.identityFile} onChange={(e) => setSshDraft({ ...sshDraft, identityFile: e.target.value })} className="mt-1 w-full rounded-md border border-editor-border bg-editor-sidebar px-3 py-2 outline-none focus:border-emerald-500" placeholder="C:\Users\vos\.ssh\id_rsa" />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIsSshFormOpen(false)} className="rounded-md px-3 py-1.5 text-editor-textDark hover:bg-editor-sidebar hover:text-editor-accent">Cancelar</button>
              <button type="submit" className="rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-black hover:bg-emerald-400">Guardar y conectar</button>
            </div>
          </form>
        </div>
      )}

    </header>
  );
};

export default TitleBar;
