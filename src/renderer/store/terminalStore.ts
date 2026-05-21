import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  name: string;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  createSession: (cols: number, rows: number, cwd: string) => Promise<string | null>;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  createSession: async (cols: number, rows: number, cwd: string) => {
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
