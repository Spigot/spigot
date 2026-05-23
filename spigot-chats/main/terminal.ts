import { BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import { randomUUID } from 'crypto';

export interface SshSessionConfig {
  name?: string;
  host: string;
  user: string;
  port?: number;
  identityFile?: string;
}

class TerminalManager {
  private sessions = new Map<string, pty.IPty>();

  createSession(mainWindow: BrowserWindow, cols: number, rows: number, cwd: string): string {
    // Choose shell based on OS platform
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || process.env.HOME || process.env.USERPROFILE,
      env: process.env as Record<string, string>,
    });

    return this.registerSession(mainWindow, ptyProcess);
  }

  createSshSession(mainWindow: BrowserWindow, cols: number, rows: number, config: SshSessionConfig): string {
    const sshCommand = process.platform === 'win32' ? 'ssh.exe' : 'ssh';
    const args = this.buildSshArgs(config);
    const ptyProcess = pty.spawn(sshCommand, args, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: process.env.HOME || process.env.USERPROFILE,
      env: process.env as Record<string, string>,
    });

    return this.registerSession(mainWindow, ptyProcess);
  }

  private buildSshArgs(config: SshSessionConfig): string[] {
    const args = ['-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3'];

    if (config.port && Number.isInteger(config.port) && config.port > 0) {
      args.push('-p', String(config.port));
    }

    if (config.identityFile?.trim()) {
      args.push('-i', config.identityFile.trim());
    }

    args.push(`${config.user}@${config.host}`);
    return args;
  }

  private registerSession(mainWindow: BrowserWindow, ptyProcess: pty.IPty): string {
    const sessionId = randomUUID();
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
