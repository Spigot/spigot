import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, safeStorage } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join, relative, resolve } from 'path';
import { promises as fsPromises, watch, FSWatcher, existsSync } from 'fs';
import { exec, execFile } from 'child_process';
import { SshSessionConfig, terminalManager } from './terminal';
import { lspManager } from './lspManager';
import { semanticCatalogService } from './SemanticCatalogService';
import { runAgentLoop } from './agentRunner';
import { isSpigotChatsEngineEnabled } from './engine/featureGate';
import { createE2ETypedStreamRuntime, SpigotChatsEngineAdapter } from './engine/SpigotChatsEngineAdapter';
import { EngineSessionService } from './engine/EngineSessionService';
import { mapEngineEventToIpc } from './engine/types';
import { CheckpointJournal, WorkspaceChangeSetService } from './changes/WorkspaceChangeSetService';
import { createModelConfiguration } from '../shared/modelConfiguration';
import { createChatLogger } from '../shared/chatLogger';
import {
  startOAuthListener,
  authorizeAntigravity,
  exchangeAntigravity,
} from './oauth/antigravityOAuth';
import { getGlobalOAuthAccountPool } from './oauth/accountPool';
import { SDDPipelineService } from './engine/sddPipeline';
import { GENTLE_SKILLS } from './engine/gentleSkills';
import { gentleAgentBuilder, type CustomAgentRoleSpec } from './engine/gentleAgentBuilder';
import { startOpenAIOAuthFlow } from './oauth/openaiOAuth';
import { startCopilotOAuthFlow } from './oauth/copilotOAuth';
import { startOpenCodeConsoleOAuthFlow } from './oauth/opencodeConsoleOAuth';
import { modelsCatalogService } from './engine/modelsCatalog';
import { WorkspaceFileService } from './WorkspaceFileService';
import { ActiveWorkspace } from './ActiveWorkspace';

// Set App User Model ID for Windows Taskbar icon grouping and display
if (process.platform === 'win32') {
  app.setAppUserModelId('com.gentleman.spigot');
}

let mainWindow: BrowserWindow | null = null;
const workspaceWatchers = new Map<number, FSWatcher>();
const chatLog = createChatLogger();

// Must be registered before Electron is ready; otherwise DevTools may still call
// the unsupported Autofill protocol and print noisy console errors.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillShowTypePredictions');

function getWindowIcon() {
  const iconCandidates = [
    join(app.getAppPath(), 'logoSpigot.ico'),
    join(app.getAppPath(), 'public/logoSpigot.ico'),
    join(app.getAppPath(), 'public/logoSpigot.png'),
    join(app.getAppPath(), 'dist/logoSpigot.ico'),
    join(__dirname, '../../logoSpigot.ico'),
    join(__dirname, '../../public/logoSpigot.ico'),
    join(__dirname, '../../public/logoSpigot.png'),
    join(__dirname, '../renderer/assets/logoSpigot.png'),
    join(process.cwd(), 'logoSpigot.ico'),
    join(process.cwd(), 'public/logoSpigot.ico'),
  ];

  for (const iconPath of iconCandidates) {
    if (existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        return img;
      }
    }
  }
  return undefined;
}


function sendUpdateStatus(channel: string, payload?: unknown) {
  mainWindow?.webContents.send(channel, payload);
}

function startUpdateService() {
  if (!app.isPackaged) {
    console.log('[updater] Skipping update checks outside packaged app.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}. Downloading in background...`);
    sendUpdateStatus('updater:download-started', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available.');
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version}. Waiting for user confirmation.`);
    sendUpdateStatus('updater:update-ready', { version: info.version });
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] Update error:', error);
    sendUpdateStatus('updater:error', error instanceof Error ? error.message : String(error));
  });

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[updater] Failed to check for updates:', error);
    });
  };

  setTimeout(checkForUpdates, 3000);
  setInterval(checkForUpdates, 30 * 60 * 1000);
}


function createWindow() {
  const windowIcon = getWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false, // Start hidden to prevent raw white flashes
    frame: false, // Frameless window for premium custom title bar
    titleBarStyle: 'hidden',
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (windowIcon) {
    mainWindow.setIcon(windowIcon);
  }

  terminalManager.setMainWindow(mainWindow);

  (mainWindow.webContents as unknown as { on(event: 'console-message', listener: (details: { level: 'debug' | 'info' | 'warning' | 'error'; message: string; lineNumber: number; sourceId: string }) => void): void }).on('console-message', (details) => {
    if (typeof details.message !== 'string' || !details.message.startsWith('[chat]')) return;
    const level = details.level === 'warning' ? 'warn' : details.level;
    console[level](`[renderer] ${details.message}`, { lineNumber: details.lineNumber, hasSource: Boolean(details.sourceId) });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.maximize();
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
    lspManager.shutdownAll();
    if (cachedWorkspacePath) semanticCatalogService.clearWorkspace(cachedWorkspacePath);
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  startUpdateService();

  // Warm the OpenCode catalog cache so per-turn provider routing never fetches.
  modelsCatalogService.getCatalog().catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  terminalManager.clearAll();
  lspManager.shutdownAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App Window IPC Controls
ipcMain.on('app:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('app:open-shell', (_event, folderPath: string) => {
  if (folderPath) {
    shell.openPath(folderPath);
  }
});

ipcMain.on('app:open-external', (_event, url: string) => {
  if (url?.startsWith('https://github.com/Spigot/spigot')) {
    shell.openExternal(url);
  }
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

ipcMain.on('app:zoom-in', () => {
  if (mainWindow) {
    const current = mainWindow.webContents.getZoomLevel();
    mainWindow.webContents.setZoomLevel(current + 0.5);
  }
});

ipcMain.on('app:zoom-out', () => {
  if (mainWindow) {
    const current = mainWindow.webContents.getZoomLevel();
    mainWindow.webContents.setZoomLevel(Math.max(-3, current - 0.5));
  }
});

ipcMain.on('app:zoom-reset', () => {
  if (mainWindow) {
    mainWindow.webContents.setZoomLevel(0);
  }
});

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  isPackaged: app.isPackaged,
}));

ipcMain.handle('updater:install-update', () => {
  if (!app.isPackaged) {
    return { ok: false, error: 'Updates are only available in the packaged app.' };
  }

  terminalManager.clearAll();
  lspManager.shutdownAll();
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
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
  const workspacePath = result.filePaths[0];
  await activeWorkspace.set(workspacePath);
  return workspacePath;
});

// Bind a renderer-selected path to the main-process mutation boundary before
// the renderer treats it as the current workspace.
ipcMain.handle('fs:activate-workspace', async (_event, workspacePath: unknown) => {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    throw new Error('A workspace path is required.');
  }

  await activeWorkspace.set(workspacePath);
  return activeWorkspace.get()!.path;
});

// Create new project folder and initialize it IPC
ipcMain.handle('fs:create-project', async (_event, parentPath: string, name: string) => {
  try {
    const projectPath = join(parentPath, name);
    await fsPromises.mkdir(projectPath, { recursive: true });
    
    // Initialize with a default README.md
    const readmePath = join(projectPath, 'README.md');
    await fsPromises.writeFile(
      readmePath,
      `# ${name}\n\nProyecto creado exitosamente en **Spigot Editor**.\n`,
      'utf-8'
    );
    await activeWorkspace.set(projectPath);
    return projectPath;
  } catch (err: any) {
    console.error('Error creating new project:', err);
    throw err;
  }
});

