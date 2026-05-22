import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to the React renderer
contextBridge.exposeInMainWorld('api', {
  app: {
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),
  },
  fs: {
    selectWorkspace: () => ipcRenderer.invoke('fs:select-workspace'),
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:read-dir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', filePath, content),
    createItem: (itemPath: string, type: 'file' | 'directory') => ipcRenderer.invoke('fs:create-item', itemPath, type),
    deleteItem: (itemPath: string) => ipcRenderer.invoke('fs:delete-item', itemPath),
    watchWorkspace: (workspacePath: string) => ipcRenderer.invoke('fs:watch-workspace', workspacePath),
    unwatchWorkspace: () => ipcRenderer.invoke('fs:unwatch-workspace'),
    onWorkspaceChanged: (callback: (filename: string | null) => void) => {
      const listener = (_event: any, filename: string | null) => callback(filename);
      ipcRenderer.on('workspace:changed', listener);
      return () => ipcRenderer.removeListener('workspace:changed', listener);
    },
  },
  terminal: {
    create: (cols: number, rows: number, cwd: string) => ipcRenderer.invoke('terminal:create', { cols, rows, cwd }),
    write: (sessionId: string, data: string) => ipcRenderer.send('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', sessionId, cols, rows),
    onData: (sessionId: string, callback: (data: string) => void) => {
      const subscription = (_event: any, data: string) => callback(data);
      ipcRenderer.on(`terminal:data:${sessionId}`, subscription);
      return () => {
        ipcRenderer.removeListener(`terminal:data:${sessionId}`, subscription);
      };
    },
    onClose: (sessionId: string, callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.once(`terminal:close:${sessionId}`, subscription);
      return () => {
        ipcRenderer.removeListener(`terminal:close:${sessionId}`, subscription);
      };
    }
  },
  store: {
    getKeys: () => ipcRenderer.invoke('store:get-keys'),
    setKey: (provider: string, key: string) => ipcRenderer.invoke('store:set-key', provider, key),
    getSelectedModels: () => ipcRenderer.invoke('store:get-selected-models'),
    setSelectedModel: (provider: string, model: string) => ipcRenderer.invoke('store:set-selected-model', provider, model),
    getLastWorkspace: () => ipcRenderer.invoke('store:get-last-workspace'),
    setLastWorkspace: (workspacePath: string | null) => ipcRenderer.invoke('store:set-last-workspace', workspacePath),
  },
  ai: {
    fetchModels: (provider: string, apiKey: string) => ipcRenderer.invoke('ai:fetch-models', provider, apiKey),
    streamChat: (args: { provider: string; model: string; apiKey: string; prompt: string; contextText: string | null; history: any[] }) => 
      ipcRenderer.invoke('ai:stream-chat', args),
    abortChat: () => ipcRenderer.send('ai:abort-chat'),
    onChunk: (callback: (chunk: string) => void) => {
      const listener = (_event: any, chunk: string) => callback(chunk);
      ipcRenderer.on('ai:stream-chunk', listener);
      return () => ipcRenderer.removeListener('ai:stream-chunk', listener);
    },
    onEnd: (callback: (aborted?: boolean) => void) => {
      const listener = (_event: any, aborted?: boolean) => callback(aborted);
      ipcRenderer.on('ai:stream-end', listener);
      return () => ipcRenderer.removeListener('ai:stream-end', listener);
    },
    onError: (callback: (err: string) => void) => {
      const listener = (_event: any, err: string) => callback(err);
      ipcRenderer.on('ai:stream-error', listener);
      return () => ipcRenderer.removeListener('ai:stream-error', listener);
    }
  },
  git: {
    getStatus: (workspacePath: string) => ipcRenderer.invoke('git:status', workspacePath),
    getDiff: (workspacePath: string, filePath: string) => ipcRenderer.invoke('git:diff', workspacePath, filePath),
    showOriginal: (workspacePath: string, filePath: string) => ipcRenderer.invoke('git:show-original', workspacePath, filePath),
    getCurrentBranch: (workspacePath: string) => ipcRenderer.invoke('git:current-branch', workspacePath),
    commit: (workspacePath: string, message: string) => ipcRenderer.invoke('git:commit', workspacePath, message),
    getLog: (workspacePath: string) => ipcRenderer.invoke('git:log', workspacePath),
  },
  lsp: {
    openDocument: (args: any) => ipcRenderer.invoke('lsp:open-document', args),
    changeDocument: (args: any) => ipcRenderer.invoke('lsp:change-document', args),
    saveDocument: (args: any) => ipcRenderer.invoke('lsp:save-document', args),
    completion: (args: any) => ipcRenderer.invoke('lsp:completion', args),
    onDiagnostics: (callback: (payload: any) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('lsp:diagnostics', listener);
      return () => ipcRenderer.removeListener('lsp:diagnostics', listener);
    },
  }
});

