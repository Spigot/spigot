import { create } from 'zustand';

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number; // 1 = Error, 2 = Warning, 3 = Info, 4 = Hint
  source?: string;
  code?: string | number;
}

interface FileDiagnostics {
  uri: string;
  filePath: string;
  diagnostics: LspDiagnostic[];
}

interface DiagnosticsState {
  // Keyed by file URI
  fileDiagnostics: Record<string, FileDiagnostics>;
  
  setDiagnostics: (uri: string, diagnostics: LspDiagnostic[]) => void;
  clearDiagnostics: (uri: string) => void;
  clearAll: () => void;
  
  // Helpers
  getDiagnosticsCount: () => { errors: number; warnings: number };
  getFileErrorStatus: (filePath: string) => 'error' | 'warning' | null;
}

// Convert file:// URI to standard system path
export const uriToPath = (uri: string): string => {
  let cleaned = decodeURIComponent(uri.replace(/^file:\/\/\/?/, ''));
  // For Windows paths like "C:/path/to/file"
  if (/^[a-zA-Z]:\//.test(cleaned)) {
    return cleaned.replace(/\//g, '\\');
  }
  // For unix/posix absolute paths
  return '/' + cleaned;
};

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  fileDiagnostics: {},

  setDiagnostics: (uri, diagnostics) => {
    set((state) => {
      const updated = { ...state.fileDiagnostics };
      if (diagnostics.length === 0) {
        delete updated[uri];
      } else {
        updated[uri] = {
          uri,
          filePath: uriToPath(uri),
          diagnostics
        };
      }
      return { fileDiagnostics: updated };
    });
  },

  clearDiagnostics: (uri) => {
    set((state) => {
      const updated = { ...state.fileDiagnostics };
      delete updated[uri];
      return { fileDiagnostics: updated };
    });
  },

  clearAll: () => {
    set({ fileDiagnostics: {} });
  },

  getDiagnosticsCount: () => {
    const fileDiagnostics = get().fileDiagnostics;
    let errors = 0;
    let warnings = 0;
    for (const file of Object.values(fileDiagnostics)) {
      for (const diag of file.diagnostics) {
        if (diag.severity === 1) errors++;
        else if (diag.severity === 2) warnings++;
      }
    }
    return { errors, warnings };
  },

  getFileErrorStatus: (filePath: string) => {
    const fileDiagnostics = get().fileDiagnostics;
    let hasWarning = false;
    
    // Normalize path to make search platform independent
    const targetNorm = filePath.replace(/\\/g, '/').toLowerCase();

    for (const file of Object.values(fileDiagnostics)) {
      const fileNorm = file.filePath.replace(/\\/g, '/').toLowerCase();
      
      // Matches the file path directly or as a child folder
      if (fileNorm === targetNorm || fileNorm.startsWith(targetNorm + '/')) {
        for (const diag of file.diagnostics) {
          if (diag.severity === 1) {
            return 'error'; // Error takes precedence
          } else if (diag.severity === 2) {
            hasWarning = true;
          }
        }
      }
    }
    
    return hasWarning ? 'warning' : null;
  }
}));
