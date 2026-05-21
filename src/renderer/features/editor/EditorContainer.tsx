import React, { useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Compass } from 'lucide-react';

export const EditorContainer: React.FC = () => {
  const { 
    activeTabPath, fileBuffers, updateFileBuffer, saveActiveFile, selectWorkspace, workspacePath 
  } = useWorkspaceStore();

  const editorRef = useRef<any>(null);

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

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;

    // Apply specific VS Code editor settings
    editor.updateOptions({
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      minimap: { enabled: true },
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: false,
      automaticLayout: true, // Auto resizes when sidebar panel collapses!
      theme: 'vs-dark',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 8, bottom: 8 },
    });
  };

  // Setup Keyboard Shortcuts (Ctrl+S / Cmd+S to Save)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        await saveActiveFile();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [saveActiveFile]);

  // Handle document content changes
  const handleEditorChange = (value: string | undefined) => {
    if (activeTabPath && value !== undefined) {
      updateFileBuffer(activeTabPath, value);
    }
  };

  // If no tab is active, show the stunning editor welcome screen
  if (!activeTabPath) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-editor-bg select-none h-full border-r border-editor-border p-8">
        <div className="max-w-md w-full flex flex-col items-center text-center">
          <Compass className="w-16 h-16 text-editor-accent mb-6 animate-pulse" />
          
          <h1 className="text-xl font-bold text-white mb-2 tracking-wide uppercase">Spigot Editor</h1>
          <p className="text-xs text-editor-textDark mb-8 leading-relaxed">
            Un editor de código liviano y modular construido con Screaming Architecture sobre Electron + React.
          </p>

          <div className="w-full flex flex-col gap-3.5 bg-zinc-900/50 p-6 rounded-lg border border-editor-border glass-panel">
            <h2 className="text-[10px] text-editor-textDark uppercase font-bold text-left tracking-wider">Comandos Rápidos</h2>
            
            <div className="flex justify-between items-center text-xs border-b border-zinc-800/40 pb-2">
              <span className="text-editor-text font-medium">Abrir Carpeta</span>
              <kbd className="px-2 py-0.5 bg-zinc-800 text-editor-textDark rounded border border-zinc-700 text-[10px] font-mono shadow-sm">
                Ctrl + O
              </kbd>
            </div>
            
            <div className="flex justify-between items-center text-xs border-b border-zinc-800/40 pb-2">
              <span className="text-editor-text font-medium">Nuevo Archivo</span>
              <kbd className="px-2 py-0.5 bg-zinc-800 text-editor-textDark rounded border border-zinc-700 text-[10px] font-mono shadow-sm">
                Ctrl + N
              </kbd>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-editor-text font-medium">Guardar Cambios</span>
              <kbd className="px-2 py-0.5 bg-zinc-800 text-editor-textDark rounded border border-zinc-700 text-[10px] font-mono shadow-sm">
                Ctrl + S
              </kbd>
            </div>
          </div>

          {!workspacePath && (
            <button
              onClick={selectWorkspace}
              className="mt-8 bg-editor-accent text-white text-xs font-semibold px-5 py-2.5 rounded shadow hover:bg-blue-600 active:scale-95 transition-all-custom"
            >
              Cargar Proyecto
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeContent = fileBuffers[activeTabPath] ?? '';
  const language = getLanguage(activeTabPath);

  return (
    <div className="flex-1 flex flex-col h-full bg-editor-bg border-r border-editor-border relative overflow-hidden">
      <MonacoEditor
        height="100%"
        width="100%"
        language={language}
        value={activeContent}
        theme="vs-dark"
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