// Structured file node interface
interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

// Memory cache for the workspace file tree to prevent redundant high-overhead recursive FS walking
let cachedTree: FileNode[] | null = null;
let cachedWorkspacePath: string | null = null;
const activeWorkspace = new ActiveWorkspace();
const workspaceFileService = new WorkspaceFileService(() => activeWorkspace.get());

// Read Workspace Tree recursively with exclude lists
ipcMain.handle('fs:read-dir', async (_event, dirPath: string): Promise<FileNode[]> => {
  // If the path matches and the cache is warm, return the cached tree instantly!
  if (cachedWorkspacePath === dirPath && cachedTree !== null) {
    return cachedTree;
  }

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

  const tree = await buildTree(dirPath);
  if (cachedWorkspacePath && cachedWorkspacePath !== dirPath) semanticCatalogService.clearWorkspace(cachedWorkspacePath);
  cachedWorkspacePath = dirPath;
  cachedTree = tree;
  return tree;
});

// File System CRUD Handlers
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    return content.replace(/^\uFEFF/, '').replace(/^\uFFFD/, '');
  } catch (err: any) {
    console.error(`Error reading file ${filePath}:`, err);
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

ipcMain.handle('fs:read-binary-file', async (_event, filePath: string) => {
  try {
    const buffer = await fsPromises.readFile(filePath);
    return buffer.toString('base64');
  } catch (err: any) {
    console.error(`Error reading binary file ${filePath}:`, err);
    throw new Error(`Failed to read binary file: ${err.message}`);
  }
});

ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
  try {
    await workspaceFileService.writeFile(filePath, content);
    cachedTree = null; // Invalidate cached tree on write
    if (cachedWorkspacePath) semanticCatalogService.invalidate(cachedWorkspacePath, filePath);
    return true;
  } catch (err: any) {
    console.error(`Error writing file ${filePath}:`, err);
    throw new Error(`Failed to write file: ${err.message}`);
  }
});

ipcMain.handle('fs:create-item', async (_event, itemPath: string, type: 'file' | 'directory') => {
  try {
    await workspaceFileService.create(itemPath, type);
    cachedTree = null; // Invalidate cached tree on create
    if (type === 'file' && cachedWorkspacePath) semanticCatalogService.invalidate(cachedWorkspacePath, itemPath);
    return true;
  } catch (err: any) {
    console.error(`Error creating ${type} at ${itemPath}:`, err);
    throw new Error(`Failed to create item: ${err.message}`);
  }
});

ipcMain.handle('fs:delete-item', async (_event, itemPath: string) => {
  try {
    await workspaceFileService.delete(itemPath);
    cachedTree = null;
    if (cachedWorkspacePath) semanticCatalogService.invalidate(cachedWorkspacePath, itemPath);
    return true;
  } catch (err: any) {
    console.error(`Error deleting item ${itemPath}:`, err);
    throw new Error(`Failed to delete item: ${err.message}`);
  }
});

ipcMain.handle('fs:rename-item', async (_event, itemPath: string, newName: string) => {
  try {
    const newPath = await workspaceFileService.rename(itemPath, newName);
    cachedTree = null;
    if (cachedWorkspacePath) {
      semanticCatalogService.invalidate(cachedWorkspacePath, itemPath);
      semanticCatalogService.invalidate(cachedWorkspacePath, newPath);
    }
    return newPath;
  } catch (err: any) {
    console.error(`Error renaming item ${itemPath}:`, err);
    throw new Error(`Failed to rename item: ${err.message}`);
  }
});

ipcMain.handle('fs:move-item', async (_event, itemPath: string, destinationDirectory: string) => {
  try {
    const newPath = await workspaceFileService.moveToDirectory(itemPath, destinationDirectory);
    cachedTree = null;
    if (cachedWorkspacePath) {
      semanticCatalogService.invalidate(cachedWorkspacePath, itemPath);
      semanticCatalogService.invalidate(cachedWorkspacePath, newPath);
    }
    return newPath;
  } catch (err: any) {
    console.error(`Error moving item ${itemPath}:`, err);
    throw new Error(`Failed to move item: ${err.message}`);
  }
});

ipcMain.handle('fs:watch-workspace', async (event, workspacePath: string) => {
  const webContentsId = event.sender.id;
  workspaceWatchers.get(webContentsId)?.close();

  try {
    const watcher = watch(
      workspacePath,
      { recursive: process.platform === 'win32' },
      (_eventType, filename) => {
        cachedTree = null; // Invalidate cached tree on watch change event
        if (filename) semanticCatalogService.invalidate(workspacePath, filename.toString());
        event.sender.send('workspace:changed', filename?.toString() ?? null);
      },
    );

    watcher.on('error', (err) => {
      console.error(`Workspace watcher failed for ${workspacePath}:`, err);
      event.sender.send('workspace:watch-error', err.message);
    });

    workspaceWatchers.set(webContentsId, watcher);
    return true;
  } catch (err: any) {
    console.error(`Error watching workspace ${workspacePath}:`, err);
    return false;
  }
});

