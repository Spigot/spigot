import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { promises as fsPromises } from 'fs';
import { terminalManager } from './terminal';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    fullscreen: true, // Start in fullscreen mode as requested
    frame: false, // Frameless window for premium custom title bar
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load Vite Dev Server URL in development
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // devtools disabled by default
    // mainWindow.webContents.openDevTools();
  } else {
    // Load local HTML file in production
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    terminalManager.clearAll();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  terminalManager.clearAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App Window IPC Controls
ipcMain.on('app:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('app:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('app:close', () => {
  terminalManager.clearAll();
  mainWindow?.close();
});

// Workspace selection IPC
ipcMain.handle('fs:select-workspace', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Seleccionar Carpeta de Proyecto',
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Structured file node interface
interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

// Read Workspace Tree recursively with exclude lists
ipcMain.handle('fs:read-dir', async (_event, dirPath: string): Promise<FileNode[]> => {
  const EXCLUDE_LIST = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', '.antigravitycli']);
  
  async function buildTree(currentPath: string): Promise<FileNode[]> {
    try {
      const items = await fsPromises.readdir(currentPath, { withFileTypes: true });
      const nodes: FileNode[] = [];

      // Sort directories first, then files alphabetically
      const sortedItems = items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const item of sortedItems) {
        if (EXCLUDE_LIST.has(item.name)) continue;

        const fullPath = join(currentPath, item.name);
        const isDirectory = item.isDirectory();

        const node: FileNode = {
          name: item.name,
          path: fullPath,
          isDirectory,
        };

        if (isDirectory) {
          node.children = await buildTree(fullPath);
        }

        nodes.push(node);
      }

      return nodes;
    } catch (err) {
      console.error(`Error walking directory ${currentPath}:`, err);
      return [];
    }
  }

  return buildTree(dirPath);
});

// File System CRUD Handlers
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  try {
    return await fsPromises.readFile(filePath, 'utf-8');
  } catch (err: any) {
    console.error(`Error reading file ${filePath}:`, err);
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
  try {
    await fsPromises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err: any) {
    console.error(`Error writing file ${filePath}:`, err);
    throw new Error(`Failed to write file: ${err.message}`);
  }
});

ipcMain.handle('fs:create-item', async (_event, itemPath: string, type: 'file' | 'directory') => {
  try {
    if (type === 'directory') {
      await fsPromises.mkdir(itemPath, { recursive: true });
    } else {
      await fsPromises.writeFile(itemPath, '', 'utf-8');
    }
    return true;
  } catch (err: any) {
    console.error(`Error creating ${type} at ${itemPath}:`, err);
    throw new Error(`Failed to create item: ${err.message}`);
  }
});

ipcMain.handle('fs:delete-item', async (_event, itemPath: string) => {
  try {
    const stats = await fsPromises.stat(itemPath);
    if (stats.isDirectory()) {
      await fsPromises.rm(itemPath, { recursive: true, force: true });
    } else {
      await fsPromises.unlink(itemPath);
    }
    return true;
  } catch (err: any) {
    console.error(`Error deleting item ${itemPath}:`, err);
    throw new Error(`Failed to delete item: ${err.message}`);
  }
});

// Integrated Terminal PTY Handlers
ipcMain.handle('terminal:create', async (_event, { cols, rows, cwd }) => {
  if (!mainWindow) throw new Error('Main window not available');
  return terminalManager.createSession(mainWindow, cols, rows, cwd);
});

ipcMain.on('terminal:write', (_event, sessionId, data) => {
  terminalManager.write(sessionId, data);
});

ipcMain.on('terminal:resize', (_event, sessionId, cols, rows) => {
  terminalManager.resize(sessionId, cols, rows);
});
