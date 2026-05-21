import { BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import { randomUUID } from 'crypto';

class TerminalManager {
  private sessions = new Map<string, pty.IPty>();

  createSession(mainWindow: BrowserWindow, cols: number, rows: number, cwd: string): string {
    const sessionId = randomUUID();
    
    // Choose shell based on OS platform
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || process.env.HOME || process.env.USERPROFILE,
      env: process.env as Record<string, string>,
    });

    this.sessions.set(sessionId, ptyProcess);

    // Forward output from node-pty to the React renderer through the safe IPC channel
    ptyProcess.onData((data) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:data:${sessionId}`, data);
      }
    });

    // Handle session exit
    ptyProcess.onExit(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:close:${sessionId}`);
      }
      this.sessions.delete(sessionId);
    });

    return sessionId;
  }

  write(sessionId: string, data: string): void {
    const ptyProcess = this.sessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const ptyProcess = this.sessions.get(sessionId);
    if (ptyProcess) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (err) {
        console.error('Error resizing PTY process:', err);
      }
    }
  }

  closeSession(sessionId: string): void {
    const ptyProcess = this.sessions.get(sessionId);
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (err) {
        console.error('Error killing PTY session:', err);
      }
      this.sessions.delete(sessionId);
    }
  }

  clearAll(): void {
    for (const ptyProcess of this.sessions.values()) {
      try {
        ptyProcess.kill();
      } catch (e) {}
    }
    this.sessions.clear();
  }
}

export const terminalManager = new TerminalManager();
