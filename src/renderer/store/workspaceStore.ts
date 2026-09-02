import { create } from 'zustand';
import { useSystemDialogStore } from '../components/ui/systemDialogStore';
import { findPath, isPathAtOrWithin, normalizedPath, pathsEqual, recordPath, replacePathPrefix } from '../pathIdentity';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export type ThemeVariant = 'spigot-dark' | 'grayish-dark' | 'solarized-dark';

export interface WorkspaceState {
  workspacePath: string | null;
  fileTree: FileNode[];
  openTabs: string[]; // Paths of currently open files
  activeTabPath: string | null; // Focused tab path
  fileBuffers: Record<string, string>; // Unsaved/edited content: path -> content
  dirtyFiles: string[]; // List of paths with unsaved changes
  pendingCloseFile: string | null; // File awaiting save/discard/cancel confirmation
  pendingSelection: { filePath: string; line: number; column: number; length: number } | null;
  explorerSelectedPath: string | null;
  activeDiffFile: { filePath: string; original: string; modified: string } | null;
  gitChangedFiles: string[]; // Absolute paths of files changed in Git
  gitStatusMap: Record<string, 'M' | 'U' | 'D' | 'I'>; // Map from normalized path to Git status
  imageBuffers: Record<string, string>; // Base64 image previews: path -> base64
  theme: ThemeVariant;
  setTheme: (theme: ThemeVariant) => void;
  selectWorkspace: () => Promise<void>;
  createNewProject: () => Promise<void>;
  setWorkspacePath: (path: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  reloadFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  requestCloseFile: (filePath: string) => void;
  cancelCloseFile: () => void;
  saveAndCloseFile: (filePath: string) => Promise<void>;
  discardAndCloseFile: (filePath: string) => Promise<void>;
  saveFile: (filePath: string) => Promise<void>;
  setActiveTab: (filePath: string) => void;
  updateFileBuffer: (filePath: string, content: string) => void;
  saveActiveFile: () => Promise<void>;
  createItem: (name: string, type: 'file' | 'directory', parentPath?: string) => Promise<void>;
  deleteItem: (itemPath: string) => Promise<void>;
  renameItem: (itemPath: string, newName: string) => Promise<string>;
  moveItem: (itemPath: string, destinationDirectory: string) => Promise<string>;
  setPendingSelection: (selection: { filePath: string; line: number; column: number; length: number } | null) => void;
  setExplorerSelectedPath: (path: string | null) => void;
  restoreLastWorkspace: () => Promise<void>;
  setDiffFile: (diffFile: { filePath: string; original: string; modified: string } | null) => void;
  clearDiffFile: () => void;
  setGitChangedFiles: (files: string[]) => void;
}

const themeClassMap: Record<WorkspaceState['theme'], string> = {
  'spigot-dark': 'theme-spigot',
  'grayish-dark': 'theme-grayish',
  'solarized-dark': 'theme-solarized',
};

const getInitialTheme = (): WorkspaceState['theme'] => {
  if (typeof window === 'undefined') return 'spigot-dark';
  try {
    const stored = window.localStorage.getItem('spigot-theme');
    if (stored === 'spigot-dark' || stored === 'grayish-dark' || stored === 'solarized-dark') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'spigot-dark';
};

const applyThemeClass = (theme: WorkspaceState['theme']) => {
  if (typeof document === 'undefined') return;
  document.body.classList.remove(...Object.values(themeClassMap));
  document.body.classList.add(themeClassMap[theme]);
};

const initialTheme = getInitialTheme();
applyThemeClass(initialTheme);

const RECOVERY_STORAGE_KEY = 'spigot_dirty_recovery_buffers';
let workspaceGeneration = 0;

function getRecoveryBuffers(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage?.getItem(RECOVERY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRecoveryBuffer(filePath: string, content: string) {
  if (typeof window === 'undefined') return;
  try {
    const buffers = getRecoveryBuffers();
    buffers[recordPath(buffers, filePath) ?? filePath] = content;
    window.localStorage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(buffers));
  } catch {}
}

function removeRecoveryBuffer(filePath: string) {
  if (typeof window === 'undefined') return;
  try {
    const buffers = getRecoveryBuffers();
    const matchingPath = recordPath(buffers, filePath);
    if (matchingPath) delete buffers[matchingPath];
    window.localStorage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(buffers));
  } catch {}
}

function remapRecord<T>(record: Record<string, T>, from: string, to: string) {
  return Object.fromEntries(Object.entries(record).map(([path, value]) => [replacePathPrefix(path, from, to), value]));
}

function remapRecoveryBuffers(from: string, to: string) {
  if (typeof window === 'undefined') return;
  try {
    const remapped = remapRecord(getRecoveryBuffers(), from, to);
    window.localStorage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(remapped));
  } catch {}
}

function removeRecoveryBuffersAtOrWithin(itemPath: string) {
  if (typeof window === 'undefined') return;
  try {
    const remaining = Object.fromEntries(
      Object.entries(getRecoveryBuffers()).filter(([path]) => !isPathAtOrWithin(path, itemPath)),
    );
    window.localStorage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(remaining));
  } catch {}
}

