import React, { useState, useEffect } from 'react';
import { useLayoutStore, SidebarTab } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { FileTree } from './FileTree';
import { Search, Replace, FileCode, Check, RefreshCw, GitBranch, ChevronDown, ChevronRight, Sparkles, MoreHorizontal, Files, Blocks, Settings } from 'lucide-react';

interface SearchMatch {
  filePath: string;
  fileName: string;
  line: number; // 1-indexed
  column: number; // 1-indexed
  length: number;
  lineContent: string;
}

export const Sidebar: React.FC = () => {
  const { activeSidebarTab, isSidebarOpen, sidebarWidth, setSidebarWidth, setSidebarTab } = useLayoutStore();
  const { 
    activeTabPath, fileBuffers, fileTree, updateFileBuffer, openFile, openTabs, setPendingSelection,
    workspacePath, setDiffFile, activeDiffFile
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
    } catch (err) {
      console.error('Error fetching git status/branch/log:', err);
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

  useEffect(() => {
    if (activeSidebarTab === 'source-control') {
      refreshGitStatus();
    }
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
  const performSearch = async () => {
    if (!searchQuery) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const matchedItems: SearchMatch[] = [];

    const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    let pattern = isRegex ? searchQuery : escapeRegex(searchQuery);
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const flags = matchCase ? 'g' : 'gi';
    
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      setIsSearching(false);
      return; // Invalid regex
    }

    const searchInFileContent = (filePath: string, content: string) => {
      const fileName = filePath.split('/').pop() || filePath;
      const lines = content.split('\n');
      lines.forEach((lineText, lineIdx) => {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(lineText)) !== null) {
          matchedItems.push({
            filePath,
            fileName,
            line: lineIdx + 1,
            column: match.index + 1,
            length: match[0].length,
            lineContent: lineText,
          });
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      });
    };

    if (searchScope === 'active') {
      if (activeTabPath) {
        const content = fileBuffers[activeTabPath] || '';
        searchInFileContent(activeTabPath, content);
      }
    } else {
      // Recursively collect all files from workspace tree
      const getAllFiles = (nodes: any[]): string[] => {
        let files: string[] = [];
        nodes.forEach(node => {
          if (node.isDirectory) {
            if (node.children) {
              files = [...files, ...getAllFiles(node.children)];
            }
          } else {
            files.push(node.path);
          }
        });
        return files;
      };

      const allFilePaths = getAllFiles(fileTree);
      
      for (const fPath of allFilePaths) {
        let content = fileBuffers[fPath];
        if (content === undefined) {
          try {
            content = await (window as any).api.fs.readFile(fPath);
          } catch (err) {
            console.error('Error reading file for search:', fPath, err);
            continue;
          }
        }
        searchInFileContent(fPath, content);
      }
    }

    setResults(matchedItems);
    setIsSearching(false);
  };

  // Run search when inputs or active file buffer changes
  useEffect(() => {
    performSearch();
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

  if (!isSidebarOpen) return null;

  return (
    <aside 
      style={{ width: `${sidebarWidth}px` }}
      className="bg-editor-sidebar border-r border-editor-border flex flex-col select-none z-30 relative animate-fade-in"
    >
      {/* Drag Resize Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-editor-accent/30 z-30 transition-colors"
      />

      {/* Premium Horizontal Navigation Tabs Bar */}
      <div className="h-10 border-b border-editor-border flex items-center justify-between px-3 bg-zinc-950/20 shrink-0 select-none">
        <div className="flex items-center gap-1">
          {[
            { id: 'explorer' as SidebarTab, icon: Files, label: 'Explorador' },
            { id: 'search' as SidebarTab, icon: Search, label: 'Buscar' },
            { id: 'source-control' as SidebarTab, icon: GitBranch, label: 'Código Fuente' },
            { id: 'extensions' as SidebarTab, icon: Blocks, label: 'Extensiones' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSidebarTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                title={tab.label}
                className={`p-1.5 rounded-md transition-all-custom ${
                  isActive 
                    ? 'text-white bg-zinc-900/60 border border-zinc-800/40 font-bold' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/20'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
              </button>
            );
          })}
        </div>

        {/* Configuration Quick-Access Button */}
        <div className="flex items-center">
          <button
            onClick={() => setSidebarTab('settings')}
            title="Configuración"
            className={`p-1.5 rounded-md transition-all-custom ${
              activeSidebarTab === 'settings'
                ? 'text-white bg-zinc-900/60 border border-zinc-800/40 font-bold'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/20'
            }`}
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
        </div>
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
        <div className="flex-1 flex flex-col overflow-hidden select-none bg-editor-bg">

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Section 1: CHANGES Collapsible */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex items-center justify-between px-3 py-1.5 bg-editor-hover/5 select-none hover:bg-editor-hover/10 transition-all-custom shrink-0">
                <button
                  onClick={() => setIsChangesHeaderOpen(!isChangesHeaderOpen)}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-editor-text hover:text-white transition-colors"
                >
                  {isChangesHeaderOpen ? (
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  )}
                  <span>Changes</span>
                </button>
                
                <div className="flex items-center gap-1 text-zinc-400">
                  <button
                    onClick={() => handleCommit()}
                    disabled={isCommitting || !commitMessage.trim()}
                    title="Commit All Changes"
                    className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom disabled:opacity-30"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    title="Staged Files / Stash"
                    className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom"
                  >
                    <GitBranch className="w-3 h-3" />
                  </button>
                  <button
                    title="AI Commit Message"
                    className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom text-amber-500/80 hover:text-amber-400"
                    onClick={() => {
                      if (gitFiles.length > 0) {
                        const filesStr = gitFiles.map(f => f.filePath.split('/').pop()).join(', ');
                        setCommitMessage(`feat: update changes in ${filesStr.slice(0, 40)}`);
                      } else {
                        setCommitMessage('chore: update configurations');
                      }
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                  <button
                    onClick={refreshGitStatus}
                    disabled={isLoadingGit}
                    title="Refresh"
                    className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingGit ? 'animate-spin' : ''}`} />
                  </button>
                  <button className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom">
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {isChangesHeaderOpen && (
                <div className="flex-1 flex flex-col overflow-hidden p-3 min-h-0 gap-3">
                  {/* Commit Input Field & Commit Button */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="relative flex items-center">
                      <textarea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleCommit();
                          }
                        }}
                        placeholder={`Message (Ctrl+Enter to commit on "${currentBranch}")`}
                        rows={2}
                        className="w-full bg-editor-hover border border-editor-border text-[11px] rounded-md pl-2.5 pr-7 py-1.5 text-white placeholder-zinc-500 outline-none focus:border-zinc-600 transition-all-custom font-sans resize-none leading-normal"
                      />
                      <button
                        title="AI Generate Message"
                        onClick={() => {
                          if (gitFiles.length > 0) {
                            const filesStr = gitFiles.map(f => f.filePath.split('/').pop()).join(', ');
                            setCommitMessage(`feat: refine changes in ${filesStr.slice(0, 40)}`);
                          } else {
                            setCommitMessage('chore: maintain repository files');
                          }
                        }}
                        className="absolute right-2 top-2 text-zinc-500 hover:text-amber-400 p-0.5 rounded transition-all-custom"
                      >
                        <Sparkles className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Commit Button */}
                    <div className="flex items-center w-full">
                      <button
                        onClick={() => handleCommit()}
                        disabled={isCommitting || !commitMessage.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-650 hover:bg-indigo-650/85 disabled:opacity-40 disabled:hover:bg-indigo-650 text-white font-semibold text-[11px] py-1 px-3 rounded-l active:scale-[0.98] border-r border-indigo-700/30 transition-all-custom"
                      >
                        {isCommitting ? (
                          <span className="w-3 h-3 border border-t-transparent border-white rounded-full animate-spin"></span>
                        ) : (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>Commit</span>
                      </button>
                      <button
                        disabled={isCommitting}
                        className="bg-indigo-650 hover:bg-indigo-650/85 disabled:opacity-40 disabled:hover:bg-indigo-650 text-white font-semibold text-[11px] py-1 px-1.5 rounded-r active:scale-[0.98] transition-all-custom shrink-0 flex items-center justify-center"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {commitFeedback && (
                      <div className={`text-[10px] px-2 py-1 rounded leading-normal ${commitFeedback.startsWith('Error') ? 'bg-red-950/30 text-red-400 border border-red-900/30' : 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30'}`}>
                        {commitFeedback}
                      </div>
                    )}
                  </div>

                  {/* Changes sub-list */}
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <div className="flex items-center justify-between py-0.5 px-1 shrink-0 select-none">
                      <button
                        onClick={() => setIsChangesListOpen(!isChangesListOpen)}
                        className="flex items-center gap-1 text-[10px] font-bold text-zinc-300 hover:text-white transition-colors"
                      >
                        {isChangesListOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                        <span>Changes</span>
                      </button>
                      {gitFiles.length > 0 && (
                        <span className="text-[9.5px] font-bold bg-indigo-950 text-indigo-400 px-1.5 py-0.2 rounded-full border border-indigo-900/40 font-sans">
                          {gitFiles.length}
                        </span>
                      )}
                    </div>

                    {isChangesListOpen && (
                      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-0.5 mt-1 pr-1 custom-scrollbar">
                        {!workspacePath ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center text-editor-textDark select-none opacity-40">
                            <GitBranch className="w-6 h-6 mb-2" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">No workspace</span>
                          </div>
                        ) : gitFiles.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center text-editor-textDark select-none">
                            <div className="w-8 h-8 rounded-full bg-emerald-950/20 border border-emerald-900/30 flex items-center justify-center mb-2">
                              <Check className="w-4 h-4 text-emerald-500" />
                            </div>
                     <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                       Todo al día
                     </span>
                     <p className="text-[9px] text-zinc-600 mt-0.5 leading-normal max-w-[160px]">
                       No se detectaron cambios.
                     </p>
                          </div>
                        ) : (
                          gitFiles.map((file) => {
                            const fileName = file.filePath.split('/').pop() || file.filePath;
                            const relativeDir = file.filePath.split('/').slice(0, -1).join('/');
                            
                            const statusRaw = file.status.trim();
                            let badgeText = 'M';
                            let badgeColor = 'text-amber-500';
                            let statusTitle = 'Modificado';

                            if (statusRaw === 'A') {
                              badgeText = 'A';
                              badgeColor = 'text-emerald-500';
                              statusTitle = 'Agregado';
                            } else if (statusRaw === '??') {
                              badgeText = 'U';
                              badgeColor = 'text-emerald-500';
                              statusTitle = 'No trackeado';
                            } else if (statusRaw === 'D') {
                              badgeText = 'D';
                              badgeColor = 'text-red-500';
                              statusTitle = 'Eliminado';
                            }

                            const isActive = activeDiffFile?.filePath === `${workspacePath}/${file.filePath}`.replace(/\/+/g, '/');

                            return (
                              <button
                                key={file.filePath}
                                onClick={() => handleSelectGitFile(file.filePath)}
                                className={`w-full text-left group flex items-center justify-between py-1 px-1.5 rounded hover:bg-zinc-900/30 text-zinc-300 hover:text-white transition-all-custom ${
                                  isActive
                                    ? 'bg-zinc-800/40 border border-zinc-700/30 text-white font-medium'
                                    : 'border border-transparent'
                                }`}
                                title={`${file.filePath} (${statusTitle})`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden flex-1">
                                  {/* Beautiful chevron > for all changed files */}
                                  <span className={`text-[12px] font-bold shrink-0 select-none w-3.5 h-3.5 flex items-center justify-center transition-colors ${isActive ? 'text-amber-500 font-extrabold' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    &gt;
                                  </span>
                                  <div className="flex items-baseline gap-1.5 overflow-hidden flex-1 leading-none">
                                    <span className="text-[11.5px] font-medium truncate">
                                      {fileName}
                                    </span>
                                    {relativeDir && (
                                      <span className="text-[9.5px] text-editor-textDark truncate font-normal">
                                        {relativeDir}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                <span className={`text-[10px] font-mono font-bold w-4 h-4 flex items-center justify-center shrink-0 ${badgeColor}`}>
                                  {badgeText}
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

            {/* Section 2: GRAPH Collapsible (VS Code Git Graph layout) */}
            <div className="border-t border-editor-border flex flex-col min-h-0 bg-zinc-950/10">
              <div className="flex items-center justify-between px-3 py-1.5 bg-editor-hover/5 select-none hover:bg-editor-hover/10 transition-all-custom shrink-0">
                <button
                  onClick={() => setIsGraphOpen(!isGraphOpen)}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-editor-text hover:text-white transition-colors"
                >
                  {isGraphOpen ? (
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                  )}
                  <span>Graph</span>
                </button>
                <div className="flex items-center gap-1 text-zinc-400">
                  <button title="Auto Refresh" className="p-1 rounded hover:bg-editor-hover hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all-custom">
                    Auto
                  </button>
                  <button title="Reload Log" onClick={refreshGitStatus} className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <button className="p-1 rounded hover:bg-editor-hover hover:text-white transition-all-custom">
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {isGraphOpen && (
                <div className="max-h-[160px] overflow-y-auto p-2 flex flex-col gap-1 min-h-0 custom-scrollbar select-none">
                  {gitLog.length === 0 ? (
                    <div className="py-6 text-center text-[10px] text-editor-textDark italic">
                      No hay commits registrados en este repositorio.
                    </div>
                  ) : (
                    gitLog.map((commit, idx) => (
                      <div key={commit.hash} className="flex items-start gap-2 py-1 px-1 hover:bg-zinc-900/20 rounded transition-colors text-[10.5px]">
                        {/* Visual Git Graph Node */}
                        <div className="flex flex-col items-center justify-center shrink-0 w-3 h-4 relative">
                          {/* Vertical Line */}
                          {idx < gitLog.length - 1 && (
                            <div className="absolute w-0.5 bg-indigo-500 top-2 bottom-[-8px] left-[5px]" />
                          )}
                          {idx > 0 && (
                            <div className="absolute w-0.5 bg-indigo-500 top-[-8px] bottom-2 left-[5px]" />
                          )}
                          {/* Node Circle */}
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 border border-zinc-950 z-10" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-zinc-200 truncate flex-1 leading-normal" title={commit.message}>
                              {commit.message}
                            </span>
                            {commit.branch && (
                              <span className="bg-indigo-950/70 text-indigo-400 font-bold px-1 rounded text-[7.5px] tracking-wider uppercase border border-indigo-900/30 shrink-0">
                                {commit.branch}
                              </span>
                            )}
                          </div>
                          <span className="text-[8.5px] text-editor-textDark font-mono">
                            {commit.hash}
                          </span>
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
