import { create } from 'zustand';

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
  pendingSelection: { filePath: string; line: number; column: number; length: number } | null;
  explorerSelectedPath: string | null;
  activeDiffFile: { filePath: string; original: string; modified: string } | null;
  gitChangedFiles: string[]; // Absolute paths of files changed in Git
  imageBuffers: Record<string, string>; // Base64 image previews: path -> base64
  theme: ThemeVariant;
  setTheme: (theme: ThemeVariant) => void;
  selectWorkspace: () => Promise<void>;
  createNewProject: () => Promise<void>;
  setWorkspacePath: (path: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  setActiveTab: (filePath: string) => void;
  updateFileBuffer: (filePath: string, content: string) => void;
  saveActiveFile: () => Promise<void>;
  createItem: (name: string, type: 'file' | 'directory', parentPath?: string) => Promise<void>;
  deleteItem: (itemPath: string) => Promise<void>;
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

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
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
      const name = prompt('Ingresá el nombre para la carpeta del nuevo proyecto:');
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
    set({ workspacePath: path, openTabs: [], activeTabPath: null, fileBuffers: {}, imageBuffers: {}, dirtyFiles: [] });
    await get().refreshWorkspace();
    await (window as any).api?.store?.setLastWorkspace?.(path);
  },

  refreshWorkspace: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    try {
      const tree = await (window as any).api.fs.readDir(workspacePath);
      set({ fileTree: tree });
      
      // Update changed files from Git
      try {
        const changed = await (window as any).api.git.getStatus(workspacePath);
        if (changed) {
          const absPaths = changed.map((f: any) => `${workspacePath}/${f.filePath}`.replace(/\/+/g, '/'));
          set({ gitChangedFiles: absPaths });
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
        openTabs: state.openTabs.includes(filePath) ? state.openTabs : [...state.openTabs, filePath],
        activeTabPath: filePath,
      }));
      return;
    }

    const isImageFile = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(filePath);

    if (isImageFile) {
      let nextImageBuffer = get().imageBuffers[filePath];
      if (nextImageBuffer === undefined) {
        try {
          nextImageBuffer = await (window as any).api.fs.readBinaryFile(filePath);
        } catch (err) {
          console.error(`Failed to load image preview for ${filePath}:`, err);
          return;
        }
      }

      set((state) => ({
        openTabs: state.openTabs.includes(filePath) ? state.openTabs : [...state.openTabs, filePath],
        activeTabPath: filePath,
        imageBuffers: { ...state.imageBuffers, [filePath]: nextImageBuffer },
      }));
      return;
    }

    let nextContent = get().fileBuffers[filePath];
    if (nextContent === undefined) {
      try {
        nextContent = await (window as any).api.fs.readFile(filePath);
      } catch (err) {
        console.error(`Failed to load file contents for ${filePath}:`, err);
        return;
      }
    }

    set((state) => ({
      openTabs: state.openTabs.includes(filePath) ? state.openTabs : [...state.openTabs, filePath],
      activeTabPath: filePath,
      fileBuffers: { ...state.fileBuffers, [filePath]: nextContent },
    }));
  },

  closeFile: (filePath: string) => {
    const { openTabs, activeTabPath, dirtyFiles } = get();
    const filteredTabs = openTabs.filter((t) => t !== filePath);
    
    let nextActive = activeTabPath;
    if (activeTabPath === filePath) {
      // Focus previous tab or next tab
      const index = openTabs.indexOf(filePath);
      if (filteredTabs.length > 0) {
        nextActive = filteredTabs[Math.max(0, index - 1)];
      } else {
        nextActive = null;
      }
    }

    set({
      openTabs: filteredTabs,
      activeTabPath: nextActive,
      // Remove from dirty file array if closing (discard changes or handled by prompt)
      dirtyFiles: dirtyFiles.filter((f) => f !== filePath),
    });
  },

  setActiveTab: (filePath: string) => {
    set({ activeTabPath: filePath });
  },

  updateFileBuffer: (filePath: string, content: string) => {
    const { dirtyFiles, fileBuffers, gitChangedFiles } = get();
    
    // Quick optimization: only trigger state update if content actually changed
    if (fileBuffers[filePath] === content) return;

    const newBuffers = { ...fileBuffers, [filePath]: content };
    const newDirty = dirtyFiles.includes(filePath) ? dirtyFiles : [...dirtyFiles, filePath];

    const newGitChangedFiles = gitChangedFiles.includes(filePath) ? gitChangedFiles : [...gitChangedFiles, filePath];

    set({
      fileBuffers: newBuffers,
      dirtyFiles: newDirty,
      gitChangedFiles: newGitChangedFiles,
    });
  },

  saveActiveFile: async () => {
    const { activeTabPath, fileBuffers, dirtyFiles } = get();
    if (!activeTabPath) return;

    const content = fileBuffers[activeTabPath] ?? '';
    try {
      await (window as any).api.fs.writeFile(activeTabPath, content);
      set({
        dirtyFiles: dirtyFiles.filter((f) => f !== activeTabPath)
      });
      await get().refreshWorkspace();
    } catch (err) {
      console.error(`Error saving file ${activeTabPath}:`, err);
    }
  },

  createItem: async (name: string, type: 'file' | 'directory', parentPath?: string) => {
    const { workspacePath } = get();
    const base = parentPath || workspacePath;
    if (!base) return;

    const targetPath = `${base}/${name}`.replace(/\/+/g, '/'); // Standardize slashes
    try {
      await (window as any).api.apiPath; // just a safeguard placeholder
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
    try {
      await (window as any).api.fs.deleteItem(itemPath);
      
      // If deleted file is currently open, close its tab
      const { openTabs } = get();
      if (openTabs.includes(itemPath)) {
        get().closeFile(itemPath);
      }
      
      await get().refreshWorkspace();
    } catch (err) {
      console.error(`Error deleting item ${itemPath}:`, err);
    }
  }
}));