function moveWorkspacePaths(state: WorkspaceState, from: string, to: string) {
  const remap = (path: string | null) => path && isPathAtOrWithin(path, from) ? replacePathPrefix(path, from, to) : path;
  return {
    openTabs: state.openTabs.map((path) => remap(path) ?? path),
    activeTabPath: remap(state.activeTabPath),
    fileBuffers: remapRecord(state.fileBuffers, from, to),
    imageBuffers: remapRecord(state.imageBuffers, from, to),
    dirtyFiles: state.dirtyFiles.map((path) => remap(path) ?? path),
    pendingCloseFile: remap(state.pendingCloseFile),
    explorerSelectedPath: remap(state.explorerSelectedPath) ?? to,
    activeDiffFile: state.activeDiffFile && isPathAtOrWithin(state.activeDiffFile.filePath, from)
      ? { ...state.activeDiffFile, filePath: replacePathPrefix(state.activeDiffFile.filePath, from, to) }
      : state.activeDiffFile,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  fileTree: [],
  openTabs: [],
  activeTabPath: null,
  fileBuffers: {},
  imageBuffers: {},
  dirtyFiles: [],
  pendingCloseFile: null,
  pendingSelection: null,
  explorerSelectedPath: null,
  activeDiffFile: null,
  gitChangedFiles: [],
  gitStatusMap: {},
  theme: initialTheme,

  setPendingSelection: (selection) => set({ pendingSelection: selection }),
  setExplorerSelectedPath: (path) => set({ explorerSelectedPath: path }),
  setDiffFile: (diffFile) => set({ activeDiffFile: diffFile }),
  clearDiffFile: () => set({ activeDiffFile: null }),
  setGitChangedFiles: (files) => set({ gitChangedFiles: files }),
  setTheme: (theme) => {
    set({ theme });
    try {
      window.localStorage.setItem('spigot-theme', theme);
    } catch {
      // ignore
    }
    applyThemeClass(theme);
  },

  restoreLastWorkspace: async () => {
    try {
      const lastWorkspacePath = await (window as any).api?.store?.getLastWorkspace?.();
      if (lastWorkspacePath) {
        await get().setWorkspacePath(lastWorkspacePath);
      }
    } catch (err) {
      console.error('Error restoring last workspace:', err);
    }
  },

  selectWorkspace: async () => {
    try {
      const selected = await (window as any).api.fs.selectWorkspace();
      if (selected) {
        await get().setWorkspacePath(selected);
      }
    } catch (err) {
      console.error('Error selecting workspace:', err);
    }
  },

  createNewProject: async () => {
    try {
      // 1. Pick parent folder
      const parentDir = await (window as any).api.fs.selectWorkspace();
      if (!parentDir) return;
      
      // 2. Prompt for name of new project folder
      const name = await useSystemDialogStore.getState().prompt('Nuevo proyecto', 'Ingresá el nombre para la carpeta del nuevo proyecto:');
      if (!name || !name.trim()) return;
      
      // 3. Create the folder on disk
      const newPath = await (window as any).api.fs.createProject(parentDir, name.trim());
      if (newPath) {
        await get().setWorkspacePath(newPath);
      }
    } catch (err) {
      console.error('Error creating new project:', err);
    }
  },

  setWorkspacePath: async (path: string) => {
    const generation = ++workspaceGeneration;
    const workspacePath = await (window as any).api.fs.activateWorkspace(path);
    if (generation !== workspaceGeneration) return;
    set({
      workspacePath,
      fileTree: [],
      openTabs: [],
      activeTabPath: null,
      fileBuffers: {},
      imageBuffers: {},
      dirtyFiles: [],
      gitChangedFiles: [],
      gitStatusMap: {},
    });
    await get().refreshWorkspace();
    if (generation !== workspaceGeneration) return;
    await (window as any).api?.store?.setLastWorkspace?.(workspacePath);
  },

  refreshWorkspace: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    const generation = workspaceGeneration;
    const isCurrentWorkspace = () => generation === workspaceGeneration && pathsEqual(get().workspacePath ?? '', workspacePath);
    try {
      const tree = await (window as any).api.fs.readDir(workspacePath);
      if (!isCurrentWorkspace()) return;
      set({ fileTree: tree });
      
      // Update changed files from Git
      try {
        const changed = await (window as any).api.git.getStatus(workspacePath);
        if (!isCurrentWorkspace()) return;
        if (changed) {
          const absPaths: string[] = [];
          const statusMap: Record<string, 'M' | 'U' | 'D' | 'I'> = {};
          changed.forEach((f: any) => {
            const normRel = f.filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
            const abs = normalizedPath(`${workspacePath}/${normRel}`);
            const trimmed = f.status.trim();
            let code: 'M' | 'U' | 'D' | 'I' = 'M';
            if (trimmed === '!!') {
              code = 'I';
            } else if (trimmed === '??' || trimmed === 'A') {
              code = 'U';
            } else if (trimmed === 'D') {
              code = 'D';
            } else {
              code = 'M';
            }
            statusMap[abs] = code;
            if (code !== 'I') {
              absPaths.push(abs);
            }
          });
          set({ gitChangedFiles: absPaths, gitStatusMap: statusMap });
        }
      } catch (gitErr) {
        console.error('Error updating git files during workspace refresh:', gitErr);
      }
    } catch (err) {
      console.error('Error reading workspace:', err);
    }
  },

  openFile: async (filePath: string) => {
    if (filePath.startsWith('browser://')) {
      set((state) => ({
        openTabs: findPath(state.openTabs, filePath) ? state.openTabs : [...state.openTabs, filePath],
        activeTabPath: findPath(state.openTabs, filePath) ?? filePath,
      }));
      return;
    }

    const isImageFile = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(filePath);

    if (isImageFile) {
      const imageBufferPath = recordPath(get().imageBuffers, filePath) ?? filePath;
      let nextImageBuffer = get().imageBuffers[imageBufferPath];
      if (nextImageBuffer === undefined) {
        try {
          nextImageBuffer = await (window as any).api.fs.readBinaryFile(filePath);
        } catch (err) {
          console.error(`Failed to load image preview for ${filePath}:`, err);
          return;
        }
      }

      set((state) => ({
        openTabs: findPath(state.openTabs, filePath) ? state.openTabs : [...state.openTabs, filePath],
        activeTabPath: findPath(state.openTabs, filePath) ?? filePath,
        imageBuffers: { ...state.imageBuffers, [recordPath(state.imageBuffers, filePath) ?? filePath]: nextImageBuffer },
      }));
      return;
    }

    const bufferPath = recordPath(get().fileBuffers, filePath) ?? filePath;
    let nextContent = get().fileBuffers[bufferPath];
    const recoveryBuffers = getRecoveryBuffers();
    const recoveryContent = recoveryBuffers[recordPath(recoveryBuffers, filePath) ?? filePath];
    let isRecovered = false;

    if (recoveryContent !== undefined) {
      nextContent = recoveryContent;
      isRecovered = true;
    } else if (nextContent === undefined) {
      try {
        nextContent = await (window as any).api.fs.readFile(filePath);
      } catch (err) {
        console.error(`Failed to load file contents for ${filePath}:`, err);
        return;
      }
    }

    set((state) => ({
      openTabs: findPath(state.openTabs, filePath) ? state.openTabs : [...state.openTabs, filePath],
      activeTabPath: findPath(state.openTabs, filePath) ?? filePath,
      fileBuffers: { ...state.fileBuffers, [recordPath(state.fileBuffers, filePath) ?? filePath]: nextContent },
      dirtyFiles: isRecovered && !findPath(state.dirtyFiles, filePath) ? [...state.dirtyFiles, filePath] : state.dirtyFiles,
    }));
  },

  // Re-reads a file from disk into its editor buffer so stale open tabs pick
  // up external changes (e.g. agent edits accepted from a change-set).
  reloadFile: async (filePath: string) => {
    try {
      const content = await (window as any).api.fs.readFile(filePath);
      set((state) => ({
        fileBuffers: { ...state.fileBuffers, [recordPath(state.fileBuffers, filePath) ?? filePath]: content },
      }));
    } catch (err) {
      console.error(`Failed to reload file contents for ${filePath}:`, err);
    }
  },

  closeFile: (filePath: string) => {
    const { openTabs, activeTabPath, dirtyFiles } = get();
    const filteredTabs = openTabs.filter((tabPath) => !pathsEqual(tabPath, filePath));
    
    let nextActive = activeTabPath;
    if (activeTabPath && pathsEqual(activeTabPath, filePath)) {
      // Focus previous tab or next tab
      const index = openTabs.findIndex((tabPath) => pathsEqual(tabPath, filePath));
      if (filteredTabs.length > 0) {
        nextActive = filteredTabs[Math.max(0, index - 1)];
      } else {
        nextActive = null;
      }
    }

    set({
      openTabs: filteredTabs,
      activeTabPath: nextActive,
      dirtyFiles: dirtyFiles.filter((dirtyFile) => !pathsEqual(dirtyFile, filePath)),
    });
  },

  requestCloseFile: (filePath: string) => {
    const { dirtyFiles } = get();
    if (findPath(dirtyFiles, filePath)) {
      set({ pendingCloseFile: filePath });
    } else {
      get().closeFile(filePath);
    }
  },

  cancelCloseFile: () => {
    set({ pendingCloseFile: null });
  },

  saveFile: async (filePath: string) => {
    const { fileBuffers, dirtyFiles } = get();
    const content = fileBuffers[recordPath(fileBuffers, filePath) ?? filePath] ?? '';
    try {
      await (window as any).api.fs.writeFile(filePath, content);
      removeRecoveryBuffer(filePath);
      set({
        dirtyFiles: dirtyFiles.filter((dirtyFile) => !pathsEqual(dirtyFile, filePath)),
      });
      await get().refreshWorkspace();
    } catch (err) {
      console.error(`Error saving file ${filePath}:`, err);
      throw err;
    }
  },

  saveAndCloseFile: async (filePath: string) => {
    try {
      await get().saveFile(filePath);
      get().closeFile(filePath);
      set({ pendingCloseFile: null });
    } catch (err) {
      console.error(`Failed to save and close ${filePath}:`, err);
    }
  },

  discardAndCloseFile: async (filePath: string) => {
    const { fileBuffers } = get();
    removeRecoveryBuffer(filePath);
    const updatedBuffers = { ...fileBuffers };
    const matchingPath = recordPath(updatedBuffers, filePath);
    if (matchingPath) delete updatedBuffers[matchingPath];
    get().closeFile(filePath);
    set({
      fileBuffers: updatedBuffers,
      pendingCloseFile: null,
    });
  },

  setActiveTab: (filePath: string) => {
    set({ activeTabPath: filePath });
  },

  updateFileBuffer: (filePath: string, content: string) => {
    const { dirtyFiles, fileBuffers, gitChangedFiles } = get();
    
    // Quick optimization: only trigger state update if content actually changed
    const bufferPath = recordPath(fileBuffers, filePath) ?? filePath;
    if (fileBuffers[bufferPath] === content) return;

    saveRecoveryBuffer(filePath, content);

    const newBuffers = { ...fileBuffers, [bufferPath]: content };
    const newDirty = findPath(dirtyFiles, filePath) ? dirtyFiles : [...dirtyFiles, filePath];
    const newGitChangedFiles = findPath(gitChangedFiles, filePath) ? gitChangedFiles : [...gitChangedFiles, filePath];

    set({
      fileBuffers: newBuffers,
      dirtyFiles: newDirty,
      gitChangedFiles: newGitChangedFiles,
    });
  },

  saveActiveFile: async () => {
    const { activeTabPath } = get();
    if (!activeTabPath) return;
    await get().saveFile(activeTabPath);
  },

  createItem: async (name: string, type: 'file' | 'directory', parentPath?: string) => {
    const { workspacePath } = get();
    const base = parentPath || workspacePath;
    if (!base || !workspacePath || !isPathAtOrWithin(base, workspacePath)) return;

    const targetPath = `${base}/${name}`.replace(/\/+/g, '/'); // Standardize slashes
    try {
      await (window as any).api.fs.createItem(targetPath, type);
      await get().refreshWorkspace();
      
      // Auto open if it's a file
      if (type === 'file') {
        await get().openFile(targetPath);
      }
    } catch (err) {
      console.error(`Error creating ${type}:`, err);
    }
  },

  deleteItem: async (itemPath: string) => {
    await (window as any).api.fs.deleteItem(itemPath);
    const state = get();
    const openTabs = state.openTabs.filter((path) => !isPathAtOrWithin(path, itemPath));
    const activeTabPath = state.activeTabPath && isPathAtOrWithin(state.activeTabPath, itemPath)
      ? openTabs[Math.max(0, state.openTabs.indexOf(state.activeTabPath) - 1)] ?? null
      : state.activeTabPath;

    removeRecoveryBuffersAtOrWithin(itemPath);
    set({
      openTabs,
      activeTabPath,
      fileBuffers: Object.fromEntries(Object.entries(state.fileBuffers).filter(([path]) => !isPathAtOrWithin(path, itemPath))),
      imageBuffers: Object.fromEntries(Object.entries(state.imageBuffers).filter(([path]) => !isPathAtOrWithin(path, itemPath))),
      dirtyFiles: state.dirtyFiles.filter((path) => !isPathAtOrWithin(path, itemPath)),
      pendingCloseFile: state.pendingCloseFile && isPathAtOrWithin(state.pendingCloseFile, itemPath) ? null : state.pendingCloseFile,
      explorerSelectedPath: state.explorerSelectedPath && isPathAtOrWithin(state.explorerSelectedPath, itemPath) ? null : state.explorerSelectedPath,
    });
    await get().refreshWorkspace();
  },

  renameItem: async (itemPath: string, newName: string) => {
    const newPath = await (window as any).api.fs.renameItem(itemPath, newName) as string;
    set((state) => moveWorkspacePaths(state, itemPath, newPath));
    remapRecoveryBuffers(itemPath, newPath);
    await get().refreshWorkspace();
    return newPath;
  },

  moveItem: async (itemPath: string, destinationDirectory: string) => {
    const newPath = await (window as any).api.fs.moveItem(itemPath, destinationDirectory) as string;
    set((state) => moveWorkspacePaths(state, itemPath, newPath));
    remapRecoveryBuffers(itemPath, newPath);
    await get().refreshWorkspace();
    return newPath;
  }
}));
