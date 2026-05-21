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
  }
});
