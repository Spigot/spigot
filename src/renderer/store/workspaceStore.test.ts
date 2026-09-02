import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';

const resetWorkspaceStore = () => {
  useWorkspaceStore.setState({
    workspacePath: null,
    fileTree: [],
    openTabs: [],
    activeTabPath: null,
    fileBuffers: {},
    imageBuffers: {},
    dirtyFiles: [],
    pendingSelection: null,
    explorerSelectedPath: null,
    activeDiffFile: null,
    gitChangedFiles: [],
    gitStatusMap: {},
  });
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('workspaceStore openFile', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetWorkspaceStore();
    (global.window as any).api = {
      fs: {
        activateWorkspace: vi.fn((workspacePath: string) => Promise.resolve(workspacePath)),
        readFile: vi.fn(),
        readBinaryFile: vi.fn(),
        readDir: vi.fn().mockResolvedValue([]),
        deleteItem: vi.fn(),
        renameItem: vi.fn(),
        moveItem: vi.fn(),
      },
      git: { getStatus: vi.fn().mockResolvedValue([]) },
    };
  });

  describe('setWorkspacePath', () => {
    it('activates a recent workspace before refreshing or persisting renderer state', async () => {
      const fs = (global.window as any).api.fs;
      const store = ((global.window as any).api.store = { setLastWorkspace: vi.fn().mockResolvedValue(true) });
      fs.activateWorkspace.mockResolvedValueOnce('/recent-workspace');

      await useWorkspaceStore.getState().setWorkspacePath('/recent-workspace');

      expect(fs.activateWorkspace).toHaveBeenCalledWith('/recent-workspace');
      expect(fs.readDir).toHaveBeenCalledWith('/recent-workspace');
      expect(store.setLastWorkspace).toHaveBeenCalledWith('/recent-workspace');
      expect(useWorkspaceStore.getState().workspacePath).toBe('/recent-workspace');
    });

    it('leaves the current workspace untouched when activation rejects', async () => {
      const fs = (global.window as any).api.fs;
      const store = ((global.window as any).api.store = { setLastWorkspace: vi.fn() });
      fs.activateWorkspace.mockRejectedValueOnce(new Error('workspace is invalid'));
      useWorkspaceStore.setState({ workspacePath: '/current-workspace', fileTree: [{ name: 'current.ts', path: '/current-workspace/current.ts', isDirectory: false }] });

      await expect(useWorkspaceStore.getState().setWorkspacePath('/recent-workspace')).rejects.toThrow('workspace is invalid');

      expect(fs.readDir).not.toHaveBeenCalled();
      expect(store.setLastWorkspace).not.toHaveBeenCalled();
      expect(useWorkspaceStore.getState().workspacePath).toBe('/current-workspace');
    });

    it('does not let a stale refresh replace the newly activated workspace tree', async () => {
      const fs = (global.window as any).api.fs;
      const oldTree = deferred<any[]>();
      fs.readDir.mockReturnValueOnce(oldTree.promise).mockResolvedValueOnce([
        { name: 'new.ts', path: '/new-workspace/new.ts', isDirectory: false },
      ]);
      useWorkspaceStore.setState({ workspacePath: '/old-workspace' });

      const staleRefresh = useWorkspaceStore.getState().refreshWorkspace();
      await useWorkspaceStore.getState().setWorkspacePath('/new-workspace');
      oldTree.resolve([{ name: 'old.ts', path: '/old-workspace/old.ts', isDirectory: false }]);
      await staleRefresh;

      expect(useWorkspaceStore.getState().workspacePath).toBe('/new-workspace');
      expect(useWorkspaceStore.getState().fileTree).toEqual([
        { name: 'new.ts', path: '/new-workspace/new.ts', isDirectory: false },
      ]);
    });
  });

  it('activates a text file only after its content is loaded', async () => {
    const read = deferred<string>();
    (global.window as any).api.fs.readFile.mockReturnValueOnce(read.promise);

    const opening = useWorkspaceStore.getState().openFile('/workspace/src/App.tsx');

    expect(useWorkspaceStore.getState().activeTabPath).toBeNull();
    expect(useWorkspaceStore.getState().openTabs).toEqual([]);

    read.resolve('export const App = () => null;\n');
    await opening;

    expect(useWorkspaceStore.getState().activeTabPath).toBe('/workspace/src/App.tsx');
    expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/src/App.tsx']);
    expect(useWorkspaceStore.getState().fileBuffers['/workspace/src/App.tsx']).toBe('export const App = () => null;\n');
  });

  it('does not open a blank tab when reading a file fails', async () => {
    (global.window as any).api.fs.readFile.mockRejectedValueOnce(new Error('read failed'));

    await useWorkspaceStore.getState().openFile('/workspace/src/Broken.ts');

    expect(useWorkspaceStore.getState().activeTabPath).toBeNull();
    expect(useWorkspaceStore.getState().openTabs).toEqual([]);
    expect(useWorkspaceStore.getState().fileBuffers['/workspace/src/Missing.tsx']).toBeUndefined();
  });

  describe('Dirty Buffer Management & Recovery', () => {
    it('applies the platform case policy to tabs, dirty buffers, recovery, and selection', async () => {
      const upperPath = '/workspace/Foo';
      const lowerPath = '/workspace/foo';
      (global.window as any).api.fs.readFile.mockResolvedValue('file content');

      try {
          for (const platform of ['win32', 'linux']) {
          (global.window as any).api.platform = platform;
          resetWorkspaceStore();
          localStorage.clear();

          await useWorkspaceStore.getState().openFile(upperPath);
          await useWorkspaceStore.getState().openFile(lowerPath);
          useWorkspaceStore.getState().updateFileBuffer(upperPath, 'upper edit');
          useWorkspaceStore.getState().updateFileBuffer(lowerPath, 'lower edit');
          useWorkspaceStore.getState().requestCloseFile(lowerPath);

          if (platform === 'win32') {
            expect(useWorkspaceStore.getState().openTabs).toEqual([upperPath]);
            expect(useWorkspaceStore.getState().dirtyFiles).toEqual([upperPath]);
          } else {
            expect(useWorkspaceStore.getState().openTabs).toEqual([upperPath, lowerPath]);
            expect(useWorkspaceStore.getState().dirtyFiles).toEqual([upperPath, lowerPath]);
          }
          expect(useWorkspaceStore.getState().pendingCloseFile).toBe(lowerPath);

          await useWorkspaceStore.getState().discardAndCloseFile(lowerPath);

          if (platform === 'win32') {
            expect(useWorkspaceStore.getState().fileBuffers).toEqual({});
          } else {
            expect(useWorkspaceStore.getState().fileBuffers).toEqual({ [upperPath]: 'upper edit' });
            expect(JSON.parse(localStorage.getItem('spigot_dirty_recovery_buffers')!)).toEqual({ [upperPath]: 'upper edit' });
          }

          useWorkspaceStore.getState().setExplorerSelectedPath(lowerPath);
          await useWorkspaceStore.getState().deleteItem(upperPath);
          expect(useWorkspaceStore.getState().explorerSelectedPath).toBe(platform === 'win32' ? null : lowerPath);
        }
      } finally {
        delete (global.window as any).api.platform;
        localStorage.clear();
      }
    });

    it('keeps darwin path identities case-sensitive under the Windows-only folding policy', async () => {
      (global.window as any).api.platform = 'darwin';
      (global.window as any).api.fs.readFile.mockResolvedValue('file content');

      try {
        await useWorkspaceStore.getState().openFile('/workspace/Foo');
        await useWorkspaceStore.getState().openFile('/workspace/foo');

        expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/Foo', '/workspace/foo']);
      } finally {
        delete (global.window as any).api.platform;
      }
    });

    it('immediately closes clean file on requestCloseFile', () => {
      useWorkspaceStore.setState({
        openTabs: ['/workspace/a.ts', '/workspace/b.ts'],
        activeTabPath: '/workspace/b.ts',
        dirtyFiles: [],
      });

      useWorkspaceStore.getState().requestCloseFile('/workspace/b.ts');

      expect(useWorkspaceStore.getState().pendingCloseFile).toBeNull();
      expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/a.ts']);
      expect(useWorkspaceStore.getState().activeTabPath).toBe('/workspace/a.ts');
    });

    it('prompts confirmation on requestCloseFile when file has unsaved changes', () => {
      useWorkspaceStore.setState({
        openTabs: ['/workspace/a.ts'],
        activeTabPath: '/workspace/a.ts',
        dirtyFiles: ['/workspace/a.ts'],
        pendingCloseFile: null,
      });

      useWorkspaceStore.getState().requestCloseFile('/workspace/a.ts');

      // Tab remains open, pending confirmation modal is set
      expect(useWorkspaceStore.getState().pendingCloseFile).toBe('/workspace/a.ts');
      expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/a.ts']);
    });

    it('cancels close on cancelCloseFile keeping dirty tab open', () => {
      useWorkspaceStore.setState({
        openTabs: ['/workspace/a.ts'],
        dirtyFiles: ['/workspace/a.ts'],
        pendingCloseFile: '/workspace/a.ts',
      });

      useWorkspaceStore.getState().cancelCloseFile();

      expect(useWorkspaceStore.getState().pendingCloseFile).toBeNull();
      expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/a.ts']);
      expect(useWorkspaceStore.getState().dirtyFiles).toContain('/workspace/a.ts');
    });

    it('saves file and closes tab on saveAndCloseFile', async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      (global.window as any).api.fs.writeFile = mockWriteFile;
      (global.window as any).api.fs.readDir = vi.fn().mockResolvedValue([]);

      useWorkspaceStore.setState({
        openTabs: ['/workspace/a.ts'],
        activeTabPath: '/workspace/a.ts',
        fileBuffers: { '/workspace/a.ts': 'modified content' },
        dirtyFiles: ['/workspace/a.ts'],
        pendingCloseFile: '/workspace/a.ts',
      });

      await useWorkspaceStore.getState().saveAndCloseFile('/workspace/a.ts');

      expect(mockWriteFile).toHaveBeenCalledWith('/workspace/a.ts', 'modified content');
      expect(useWorkspaceStore.getState().pendingCloseFile).toBeNull();
      expect(useWorkspaceStore.getState().openTabs).toEqual([]);
      expect(useWorkspaceStore.getState().dirtyFiles).not.toContain('/workspace/a.ts');
    });

    it('discards modifications and closes tab on discardAndCloseFile', async () => {
      useWorkspaceStore.setState({
        openTabs: ['/workspace/a.ts'],
        activeTabPath: '/workspace/a.ts',
        fileBuffers: { '/workspace/a.ts': 'discarded content' },
        dirtyFiles: ['/workspace/a.ts'],
        pendingCloseFile: '/workspace/a.ts',
      });

      await useWorkspaceStore.getState().discardAndCloseFile('/workspace/a.ts');

      expect(useWorkspaceStore.getState().pendingCloseFile).toBeNull();
      expect(useWorkspaceStore.getState().openTabs).toEqual([]);
      expect(useWorkspaceStore.getState().dirtyFiles).not.toContain('/workspace/a.ts');
      expect(useWorkspaceStore.getState().fileBuffers['/workspace/a.ts']).toBeUndefined();
    });

    it('persists recovery buffer in localStorage on buffer update and restores it on openFile', async () => {
      localStorage.clear();

      useWorkspaceStore.setState({
        openTabs: ['/workspace/file.ts'],
        fileBuffers: { '/workspace/file.ts': 'initial' },
        dirtyFiles: [],
      });

      // User types and updates buffer
      useWorkspaceStore.getState().updateFileBuffer('/workspace/file.ts', 'unsaved edit');

      const recoveryRaw = localStorage.getItem('spigot_dirty_recovery_buffers');
      expect(recoveryRaw).toBeDefined();
      expect(JSON.parse(recoveryRaw!)).toHaveProperty('/workspace/file.ts', 'unsaved edit');

      // Now reset store (simulating crash or app restart)
      resetWorkspaceStore();

      // Open the file again
      await useWorkspaceStore.getState().openFile('/workspace/file.ts');

      expect(useWorkspaceStore.getState().fileBuffers['/workspace/file.ts']).toBe('unsaved edit');
      expect(useWorkspaceStore.getState().dirtyFiles).toContain('/workspace/file.ts');
    });
  });

  it('preserves workspace paths when rename, move, or delete operations fail', async () => {
    const fs = (global.window as any).api.fs;
    fs.renameItem.mockRejectedValueOnce(new Error('rename denied'));
    fs.moveItem.mockRejectedValueOnce(new Error('move denied'));
    fs.deleteItem.mockRejectedValueOnce(new Error('delete denied'));
    useWorkspaceStore.setState({
      openTabs: ['/workspace/source.ts'],
      activeTabPath: '/workspace/source.ts',
      fileBuffers: { '/workspace/source.ts': 'content' },
      explorerSelectedPath: '/workspace/source.ts',
    });

    await expect(useWorkspaceStore.getState().renameItem('/workspace/source.ts', 'renamed.ts')).rejects.toThrow('rename denied');
    await expect(useWorkspaceStore.getState().moveItem('/workspace/source.ts', '/workspace/target')).rejects.toThrow('move denied');
    await expect(useWorkspaceStore.getState().deleteItem('/workspace/source.ts')).rejects.toThrow('delete denied');

    expect(useWorkspaceStore.getState()).toMatchObject({
      openTabs: ['/workspace/source.ts'],
      activeTabPath: '/workspace/source.ts',
      fileBuffers: { '/workspace/source.ts': 'content' },
      explorerSelectedPath: '/workspace/source.ts',
    });
  });

  describe('explorer mutations', () => {
    it('does not submit creation to a parent from a prior workspace', async () => {
      const createItem = ((global.window as any).api.fs.createItem = vi.fn());
      useWorkspaceStore.setState({ workspacePath: '/new-workspace' });

      await useWorkspaceStore.getState().createItem('stale.ts', 'file', '/old-workspace');

      expect(createItem).not.toHaveBeenCalled();
    });

    it('keeps tree selection and open tabs intact when deletion fails', async () => {
      (global.window as any).api.fs.deleteItem.mockRejectedValueOnce(new Error('access denied'));
      useWorkspaceStore.setState({
        explorerSelectedPath: '/workspace/src',
        openTabs: ['/workspace/src/App.tsx'],
        activeTabPath: '/workspace/src/App.tsx',
        fileBuffers: { '/workspace/src/App.tsx': 'content' },
      });

      await expect(useWorkspaceStore.getState().deleteItem('/workspace/src')).rejects.toThrow('access denied');

      expect(useWorkspaceStore.getState().explorerSelectedPath).toBe('/workspace/src');
      expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/src/App.tsx']);
    });

    it('closes every tab and buffer below a deleted folder after filesystem success', async () => {
      useWorkspaceStore.setState({
        workspacePath: '/workspace',
        explorerSelectedPath: '/workspace/src',
        openTabs: ['/workspace/src/App.tsx', '/workspace/README.md'],
        activeTabPath: '/workspace/src/App.tsx',
        fileBuffers: { '/workspace/src/App.tsx': 'content', '/workspace/README.md': 'readme' },
        imageBuffers: { '/workspace/src/logo.png': 'image' },
        dirtyFiles: ['/workspace/src/App.tsx'],
      });

      await useWorkspaceStore.getState().deleteItem('/workspace/src');

      expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/README.md']);
      expect(useWorkspaceStore.getState().activeTabPath).toBe('/workspace/README.md');
      expect(useWorkspaceStore.getState().fileBuffers).toEqual({ '/workspace/README.md': 'readme' });
      expect(useWorkspaceStore.getState().imageBuffers).toEqual({});
      expect(useWorkspaceStore.getState().explorerSelectedPath).toBeNull();
    });

    it('remaps open folder tabs, buffers, and selection after a successful move', async () => {
      (global.window as any).api.fs.moveItem.mockResolvedValueOnce('/workspace/lib/src');
      useWorkspaceStore.setState({
        workspacePath: '/workspace',
        explorerSelectedPath: '/workspace/src',
        openTabs: ['/workspace/src/App.tsx'],
        activeTabPath: '/workspace/src/App.tsx',
        fileBuffers: { '/workspace/src/App.tsx': 'content' },
        dirtyFiles: ['/workspace/src/App.tsx'],
        activeDiffFile: { filePath: '/workspace/src/App.tsx', original: 'original', modified: 'content' },
      });

      await useWorkspaceStore.getState().moveItem('/workspace/src', '/workspace/lib');

      expect(useWorkspaceStore.getState().openTabs).toEqual(['/workspace/lib/src/App.tsx']);
      expect(useWorkspaceStore.getState().activeTabPath).toBe('/workspace/lib/src/App.tsx');
      expect(useWorkspaceStore.getState().fileBuffers).toEqual({ '/workspace/lib/src/App.tsx': 'content' });
      expect(useWorkspaceStore.getState().explorerSelectedPath).toBe('/workspace/lib/src');
      expect(useWorkspaceStore.getState().activeDiffFile).toEqual({
        filePath: '/workspace/lib/src/App.tsx', original: 'original', modified: 'content',
      });
    });

    it('remaps the active diff after a successful rename', async () => {
      (global.window as any).api.fs.renameItem.mockResolvedValueOnce('/workspace/renamed.ts');
      useWorkspaceStore.setState({
        activeDiffFile: { filePath: '/workspace/source.ts', original: 'original', modified: 'content' },
      });

      await useWorkspaceStore.getState().renameItem('/workspace/source.ts', 'renamed.ts');

      expect(useWorkspaceStore.getState().activeDiffFile).toEqual({
        filePath: '/workspace/renamed.ts', original: 'original', modified: 'content',
      });
    });
  });
});