ipcMain.handle('fs:unwatch-workspace', async (event) => {
  const webContentsId = event.sender.id;
  workspaceWatchers.get(webContentsId)?.close();
  workspaceWatchers.delete(webContentsId);
  if (cachedWorkspacePath) semanticCatalogService.clearWorkspace(cachedWorkspacePath);
  return true;
});

ipcMain.handle('lsp:open-document', async (_event, args) => {
  if (!mainWindow) return false;
  semanticCatalogService.invalidate(args.workspacePath, args.document.uri);
  return lspManager.openDocument(mainWindow, args.workspacePath, args.document);
});

ipcMain.handle('lsp:change-document', async (_event, args) => {
  semanticCatalogService.invalidate(args.workspacePath, args.document.uri);
  return lspManager.changeDocument(args.workspacePath, args.languageId, args.document);
});

ipcMain.handle('lsp:save-document', async (_event, args) => {
  semanticCatalogService.invalidate(args.workspacePath, args.uri);
  return lspManager.saveDocument(args.workspacePath, args.languageId, args.uri, args.text);
});

ipcMain.handle('semantic:retrieve', async (_event, args: { workspacePath: string; query: string; explicitPaths?: string[] }) => {
  return semanticCatalogService.retrieve(args);
});

ipcMain.handle('lsp:completion', async (_event, args) => {
  return lspManager.completion(args.workspacePath, args.languageId, args);
});

// Integrated Terminal PTY Handlers
ipcMain.handle('terminal:create', async (_event, { cols, rows, cwd }) => {
  if (!mainWindow) throw new Error('Main window not available');
  return terminalManager.createSession(mainWindow, cols, rows, cwd);
});

ipcMain.handle('terminal:create-ssh', async (_event, { cols, rows, server }: { cols: number; rows: number; server: SshSessionConfig }) => {
  if (!mainWindow) throw new Error('Main window not available');
  if (!server?.host?.trim() || !server?.user?.trim()) {
    throw new Error('SSH host and user are required.');
  }

  return terminalManager.createSshSession(mainWindow, cols, rows, {
    ...server,
    host: server.host.trim(),
    user: server.user.trim(),
    identityFile: server.identityFile?.trim() || undefined,
  });
});

ipcMain.on('terminal:write', (_event, sessionId, data) => {
  terminalManager.write(sessionId, data);
});

ipcMain.on('terminal:resize', (_event, sessionId, cols, rows) => {
  terminalManager.resize(sessionId, cols, rows);
});

ipcMain.on('terminal:close', (_event, sessionId) => {
  terminalManager.closeSession(sessionId);
});

ipcMain.handle('terminal:get-history', async (_event, sessionId) => {
  return terminalManager.getHistory(sessionId);
});

// ==========================================
// AI AGENT STORE AND STREAMING IPC HANDLERS
// ==========================================

const storeFilePath = join(app.getPath('userData'), 'electron-store-config.json');

