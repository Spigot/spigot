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
  private outputBuffers = new Map<string, string[]>();
  private mainWindow: BrowserWindow | null = null;
  private agentSessions = new Map<string, BrowserWindow>();

  /** Call once with the main window so agent-command sessions can stream to the UI. */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Registers a read-only terminal session that mirrors the commands the AI
   * agent runs, like VS Code's "tool terminal". Idempotent per conversation.
   */
  ensureAgentSession(conversationId: string, cwd: string): string {
    const sessionId = `agent-${conversationId}`;
    if (this.agentSessions.has(sessionId)) return sessionId;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return sessionId;

    this.agentSessions.set(sessionId, this.mainWindow);
    this.outputBuffers.set(sessionId, []);
    this.mainWindow.webContents.send('terminal:agent-session', {
      id: sessionId,
      name: 'Agente',
      cwd,
    });
    return sessionId;
  }

  emitAgentData(conversationId: string, text: string): void {
    const sessionId = `agent-${conversationId}`;
    const window = this.agentSessions.get(sessionId);
    if (!window || window.isDestroyed()) return;

    const buf = this.outputBuffers.get(sessionId);
    if (buf) {
      buf.push(text);
      if (buf.length > 500) buf.shift();
    }
    window.webContents.send(`terminal:data:${sessionId}`, text);
  }

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
    this.outputBuffers.set(sessionId, []);

    // Forward output from node-pty to the React renderer through the safe IPC channel
    ptyProcess.onData((data) => {
      const buf = this.outputBuffers.get(sessionId);
      if (buf) {
        buf.push(data);
        if (buf.length > 500) buf.shift();
      }

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
      this.outputBuffers.delete(sessionId);
    });

    return sessionId;
  }

  getHistory(sessionId: string): string[] {
    return this.outputBuffers.get(sessionId) || [];
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
    if (this.agentSessions.has(sessionId)) {
      this.agentSessions.delete(sessionId);
      this.outputBuffers.delete(sessionId);
      return;
    }
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
    this.agentSessions.clear();
  }
}

export const terminalManager = new TerminalManager();
