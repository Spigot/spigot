import { create } from 'zustand';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface WorkspaceState {
  workspacePath: string | null;
  fileTree: FileNode[];
  openTabs: string[]; // Paths of currently open files
  activeTabPath: string | null; // Focused tab path
  fileBuffers: Record<string, string>; // Unsaved/edited content: path -> content
  dirtyFiles: string[]; // List of paths with unsaved changes

  selectWorkspace: () => Promise<void>;
  setWorkspacePath: (path: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  setActiveTab: (filePath: string) => void;
  updateFileBuffer: (filePath: string, content: string) => void;
  saveActiveFile: () => Promise<void>;
  createItem: (name: string, type: 'file' | 'directory', parentPath?: string) => Promise<void>;
  deleteItem: (itemPath: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  fileTree: [],
  openTabs: [],
  activeTabPath: null,
  fileBuffers: {},
  dirtyFiles: [],

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

  setWorkspacePath: async (path: string) => {
    set({ workspacePath: path, openTabs: [], activeTabPath: null, fileBuffers: {}, dirtyFiles: [] });
    await get().refreshWorkspace();
  },

  refreshWorkspace: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    try {
      const tree = await (window as any).api.fs.readDir(workspacePath);
      set({ fileTree: tree });
    } catch (err) {
      console.error('Error reading workspace:', err);
    }
  },

  openFile: async (filePath: string) => {
    const { openTabs, fileBuffers } = get();
    
    // Add tab if not already present
    if (!openTabs.includes(filePath)) {
      set({ openTabs: [...openTabs, filePath] });
    }
    
    set({ activeTabPath: filePath });

    // Load file from disk if not already cached in memory buffer
    if (fileBuffers[filePath] === undefined) {
      try {
        const content = await (window as any).api.fs.readFile(filePath);
        set((state) => ({
          fileBuffers: { ...state.fileBuffers, [filePath]: content }
        }));
      } catch (err) {
        console.error(`Failed to load file contents for ${filePath}:`, err);
      }
    }
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
    const { dirtyFiles, fileBuffers } = get();
    
    // Quick optimization: only trigger state update if content actually changed
    if (fileBuffers[filePath] === content) return;

    const newBuffers = { ...fileBuffers, [filePath]: content };
    const newDirty = dirtyFiles.includes(filePath) ? dirtyFiles : [...dirtyFiles, filePath];

    set({
      fileBuffers: newBuffers,
      dirtyFiles: newDirty
    });
  },

  saveActiveFile: async () => {
    const { activeTabPath, fileBuffers, dirtyFiles } = get();
    if (!activeTabPath || !dirtyFiles.includes(activeTabPath)) return;

    const content = fileBuffers[activeTabPath] || '';
    try {
      await (window as any).api.fs.writeFile(activeTabPath, content);
      set({
        dirtyFiles: dirtyFiles.filter((f) => f !== activeTabPath)
      });
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