async function readStore(): Promise<Record<string, any>> {
  try {
    const content = await fsPromises.readFile(storeFilePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
}

async function writeStore(data: Record<string, any>): Promise<void> {
  try {
    await fsPromises.writeFile(storeFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing config store:', err);
  }
}

async function getDecryptedKeys(): Promise<Record<string, string>> {
  const data = await readStore();
  const result: Record<string, string> = {};
  const canDecrypt = safeStorage?.isEncryptionAvailable?.();

  // 1. Decrypt from encryptedApiKeys
  if (data.encryptedApiKeys && typeof data.encryptedApiKeys === 'object' && canDecrypt) {
    for (const [provider, base64] of Object.entries(data.encryptedApiKeys)) {
      try {
        if (typeof base64 === 'string' && base64.trim()) {
          const buf = Buffer.from(base64, 'base64');
          result[provider] = safeStorage.decryptString(buf);
        }
      } catch (e) {
        console.error(`Failed to decrypt key for ${provider}:`, e);
      }
    }
  }

  // 2. Migration: if legacy plaintext keys exist, encrypt and migrate them
  if (data.apiKeys && typeof data.apiKeys === 'object') {
    let migrated = false;
    for (const [provider, plainKey] of Object.entries(data.apiKeys)) {
      if (!result[provider] && typeof plainKey === 'string' && plainKey.trim()) {
        result[provider] = plainKey;
        if (canDecrypt) {
          if (!data.encryptedApiKeys) data.encryptedApiKeys = {};
          data.encryptedApiKeys[provider] = safeStorage.encryptString(plainKey).toString('base64');
          delete data.apiKeys[provider];
          migrated = true;
        }
      }
    }
    if (migrated) {
      await writeStore(data);
    }
  }

  return result;
}

// 1. Storage Handlers (electron-store simulation with safeStorage encryption)
ipcMain.handle('store:get-keys', async () => {
  if (process.env.SPIGOT_E2E_TYPED_STREAM === '1') return { openai: 'e2e-fixture-key' };
  return getDecryptedKeys();
});

ipcMain.handle('store:set-key', async (_event, provider: string, key: string, authType?: 'api' | 'oauth') => {
  const data = await readStore();
  if (!data.encryptedApiKeys) data.encryptedApiKeys = {};
  if (!data.apiKeys) data.apiKeys = {};

  const canEncrypt = safeStorage?.isEncryptionAvailable?.();

  if (key && canEncrypt) {
    const encryptedBuf = safeStorage.encryptString(key);
    data.encryptedApiKeys[provider] = encryptedBuf.toString('base64');
    // Ensure plaintext key is never retained
    delete data.apiKeys[provider];
  } else {
    // Fallback if OS encryption is unavailable in the environment
    data.apiKeys[provider] = key;
    delete data.encryptedApiKeys[provider];
  }

  if (authType) {
    if (!data.authTypes) data.authTypes = {};
    data.authTypes[provider] = authType;
  }

  await writeStore(data);
  return true;
});

ipcMain.handle('store:get-selected-models', async () => {
  const data = await readStore();
  return data.selectedModels || {};
});

ipcMain.handle('store:set-selected-model', async (_event, provider: string, model: string) => {
  const data = await readStore();
  if (!data.selectedModels) data.selectedModels = {};
  data.selectedModels[provider] = model;
  await writeStore(data);
  return true;
});

ipcMain.handle('store:get-model-configuration', async () => {
  const data = await readStore();
  return createModelConfiguration(data.modelConfiguration, data.selectedModels || {});
});

ipcMain.handle('store:set-model-configuration', async (_event, configuration: unknown) => {
  const data = await readStore();
  data.modelConfiguration = createModelConfiguration(configuration, data.selectedModels || {});
  await writeStore(data);
  return true;
});

ipcMain.handle('store:get-last-workspace', async () => {
  const data = await readStore();
  const lastWorkspacePath = data.lastWorkspacePath;

  if (typeof lastWorkspacePath !== 'string' || !lastWorkspacePath.trim()) {
    return null;
  }

  try {
    await activeWorkspace.set(lastWorkspacePath);
    return lastWorkspacePath;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('store:set-last-workspace', async (_event, workspacePath: string | null) => {
  const data = await readStore();

  if (workspacePath && workspacePath.trim()) {
    data.lastWorkspacePath = workspacePath;
    if (!data.recentWorkspaces) {
      data.recentWorkspaces = [];
    }
    data.recentWorkspaces = data.recentWorkspaces.filter((p: string) => p !== workspacePath);
    data.recentWorkspaces.unshift(workspacePath);
    if (data.recentWorkspaces.length > 10) {
      data.recentWorkspaces = data.recentWorkspaces.slice(0, 10);
    }
  } else {
    delete data.lastWorkspacePath;
  }

  await writeStore(data);
  return true;
});

ipcMain.handle('store:get-recent-workspaces', async () => {
  const data = await readStore();
  const list = data.recentWorkspaces || [];
  const validList: string[] = [];
  for (const p of list) {
    try {
      const stats = await fsPromises.stat(p);
      if (stats.isDirectory()) {
        validList.push(p);
      }
    } catch {
      // Ignore deleted/invalid directory paths
    }
  }
  if (validList.length !== list.length) {
    data.recentWorkspaces = validList;
    await writeStore(data);
  }
  return validList;
});

ipcMain.handle('store:get-ssh-servers', async () => {
  const data = await readStore();
  return data.sshServers || [];
});

ipcMain.handle('store:add-ssh-server', async (_event, server: { id: string; name: string; host: string; user: string; port?: number; identityFile?: string }) => {
  const data = await readStore();
  const servers = data.sshServers || [];
  const normalized = {
    ...server,
    host: server.host.trim(),
    user: server.user.trim(),
    port: server.port || 22,
    identityFile: server.identityFile?.trim() || undefined,
  };
  const filteredServers = servers.filter((s: any) => !(s.host === normalized.host && s.user === normalized.user && (s.port || 22) === normalized.port));
  data.sshServers = [normalized, ...filteredServers].slice(0, 10);
  await writeStore(data);
  return data.sshServers;
});


ipcMain.handle('store:get-chat-history', async (_event, workspacePath?: string | null) => {
  const data = await readStore();
  if (workspacePath && workspacePath.trim()) {
    if (!data.workspaceChatHistories) {
      data.workspaceChatHistories = {};
    }
    return data.workspaceChatHistories[workspacePath] || [];
  }
  return data.chatHistory || [];
});

ipcMain.handle('store:set-chat-history', async (_event, chatHistory: any[], workspacePath?: string | null) => {
  const data = await readStore();
  if (workspacePath && workspacePath.trim()) {
    if (!data.workspaceChatHistories) {
      data.workspaceChatHistories = {};
    }
    data.workspaceChatHistories[workspacePath] = chatHistory;
  } else {
    data.chatHistory = chatHistory;
  }
  await writeStore(data);
  return true;
});

// 1.1 OAuth Google Antigravity Account Pool & Handlers
const oauthAccountPool = getGlobalOAuthAccountPool();
oauthAccountPool.setOnChange(async (accounts, activeId) => {
  try {
    const data = await readStore();
    data.oauthAccounts = accounts;
    data.activeOAuthAccountId = activeId;
    const active = accounts.find((a) => a.id === activeId) || accounts[0];
    if (active) {
      const tokenToStore = active.refreshToken;
      const canEncrypt = safeStorage?.isEncryptionAvailable?.();
      if (!data.encryptedApiKeys) data.encryptedApiKeys = {};
      if (!data.apiKeys) data.apiKeys = {};
      if (!data.authTypes) data.authTypes = {};
      if (canEncrypt) {
        data.encryptedApiKeys['gemini'] = safeStorage.encryptString(tokenToStore).toString('base64');
        delete data.apiKeys['gemini'];
      } else {
        data.apiKeys['gemini'] = tokenToStore;
        delete data.encryptedApiKeys['gemini'];
      }
      data.authTypes['gemini'] = 'oauth';
    } else {
      delete data.apiKeys?.['gemini'];
      delete data.encryptedApiKeys?.['gemini'];
    }
    await writeStore(data);
  } catch (err) {
    console.error('Failed to persist OAuth account pool update:', err);
  }
});

// Rehydrate pool on boot
readStore().then((data) => {
  if (Array.isArray(data.oauthAccounts) && data.oauthAccounts.length > 0) {
    oauthAccountPool.rehydrate(data.oauthAccounts, data.activeOAuthAccountId ?? null);
  } else {
    const rawKey = data.apiKeys?.['gemini'] || (data.encryptedApiKeys?.['gemini'] && safeStorage?.isEncryptionAvailable?.()
      ? safeStorage.decryptString(Buffer.from(data.encryptedApiKeys['gemini'], 'base64'))
      : null);
    if (rawKey && data.authTypes?.['gemini'] === 'oauth') {
      oauthAccountPool.addAccount({
        email: 'Google Account',
        projectId: 'rising-fact-p41fc',
        refreshToken: rawKey,
      });
    }
  }
}).catch(console.error);

ipcMain.handle('oauth:google-login', async () => {
  let listener: Awaited<ReturnType<typeof startOAuthListener>> | null = null;
  try {
    listener = await startOAuthListener();
    const auth = authorizeAntigravity();
    await shell.openExternal(auth.url);
    const callbackUrl = await listener.waitForCallback();

    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');

    if (!code || !state) {
      throw new Error('Google OAuth no devolvió los parámetros de autorización requeridos.');
    }

    const exchangeResult = await exchangeAntigravity(code, state);
    if (exchangeResult.type === 'failed') {
      throw new Error(exchangeResult.error || 'Error al intercambiar el token de Google.');
    }

    const email = exchangeResult.email || `google-user-${Date.now().toString(36)}`;
    const addedAccount = oauthAccountPool.addAccount({
      email,
      projectId: exchangeResult.projectId,
      refreshToken: exchangeResult.refresh,
      accessToken: exchangeResult.access,
      expiresAt: exchangeResult.expires,
    });

    return {
      success: true,
      email: addedAccount.email,
      projectId: addedAccount.projectId,
      token: exchangeResult.refresh,
      accounts: oauthAccountPool.listPublic(),
    };
  } catch (err: any) {
    if (listener) {
      await listener.close().catch(() => {});
    }
    throw new Error(err.message || 'Error durante el inicio de sesión OAuth con Google');
  }
});

ipcMain.handle('oauth:list-accounts', async () => {
  return oauthAccountPool.listPublic();
});

ipcMain.handle('oauth:remove-account', async (_event, accountId: string) => {
  const removed = oauthAccountPool.removeAccount(accountId);
  return { success: removed, accounts: oauthAccountPool.listPublic() };
});

ipcMain.handle('oauth:set-active-account', async (_event, accountId: string) => {
  const success = oauthAccountPool.setActiveAccount(accountId);
  return { success, accounts: oauthAccountPool.listPublic() };
});

ipcMain.handle('oauth:openai-login', async () => {
  try {
    const result = await startOpenAIOAuthFlow();
    return {
      success: true,
      email: result.email,
      token: result.accessToken,
    };
  } catch (err: any) {
    throw new Error(err.message || 'Error durante el inicio de sesión OAuth con OpenAI');
  }
});

ipcMain.handle('oauth:copilot-login', async () => {
  try {
    const result = await startCopilotOAuthFlow();
    return {
      success: true,
      email: result.email,
      token: result.accessToken,
    };
  } catch (err: any) {
    throw new Error(err.message || 'Error durante el inicio de sesión OAuth con GitHub Copilot');
  }
});

ipcMain.handle('oauth:opencode-login', async () => {
  try {
    const result = await startOpenCodeConsoleOAuthFlow();
    return {
      success: true,
      email: result.email,
      token: result.accessToken,
    };
  } catch (err: any) {
    throw new Error(err.message || 'Error durante el inicio de sesión OAuth con OpenCode Console');
  }
});

// ==========================================
// GENTLE AI SDD PIPELINE & AGENT BUILDER IPC
// ==========================================

ipcMain.handle('gentle:sdd-get-state', async (_event, workspacePath: string) => {
  const service = new SDDPipelineService(workspacePath || process.cwd());
  return service.loadState();
});

ipcMain.handle('gentle:sdd-advance-phase', async (_event, workspacePath: string, artifactSummary?: string) => {
  const service = new SDDPipelineService(workspacePath || process.cwd());
  const state = service.loadState();
  return service.advancePhase(state, artifactSummary);
});

ipcMain.handle('gentle:sdd-reset', async (_event, workspacePath: string) => {
  const service = new SDDPipelineService(workspacePath || process.cwd());
  return service.resetPipeline();
});

ipcMain.handle('gentle:get-skills', async () => {
  return GENTLE_SKILLS;
});

ipcMain.handle('gentle:build-agent-role', async (_event, spec: CustomAgentRoleSpec) => {
  return gentleAgentBuilder.buildRole(spec);
});

ipcMain.handle('gentle:list-custom-roles', async () => {
  return gentleAgentBuilder.listCustomRoles();
});

ipcMain.handle('gentle:remove-custom-role', async (_event, id: string) => {
  return gentleAgentBuilder.removeCustomRole(id);
});

// 2. Fetch Models Dynamically from OpenCode Catalog & Provider endpoints
ipcMain.handle('ai:fetch-models', async (_event, provider: string, apiKey?: string) => {
  if (process.env.SPIGOT_E2E_TYPED_STREAM === '1') return ['e2e-typed-model'];

  const catalogModels = await modelsCatalogService.getModelsForProvider(provider);
  const results = new Set<string>(catalogModels);

  if (apiKey && apiKey.trim()) {
    try {
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const json = await res.json() as any;
          json.data?.forEach((m: any) => {
            if (m.id && (m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('terra'))) {
              results.add(m.id);
            }
          });
        }
      } else if (provider === 'deepseek') {
        const res = await fetch('https://api.deepseek.com/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const json = await res.json() as any;
          json.data?.forEach((m: any) => m.id && results.add(m.id));
        }
      } else if (provider === 'gemini') {
        const isOAuth = apiKey.includes('|') || apiKey.startsWith('{') || apiKey.startsWith('ya29.');
        if (!isOAuth) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
          if (res.ok) {
            const json = await res.json() as any;
            json.models?.forEach((m: any) => {
              const name = m.name?.replace('models/', '');
              if (name && name.includes('gemini')) results.add(name);
            });
          }
        }
      } else if (provider === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://spigot.gentleman.com',
            'X-Title': 'Spigot'
          }
        });
        if (res.ok) {
          const json = await res.json() as any;
          json.data?.forEach((m: any) => m.id && results.add(m.id));
        }
      } else if (provider === 'kimi') {
        const res = await fetch('https://api.moonshot.cn/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const json = await res.json() as any;
          json.data?.forEach((m: any) => m.id && results.add(m.id));
        }
      } else if (provider === 'minimax') {
        const res = await fetch('https://api.minimax.io/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const json = await res.json() as any;
          json.data?.forEach((m: any) => m.id && results.add(m.id));
        }
      }
    } catch (_err) {
      // Ignored, fallback to catalog
    }
  }

  return Array.from(results);
});

