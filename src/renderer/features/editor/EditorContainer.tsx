import React, { useEffect, useRef } from 'react';
import MonacoEditor, { DiffEditor, loader } from '@monaco-editor/react';
import logoSpigotUrl from '../../assets/logoSpigot.png';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  changeLspDocument,
  initializeLspDiagnosticsBridge,
  openLspDocument,
  registerLspCompletionProvider,
  saveLspDocument,
  toFileUri,
} from './lspMonacoBridge';

// Define premium Cursor-like Pitch-Black theme configuration
const defineMonacoThemes = (monaco: any) => {
  monaco.editor.defineTheme('spigot-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: '', background: '0a0a0a' }],
    colors: {
      'editor.background': '#0a0a0a',
      'editor.lineHighlightBackground': '#18181b',
      'editorLineNumber.foreground': '#52525b',
      'editorLineNumber.activeForeground': '#ffffff',
      'editor.selectionBackground': '#27272a',
      'editor.inactiveSelectionBackground': '#1c1c1e',
      'minimap.background': '#070708',
      'editorWidget.background': '#0e0e0f',
      'editorWidget.border': '#1c1c1e',
      'editorSuggestWidget.background': '#0e0e0f',
      'editorSuggestWidget.border': '#1c1c1e',
      'editorSuggestWidget.selectedBackground': '#27272a',
      'editorSuggestWidget.highlightForeground': '#ffffff',
    },
  });

  monaco.editor.defineTheme('grayish-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: '', background: '14161d' }],
    colors: {
      'editor.background': '#14161d',
      'editor.lineHighlightBackground': '#1f222a',
      'editorLineNumber.foreground': '#6b7280',
      'editorLineNumber.activeForeground': '#f8fafc',
      'editor.selectionBackground': '#2e3342',
      'editor.inactiveSelectionBackground': '#181c25',
      'minimap.background': '#10131a',
      'editorWidget.background': '#181b24',
      'editorWidget.border': '#343a47',
      'editorSuggestWidget.background': '#181b24',
      'editorSuggestWidget.border': '#343a47',
      'editorSuggestWidget.selectedBackground': '#2e3342',
      'editorSuggestWidget.highlightForeground': '#f8fafc',
    },
  });

  monaco.editor.defineTheme('solarized-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: '', background: '002b36' }],
    colors: {
      'editor.background': '#002b36',
      'editor.lineHighlightBackground': '#073642',
      'editorLineNumber.foreground': '#586e75',
      'editorLineNumber.activeForeground': '#93a1a1',
      'editor.selectionBackground': '#073642',
      'editor.inactiveSelectionBackground': '#002b36',
      'minimap.background': '#002b36',
      'editorWidget.background': '#073642',
      'editorWidget.border': '#586e75',
      'editorSuggestWidget.background': '#073642',
      'editorSuggestWidget.border': '#586e75',
      'editorSuggestWidget.selectedBackground': '#073642',
      'editorSuggestWidget.highlightForeground': '#fdf6e3',
    },
  });
};

// Configure Monaco to load assets locally from our public folder (works offline and respects CSP 'self')
loader.config({
  paths: {
    vs: '/monaco-editor/min/vs',
  },
});

// Initialize globally as early as possible as fallback
loader.init().then((monaco) => {
  defineMonacoThemes(monaco);
});

