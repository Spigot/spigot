import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
(global.window as any).api = {
  app: {
    minimize: mockMinimize,
    maximize: mockMaximize,
    close: mockClose,
  },
};

describe('TitleBar Component', () => {
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
    expect(screen.getByText('File')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
    expect(screen.getByText('View')).toBeDefined();
  });

  it('toggles dropdown when clicking File', () => {
    render(<TitleBar />);
    
    // Dropdown options should not be visible initially
    expect(screen.queryByText('New File')).toBeNull();
    
    // Click File to open menu
    const fileBtn = screen.getByText('File');
    fireEvent.click(fileBtn);
    
    // Options should now be visible
    expect(screen.getByText('New File')).toBeDefined();
    expect(screen.getByText('Open Folder...')).toBeDefined();
    expect(screen.getByText('Save')).toBeDefined();
    expect(screen.getByText('Exit')).toBeDefined();

    // Click File again to close
    fireEvent.click(fileBtn);
    expect(screen.queryByText('New File')).toBeNull();
  });

  it('triggers selectWorkspace when Open Folder is clicked', () => {
    render(<TitleBar />);
    
    const fileBtn = screen.getByText('File');
    fireEvent.click(fileBtn);
    
    const openFolderBtn = screen.getByText('Open Folder...');
    fireEvent.click(openFolderBtn);
    
    expect(mockSelectWorkspace).toHaveBeenCalled();
  });

  it('triggers saveActiveFile when Save is clicked', () => {
    render(<TitleBar />);
    
    const fileBtn = screen.getByText('File');
    fireEvent.click(fileBtn);
    
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);
    
    expect(mockSaveActiveFile).toHaveBeenCalled();
  });

  it('triggers api.app.close when Exit is clicked', () => {
    render(<TitleBar />);
    
    const fileBtn = screen.getByText('File');
    fireEvent.click(fileBtn);
    
    const exitBtn = screen.getByText('Exit');
    fireEvent.click(exitBtn);
    
    expect(mockClose).toHaveBeenCalled();
  });
});