// Full OpenCode catalog provider list for dynamic provider selection in the UI.
ipcMain.handle('ai:fetch-catalog-providers', async () => {
  if (process.env.SPIGOT_E2E_TYPED_STREAM === '1') return [];
  try {
    return await modelsCatalogService.getProviders();
  } catch {
    return [];
  }
});

// 3. Unified Stream Chat SSE Handler
const workspaceChangeSetService = new WorkspaceChangeSetService(new CheckpointJournal(app.getPath('userData')));
const isE2ETypedStreamFixture = process.env.SPIGOT_E2E_TYPED_STREAM === '1';
const engineSessionService = new EngineSessionService(new SpigotChatsEngineAdapter({
  ...(isE2ETypedStreamFixture ? { runtime: createE2ETypedStreamRuntime() } : {}),
}), {
  enabled: isE2ETypedStreamFixture || isSpigotChatsEngineEnabled(process.env.SPIGOT_CHATS_ENGINE),
  legacyRunner: runAgentLoop,
  changeSetService: workspaceChangeSetService,
});

function stagedChangeSet(changeSetId: unknown) {
  if (typeof changeSetId !== 'string' || !changeSetId) throw new Error('A change-set identity is required.');
  return workspaceChangeSetService.get(changeSetId);
}

function dirtyRelativePaths(changeSetId: string, dirtyPaths: unknown): string[] {
  if (!Array.isArray(dirtyPaths) || !dirtyPaths.every(path => typeof path === 'string')) {
    throw new Error('Dirty buffer identities must be a string array.');
  }

  const workspace = stagedChangeSet(changeSetId).workspace.canonicalPath;
  return dirtyPaths.map(candidate => {
    const target = resolve(workspace, candidate);
    const rel = relative(workspace, target).replace(/\\/g, '/');
    if (!rel || rel === '..' || rel.startsWith('../')) throw new Error('Dirty buffer path is outside the staged workspace.');
    return rel;
  });
}

