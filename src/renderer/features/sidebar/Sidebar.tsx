import React, { useState, useEffect, useRef } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAIStore } from '../../store/aiStore';
import { FileTree } from './FileTree';
import { Search, Replace, FileCode, Check, RefreshCw, GitBranch, ChevronDown, ChevronRight, Sparkles, MoreHorizontal, Loader2, ArrowUp, Folder } from 'lucide-react';
import { buildSearchRegex, collectSearchableFilePaths, MAX_SEARCH_FILE_BYTES, MAX_SEARCH_RESULTS, searchInContent } from './searchEngine';
import type { SearchMatch } from './searchEngine';

export const Sidebar: React.FC = () => {
  const { activeSidebarTab, isSidebarOpen, sidebarWidth, setSidebarWidth } = useLayoutStore();
  const { 
    activeTabPath, fileBuffers, fileTree, updateFileBuffer, openFile, openTabs, setPendingSelection,
    workspacePath, setDiffFile, activeDiffFile, dirtyFiles
  } = useWorkspaceStore();

  // Git Source Control states
  const [gitFiles, setGitFiles] = useState<{ status: string; filePath: string }[]>([]);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [gitLog, setGitLog] = useState<{ hash: string; message: string; branch: string }[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitFeedback, setCommitFeedback] = useState('');
  const [isChangesHeaderOpen, setIsChangesHeaderOpen] = useState(true);
  const [isChangesListOpen, setIsChangesListOpen] = useState(true);
  const [isGraphOpen, setIsGraphOpen] = useState(true);
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);
  const [aheadCount, setAheadCount] = useState(0);
  const [isPushing, setIsPushing] = useState(false);

  const handleGenerateCommitMessage = async () => {
    if (!workspacePath) return;
    setIsGeneratingCommit(true);
    setCommitFeedback('');
    try {
      const diff = await (window as any).api.git.getDiff(workspacePath, '');
      if (!diff || !diff.trim()) {
        setCommitFeedback('Error: ¡Che! No hay ningún cambio local guardado para hacer commit.');
        setIsGeneratingCommit(false);
        return;
      }

      setCommitMessage('');
      await useAIStore.getState().generateCommitMessage(diff, (text) => {
        setCommitMessage(text);
      });
      setCommitFeedback('Mensaje de commit sugerido con éxito.');
    } catch (err: any) {
      console.error('Failed generating commit message:', err);
      let errorMsg = 'Error al generar el mensaje.';
      if (err.message && err.message.includes('API Key')) {
        errorMsg = 'Error: ¡Che! Te falta configurar la API Key de la IA en los ajustes antes de proponer un commit.';
      } else if (err.message) {
        errorMsg = `Error: ${err.message}`;
      }
      setCommitFeedback(errorMsg);
    } finally {
      setIsGeneratingCommit(false);
    }
  };

  const refreshGitStatus = async () => {
    if (!workspacePath) return;
    setIsLoadingGit(true);
    try {
      const files = await (window as any).api.git.getStatus(workspacePath);
      setGitFiles(files || []);
      const branch = await (window as any).api.git.getCurrentBranch(workspacePath);
      setCurrentBranch(branch || 'main');
      const log = await (window as any).api.git.getLog(workspacePath);
      setGitLog(log || []);
      
      const counts = await (window as any).api.git.getAheadBehind(workspacePath);
      setAheadCount(counts?.ahead || 0);
    } catch (err) {
      console.error('Error fetching git status/branch/log/ahead-behind:', err);
    } finally {
      setIsLoadingGit(false);
    }
  };

  const handleCommit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!workspacePath || !commitMessage.trim()) return;
    setIsCommitting(true);
    setCommitFeedback('');
    try {
      const res = await (window as any).api.git.commit(workspacePath, commitMessage.trim());
      if (res.success) {
        setCommitMessage('');
        setCommitFeedback('¡Confirmado con éxito!');
        refreshGitStatus();
        setTimeout(() => setCommitFeedback(''), 3000);
      } else {
        setCommitFeedback(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setCommitFeedback(`Error: ${err.message || 'Fallo desconocido'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    if (!workspacePath) return;
    setIsPushing(true);
    setCommitFeedback('');
    try {
      const res = await (window as any).api.git.push(workspacePath);
      if (res.success) {
        setCommitFeedback('¡Subido al repositorio remoto con éxito!');
        refreshGitStatus();
        setTimeout(() => setCommitFeedback(''), 3000);
      } else {
        setCommitFeedback(`Error al subir: ${res.error}`);
      }
    } catch (err: any) {
      setCommitFeedback(`Error al subir: ${err.message || 'Fallo desconocido'}`);
    } finally {
      setIsPushing(false);
    }
  };

  useEffect(() => {
    if (activeSidebarTab === 'source-control') {
      refreshGitStatus();
    }
  }, [activeSidebarTab, workspacePath]);

  useEffect(() => {
    if (activeSidebarTab !== 'source-control' || !workspacePath) return;

    const intervalId = window.setInterval(() => {
      refreshGitStatus();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeSidebarTab, workspacePath]);

  const handleSelectGitFile = async (relativeFilePath: string) => {
    if (!workspacePath) return;
    const absoluteFilePath = `${workspacePath}/${relativeFilePath}`.replace(/\/+/g, '/');
    
    try {
      // 1. Obtener contenido original (de HEAD)
      const original = await (window as any).api.git.showOriginal(workspacePath, absoluteFilePath);
      
      // 2. Obtener contenido modificado (desde buffer o desde archivo)
      let modified = '';
      if (fileBuffers[absoluteFilePath] !== undefined) {
        modified = fileBuffers[absoluteFilePath];
      } else {
        modified = await (window as any).api.fs.readFile(absoluteFilePath);
      }
      
      // 3. Setear en el store para abrir la vista de diferencias
      setDiffFile({
        filePath: absoluteFilePath,
        original,
        modified
      });
      
      // 4. Abrir el archivo en las pestañas para que se active en EditorContainer
      await openFile(absoluteFilePath);
    } catch (err) {
      console.error('Error loading git file diff details:', err);
    }
  };

  // Search & Replace states
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [searchScope, setSearchScope] = useState<'active' | 'workspace'>('active');
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRunIdRef = useRef(0);

  // Resize handler
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(160, Math.min(600, startWidth + deltaX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Perform search matches recursively or active-only
  const performSearch = async (runId: number) => {
    if (!searchQuery) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const matchedItems: SearchMatch[] = [];

    let regex: RegExp;
    try {
      regex = buildSearchRegex(searchQuery, { matchCase, wholeWord, isRegex });
    } catch (e) {
      setIsSearching(false);
      return; // Invalid regex
    }

    const addMatches = (filePath: string, content: string) => {
      if (content.length > MAX_SEARCH_FILE_BYTES || matchedItems.length >= MAX_SEARCH_RESULTS) return;

      const remaining = MAX_SEARCH_RESULTS - matchedItems.length;
      matchedItems.push(...searchInContent(filePath, content, regex, remaining));
    };

    if (searchScope === 'active') {
      if (activeTabPath) {
        const content = fileBuffers[activeTabPath] || '';
        addMatches(activeTabPath, content);
      }
    } else {
      const allFilePaths = collectSearchableFilePaths(fileTree);
      
      for (let index = 0; index < allFilePaths.length; index++) {
        if (runId !== searchRunIdRef.current || matchedItems.length >= MAX_SEARCH_RESULTS) return;

        const fPath = allFilePaths[index];
        let content = fileBuffers[fPath];
        if (content === undefined) {
          try {
            content = await (window as any).api.fs.readFile(fPath);
          } catch (err) {
            console.error('Error reading file for search:', fPath, err);
            continue;
          }
        }
        addMatches(fPath, content);

        if (index % 25 === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
    }

    if (runId === searchRunIdRef.current) {
      setResults(matchedItems);
      setIsSearching(false);
    }
  };

  // Run search when inputs or active file buffer changes
  useEffect(() => {
    const runId = searchRunIdRef.current + 1;
    searchRunIdRef.current = runId;

    if (!searchQuery) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = window.setTimeout(() => {
      performSearch(runId);
    }, searchScope === 'workspace' ? 300 : 120);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery, matchCase, wholeWord, isRegex, searchScope, activeTabPath, fileBuffers]);

  // Navigate to match selection in Monaco Editor
  const handleSelectMatch = async (match: SearchMatch) => {
    await openFile(match.filePath);
    setPendingSelection({
      filePath: match.filePath,
      line: match.line,
      column: match.column,
      length: match.length
    });
  };

  // Replace single occurrence
  const handleReplaceSingle = async (match: SearchMatch) => {
    let content = fileBuffers[match.filePath];
    if (content === undefined) {
      try {
        content = await (window as any).api.fs.readFile(match.filePath);
      } catch (err) {
        console.error('Error reading file for replace:', err);
        return;
      }
    }
    
    const lines = content.split('\n');
    const lineIdx = match.line - 1;
    const lineText = lines[lineIdx];
    const start = match.column - 1;
    const end = start + match.length;
    const newLineText = lineText.substring(0, start) + replaceQuery + lineText.substring(end);
    lines[lineIdx] = newLineText;
    const newContent = lines.join('\n');
    
    updateFileBuffer(match.filePath, newContent);
    
    if (!openTabs.includes(match.filePath)) {
      await openFile(match.filePath);
    }
  };

  // Replace all in a single file
  const handleReplaceInFile = async (filePath: string) => {
    let content = fileBuffers[filePath];
    if (content === undefined) {
      try {
        content = await (window as any).api.fs.readFile(filePath);
      } catch (err) {
        console.error('Error reading file for replace all in file:', err);
        return;
      }
    }
    
    const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    let pattern = isRegex ? searchQuery : escapeRegex(searchQuery);
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);
    
    const newContent = content.replace(regex, replaceQuery);
    updateFileBuffer(filePath, newContent);
    
    if (!openTabs.includes(filePath)) {
      await openFile(filePath);
    }
  };

  // Replace all occurrences in results globally
  const handleReplaceAll = async () => {
    if (!searchQuery) return;
    const uniquePaths = Array.from(new Set(results.map(r => r.filePath)));
    for (const filePath of uniquePaths) {
      await handleReplaceInFile(filePath);
    }
  };

  // Render highlighted matching text segment
  const renderHighlightedLine = (match: SearchMatch) => {
    const text = match.lineContent;
    const start = match.column - 1;
    const end = start + match.length;
    
    if (start < 0 || end > text.length || start > end) {
      return <span className="font-mono text-[10px] text-editor-text">{text}</span>;
    }

    const pre = text.substring(0, start);
    const highlighted = text.substring(start, end);
    const post = text.substring(end);

    return (
      <span className="font-mono text-[10px] text-editor-text">
        {pre}
        <mark className="bg-zinc-800 text-white font-bold px-0.5 rounded border border-zinc-700 shadow-sm">
          {highlighted}
        </mark>
        {post}
      </span>
    );
  };

  // Group search results by file path
  const groupedResults = results.reduce<Record<string, SearchMatch[]>>((acc, match) => {
    if (!acc[match.filePath]) {
      acc[match.filePath] = [];
    }
    acc[match.filePath].push(match);
    return acc;
  }, {});


  const getGitStatusMeta = (status: string) => {
    const statusRaw = status.trim();

    if (statusRaw === 'A') {
      return { badgeText: 'A', badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', title: 'Added' };
    }

    if (statusRaw === '??') {
      return { badgeText: 'U', badgeColor: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20', title: 'Untracked' };
    }

    if (statusRaw === 'D') {
      return { badgeText: 'D', badgeColor: 'text-red-400 bg-red-500/10 border-red-500/20', title: 'Deleted' };
    }

    return { badgeText: 'M', badgeColor: 'text-amber-300 bg-amber-500/10 border-amber-500/20', title: 'Modified' };
  };

  const displayedGitFiles = React.useMemo(() => {
    if (!workspacePath) return gitFiles;

    const gitRelativePaths = new Set(gitFiles.map((file) => file.filePath.replace(/\\/g, '/')));
    const unsavedFiles = dirtyFiles
      .map((filePath) => filePath.replace(/\\/g, '/'))
      .filter((filePath) => filePath.startsWith(workspacePath.replace(/\\/g, '/')))
      .map((filePath) => filePath.slice(workspacePath.replace(/\\/g, '/').length + 1))
      .filter((relativePath) => relativePath && !gitRelativePaths.has(relativePath))
      .map((filePath) => ({ status: 'M*', filePath }));

    return [...gitFiles, ...unsavedFiles];
  }, [dirtyFiles, gitFiles, workspacePath]);
  const changedFileCount = displayedGitFiles.length;

  const handleOpenExplorer = () => {
    if (workspacePath && (window as any).api?.app?.openShell) {
      (window as any).api.app.openShell(workspacePath);
    }
  };

  if (!isSidebarOpen) return null;

  return (
    <aside 
      style={{ width: `${sidebarWidth}px` }}
      className="bg-[#101011] border-r border-zinc-800/80 flex flex-col select-none z-30 relative animate-fade-in shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)]"
    >
      {/* Drag Resize Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-editor-accent/30 z-30 transition-colors"
      />

      {/* Sidebar Header showing current active tab title */}
      <div className="h-11 border-b border-zinc-800/80 flex items-center justify-between px-4 bg-zinc-950/45 shrink-0 select-none">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300">
          {activeSidebarTab === 'explorer' && 'EXPLORADOR'}
          {activeSidebarTab === 'search' && 'BUSCAR'}
          {activeSidebarTab === 'source-control' && 'CÓDIGO FUENTE'}
          {activeSidebarTab === 'extensions' && 'EXTENSIONES'}
          {activeSidebarTab === 'settings' && 'CONFIGURACIÓN'}
        </span>
        {activeSidebarTab === 'explorer' && (
          <button 
            onClick={handleOpenExplorer}
            className="p-1.5 hover:bg-zinc-800/60 rounded-md text-zinc-400 hover:text-zinc-200 transition-all-custom"
            title="Abrir en Explorador de Archivos"
          >
            <Folder className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {activeSidebarTab === 'explorer' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        </div>
      )}

      {activeSidebarTab === 'search' && (
        <div className="flex-1 flex flex-col p-3 overflow-hidden">
          
          <div className="flex flex-col gap-1.5">
            {/* Search Input and Filters */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-editor-bg border border-editor-border text-xs px-2.5 py-1.5 rounded outline-none text-white focus:border-editor-accent transition-all-custom pr-20"
              />
              <div className="absolute right-1.5 top-1.5 flex gap-1 select-none">
                <button
                  onClick={() => setMatchCase(!matchCase)}
                  title="Coincidir mayúsculas y minúsculas (Aa)"
                  className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border transition-all-custom ${
                    matchCase 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-white'
                  }`}
                >
                  Aa
                </button>
                <button
                  onClick={() => setWholeWord(!wholeWord)}
                  title="Palabra completa ([a])"
                  className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border transition-all-custom ${
                    wholeWord 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-white'
                  }`}
                >
                  [a]
                </button>
                <button
                  onClick={() => setIsRegex(!isRegex)}
                  title="Expresión regular (.*)"
                  className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border transition-all-custom ${
                    isRegex 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-white'
                  }`}
                >
                  .*
                </button>
              </div>
            </div>

            {/* Scope selection */}
            <div className="flex gap-1 bg-editor-bg p-0.5 rounded border border-editor-border">
              <button
                onClick={() => setSearchScope('active')}
                className={`flex-1 text-[9px] py-1 rounded text-center font-bold tracking-wider uppercase transition-all-custom ${
                  searchScope === 'active' 
                    ? 'bg-zinc-800 text-white shadow' 
                    : 'text-editor-textDark hover:text-white'
                }`}
              >
                Archivo Activo
              </button>
              <button
                onClick={() => setSearchScope('workspace')}
                className={`flex-1 text-[9px] py-1 rounded text-center font-bold tracking-wider uppercase transition-all-custom ${
                  searchScope === 'workspace' 
                    ? 'bg-zinc-800 text-white shadow' 
                    : 'text-editor-textDark hover:text-white'
                }`}
              >
                Todo el Proyecto
              </button>
            </div>

            {/* Replace Input and global Action */}
            <div className="flex gap-1.5 mt-0.5">
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Reemplazar con..."
                className="flex-1 bg-editor-bg border border-editor-border text-xs px-2.5 py-1.5 rounded outline-none text-white focus:border-editor-accent transition-all-custom"
              />
              <button 
                onClick={handleReplaceAll}
                disabled={results.length === 0}
                title="Reemplazar todas las coincidencias"
                className="bg-white text-black disabled:opacity-40 disabled:cursor-not-allowed text-[10px] px-2.5 py-1.5 rounded font-bold hover:bg-zinc-200 transition-all-custom shrink-0"
              >
                Reemplazar todo
              </button>
            </div>
          </div>

          {/* Results Summary */}
          {searchQuery && (
            <div className="text-[10px] text-editor-textDark font-bold uppercase tracking-wider mt-3 border-t border-editor-border pt-3.5 flex justify-between items-center shrink-0 select-none">
              <span>
                {isSearching 
                  ? 'Buscando coincidencias...' 
                  : `${results.length} ${results.length === 1 ? 'coincidencia' : 'coincidencias'}`}
              </span>
              {isSearching && <RefreshCw className="w-2.5 h-2.5 animate-spin text-editor-textDark" />}
            </div>
          )}

          {/* Results List */}
          <div className="flex-1 overflow-y-auto mt-2 pr-1 select-text flex flex-col gap-3 min-h-0">
            {Object.entries(groupedResults).map(([filePath, fileMatches]) => {
              const fileName = filePath.split('/').pop() || filePath;
              const isFileActive = activeTabPath === filePath;
              return (
                <div key={filePath} className="flex flex-col gap-1 border-b border-editor-border/40 pb-2 shrink-0">
                  {/* File Header */}
                  <div className="flex items-center justify-between group/file select-none py-0.5">
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                      <FileCode className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span 
                        title={filePath}
                        className={`text-xs font-semibold truncate cursor-pointer transition-colors ${
                          isFileActive 
                            ? 'text-white underline decoration-zinc-600 underline-offset-2' 
                            : 'text-editor-text hover:text-white'
                        }`}
                        onClick={async () => {
                          await openFile(filePath);
                        }}
                      >
                        {fileName}
                      </span>
                      <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1 py-0.2 rounded shrink-0 font-bold">
                        {fileMatches.length}
                      </span>
                    </div>
                    {/* File Action */}
                    <button
                      onClick={() => handleReplaceInFile(filePath)}
                      title={`Reemplazar coincidencias en ${fileName}`}
                      className="opacity-0 group-hover/file:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all-custom shrink-0"
                    >
                      <Replace className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Matches List */}
                  <div className="flex flex-col gap-0.5 ml-2 border-l border-zinc-850 pl-2">
                    {fileMatches.map((match, idx) => (
                      <div 
                        key={idx} 
                        className="group flex items-center justify-between hover:bg-zinc-900/40 py-1 px-1.5 rounded transition-all-custom cursor-pointer"
                        onClick={() => handleSelectMatch(match)}
                      >
                        <div className="flex items-start gap-2 overflow-hidden flex-1">
                          <span className="text-[9px] font-mono text-zinc-500 select-none bg-zinc-950 px-1 py-0.2 rounded border border-zinc-900 shrink-0">
                            L{match.line}
                          </span>
                          <div className="truncate flex-1 leading-none">
                            {renderHighlightedLine(match)}
                          </div>
                        </div>

                        {/* Atomic replace button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReplaceSingle(match);
                          }}
                          title="Reemplazar esta coincidencia"
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all-custom shrink-0"
                        >
                          <Check className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            
            {searchQuery && results.length === 0 && !isSearching && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-editor-textDark select-none opacity-40">
                <Search className="w-8 h-8 mb-2" />
                <span className="text-[10px] font-bold uppercase tracking-wider">No se hallaron coincidencias</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSidebarTab === 'source-control' && (
        <div className="flex-1 flex flex-col overflow-hidden select-none bg-[#101011]">
          <div className="px-3 py-3 border-b border-zinc-800/80 bg-zinc-950/55">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Source Control</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.6)] shrink-0" />
                  <span className="truncate text-[13px] font-semibold text-white" title={currentBranch}>
                    {currentBranch}
                  </span>
                  <span className="text-[10px] text-zinc-500">branch</span>
                  {aheadCount > 0 && (
                    <span className="ml-1 flex items-center gap-0.5 rounded-md bg-indigo-500/15 border border-indigo-400/20 px-1.5 py-0.5 text-[9px] text-indigo-300 font-bold" title={`${aheadCount} commits pendientes de push`}>
                      <ArrowUp className="w-2.5 h-2.5 shrink-0" />
                      {aheadCount}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={refreshGitStatus}
                disabled={isLoadingGit}
                title="Refresh source control"
                className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-white hover:border-zinc-600 hover:bg-zinc-800 transition-all-custom flex items-center justify-center shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGit ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex flex-col overflow-hidden min-h-0 shrink-0">
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-950/35 select-none hover:bg-zinc-900/70 transition-all-custom shrink-0 border-b border-zinc-800/70">
                <button
                  onClick={() => setIsChangesHeaderOpen(!isChangesHeaderOpen)}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-200 hover:text-white transition-colors"
                >
                  {isChangesHeaderOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <span>Working Tree</span>
                  {changedFileCount > 0 && (
                    <span className="ml-1 rounded-full border border-indigo-400/30 bg-indigo-400/15 px-1.5 py-0.5 text-[10px] text-indigo-200">
                      {changedFileCount}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-1 text-zinc-500">
                  <button
                    onClick={() => handleCommit()}
                    disabled={isCommitting || !commitMessage.trim()}
                    title="Commit all changes"
                    className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all-custom disabled:opacity-30"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all-custom" title="More actions">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isChangesHeaderOpen && (
                <div className="flex flex-col overflow-hidden p-3 min-h-0 gap-3 shrink-0">
                  <form onSubmit={handleCommit} className="flex flex-col gap-1.5 shrink-0">
                    <div className="relative">
                      <textarea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleCommit();
                          }
                        }}
                        placeholder={`Message on ${currentBranch} (Ctrl+Enter)`}
                        rows={2}
                        className="w-full bg-zinc-950/70 border border-zinc-700/80 text-[12px] rounded-xl pl-3 pr-8 py-2 text-zinc-100 placeholder-zinc-400 outline-none focus:border-zinc-500 transition-all-custom font-sans resize-none leading-snug shadow-inner"
                      />
                      <button
                        type="button"
                        title="Generate message"
                        disabled={isGeneratingCommit}
                        onClick={handleGenerateCommitMessage}
                        className="absolute right-2 top-2 text-zinc-500 hover:text-amber-400 disabled:text-amber-500 disabled:opacity-50 p-0.5 rounded transition-all-custom"
                      >
                        {isGeneratingCommit ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="submit"
                        disabled={isCommitting || !commitMessage.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-white disabled:opacity-45 disabled:hover:bg-zinc-100 text-black font-bold text-[12px] h-8 rounded-lg active:scale-[0.98] transition-all-custom"
                      >
                        {isCommitting ? (
                          <span className="w-3 h-3 border border-t-transparent border-black rounded-full animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>Commit</span>
                      </button>
                      <button
                        type="button"
                        disabled={isCommitting}
                        className="h-8 w-9 rounded-lg border border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:text-white hover:border-zinc-600 hover:bg-zinc-900 transition-all-custom flex items-center justify-center"
                        title="Commit options"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {aheadCount > 0 && (
                      <button
                        type="button"
                        disabled={isPushing}
                        onClick={handlePush}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-bold text-[12px] h-8 rounded-lg active:scale-[0.98] transition-all-custom shadow-md animate-pulse-subtle"
                      >
                        {isPushing ? (
                          <span className="w-3 h-3 border border-t-transparent border-indigo-400 rounded-full animate-spin" />
                        ) : (
                          <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>Push {aheadCount} {aheadCount === 1 ? 'commit' : 'commits'}</span>
                      </button>
                    )}

                    {commitFeedback && (
                      <div className={`text-[11px] px-2.5 py-1.5 rounded-lg leading-normal border ${commitFeedback.startsWith('Error') ? 'bg-red-950/30 text-red-400 border-red-900/30' : 'bg-emerald-950/30 text-emerald-400 border-emerald-900/30'}`}>
                        {commitFeedback}
                      </div>
                    )}
                  </form>

                  <div className="flex flex-col overflow-hidden min-h-0 rounded-xl border border-zinc-800/90 bg-zinc-950/35 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
                    <div className="flex items-center justify-between h-9 px-3 shrink-0 border-b border-zinc-800/80 bg-zinc-950/35">
                      <button
                        onClick={() => setIsChangesListOpen(!isChangesListOpen)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200 hover:text-white transition-colors uppercase tracking-[0.12em]"
                      >
                        {isChangesListOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                        <span>Changed Files</span>
                      </button>
                    </div>

                    {isChangesListOpen && (
                      <div className="max-h-[360px] overflow-y-auto min-h-0 flex flex-col gap-1 p-2 custom-scrollbar">
                        {!workspacePath ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center text-editor-textDark select-none opacity-50">
                            <GitBranch className="w-6 h-6 mb-2" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">No workspace</span>
                          </div>
                        ) : displayedGitFiles.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center text-editor-textDark select-none">
                            <div className="w-8 h-8 rounded-full bg-emerald-950/20 border border-emerald-900/30 flex items-center justify-center mb-2">
                              <Check className="w-4 h-4 text-emerald-500" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Clean tree</span>
                            <p className="text-[9px] text-zinc-600 mt-0.5 leading-normal max-w-[160px]">No pending changes.</p>
                          </div>
                        ) : (
                          displayedGitFiles.map((file) => {
                            const fileName = file.filePath.split('/').pop() || file.filePath;
                            const relativeDir = file.filePath.split('/').slice(0, -1).join('/');
                            const meta = getGitStatusMeta(file.status);
                            const isActive = activeDiffFile?.filePath === `${workspacePath}/${file.filePath}`.replace(/\/+/g, '/');

                            return (
                              <button
                                key={file.filePath}
                                onClick={() => handleSelectGitFile(file.filePath)}
                                className={`w-full text-left group grid grid-cols-[1fr_auto] gap-2 rounded-xl px-2.5 py-2 hover:bg-zinc-800/70 text-zinc-200 hover:text-white transition-all-custom border ${
                                  isActive
                                    ? 'bg-zinc-800/85 border-zinc-600/80 text-white shadow-sm'
                                    : 'border-transparent'
                                }`}
                                title={`${file.filePath} (${meta.title})`}
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${meta.badgeColor}`}>
                                    {meta.badgeText}
                                  </span>
                                  <div className="min-w-0 flex flex-col leading-snug">
                                    <span className="text-[12.5px] font-semibold truncate text-zinc-100">{fileName}</span>
                                    {relativeDir && (
                                      <span className="text-[10.5px] text-zinc-400 truncate">{relativeDir}</span>
                                    )}
                                  </div>
                                </div>
                                <span className={`text-[14px] font-bold self-center ${isActive ? 'text-amber-400' : 'text-zinc-600 group-hover:text-zinc-300'}`}>
                                  &gt;
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800/80 flex flex-col bg-zinc-950/45 shrink-0">
              <div className="flex items-center justify-between px-3 py-2.5 select-none hover:bg-zinc-900/70 transition-all-custom shrink-0">
                <button
                  onClick={() => setIsGraphOpen(!isGraphOpen)}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-200 hover:text-white transition-colors"
                >
                  {isGraphOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <span>Branch Graph</span>
                </button>
                <div className="flex items-center gap-1 text-zinc-500">
                  <button title="Auto refresh" className="px-2 py-1 rounded-lg hover:bg-zinc-800 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all-custom">
                    Auto
                  </button>
                  <button title="Reload graph" onClick={refreshGitStatus} className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all-custom">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isGraphOpen && (
                <div className="max-h-[220px] overflow-y-auto px-2 pb-2 flex flex-col gap-1 min-h-0 custom-scrollbar select-none">
                  {gitLog.length === 0 ? (
                    <div className="py-6 text-center text-[10px] text-editor-textDark italic">
                      No commits found in this repository.
                    </div>
                  ) : (
                    gitLog.map((commit, idx) => (
                      <div key={commit.hash} className="grid grid-cols-[20px_1fr] gap-2 rounded-xl px-2 py-2 hover:bg-zinc-800/60 transition-colors text-[11.5px]">
                        <div className="flex flex-col items-center justify-center shrink-0 w-5 h-8 relative">
                          {idx < gitLog.length - 1 && (
                            <div className="absolute w-px bg-indigo-500/70 top-4 bottom-[-10px]" />
                          )}
                          {idx > 0 && (
                            <div className="absolute w-px bg-indigo-500/70 top-[-10px] bottom-4" />
                          )}
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-300 border border-zinc-950 z-10 shadow-[0_0_12px_rgba(165,180,252,0.55)]" />
                        </div>

                        <div className="min-w-0 flex flex-col leading-snug gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-zinc-100 truncate flex-1 leading-normal" title={commit.message}>
                              {commit.message}
                            </span>
                            {commit.branch && (
                              <span className="bg-indigo-400/15 text-indigo-200 font-bold px-1.5 py-0.5 rounded-md text-[8px] tracking-wider uppercase border border-indigo-400/25 shrink-0">
                                {commit.branch}
                              </span>
                            )}
                          </div>
                          <span className="text-[9.5px] text-zinc-500 font-mono">{commit.hash}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSidebarTab === 'extensions' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {/* Premium Mock Extensions list */}
            {[
              { name: 'Python LSP', desc: 'Soporte inteligente para Python', author: 'Microsoft', inst: true },
              { name: 'GitLens', desc: 'Visualizá el historial de Git', author: 'GitKraken', inst: false },
              { name: 'Prettier', desc: 'Formateador de código automático', author: 'Prettier Org', inst: true },
              { name: 'Dracula Theme', desc: 'Tema oscuro premium', author: 'Dracula', inst: false },
            ].map((ext) => (
              <div key={ext.name} className="p-2.5 bg-editor-bg rounded border border-editor-border flex flex-col gap-1.5 hover:border-editor-textDark transition-all-custom">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xs font-semibold text-white">{ext.name}</h3>
                    <p className="text-[10px] text-editor-textDark font-medium">por {ext.author}</p>
                  </div>
                  <button className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all-custom ${
                    ext.inst ? 'bg-zinc-700 text-zinc-300' : 'bg-white text-black hover:bg-zinc-200'
                  }`}>
                    {ext.inst ? 'Instalado' : 'Instalar'}
                  </button>
                </div>
                <p className="text-[10px] text-editor-textDark leading-relaxed">{ext.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSidebarTab === 'settings' && (
        <div className="flex-1 flex flex-col p-3 gap-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-editor-textDark font-bold uppercase">Tema de color</label>
              <select className="bg-editor-bg border border-editor-border text-xs px-2 py-1 rounded text-white outline-none">
                <option>Spigot Dark (Por defecto)</option>
                <option>VS Code Classic Dark</option>
                <option>Light Theme</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-editor-textDark font-bold uppercase">Tamaño de fuente</label>
              <input type="number" defaultValue={14} className="bg-editor-bg border border-editor-border text-xs px-2 py-1 rounded text-white outline-none w-20" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded border-editor-border accent-editor-accent" />
              <span className="text-xs text-editor-text">Auto-Guardado</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
export default Sidebar;
