import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileTree } from './FileTree';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useSystemDialogStore } from '../../components/ui/systemDialogStore';

describe('FileTree', () => {
  beforeEach(() => {
    (global.window as any).api = {
      fs: {
        readDir: vi.fn().mockResolvedValue([]),
        readFile: vi.fn(),
        moveItem: vi.fn().mockResolvedValue('/workspace/target/source.ts'),
      },
      git: { getStatus: vi.fn().mockResolvedValue([]) },
    };
    useWorkspaceStore.setState({
      workspacePath: '/workspace',
      fileTree: [
        { name: 'source.ts', path: '/workspace/source.ts', isDirectory: false },
        {
          name: 'parent',
          path: '/workspace/parent',
          isDirectory: true,
          children: [{
            name: 'source-folder',
            path: '/workspace/parent/source-folder',
            isDirectory: true,
            children: [{ name: 'child', path: '/workspace/parent/source-folder/child', isDirectory: true, children: [] }],
          }],
        },
        { name: 'target', path: '/workspace/target', isDirectory: true, children: [] },
      ],
      openTabs: [],
      activeTabPath: null,
      fileBuffers: {},
      imageBuffers: {},
      dirtyFiles: [],
      explorerSelectedPath: null,
      gitStatusMap: {},
    });
    useSystemDialogStore.setState({ request: null });
  });

  it('shows rename, move guidance, and delete actions on a file context menu', () => {
    render(<FileTree />);

    fireEvent.contextMenu(screen.getByText('source.ts'), { clientX: 20, clientY: 20 });

    expect(screen.queryByRole('menu')).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: /renombrar/i })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: /mover/i })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: /eliminar/i })).not.toBeNull();
    expect(useWorkspaceStore.getState().explorerSelectedPath).toBe('/workspace/source.ts');
  });

  it('cancels active creation when the workspace switches', async () => {
    render(<FileTree />);

    fireEvent.click(screen.getByTitle('Nuevo archivo'));
    expect(screen.queryByPlaceholderText('nombre.ext')).not.toBeNull();

    await act(async () => {
      useWorkspaceStore.setState({ workspacePath: '/new-workspace', fileTree: [] });
    });

    expect(screen.queryByPlaceholderText('nombre.ext')).toBeNull();
  });

  it('moves a file when it is dropped onto a directory', async () => {
    render(<FileTree />);
    const source = screen.getByText('source.ts');
    const target = screen.getByText('target');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect((global.window as any).api.fs.moveItem).toHaveBeenCalledWith('/workspace/source.ts', '/workspace/target'));
  });

  it('moves a nested file when it is dropped onto the workspace root', async () => {
    (global.window as any).api.fs.moveItem.mockResolvedValueOnce('/workspace/source-folder');
    render(<FileTree />);
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
    const root = screen.getByText('workspace').parentElement?.parentElement!;

    fireEvent.click(screen.getByText('parent'));
    fireEvent.dragStart(screen.getByText('source-folder'), { dataTransfer });
    fireEvent.dragOver(root, { dataTransfer });
    expect(root.className).toContain('ring-editor-accent');
    fireEvent.drop(root, { dataTransfer });

    await waitFor(() => expect((global.window as any).api.fs.moveItem).toHaveBeenCalledWith('/workspace/parent/source-folder', '/workspace'));
  });

  it('does not move invalid self, parent, descendant, or file drops', () => {
    render(<FileTree />);
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
    fireEvent.click(screen.getByText('parent'));
    fireEvent.click(screen.getByText('source-folder'));

    fireEvent.dragStart(screen.getByText('source.ts'), { dataTransfer });
    fireEvent.drop(screen.getByText('source.ts'), { dataTransfer });

    fireEvent.dragStart(screen.getByText('source-folder'), { dataTransfer });
    fireEvent.drop(screen.getByText('source-folder'), { dataTransfer });
    fireEvent.drop(screen.getByText('parent'), { dataTransfer });
    fireEvent.drop(screen.getByText('child'), { dataTransfer });
    fireEvent.drop(screen.getByText('source.ts'), { dataTransfer });

    expect((global.window as any).api.fs.moveItem).not.toHaveBeenCalled();
  });

  it('treats case-only source and destination paths according to the renderer platform', async () => {
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
    const caseDistinctTree = [
      { name: 'Foo', path: '/workspace/Foo', isDirectory: false },
      { name: 'foo', path: '/workspace/foo', isDirectory: true, children: [] },
    ];
    useWorkspaceStore.setState({
      fileTree: caseDistinctTree,
    });

    try {
      (global.window as any).api.platform = 'linux';
      const linuxTree = render(<FileTree />);
      fireEvent.dragStart(screen.getByText('Foo'), { dataTransfer });
      fireEvent.drop(screen.getByText('foo'), { dataTransfer });
      await waitFor(() => expect((global.window as any).api.fs.moveItem).toHaveBeenCalledWith('/workspace/Foo', '/workspace/foo'));

      linuxTree.unmount();
      (global.window as any).api.fs.moveItem.mockClear();
      (global.window as any).api.platform = 'win32';
      useWorkspaceStore.setState({ fileTree: caseDistinctTree });
      render(<FileTree />);
      fireEvent.dragStart(screen.getByText('Foo'), { dataTransfer });
      fireEvent.drop(screen.getByText('foo'), { dataTransfer });
      expect((global.window as any).api.fs.moveItem).not.toHaveBeenCalled();
    } finally {
      delete (global.window as any).api.platform;
    }
  });

  it('keeps explorer state and surfaces an error when a move fails', async () => {
    (global.window as any).api.fs.moveItem.mockRejectedValueOnce(new Error('permission denied'));
    render(<FileTree />);
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };

    fireEvent.dragStart(screen.getByText('source.ts'), { dataTransfer });
    fireEvent.drop(screen.getByText('target'), { dataTransfer });

    await waitFor(() => expect(useSystemDialogStore.getState().request).toMatchObject({
      kind: 'alert', title: 'No se pudo mover', message: 'permission denied',
    }));
    expect(useWorkspaceStore.getState().fileTree[0].path).toBe('/workspace/source.ts');
    await act(async () => {
      useSystemDialogStore.getState().resolve(true);
    });
  });
});
