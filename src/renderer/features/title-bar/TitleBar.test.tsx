import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import TitleBar from './TitleBar';

const mockSelectWorkspace = vi.fn();
const mockSaveActiveFile = vi.fn();
const mockCreateItem = vi.fn();

// 1. Mock Zustand Store
vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: () => ({
    activeTabPath: '/workspace/src/App.tsx',
    workspacePath: '/workspace',
    selectWorkspace: mockSelectWorkspace,
    saveActiveFile: mockSaveActiveFile,
    createItem: mockCreateItem,
  }),
}));

// 2. Mock Electron IPC window api
const mockMinimize = vi.fn();
const mockMaximize = vi.fn();
const mockClose = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockZoomReset = vi.fn();
const mockGetInfo = vi.fn().mockResolvedValue({
  name: 'Spigot',
  version: '1.0.4',
  platform: 'win32',
  arch: 'x64',
  electron: '30.0.0',
  isPackaged: true,
});
const mockGetSSHServers = vi.fn().mockResolvedValue([
  { id: '1', name: 'test-server-alpha', host: '10.0.0.1', user: 'deploy' },
  { id: '2', name: 'test-server-beta', host: '10.0.0.2', user: 'root' },
]);
const mockAddSSHServer = vi.fn();
const mockInstallUpdate = vi.fn();
const mockCreateSSH = vi.fn().mockResolvedValue('ssh-session-1');
let updateReadyCallback: ((payload: { version?: string }) => void) | null = null;

(global.window as any).api = {
  app: {
    minimize: mockMinimize,
    maximize: mockMaximize,
    close: mockClose,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
    zoomReset: mockZoomReset,
    getInfo: mockGetInfo,
  },
  updater: {
    installUpdate: mockInstallUpdate,
    onUpdateReady: vi.fn((callback: (payload: { version?: string }) => void) => {
      updateReadyCallback = callback;
      return vi.fn();
    }),
  },
  terminal: {
    createSSH: mockCreateSSH,
  },
  store: {
    getSSHServers: mockGetSSHServers,
    addSSHServer: mockAddSSHServer,
    getRecentWorkspaces: vi.fn().mockResolvedValue([]),
  },
};