export const EditorContainer: React.FC = () => {
  const {
    activeTabPath, fileBuffers, updateFileBuffer, selectWorkspace, workspacePath,
    pendingSelection, setPendingSelection, activeDiffFile, clearDiffFile, imageBuffers,
    theme,
  } = useWorkspaceStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Auto-detect Monaco language based on file extension
  const getLanguage = (path: string | null): string => {
    if (!path) return 'plaintext';
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'cpp':
      case 'h':
        return 'cpp';
      default:
        return 'plaintext';
    }
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    initializeLspDiagnosticsBridge(monaco);

    // Configure TypeScript IntelliSense features and compilation environment
    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.Bundler
        ?? monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noLib: false,
      allowJs: true,
      checkJs: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowNonTsExtensions: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      baseUrl: 'file:///',
      paths: {
        '@/*': ['*'],
      },
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);

    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

    // Monaco standalone is not a full project LSP. Keep syntax checks, but avoid
    // noisy semantic false positives until a real language server bridge exists.
    const diagnosticsOptions = {
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    };

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

    monaco.editor.setTheme(theme);
    registerLspCompletionProvider(monaco, getLanguage(activeTabPath), workspacePath);

    if (activeTabPath) {
      openLspDocument(workspacePath, activeTabPath, getLanguage(activeTabPath), fileBuffers[activeTabPath] ?? '');
    }

    // Register Ctrl+S shortcut inside Monaco editor instance
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const state = useWorkspaceStore.getState();
      if (state.activeTabPath) {
        saveLspDocument(
          state.workspacePath,
          state.activeTabPath,
          getLanguage(state.activeTabPath),
          state.fileBuffers[state.activeTabPath] ?? '',
        );
      }
      state.saveActiveFile();
    });

    // Apply specific VS Code editor settings
    editor.updateOptions({
      fontSize: 16,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontWeight: '400',
      minimap: { enabled: true },
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: false,
      automaticLayout: true, // Auto resizes when sidebar panel collapses!
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 8, bottom: 8 },
      quickSuggestions: { other: true, comments: true, strings: true },
      parameterHints: { enabled: true },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: "on",
      tabSize: 2,
    });
  };

  const handleDiffOnMount = (editor: any, monaco: any) => {
    monaco.editor.setTheme(theme);

    editor.getModifiedEditor().updateOptions({
      fontSize: 16,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontWeight: '400',
      minimap: { enabled: true },
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: true, // Hacemos el diff editor de sólo lectura para mayor robustez
      automaticLayout: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 8, bottom: 8 },
      tabSize: 2,
    });
    
    editor.getOriginalEditor().updateOptions({
      fontSize: 16,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontWeight: '400',
      minimap: { enabled: false },
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: true,
      automaticLayout: true,
      padding: { top: 8, bottom: 8 },
      tabSize: 2,
    });
  };

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme);
    }
  }, [theme]);

  // Listen for pending selection events (e.g. from Sidebar search matches)
  useEffect(() => {
    if (editorRef.current && pendingSelection && pendingSelection.filePath === activeTabPath) {
      const editor = editorRef.current;
      editor.revealLineInCenter(pendingSelection.line);
      editor.setSelection({
        startLineNumber: pendingSelection.line,
        startColumn: pendingSelection.column,
        endLineNumber: pendingSelection.line,
        endColumn: pendingSelection.column + pendingSelection.length
      });
      editor.focus();
      // Reset after applying
      setPendingSelection(null);
    }
  }, [activeTabPath, pendingSelection, setPendingSelection]);

  // Handle document content changes
  const handleEditorChange = (value: string | undefined) => {
    if (activeTabPath && value !== undefined) {
      updateFileBuffer(activeTabPath, value);
      changeLspDocument(workspacePath, activeTabPath, language, value);
    }
  };

  const activeContent = activeTabPath ? fileBuffers[activeTabPath] ?? '' : '';
  const language = getLanguage(activeTabPath);
  const isImageActive = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(activeTabPath ?? '');
  const getImageMimeType = (path: string) => {
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'bmp':
        return 'image/bmp';
      case 'svg':
        return 'image/svg+xml';
      case 'ico':
        return 'image/x-icon';
      case 'avif':
        return 'image/avif';
      default:
        return 'application/octet-stream';
    }
  };

  useEffect(() => {
    if (!activeTabPath || !monacoRef.current || isImageActive) return;

    registerLspCompletionProvider(monacoRef.current, language, workspacePath);
    openLspDocument(workspacePath, activeTabPath, language, activeContent);
  }, [activeContent, activeTabPath, isImageActive, language, workspacePath]);

  // If no tab is active, show the editor welcome screen
  if (!activeTabPath) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-editor-bg select-none h-full border-r border-editor-border p-6">
        <div className="max-w-[400px] w-full flex flex-col items-center text-center">
          <img src={logoSpigotUrl} alt="Spigot Logo" width="56" height="56" className="w-14 h-14 mb-5 select-none pointer-events-none object-contain opacity-95" />

          <h1 className="text-lg font-bold text-white mb-2 tracking-wide uppercase">Spigot Editor</h1>
          <p className="text-[12px] text-editor-textDark mb-6 leading-relaxed">
            A lightweight modular code editor built with Screaming Architecture on Electron + React.
          </p>

          <div className="w-full flex flex-col gap-2.5 bg-zinc-950/45 p-4 rounded-xl border border-editor-border shadow-2xl shadow-black/20">
            <h2 className="text-[10px] text-editor-textDark uppercase font-bold text-left tracking-wider">Quick Commands</h2>

            <div className="flex justify-between items-center text-xs border-b border-zinc-800/50 pb-2">
              <span className="text-editor-text font-medium">Open Folder</span>
              <kbd className="px-2 py-0.5 bg-zinc-900 text-editor-textDark rounded-md border border-zinc-800 text-[10px] font-mono shadow-sm">
                Ctrl + O
              </kbd>
            </div>

            <div className="flex justify-between items-center text-xs border-b border-zinc-800/50 pb-2">
              <span className="text-editor-text font-medium">New File</span>
              <kbd className="px-2 py-0.5 bg-zinc-900 text-editor-textDark rounded-md border border-zinc-800 text-[10px] font-mono shadow-sm">
                Ctrl + N
              </kbd>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-editor-text font-medium">Save Changes</span>
              <kbd className="px-2 py-0.5 bg-zinc-900 text-editor-textDark rounded-md border border-zinc-800 text-[10px] font-mono shadow-sm">
                Ctrl + S
              </kbd>
            </div>
          </div>

          {!workspacePath && (
            <button
              onClick={selectWorkspace}
              className="mt-6 bg-white text-black text-xs font-semibold px-4 py-2 rounded-lg shadow hover:bg-zinc-200 active:scale-95 transition-all-custom"
            >
              Load Project
            </button>
          )}
        </div>
      </div>
    );
  }

  const isDiffActive = activeDiffFile !== null && activeDiffFile.filePath === activeTabPath;
  const diffOriginalModelPath = activeDiffFile
    ? `spigot-diff-original://${encodeURIComponent(activeDiffFile.filePath)}`
    : undefined;
  const diffModifiedModelPath = activeTabPath
    ? `spigot-diff-modified://${encodeURIComponent(activeTabPath)}`
    : undefined;

  if (isImageActive && activeTabPath) {
    const imageName = activeTabPath.split(/[/\\]/).pop() || activeTabPath;
    const base64 = imageBuffers[activeTabPath];
    const src = base64 ? `data:${getImageMimeType(activeTabPath)};base64,${base64}` : null;

    return (
      <div className="flex-1 flex flex-col h-full bg-editor-bg border-r border-editor-border relative overflow-hidden">
        <div className="h-9 border-b border-editor-border bg-editor-sidebar flex items-center justify-between px-3 select-none">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Preview</span>
            <span className="text-xs text-zinc-200 font-semibold truncate">{imageName}</span>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono uppercase">
            {activeTabPath.split('.').pop()}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_center,rgba(39,39,42,0.55)_0,rgba(10,10,10,1)_58%)] p-8">
          <div className="h-full w-full flex items-center justify-center">
            {src ? (
              <div className="max-w-full max-h-full rounded-2xl border border-zinc-800/90 bg-zinc-950/50 p-4 shadow-2xl shadow-black/40">
                <img
                  src={src}
                  alt={imageName}
                  className="max-w-full max-h-[calc(100vh-180px)] object-contain rounded-lg select-none"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="text-xs text-zinc-500 font-medium">Cargando imagen...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isDiffActive) {
    return (
      <div className="flex-1 flex flex-col h-full bg-editor-bg border-r border-editor-border relative overflow-hidden">
        {/* Floating Diff Toolbar */}
        <div className="absolute top-2 right-4 z-10 flex items-center gap-2">
          <div className="bg-editor-bg/95 border border-editor-border backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-2 shadow-lg">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider select-none">
              Diferencias de Git
            </span>
            <div className="w-px h-3 bg-zinc-800" />
            <button
              onClick={clearDiffFile}
              className="bg-white hover:bg-zinc-200 text-black text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-all-custom animate-pulse-subtle"
            >
              Cerrar Diff
            </button>
          </div>
        </div>

        <DiffEditor
          key={activeDiffFile.filePath}
          height="100%"
          width="100%"
          original={activeDiffFile.original}
          modified={activeContent}
          language={language}
          originalModelPath={diffOriginalModelPath}
          modifiedModelPath={diffModifiedModelPath}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          theme={theme}
          beforeMount={defineMonacoThemes}
          onMount={handleDiffOnMount}
          loading={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-editor-bg gap-3 z-50">
              <div className="w-8 h-8 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-editor-textDark font-medium">Comparando archivos...</span>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-editor-bg border-r border-editor-border relative overflow-hidden">
      <MonacoEditor
        height="100%"
        width="100%"
        language={language}
        path={toFileUri(activeTabPath)} // Align Monaco model URI with LSP document URI.
        value={activeContent}
        theme={theme}
        beforeMount={defineMonacoThemes}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          unicodeHighlight: {
            ambiguousCharacters: false,
            invisibleCharacters: false,
            nonBasicASCII: false,
          },
        }}
        loading={
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-editor-bg gap-3 z-50">
            <div className="w-8 h-8 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-editor-textDark font-medium">Cargando Editor Monaco...</span>
          </div>
        }
      />
    </div>
  );
};
export default EditorContainer;
