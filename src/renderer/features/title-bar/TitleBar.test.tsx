import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TitleBar from './TitleBar';

// 1. Mock Zustand Store
vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: () => ({
    activeTabPath: '/workspace/src/App.tsx',
    selectWorkspace: vi.fn(),
  }),
}));

// 2. Mock Electron IPC window api
(global.window as any).api = {
  app: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  },
};

describe('TitleBar Component', () => {
  it('renders the brand title correctly', () => {
    render(<TitleBar />);
    expect(screen.getByText('SPIGOT')).toBeDefined();
  });

  it('renders the active file name in header', () => {
    render(<TitleBar />);
    expect(screen.getByText('App.tsx')).toBeDefined();
  });

  it('renders the top-bar mock menu buttons', () => {
    render(<TitleBar />);
    expect(screen.getByText('Archivo')).toBeDefined();
    expect(screen.getByText('Editar')).toBeDefined();
    expect(screen.getByText('Ver')).toBeDefined();
  });
});