describe('TitleBar Component', () => {
  beforeEach(() => {
    updateReadyCallback = null;
    mockInstallUpdate.mockClear();
    mockCreateSSH.mockClear();
    mockGetInfo.mockClear();
  });

  it('renders the brand title correctly', () => {
    render(<TitleBar />);
    expect(screen.getByAltText('Spigot')).toBeDefined();
  });

  it('renders the active file name in header', () => {
    render(<TitleBar />);
    expect(screen.getByText('App.tsx')).toBeDefined();
  });

  it('renders the top-bar mock menu buttons', () => {
    render(<TitleBar />);
    expect(screen.getByText('Archivo')).toBeDefined();
    expect(screen.getByText('Ver')).toBeDefined();
    expect(screen.getByText('Tools')).toBeDefined();
    expect(screen.getByText('SSH')).toBeDefined();
    expect(screen.getByText('Ayuda')).toBeDefined();
  });

  it('renders Help dropdown with current app version', async () => {
    render(<TitleBar />);

    fireEvent.click(screen.getByText('Ayuda'));

    expect(await screen.findByText('Ayuda de Spigot')).toBeDefined();
    expect(await screen.findByText('Versión actual: 1.0.4')).toBeDefined();
    expect(mockGetInfo).toHaveBeenCalled();
  });


  it('toggles dropdown when clicking Archivo', () => {
    render(<TitleBar />);
    
    // Dropdown options should not be visible initially
    expect(screen.queryByText('Nuevo Archivo')).toBeNull();
    
    // Click Archivo to open menu
    const fileBtn = screen.getByText('Archivo');
    fireEvent.click(fileBtn);
    
    // Options should now be visible
    expect(screen.getByText('Nuevo Archivo')).toBeDefined();
    expect(screen.getByText('Abrir Carpeta...')).toBeDefined();
    expect(screen.getByText('Guardar')).toBeDefined();
    expect(screen.getByText('Salir')).toBeDefined();

    // Click Archivo again to close
    fireEvent.click(fileBtn);
    expect(screen.queryByText('Nuevo Archivo')).toBeNull();
  });

  it('triggers selectWorkspace when Abrir Carpeta is clicked', () => {
    render(<TitleBar />);
    
    const fileBtn = screen.getByText('Archivo');
    fireEvent.click(fileBtn);
    
    const openFolderBtn = screen.getByText('Abrir Carpeta...');
    fireEvent.click(openFolderBtn);
    
    expect(mockSelectWorkspace).toHaveBeenCalled();
  });

  it('triggers saveActiveFile when Guardar is clicked', () => {
    render(<TitleBar />);
    
    const fileBtn = screen.getByText('Archivo');
    fireEvent.click(fileBtn);
    
    const saveBtn = screen.getByText('Guardar');
    fireEvent.click(saveBtn);
    
    expect(mockSaveActiveFile).toHaveBeenCalled();
  });

  it('triggers api.app.close when Salir is clicked', () => {
    render(<TitleBar />);
    
    const fileBtn = screen.getByText('Archivo');
    fireEvent.click(fileBtn);
    
    const exitBtn = screen.getByText('Salir');
    fireEvent.click(exitBtn);
    
    expect(mockClose).toHaveBeenCalled();
  });

  it('toggles dropdown and handles zoom actions when Ver is clicked', () => {
    render(<TitleBar />);
    
    // Zoom options should not be visible initially
    expect(screen.queryByText('Zoom In')).toBeNull();
    
    // Click Ver to open menu
    const verBtn = screen.getByText('Ver');
    fireEvent.click(verBtn);
    
    // Options should now be visible
    expect(screen.getByText('Zoom In')).toBeDefined();
    expect(screen.getByText('Zoom Out')).toBeDefined();
    expect(screen.getByText('Reset Zoom')).toBeDefined();

    // Click Zoom In
    const zoomInBtn = screen.getByText('Zoom In');
    fireEvent.click(zoomInBtn);
    expect(mockZoomIn).toHaveBeenCalled();

    // Re-open menu to click Zoom Out
    fireEvent.click(verBtn);
    const zoomOutBtn = screen.getByText('Zoom Out');
    fireEvent.click(zoomOutBtn);
    expect(mockZoomOut).toHaveBeenCalled();

    // Re-open menu to click Reset Zoom
    fireEvent.click(verBtn);
    const zoomResetBtn = screen.getByText('Reset Zoom');
    fireEvent.click(zoomResetBtn);
    expect(mockZoomReset).toHaveBeenCalled();
  });

  it('shows update button after update is downloaded and installs on click', async () => {
    render(<TitleBar />);

    expect(screen.queryByText('Actualizar versión')).toBeNull();

    act(() => {
      updateReadyCallback?.({ version: '1.0.4' });
    });

    const updateButton = await screen.findByText('Actualizar versión');
    fireEvent.click(updateButton);

    expect(mockInstallUpdate).toHaveBeenCalled();
  });

  it('opens an SSH terminal when selecting a saved server', async () => {
    render(<TitleBar />);

    fireEvent.click(screen.getByText('SSH'));

    const serverButton = await screen.findByText('test-server-alpha');
    fireEvent.click(serverButton);

    await waitFor(() => {
      expect(mockCreateSSH).toHaveBeenCalledWith(100, 30, expect.objectContaining({
        host: '10.0.0.1',
        user: 'deploy',
      }));
    });
  });

  it('toggles SSH dropdown and displays servers from store when clicked', async () => {
    render(<TitleBar />);
    
    // SSH options should not be visible initially
    expect(screen.queryByText('Nueva Conexión VPS...')).toBeNull();
    
    // Click SSH to open menu (triggers async loadSshServers)
    const sshBtn = screen.getByText('SSH');
    fireEvent.click(sshBtn);
    
    // Static options should appear immediately
    expect(screen.getByText('Nueva Conexión VPS...')).toBeDefined();
    expect(screen.getByText('Claves y Credenciales...')).toBeDefined();
    
    // Dynamic servers load from the mock store asynchronously
    await waitFor(() => {
      expect(screen.getByText('test-server-alpha')).toBeDefined();
      expect(screen.getByText('test-server-beta')).toBeDefined();
    });
    
    expect(mockGetSSHServers).toHaveBeenCalled();
  });
});


