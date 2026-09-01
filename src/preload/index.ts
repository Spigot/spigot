import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to the React renderer
contextBridge.exposeInMainWorld('api', {
  app: {
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),
    zoomIn: () => ipcRenderer.send('app:zoom-in'),
    zoomOut: () => ipcRenderer.send('app:zoom-out'),
    zoomReset: () => ipcRenderer.send('app:zoom-reset'),
    openShell: (folderPath: string) => ipcRenderer.send('app:open-shell', folderPath),
    openExternal: (url: string) => ipcRenderer.send('app:open-external', url),
    getInfo: () => ipcRenderer.invoke('app:get-info'),
  },
  updater: {
    installUpdate: () => ipcRenderer.invoke('updater:install-update'),
    onUpdateReady: (callback: (payload: { version?: string }) => void) => {
      const listener = (_event: any, payload: { version?: string }) => callback(payload);
      ipcRenderer.on('updater:update-ready', listener);
      return () => ipcRenderer.removeListener('updater:update-ready', listener);
    },
    onError: (callback: (message: string) => void) => {
      const listener = (_event: any, message: string) => callback(message);
      ipcRenderer.on('updater:error', listener);
      return () => ipcRenderer.removeListener('updater:error', listener);
    },
  },
  fs: {
    selectWorkspace: () => ipcRenderer.invoke('fs:select-workspace'),
    createProject: (parentPath: string, name: string) => ipcRenderer.invoke('fs:create-project', parentPath, name),
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:read-dir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    readBinaryFile: (filePath: string) => ipcRenderer.invoke('fs:read-binary-file', filePath),
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
    createSSH: (cols: number, rows: number, server: { name?: string; host: string; user: string; port?: number; identityFile?: string }) =>
      ipcRenderer.invoke('terminal:create-ssh', { cols, rows, server }),
    write: (sessionId: string, data: string) => ipcRenderer.send('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', sessionId, cols, rows),
    close: (sessionId: string) => ipcRenderer.send('terminal:close', sessionId),
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
    },
    getHistory: (sessionId: string) => ipcRenderer.invoke('terminal:get-history', sessionId)
  },
  store: {
    getKeys: () => ipcRenderer.invoke('store:get-keys'),
    setKey: (provider: string, key: string, authType?: 'api' | 'oauth') => ipcRenderer.invoke('store:set-key', provider, key, authType),
    getSelectedModels: () => ipcRenderer.invoke('store:get-selected-models'),
    setSelectedModel: (provider: string, model: string) => ipcRenderer.invoke('store:set-selected-model', provider, model),
    getModelConfiguration: () => ipcRenderer.invoke('store:get-model-configuration'),
    setModelConfiguration: (configuration: unknown) => ipcRenderer.invoke('store:set-model-configuration', configuration),
    getLastWorkspace: () => ipcRenderer.invoke('store:get-last-workspace'),
    setLastWorkspace: (workspacePath: string | null) => ipcRenderer.invoke('store:set-last-workspace', workspacePath),
    getRecentWorkspaces: () => ipcRenderer.invoke('store:get-recent-workspaces'),
    getChatHistory: (workspacePath?: string | null) => ipcRenderer.invoke('store:get-chat-history', workspacePath),
    setChatHistory: (chatHistory: any[], workspacePath?: string | null) => ipcRenderer.invoke('store:set-chat-history', chatHistory, workspacePath),
    getSSHServers: () => ipcRenderer.invoke('store:get-ssh-servers'),
    addSSHServer: (server: { id: string; name: string; host: string; user: string; port?: number; identityFile?: string }) => ipcRenderer.invoke('store:add-ssh-server', server),
  },
  ai: {
    fetchModels: (provider: string, apiKey: string) => ipcRenderer.invoke('ai:fetch-models', provider, apiKey),
    streamChat: (args: { 
      conversationId?: string;
      turnId?: string;
      mode?: 'orchestrator' | 'build' | 'plan' | 'review';
      effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
      provider: string; 
      model: string; 
      apiKey: string; 
      prompt: string; 
      contextText: string | null; 
      contextSource?: 'default' | 'explicit';
      history: any[]; 
      image?: string | null 
    }) => ipcRenderer.invoke('ai:stream-chat', args),
    abortChat: (args?: { conversationId?: string; turnId?: string }) => ipcRenderer.send('ai:abort-chat', args),
    onChunk: (callback: (payload: { conversationId: string; turnId: string; chunk: string } | string) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:stream-chunk', listener);
      return () => ipcRenderer.removeListener('ai:stream-chunk', listener);
    },
    onPart: (callback: (payload: { conversationId: string; turnId: string; part: import('../main/engine/types').AssistantPart }) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:stream-part', listener);
      return () => ipcRenderer.removeListener('ai:stream-part', listener);
    },
    onEnd: (callback: (payload: { conversationId: string; turnId: string; aborted?: boolean } | boolean) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:stream-end', listener);
      return () => ipcRenderer.removeListener('ai:stream-end', listener);
    },
    onError: (callback: (payload: { conversationId: string; turnId: string; error: string } | string) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:stream-error', listener);
      return () => ipcRenderer.removeListener('ai:stream-error', listener);
    },
    onTool: (callback: (payload: { conversationId: string; turnId: string; tool: { id: string; name: string; status: 'start' | 'progress' | 'end'; data?: any } }) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:stream-tool', listener);
      return () => ipcRenderer.removeListener('ai:stream-tool', listener);
    },
    onContextBounded: (callback: (payload: { conversationId: string; turnId: string; warning: import('../shared/contextBudget').ContextBoundEvent }) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:context-bounded', listener);
      return () => ipcRenderer.removeListener('ai:context-bounded', listener);
    },
    onChangeSetReady: (callback: (payload: { conversationId: string; turnId: string; changeSet: unknown }) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('ai:changeset-ready', listener);
      return () => ipcRenderer.removeListener('ai:changeset-ready', listener);
    },
  },
  changes: {
    summary: (changeSetId: string) => ipcRenderer.invoke('changes:summary', changeSetId),
    entry: (args: { changeSetId: string; relativePath: string }) => ipcRenderer.invoke('changes:entry', args),
    accept: (args: { changeSetId: string; dirtyPaths: string[] }) => ipcRenderer.invoke('changes:accept', args),
    reject: (changeSetId: string) => ipcRenderer.invoke('changes:reject', changeSetId),
    listRollbacks: (query?: { changeSetId?: string; turnId?: string; conversationId?: string }) => ipcRenderer.invoke('changes:list-rollbacks', query),
    previewRollback: (checkpointId: string) => ipcRenderer.invoke('changes:preview-rollback', checkpointId),
    rollback: (checkpointId: string) => ipcRenderer.invoke('changes:rollback', checkpointId),
  },
  git: {
    getStatus: (workspacePath: string) => ipcRenderer.invoke('git:status', workspacePath),
    getRepositories: (workspacePath: string) => ipcRenderer.invoke('git:repositories', workspacePath),
    getDiff: (workspacePath: string, filePath: string) => ipcRenderer.invoke('git:diff', workspacePath, filePath),
    showOriginal: (workspacePath: string, filePath: string) => ipcRenderer.invoke('git:show-original', workspacePath, filePath),
    getCurrentBranch: (workspacePath: string) => ipcRenderer.invoke('git:current-branch', workspacePath),
    commit: (workspacePath: string, message: string) => ipcRenderer.invoke('git:commit', workspacePath, message),
    getLog: (workspacePath: string) => ipcRenderer.invoke('git:log', workspacePath),
    getCommitFiles: (workspacePath: string, hash: string) => ipcRenderer.invoke('git:commit-files', workspacePath, hash),
    getAheadBehind: (workspacePath: string) => ipcRenderer.invoke('git:get-ahead-behind', workspacePath),
    push: (workspacePath: string) => ipcRenderer.invoke('git:push', workspacePath),
    stage: (workspacePath: string, filePath: string) => ipcRenderer.invoke('git:stage', workspacePath, filePath),
    unstage: (workspacePath: string, filePath: string) => ipcRenderer.invoke('git:unstage', workspacePath, filePath),
    createPullRequest: (workspacePath: string, args: { title: string; body: string; base?: string; draft?: boolean }) =>
      ipcRenderer.invoke('git:create-pull-request', workspacePath, args),
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
  },
  semantic: {
    retrieve: (args: { workspacePath: string; query: string; explicitPaths?: string[] }) => ipcRenderer.invoke('semantic:retrieve', args),
  }
});
