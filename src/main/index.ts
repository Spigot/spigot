import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, relative } from 'path';
import { promises as fsPromises } from 'fs';
import { exec } from 'child_process';
import { terminalManager } from './terminal';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false, // Start hidden to prevent raw white flashes
    frame: false, // Frameless window for premium custom title bar
    titleBarStyle: 'hidden',
    icon: join(__dirname, '../../logoSpigot.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

// 1. Storage Handlers (electron-store simulation)
ipcMain.handle('store:get-keys', async () => {
  const data = await readStore();
  return data.apiKeys || {};
});

ipcMain.handle('store:set-key', async (_event, provider: string, key: string) => {
  const data = await readStore();
  if (!data.apiKeys) data.apiKeys = {};
  data.apiKeys[provider] = key;
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

ipcMain.handle('store:get-last-workspace', async () => {
  const data = await readStore();
  const lastWorkspacePath = data.lastWorkspacePath;

  if (typeof lastWorkspacePath !== 'string' || !lastWorkspacePath.trim()) {
    return null;
  }

  try {
    const stats = await fsPromises.stat(lastWorkspacePath);
    return stats.isDirectory() ? lastWorkspacePath : null;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('store:set-last-workspace', async (_event, workspacePath: string | null) => {
  const data = await readStore();

  if (workspacePath && workspacePath.trim()) {
    data.lastWorkspacePath = workspacePath;
  } else {
    delete data.lastWorkspacePath;
  }

  await writeStore(data);
  return true;
});

// 2. Fetch Models Dynamically from Provider endpoints
ipcMain.handle('ai:fetch-models', async (_event, provider: string, apiKey: string) => {
  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as any;
      return json.data.map((m: any) => m.id).filter((id: string) => id.includes('gpt') || id.includes('o1') || id.includes('o3'));
    } else if (provider === 'deepseek') {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as any;
      return json.data.map((m: any) => m.id);
    } else if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as any;
      return json.models
        .map((m: any) => m.name.replace('models/', ''))
        .filter((id: string) => id.includes('gemini'));
    } else if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://spigot.gentleman.com',
          'X-Title': 'Spigot'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as any;
      return json.data.map((m: any) => m.id);
    } else if (provider === 'kimi') {
      const res = await fetch('https://api.moonshot.cn/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as any;
      return json.data.map((m: any) => m.id);
    }
    return [];
  } catch (err) {
    console.error(`Error querying dynamic models for ${provider}:`, err);
    return [];
  }
});

// 3. Unified Stream Chat SSE Handler
let activeAbortController: AbortController | null = null;

ipcMain.on('ai:abort-chat', () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
});

ipcMain.handle('ai:stream-chat', async (
  _event, 
  { provider, model, apiKey, prompt, contextText, history }
): Promise<boolean> => {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  try {
    let url = '';
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {};

    // Standardize conversation history format for API calls
    const formattedMessages = (history || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }));

    // Prepend active project context to the latest message
    const fullUserPrompt = contextText 
      ? `=== CONTEXTO DEL PROYECTO ===\n${contextText}\n\n=== FIN CONTEXTO ===\n\nPregunta / Instrucción del usuario:\n${prompt}`
      : prompt;

    formattedMessages.push({ role: 'user', content: fullUserPrompt });

    if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model, messages: formattedMessages, stream: true };
    } else if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = 'https://spigot.gentleman.com';
      headers['X-Title'] = 'Spigot';
      body = { model, messages: formattedMessages, stream: true };
    } else if (provider === 'deepseek') {
      url = 'https://api.deepseek.com/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model, messages: formattedMessages, stream: true };
    } else if (provider === 'kimi') {
      url = 'https://api.moonshot.cn/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model, messages: formattedMessages, stream: true };
    } else if (provider === 'qwen') {
      url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = { model, messages: formattedMessages, stream: true };
    } else if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = { 
        model, 
        messages: formattedMessages, 
        max_tokens: 4000, 
        stream: true 
      };
    } else if (provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
      // Gemini expects contents list
      const geminiContents = (history || []).map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      geminiContents.push({
        role: 'user',
        parts: [{ text: fullUserPrompt }]
      });
      body = { contents: geminiContents };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API returned HTTP ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (provider === 'anthropic') {
          // Anthropic SSE format
          if (trimmed.startsWith('data: ')) {
            try {
              const dataStr = trimmed.slice(6);
              if (dataStr.trim() === '[DONE]') continue;
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                mainWindow?.webContents.send('ai:stream-chunk', parsed.delta.text);
              }
            } catch (e) {}
          }
        } else if (provider === 'gemini') {
          // Gemini returns JSON array stream, each chunk is a candidates node
          try {
            // Gemini stream can send lines starting with "data: " or direct JSON objects
            const cleanLine = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
            const parsed = JSON.parse(cleanLine);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (content) {
              mainWindow?.webContents.send('ai:stream-chunk', content);
            }
          } catch (e) {}
        } else {
          // OpenAI, DeepSeek, Qwen, Kimi compatible format
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr.trim() === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                mainWindow?.webContents.send('ai:stream-chunk', content);
              }
            } catch (e) {}
          }
        }
      }
    }

    mainWindow?.webContents.send('ai:stream-end');
    activeAbortController = null;
    return true;

  } catch (err: any) {
    if (err.name === 'AbortError') {
      mainWindow?.webContents.send('ai:stream-end', true); // Send true to signify aborted
    } else {
      console.error('Error during AI chat completion:', err);
      mainWindow?.webContents.send('ai:stream-error', err.message || 'Error desconocido.');
    }
    activeAbortController = null;
    return false;
  }
});

// 4. Git Source Control Handlers
ipcMain.handle('git:status', async (_event, workspacePath: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec('git status --porcelain', { cwd: workspacePath }, (err, stdout, stderr) => {
        if (err && !stdout) reject(err);
        else resolve({ stdout, stderr });
      });
    });

    const lines = stdout.split('\n').filter(Boolean);
    return lines.map(line => {
      const status = line.slice(0, 2);
      const filePath = line.slice(3).trim();
      return { status, filePath };
    });
  } catch (err) {
    console.error('Error running git status:', err);
    return [];
  }
});

ipcMain.handle('git:diff', async (_event, workspacePath: string, filePath: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec(`git diff HEAD -- "${filePath}"`, { cwd: workspacePath }, (err, stdout, stderr) => {
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
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec('git add -A && git commit -m "' + message.replace(/"/g, '\\"') + '"', { cwd: workspacePath }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      });
    });
    return { success: true, output: stdout };
  } catch (err: any) {
    console.error('Error running git commit:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:log', async (_event, workspacePath: string) => {
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve) => {
      exec('git log -n 10 --oneline --decorate', { cwd: workspacePath }, (err, stdout) => {
        if (err) resolve({ stdout: '' });
        else resolve({ stdout });
      });
    });
    const lines = stdout.split('\n').filter(Boolean);
    return lines.map(line => {
      const firstSpace = line.indexOf(' ');
      const hash = line.slice(0, firstSpace);
      let rest = line.slice(firstSpace + 1);
      
      let branchName = '';
      if (rest.startsWith('(')) {
        const closingParen = rest.indexOf(')');
        const refStr = rest.slice(1, closingParen);
        const headMatch = refStr.match(/HEAD -> ([^,)]+)/);
        if (headMatch) {
          branchName = headMatch[1];
        } else {
          branchName = refStr.split(',')[0].trim();
        }
        rest = rest.slice(closingParen + 1).trim();
      }
      return { hash, message: rest, branch: branchName };
    });
  } catch {
    return [];
  }
});

