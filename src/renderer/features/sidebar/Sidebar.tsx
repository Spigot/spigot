import React, { useState, useEffect } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { FileTree } from './FileTree';
import { Search, Replace, FileCode, Check, RefreshCw } from 'lucide-react';

interface SearchMatch {
  filePath: string;
  fileName: string;
  line: number; // 1-indexed
  column: number; // 1-indexed
  length: number;
  lineContent: string;
}

export const Sidebar: React.FC = () => {
  const { activeSidebarTab, isSidebarOpen, sidebarWidth, setSidebarWidth } = useLayoutStore();
  const { 
    activeTabPath, fileBuffers, fileTree, updateFileBuffer, openFile, openTabs, setPendingSelection 
  } = useWorkspaceStore();

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
      {activeSidebarTab === 'explorer' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-10 px-4 flex items-center justify-between border-b border-editor-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-editor-text">Explorador</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        </div>
      )}

      {activeSidebarTab === 'search' && (
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3 text-editor-text">Buscar y Reemplazar</h2>
          
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

      {activeSidebarTab === 'extensions' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-10 px-4 flex items-center border-b border-editor-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-editor-text">Extensiones</span>
          </div>
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
        <div className="flex-1 flex flex-col p-4 gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-editor-text">Configuración</h2>
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
