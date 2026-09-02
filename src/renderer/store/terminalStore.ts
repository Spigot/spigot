import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  name: string;
  kind?: 'local' | 'ssh' | 'agent';
}

export interface SshServer {
  id?: string;
  name?: string;
  host: string;
  user: string;
  port?: number;
  identityFile?: string;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  isCreating: boolean;

  createSession: (cols: number, rows: number, cwd: string) => Promise<string | null>;
  createSshSession: (cols: number, rows: number, server: SshServer) => Promise<string | null>;
  ensureAgentSession: (session: { id: string; name: string; cwd: string }) => void;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isCreating: false,

  createSession: async (cols: number, rows: number, cwd: string) => {
    if (get().isCreating) return null;
    set({ isCreating: true });
    try {
      const sessionId = await (window as any).api.terminal.create(cols, rows, cwd);
      if (sessionId) {
        const newSession: TerminalSession = {
          id: sessionId,
          name: `Terminal ${get().sessions.length + 1}`,
        };
        set((state) => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: sessionId,
        }));
        return sessionId;
      }
    } catch (err) {
      console.error('Error creating terminal session:', err);
    } finally {
      set({ isCreating: false });
    }
    return null;
  },

  createSshSession: async (cols: number, rows: number, server: SshServer) => {
    if (get().isCreating) return null;
    set({ isCreating: true });
    try {
      const sessionId = await (window as any).api.terminal.createSSH(cols, rows, server);
      if (sessionId) {
        const label = server.name?.trim() || `${server.user}@${server.host}`;
        const newSession: TerminalSession = {
          id: sessionId,
          name: `SSH: ${label}`,
          kind: 'ssh',
        };
        set((state) => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: sessionId,
        }));
        return sessionId;
      }
    } catch (err) {
      console.error('Error creating SSH terminal session:', err);
    } finally {
      set({ isCreating: false });
    }
    return null;
  },

  // Read-only session mirroring the commands the AI agent runs (VS Code-style
  // tool terminal). It exists in the renderer only; output arrives via IPC.
  ensureAgentSession: (session) => {
    if (get().sessions.some((s) => s.id === session.id)) return;
    set((state) => ({
      sessions: [...state.sessions, { id: session.id, name: session.name, kind: 'agent' as const }],
      activeSessionId: session.id,
    }));
  },

  closeSession: (id: string) => {
    const { sessions, activeSessionId } = get();
    const filteredSessions = sessions.filter((s) => s.id !== id);
    
    let nextActive = activeSessionId;
    if (activeSessionId === id) {
      if (filteredSessions.length > 0) {
        nextActive = filteredSessions[filteredSessions.length - 1].id;
      } else {
        nextActive = null;
      }
    }

    set({
      sessions: filteredSessions,
      activeSessionId: nextActive,
    });
  },

  setActiveSession: (id: string) => {
    set({ activeSessionId: id });
  },
}));