async function activeWorkspacePath(): Promise<string> {
  const storeData = await readStore();
  const workspacePath = storeData.lastWorkspacePath;
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) throw new Error('No active workspace is available for rollback.');
  return workspacePath;
}

ipcMain.handle('changes:summary', (_event, changeSetId: unknown) => {
  stagedChangeSet(changeSetId);
  return workspaceChangeSetService.summary(changeSetId as string);
});

ipcMain.handle('changes:entry', (_event, args: { changeSetId?: unknown; relativePath?: unknown }) => {
  if (!args || typeof args.changeSetId !== 'string' || typeof args.relativePath !== 'string') throw new Error('A staged file identity is required.');
  const entry = workspaceChangeSetService.entry(args.changeSetId, args.relativePath);
  return { relativePath: entry.relativePath, operation: entry.operation, before: entry.before.content, after: entry.after.content };
});

ipcMain.handle('changes:accept', async (_event, args: { changeSetId?: unknown; dirtyPaths?: unknown }) => {
  if (!args || typeof args.changeSetId !== 'string') throw new Error('A change-set identity is required.');
  const dirty = dirtyRelativePaths(args.changeSetId, args.dirtyPaths);
  await workspaceChangeSetService.validateDirtyBuffers(args.changeSetId, dirty);
  const checkpoint = await workspaceChangeSetService.apply(args.changeSetId);
  chatLog('info', { conversationId: checkpoint.changeSet.conversationId, turnId: checkpoint.changeSet.turnId }, 'main.changes', 'changeset.accepted', { entryCount: checkpoint.changeSet.entries.length });
  cachedTree = null;
  return { checkpointId: checkpoint.id, summary: workspaceChangeSetService.summary(args.changeSetId) };
});

ipcMain.handle('changes:reject', (_event, changeSetId: unknown) => {
  const changeSet = stagedChangeSet(changeSetId);
  const summary = workspaceChangeSetService.reject(changeSetId as string);
  chatLog('info', { conversationId: changeSet.conversationId, turnId: changeSet.turnId }, 'main.changes', 'changeset.rejected', { entryCount: summary.entries.length });
  return summary;
});

ipcMain.handle('changes:list-rollbacks', async (_event, query?: { changeSetId?: unknown; turnId?: unknown; conversationId?: unknown }) => {
  if (query && Object.values(query).some(value => value !== undefined && typeof value !== 'string')) throw new Error('Rollback lookup identities must be strings.');
  const rollbackQuery = query ? {
    changeSetId: query.changeSetId as string | undefined,
    turnId: query.turnId as string | undefined,
    conversationId: query.conversationId as string | undefined,
  } : {};
  return workspaceChangeSetService.listRollbackRecords(await activeWorkspacePath(), rollbackQuery);
});

ipcMain.handle('changes:preview-rollback', async (_event, checkpointId: unknown) => {
  if (typeof checkpointId !== 'string' || !checkpointId) throw new Error('A checkpoint identity is required.');
  return workspaceChangeSetService.previewRollback(await activeWorkspacePath(), checkpointId);
});

ipcMain.handle('changes:rollback', async (_event, checkpointId: unknown) => {
  if (typeof checkpointId !== 'string' || !checkpointId) throw new Error('A checkpoint identity is required.');
  const rolledBack = await workspaceChangeSetService.rollback(await activeWorkspacePath(), checkpointId);
  chatLog('info', { conversationId: rolledBack.conversationId, turnId: rolledBack.turnId }, 'main.changes', 'changeset.rolled_back', { entryCount: rolledBack.entries.length });
  cachedTree = null;
  return { summary: workspaceChangeSetService.summary(rolledBack.id), checkpointId };
});

ipcMain.on('ai:abort-chat', (_event, args?: { conversationId?: string; turnId?: string }) => {
  engineSessionService.abortActiveTurn(args?.conversationId, args?.turnId);
});

