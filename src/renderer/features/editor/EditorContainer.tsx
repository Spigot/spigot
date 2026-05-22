import React, { useEffect, useRef } from 'react';
import MonacoEditor, { DiffEditor, loader } from '@monaco-editor/react';
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
const defineMonacoTheme = (monaco: any) => {
  monaco.editor.defineTheme('cursor-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', background: '0a0a0a' },
    ],
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
    }
  });
};

// Initialize globally as early as possible as fallback
loader.init().then((monaco) => {
  defineMonacoTheme(monaco);
});

export const EditorContainer: React.FC = () => {
  const { 
    activeTabPath, fileBuffers, updateFileBuffer, selectWorkspace, workspacePath,
    pendingSelection, setPendingSelection, activeDiffFile, clearDiffFile
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

    monaco.editor.setTheme('cursor-dark');
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
    monaco.editor.setTheme('cursor-dark');

    editor.getModifiedEditor().updateOptions({
      fontSize: 16,
      fontFamily: 'Consolas, "Courier New", monospace',
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

  useEffect(() => {
    if (!activeTabPath || !monacoRef.current) return;

    registerLspCompletionProvider(monacoRef.current, language, workspacePath);
    openLspDocument(workspacePath, activeTabPath, language, activeContent);
  }, [activeContent, activeTabPath, language, workspacePath]);

  // If no tab is active, show the editor welcome screen
  if (!activeTabPath) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-editor-bg select-none h-full border-r border-editor-border p-6">
        <div className="max-w-[400px] w-full flex flex-col items-center text-center">
          <img src="/logoSpigot.png" alt="Spigot Logo" width="56" height="56" className="w-14 h-14 mb-5 select-none pointer-events-none object-contain opacity-95" />

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
          height="100%"
          width="100%"
          original={activeDiffFile.original}
          modified={activeContent}
          language={language}
          theme="cursor-dark"
          beforeMount={defineMonacoTheme}
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
        theme="cursor-dark"
        beforeMount={defineMonacoTheme}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
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
