import { create } from 'zustand';

export interface DiagnosticItem {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  line: number; // 1-indexed
  column: number; // 1-indexed
  code?: string;
  source?: string;
}

interface DiagnosticsState {
  // Normalized file path -> list of diagnostics
  diagnostics: Record<string, DiagnosticItem[]>;
  setDiagnostics: (filePath: string, items: DiagnosticItem[]) => void;
  clearDiagnostics: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  diagnostics: {},
  setDiagnostics: (filePath, items) => {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
    set((state) => ({
      diagnostics: {
        ...state.diagnostics,
        [normalizedPath]: items,
      },
    }));
  },
  clearDiagnostics: () => set({ diagnostics: {} }),
}));
