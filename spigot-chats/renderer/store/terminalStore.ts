import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  name: string;
  kind?: 'local' | 'ssh';
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