ipcMain.handle('ai:stream-chat', async (
  _event, 
  { conversationId, turnId, mode, provider, model, effort, apiKey, prompt, contextText, contextSource, history, image }: {
    conversationId?: string;
    turnId?: string;
    mode?: 'orchestrator' | 'build' | 'plan' | 'review';
    provider: string;
    model: string;
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    apiKey: string;
    prompt: string;
    contextText?: string | null;
    contextSource?: 'default' | 'explicit';
    history: any[];
    image?: string | null;
  }
): Promise<boolean> => {
  const activeConvId = conversationId || 'default';
  const effectiveMode = mode || 'orchestrator';
  const startedAt = Date.now();
  const logContext = { conversationId: activeConvId, turnId, mode: effectiveMode, providerModelId: `${provider}/${model}`, startedAt };
  chatLog('info', logContext, 'main.ipc', 'turn.accepted', { historyCount: Array.isArray(history) ? history.length : 0, hasImage: Boolean(image), contextBytes: typeof contextText === 'string' ? Buffer.byteLength(contextText) : 0 });

  try {
    const storeData = await readStore();
    const workspacePath = storeData.lastWorkspacePath || app.getPath('documents');
    const modelConfig = createModelConfiguration(storeData.modelConfiguration, storeData.selectedModels || {});

    const decryptedKeys = await getDecryptedKeys();
    const providersMap: Record<string, { apiKey: string }> = {};
    for (const [p, k] of Object.entries(decryptedKeys)) {
      if (k && typeof k === 'string' && k.trim()) {
        providersMap[p] = { apiKey: k.trim() };
      }
    }
    if (provider && apiKey) {
      providersMap[provider] = { apiKey: apiKey.trim() };
    }

    chatLog('info', logContext, 'main.engine', 'provider.dispatch.started');
    const success = await engineSessionService.startTurn(
      {
        sessionId: activeConvId,
        turnId,
        mode: effectiveMode,
        provider,
        model,
        effort,
        apiKey,
        prompt,
        contextText,
        contextSource,
        history,
        image,
        workspacePath,
        modelConfig,
        providers: providersMap,
      },
      event => {
        if (event.type === 'context:bounded') chatLog('info', logContext, 'main.engine', 'context.result', { keptCount: event.data.keptItems, removedCount: event.data.removedItems, omittedExplicitContext: event.data.omittedExplicitContext, omittedHistory: event.data.omittedHistory });
        if (event.type === 'part' && event.part.lifecycle !== 'delta') chatLog('info', logContext, 'main.stream', `part.${event.part.lifecycle}`, { ordinal: event.part.ordinal, textBytes: event.part.text?.length ?? 0 });
        if (event.type === 'tool') chatLog(event.status === 'end' ? 'info' : 'info', logContext, 'main.tool', `tool.${event.status}`, { toolIdPresent: Boolean(event.id) });
        if (event.type === 'end') chatLog('info', logContext, 'main.stream', event.aborted ? 'terminal.cancelled' : 'terminal.completed');
        if (event.type === 'error') chatLog('error', logContext, 'main.stream', 'terminal.error');
        const mapped = mapEngineEventToIpc(event);
        if (mapped.channel) {
          mainWindow?.webContents.send(mapped.channel, {
            conversationId: activeConvId,
            turnId: event.turnId,
            ...(mapped.channel === 'ai:stream-chunk' ? { chunk: mapped.payload } : {}),
            ...(mapped.channel === 'ai:stream-part' ? { part: mapped.payload } : {}),
            ...(mapped.channel === 'ai:stream-error' ? { error: mapped.payload } : {}),
            ...(mapped.channel === 'ai:stream-end' ? { aborted: mapped.payload } : {}),
            ...(mapped.channel === 'ai:stream-tool' ? { tool: mapped.payload } : {}),
            ...(mapped.channel === 'ai:context-bounded' ? { warning: mapped.payload } : {}),
          });
        }
      },
    );

    chatLog('info', logContext, 'main.engine', 'provider.dispatch.completed', { success });

    const changeSet = workspaceChangeSetService.findByTurn(turnId || '');
    if (changeSet?.entries.length) {
      mainWindow?.webContents.send('ai:changeset-ready', { conversationId: activeConvId, turnId: changeSet.turnId, changeSet });
    }

    return success;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      chatLog('warn', logContext, 'main.stream', 'terminal.cancelled');
      mainWindow?.webContents.send('ai:stream-end', {
        conversationId: activeConvId,
        turnId,
        aborted: true,
      });
    } else {
      chatLog('error', logContext, 'main.stream', 'terminal.error');
      console.error('Error during AI agent execution:', err);
      mainWindow?.webContents.send('ai:stream-error', {
        conversationId: activeConvId,
        turnId,
        error: err.message || 'Error desconocido.',
      });
    }
    return false;
  }
});

// 4. Git Source Control Handlers
const runGit = (workspacePath: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile('git', args, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });

ipcMain.handle('git:status', async (_event, workspacePath: string) => {
  if (!workspacePath) return [];

  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec('git status --porcelain --ignored=matching', { cwd: workspacePath }, (err, stdout, stderr) => {
        if (err && !stdout) reject(err);
        else resolve({ stdout, stderr });
      });
    });

    const lines = stdout.split('\n').filter(Boolean);
    return lines.map(line => {
      const status = line.slice(0, 2);
      let rawPath = line.slice(3).trim();
      if (rawPath.startsWith('"') && rawPath.endsWith('"')) {
        rawPath = rawPath.slice(1, -1);
      }
      const filePath = rawPath.replace(/\/$/, '');
      return { status, filePath };
    });
  } catch (err: any) {
    // Gracefully ignore expected error when a workspace is not a Git repository
    if (err?.code === 128 || err?.message?.includes('not a git repository')) {
      return [];
    }
    console.warn('Git status not available for workspace:', err?.message || err);
    return [];
  }
});

ipcMain.handle('git:stage', async (_event, workspacePath: string, filePath: string) => {
  try {
    await runGit(workspacePath, ['add', '--', filePath]);
    return { success: true };
  } catch (err: any) {
    console.error('Error staging git file:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:unstage', async (_event, workspacePath: string, filePath: string) => {
  try {
    await runGit(workspacePath, ['restore', '--staged', '--', filePath]);
    return { success: true };
  } catch (err: any) {
    console.error('Error unstaging git file:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:diff', async (_event, workspacePath: string, filePath: string) => {
  try {
    const cmd = filePath ? `git diff HEAD -- "${filePath}"` : `git diff HEAD`;
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec(cmd, { cwd: workspacePath }, (err, stdout, stderr) => {
        if (err && !stdout) reject(err);
        else resolve({ stdout, stderr });
      });
    });
    return stdout;
  } catch (err) {
    console.error('Error running git diff:', err);
    return 'No se pudo obtener el diff de git para este archivo o es un archivo nuevo sin trackear.';
  }
});

ipcMain.handle('git:show-original', async (_event, workspacePath: string, filePath: string) => {
  try {
    const relativePath = relative(workspacePath, filePath).replace(/\\/g, '/');
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec(`git show "HEAD:${relativePath}"`, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
        if (err) {
          resolve({ stdout: '' });
        } else {
          resolve({ stdout });
        }
      });
    });
    return stdout;
  } catch (err) {
    console.error('Error running git show-original:', err);
    return '';
  }
});

ipcMain.handle('git:current-branch', async (_event, workspacePath: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec('git branch --show-current', { cwd: workspacePath }, (err, stdout) => {
        if (err || !stdout.trim()) {
          exec('git rev-parse --abbrev-ref HEAD', { cwd: workspacePath }, (err2, stdout2) => {
            if (err2) resolve({ stdout: 'main' });
            else resolve({ stdout: stdout2.trim() });
          });
        } else {
          resolve({ stdout: stdout.trim() });
        }
      });
    });
    return stdout;
  } catch {
    return 'main';
  }
});

