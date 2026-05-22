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
    expect(useWorkspaceStore.getState().fileBuffers['/workspace/src/Broken.ts']).toBeUndefined();
  });
});
