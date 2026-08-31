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
        readFile: vi.fn(),
        readBinaryFile: vi.fn(),
      },
    };
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
});