ipcMain.handle('git:commit', async (_event, workspacePath: string, message: string) => {
  try {
    await runGit(workspacePath, ['add', '-A']);
    const { stdout, stderr } = await runGit(workspacePath, ['commit', '-m', message]);
    return { success: true, output: `${stdout}${stderr}`.trim() };
  } catch (err: any) {
    console.error('Error running git commit:', err);
    return { success: false, error: err.stderr || err.message };
  }
});

ipcMain.handle('git:log', async (_event, workspacePath: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec('git log -n 35 --pretty=format:"%h|%d|%s|%an|%cr|%p"', { cwd: workspacePath }, (err, stdout) => {
        if (err) resolve({ stdout: '' });
        else resolve({ stdout });
      });
    });
    const lines = stdout.split('\n').filter(Boolean);
    return lines.map(line => {
      const parts = line.split('|');
      const hash = parts[0] || '';
      const rawDecorations = parts[1] || '';
      const message = parts[2] || '';
      const author = parts[3] || '';
      const date = parts[4] || '';
      const rawParents = parts[5] || '';
      const parents = rawParents.trim().split(/\s+/).filter(Boolean);

      let branch = '';
      const tags: string[] = [];
      if (rawDecorations.trim()) {
        const cleaned = rawDecorations.trim().replace(/^\(/, '').replace(/\)$/, '');
        cleaned.split(',').forEach(item => {
          const trimmed = item.trim();
          if (trimmed.startsWith('HEAD ->')) {
            branch = trimmed.replace('HEAD ->', '').trim();
          } else if (trimmed.startsWith('tag:')) {
            tags.push(trimmed.replace('tag:', '').trim());
          } else if (trimmed && !branch) {
            branch = trimmed;
          }
        });
      }

      return { hash, message, branch, author, date, parents, tags };
    });
  } catch {
    return [];
  }
});

ipcMain.handle('git:repositories', async (_event, workspacePath: string) => {
  try {
    const rootName = workspacePath.split(/[/\\]/).pop() || 'root';
    const repos = [{ name: rootName, path: workspacePath, isRoot: true }];
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec('git submodule status', { cwd: workspacePath }, (err, stdout) => {
        if (err) resolve({ stdout: '' });
        else resolve({ stdout });
      });
    });
    const lines = stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const subPath = parts[1];
      if (subPath) {
        const name = subPath.split(/[/\\]/).pop() || subPath;
        const fullPath = `${workspacePath}/${subPath}`.replace(/\/+/g, '/');
        repos.push({ name, path: fullPath, isRoot: false });
      }
    }
    return repos;
  } catch {
    return [{ name: workspacePath.split(/[/\\]/).pop() || 'root', path: workspacePath, isRoot: true }];
  }
});

ipcMain.handle('git:commit-files', async (_event, workspacePath: string, hash: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec(`git show --name-status --oneline "${hash}"`, { cwd: workspacePath }, (err, stdout) => {
        if (err) resolve({ stdout: '' });
        else resolve({ stdout });
      });
    });
    const lines = stdout.split('\n').filter(Boolean).slice(1);
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const status = parts[0] || 'M';
      const filePath = parts.slice(1).join(' ') || '';
      return { status, filePath };
    });
  } catch {
    return [];
  }
});

ipcMain.handle('git:get-ahead-behind', async (_event, workspacePath: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec('git rev-list --left-right --count HEAD...@{u}', { cwd: workspacePath }, (err, stdout) => {
        if (err) {
          resolve({ stdout: '0\t0' });
        } else {
          resolve({ stdout });
        }
      });
    });
    const parts = stdout.trim().split(/\s+/);
    const ahead = parseInt(parts[0], 10) || 0;
    const behind = parseInt(parts[1], 10) || 0;
    return { ahead, behind };
  } catch (err) {
    return { ahead: 0, behind: 0 };
  }
});

ipcMain.handle('git:push', async (_event, workspacePath: string) => {
  try {
    let pushArgs = ['push'];

    try {
      await runGit(workspacePath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    } catch {
      const { stdout: branchStdout } = await runGit(workspacePath, ['branch', '--show-current']);
      const branch = branchStdout.trim();
      if (branch) {
        pushArgs = ['push', '--set-upstream', 'origin', branch];
      }
    }

    const { stdout, stderr } = await runGit(workspacePath, pushArgs);
    return { success: true, output: `${stdout}${stderr}`.trim() };
  } catch (err: any) {
    console.error('Error running git push:', err);
    return { success: false, error: err.stderr || err.message };
  }
});

ipcMain.handle('git:create-pull-request', async (_event, workspacePath: string, args: {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
}) => {
  try {
    const base = args.base?.trim() || 'main';
    const prArgs = [
      'pr',
      'create',
      '--base',
      base,
      '--title',
      args.title.trim(),
      '--body',
      args.body.trim() || 'Ready for review.',
    ];

    if (args.draft) {
      prArgs.push('--draft');
    }

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile('gh', prArgs, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
        if (err) reject(Object.assign(err, { stdout, stderr }));
        else resolve({ stdout, stderr });
      });
    });

    return { success: true, url: stdout.trim(), output: `${stdout}${stderr}`.trim() };
  } catch (err: any) {
    console.error('Error creating pull request:', err);
    return { success: false, error: err.stderr || err.message };
  }
});
