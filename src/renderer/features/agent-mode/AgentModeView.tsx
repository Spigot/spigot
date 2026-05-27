import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { 
  SquarePen, Search, Blocks, Clock, Folder, MessageSquare, Settings,
  Plus, Hand, ChevronDown, Mic, ArrowUp, Monitor, GitBranch, X, Loader2, Copy, Check, Brain,
  FilePlus, GitCommit, GitPullRequest, FolderOpen, Trash2
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAIStore } from '../../store/aiStore';
import { useLayoutStore } from '../../store/layoutStore';
import { compileContext } from '../ai-panel/contextCompiler';
import ConsolePanel from '../terminal/ConsolePanel';

// Helper to parse <think> blocks
function parseThinking(content: string) {
  const startTag = '<think>';
  const endTag = '</think>';

  const startIndex = content.indexOf(startTag);
  if (startIndex === -1) {
    return { thought: '', response: content, isThinking: false };
  }

  const endIndex = content.indexOf(endTag);
  if (endIndex === -1) {
    const thought = content.slice(startIndex + startTag.length);
    return { thought, response: '', isThinking: true };
  }

  const thought = content.slice(startIndex + startTag.length, endIndex);
  const response = content.slice(endIndex + endTag.length);
  return { thought, response: response.trim(), isThinking: false };
}

type DiffStats = {
  added: number;
  deleted: number;
};

type DiffLine = {
  type: 'add' | 'delete' | 'context' | 'meta';
  oldLine?: number;
  newLine?: number;
  content: string;
};

type DiffFile = {
  filePath: string;
  stats: DiffStats;
  lines: DiffLine[];
};

const emptyDiffStats: DiffStats = { added: 0, deleted: 0 };

const parseUnifiedDiffStats = (diff: string): DiffStats => (
  diff.split('\n').reduce(
    (stats, line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return stats;
      if (line.startsWith('+')) stats.added += 1;
      if (line.startsWith('-')) stats.deleted += 1;
      return stats;
    },
    { ...emptyDiffStats }
  )
);

const parseUnifiedDiffFiles = (diff: string): DiffFile[] => {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  diff.split('\n').forEach((line) => {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = {
        filePath: match?.[2] || line.replace('diff --git ', ''),
        stats: { ...emptyDiffStats },
        lines: [],
      };
      files.push(currentFile);
      return;
    }

    if (!currentFile) return;

    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      oldLine = Number(match?.[1] || 0);
      newLine = Number(match?.[2] || 0);
      currentFile.lines.push({ type: 'meta', content: line });
      return;
    }

    if (line.startsWith('+++') || line.startsWith('---')) return;

    if (line.startsWith('+')) {
      currentFile.stats.added += 1;
      currentFile.lines.push({ type: 'add', newLine, content: line });
      newLine += 1;
      return;
    }

    if (line.startsWith('-')) {
      currentFile.stats.deleted += 1;
      currentFile.lines.push({ type: 'delete', oldLine, content: line });
      oldLine += 1;
      return;
    }

    if (line.startsWith(' ')) {
      currentFile.lines.push({ type: 'context', oldLine, newLine, content: line });
      oldLine += 1;
      newLine += 1;
      return;
    }

    if (line.trim()) {
      currentFile.lines.push({ type: 'meta', content: line });
    }
  });

  return files;
};

const ThoughtBlock: React.FC<{ thought: string; isThinking: boolean }> = ({ thought, isThinking }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!thought.trim() && isThinking) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2.5 rounded bg-editor-hover/20 text-editor-textDark text-[11px] mb-2 select-none border border-editor-border/40 w-fit">
        <Loader2 className="w-3 h-3 animate-spin text-editor-accent" />
        <span className="font-medium animate-pulse">Pensando...</span>
      </div>
    );
  }

  return (
    <div className="mb-3 border border-editor-border/40 rounded-lg overflow-hidden bg-editor-hover/10">
      <button
        onClick={() => !isThinking && setIsOpen(!isOpen)}
        disabled={isThinking}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-editor-hover/20 text-[10px] text-editor-textDark font-medium transition-colors select-none"
      >
        <div className="flex items-center gap-1.5">
          {isThinking ? (
            <Loader2 className="w-3 h-3 animate-spin text-editor-accent" />
          ) : (
            <Brain className="w-3 h-3 text-editor-accent" />
          )}
          <span>{isThinking ? 'Pensando...' : 'Proceso de pensamiento'}</span>
        </div>
        {!isThinking && (
          <span className="text-[9px] uppercase tracking-wider text-editor-textDark/60">
            {isOpen ? 'Ocultar' : 'Mostrar'}
          </span>
        )}
      </button>
      {isOpen && !isThinking && (
        <div className="px-3 py-2 border-t border-editor-border/20 text-[10px] text-editor-textDark leading-relaxed font-mono whitespace-pre-wrap select-text selection:bg-zinc-800 bg-editor-hover/5">
          {thought}
        </div>
      )}
    </div>
  );
};

export const AgentModeView: React.FC = () => {
  const { workspacePath, setWorkspacePath, theme, setTheme, fileTree, explorerSelectedPath } = useWorkspaceStore();
  const { 
    conversations, activeConversationId, selectConversation, createConversation,
    messages, sendMessage, isGenerating, incomingStreamText, activeProvider,
    initializeStore, deleteConversation
  } = useAIStore();
  const { isSettingsModalOpen, setSettingsModalOpen } = useLayoutStore();
  
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<string[]>(workspacePath ? [workspacePath] : []);
  const [projectChatsCache, setProjectChatsCache] = useState<Record<string, any[]>>({});
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [diffStats, setDiffStats] = useState<DiffStats>(emptyDiffStats);
  const [diffText, setDiffText] = useState('');
  const [isChangesPanelOpen, setIsChangesPanelOpen] = useState(false);
  const [changesPanelWidth, setChangesPanelWidth] = useState(720);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const diffFiles = useMemo(() => parseUnifiedDiffFiles(diffText), [diffText]);
  const hasDiffChanges = diffStats.added > 0 || diffStats.deleted > 0;

  // Re-sync chats when project changes to ensure isolation
  useEffect(() => {
    if (workspacePath) {
      initializeStore();
    }
  }, [workspacePath, initializeStore]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, incomingStreamText]);

  const refreshDiffState = useCallback(async () => {
    if (!workspacePath) {
      setDiffStats(emptyDiffStats);
      setDiffText('');
      return '';
    }

    const diff = await (window as any).api.git.getDiff(workspacePath, '');
    const nextDiffText = typeof diff === 'string' ? diff : '';
    setDiffText(nextDiffText);
    setDiffStats(parseUnifiedDiffStats(nextDiffText));
    return nextDiffText;
  }, [workspacePath]);

  useEffect(() => {
    let isMounted = true;

    const refreshDiffStats = async () => {
      try {
        await refreshDiffState();
      } catch {
        if (isMounted) {
          setDiffStats(emptyDiffStats);
          setDiffText('');
        }
      }
    };

    refreshDiffStats();
    const intervalId = window.setInterval(refreshDiffStats, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [refreshDiffState]);

  const handleOpenChangesPanel = async () => {
    setIsChangesPanelOpen(true);
    try {
      await refreshDiffState();
    } catch {
      setDiffStats(emptyDiffStats);
      setDiffText('');
    }
  };

  const handleChangesPanelResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = changesPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const maxWidth = Math.max(520, window.innerWidth - 420);
      const nextWidth = startWidth - (moveEvent.clientX - startX);
      setChangesPanelWidth(Math.max(420, Math.min(maxWidth, nextWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Adjust textarea height on typing
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(200, textareaRef.current.scrollHeight)}px`;
    }
  }, [prompt]);

  const handleSend = async () => {
    if (!prompt.trim() || isGenerating) return;
    const textToSend = prompt;
    setPrompt('');

    // Compile active context
    let contextText = null;
    try {
      const compiled = await compileContext(workspacePath, fileTree, explorerSelectedPath);
      contextText = compiled.text;
    } catch (e) {
      console.error('Failed to compile context:', e);
    }

    await sendMessage(textToSend.trim(), contextText);
  };

  const handleOpenExplorer = () => {
    if (workspacePath && (window as any).api?.app?.openShell) {
      (window as any).api.app.openShell(workspacePath);
    }
  };

  // Logic to determine if a conversation is actually starting (Reset UI to center)
  const isConversationEmpty = messages.length === 0 && !incomingStreamText;

  // Store conversations for the current workspace into the cache
  useEffect(() => {
    if (workspacePath && conversations) {
      setProjectChatsCache(prev => ({
        ...prev,
        [workspacePath]: conversations
      }));
    }
  }, [workspacePath, conversations]);

  // Sync recent workspaces from backend without reordering existing ones
  useEffect(() => {
    const loadRecentProjects = async () => {
      try {
        const list = await (window as any).api.store.getRecentWorkspaces();
        setRecentProjects(prev => {
          const newItems = (list || []).filter((p: string) => !prev.includes(p));
          return [...prev, ...newItems];
        });
      } catch (err) {
        console.error('Error loading recent projects in AgentMode:', err);
      }
    };
    loadRecentProjects();
  }, [workspacePath]);

  // Ensure current workspacePath is immediately visible and stays in place
  useEffect(() => {
    if (workspacePath) {
      setRecentProjects(prev => {
        if (!prev.includes(workspacePath)) {
          return [workspacePath, ...prev];
        }
        return prev;
      });
    }
  }, [workspacePath]);

  const workspaceName = workspacePath 
    ? workspacePath.replace(/\\/g, '/').split('/').pop() 
    : 'spigot';

  // Ensure current workspace is always in the list
  const displayedProjects = [...recentProjects];
  if (workspacePath && !displayedProjects.includes(workspacePath)) {
    displayedProjects.unshift(workspacePath);
  }

  const renderConversations = (projPath: string) => {
    const projConversations = projectChatsCache[projPath];
    if (!projConversations || projConversations.length === 0) return null;
    
    return (
      <div className="pl-4 pr-1 mt-1 mb-2 flex flex-col gap-1 text-[12px] animate-in fade-in slide-in-from-top-1 duration-150">
        {projConversations.map(conv => {
          const isActive = conv.id === activeConversationId && workspacePath === projPath;
          const date = new Date(conv.timestamp);
          const now = new Date();
          const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
          const timeString = isToday 
            ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

          return (
            <div 
              key={conv.id}
              onClick={() => {
                if (workspacePath !== projPath) {
                  setWorkspacePath(projPath);
                }
                selectConversation(conv.id);
              }}
              className={`flex items-center justify-between group cursor-pointer px-2 py-1.5 rounded transition-colors ${
                isActive ? 'bg-editor-active text-editor-text font-medium' : 'hover:bg-editor-hover text-editor-textDark hover:text-editor-text'
              }`}
            >
              <div className="flex items-center gap-2 truncate min-w-0 mr-1.5">
                <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-emerald-500' : ''}`} />
                <span className="truncate">{conv.title || 'Nueva conversación'}</span>
              </div>
              <div className="flex items-center flex-shrink-0 ml-2">
                <span className="text-[10px] text-editor-textDark group-hover:hidden block">
                  {timeString}
                </span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm('¿Estás seguro de que querés eliminar esta conversación?')) {
                      if (workspacePath === projPath) {
                        deleteConversation(conv.id);
                      } else {
                        try {
                          const history = await (window as any).api.store.getChatHistory(projPath);
                          if (history) {
                            const updated = history.filter((c: any) => c.id !== conv.id);
                            await (window as any).api.store.setChatHistory(updated, projPath);
                            setProjectChatsCache(prev => ({
                              ...prev,
                              [projPath]: updated
                            }));
                          }
                        } catch (err) {
                          console.error('Error deleting non-active project conversation:', err);
                        }
                      }
                    }
                  }}
                  className="hidden group-hover:block p-0.5 rounded hover:bg-white/10 text-red-400 hover:text-red-500 transition-colors"
                  title="Eliminar conversación"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessageContent = (content: string, id: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    const renderInlineCode = (text: string) => {
      const codeParts = text.split(/(`.*?`)/g);
      return codeParts.map((codePart, idx) => {
        if (codePart.startsWith('`') && codePart.endsWith('`')) {
          return (
            <code 
              key={`c-${idx}`} 
              className="px-1 py-0.5 mx-0.5 rounded bg-editor-hover font-mono text-[11px] text-zinc-200 border border-editor-border/40 select-all"
            >
              {codePart.slice(1, -1)}
            </code>
          );
        }
        return codePart;
      });
    };

    const renderInlineMarkdown = (text: string) => {
      const boldParts = text.split(/(\*\*.*?\*\*)/g);
      return boldParts.map((boldPart, idx) => {
        if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
          return (
            <strong key={`b-${idx}`} className="font-bold text-white">
              {renderInlineCode(boldPart.slice(2, -2))}
            </strong>
          );
        }
        return renderInlineCode(boldPart);
      });
    };

    return parts.map((part, idx) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const firstLine = lines[0].replace('```', '').trim();
        const code = lines.slice(1, -1).join('\n');
        const codeId = `${id}-${idx}`;

        return (
          <div key={idx} className="my-3 border border-editor-border rounded-lg overflow-hidden bg-editor-bg max-w-[calc(100vw-360px)]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-editor-hover/50 text-[11px] text-editor-textDark border-b border-editor-border">
              <span className="font-mono uppercase font-bold">{firstLine || 'code'}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(code);
                  setCopiedId(codeId);
                  setTimeout(() => setCopiedId(null), 1500);
                }}
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                {copiedId === codeId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 text-[12px] font-mono text-zinc-300 overflow-x-auto leading-relaxed whitespace-pre select-text selection:bg-zinc-800">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      return (
        <span 
          key={idx} 
          className="text-[13px] leading-relaxed whitespace-pre-wrap select-text selection:bg-zinc-800 break-words"
        >
          {renderInlineMarkdown(part)}
        </span>
      );
    });
  };

  const renderAssistantMessage = (content: string, id: string) => {
    const { thought, response, isThinking } = parseThinking(content);

    return (
      <div className="flex flex-col gap-2">
        {thought.trim() && (
          <ThoughtBlock thought={thought} isThinking={isThinking} />
        )}
        {response.trim() && (
          <div className="flex flex-col gap-1">
            {renderMessageContent(response, id)}
          </div>
        )}
        {!response.trim() && isThinking && (
          <div className="flex items-center gap-2 text-editor-textDark text-[12px] select-none">
            <Loader2 className="w-4 h-4 animate-spin text-editor-accent" />
            <span>Generando respuesta...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full bg-editor-bg text-editor-text font-sans relative">
      <style>{`
        .custom-scrollbar-agent::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar-agent::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-agent::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar-agent::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        /* Solarized Dark High Contrast scrollbar */
        [data-theme='solarized-dark'] .custom-scrollbar-agent::-webkit-scrollbar-thumb {
          background: rgba(147, 161, 161, 0.3);
        }
        [data-theme='solarized-dark'] .custom-scrollbar-agent::-webkit-scrollbar-thumb:hover {
          background: rgba(147, 161, 161, 0.5);
        }
      `}</style>

      {/* Sidebar */}
      <div className="w-[260px] flex flex-col border-r border-editor-border bg-editor-sidebar p-3 text-[13px] shrink-0">
        <div className="flex flex-col gap-1 mb-6">
          <button 
            onClick={createConversation}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-editor-hover transition-colors text-left text-editor-text"
          >
            <SquarePen className="w-4 h-4 text-editor-textDark" />
            <span>Nuevo chat</span>
          </button>
          <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-editor-hover transition-colors text-left text-editor-text">
            <Search className="w-4 h-4 text-editor-textDark" />
            <span>Buscar</span>
          </button>
          <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-editor-hover transition-colors text-left text-editor-text">
            <Blocks className="w-4 h-4 text-editor-textDark" />
            <span>Complementos</span>
          </button>
          <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-editor-hover transition-colors text-left text-editor-text">
            <Clock className="w-4 h-4 text-editor-textDark" />
            <span>Automatizaciones</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="mb-6">
            <h3 className="px-2 text-[11px] font-semibold text-editor-textDark mb-2">Proyectos</h3>
            <div className="flex flex-col gap-0.5">
              {displayedProjects.map((p) => {
                const folderName = p.replace(/\\/g, '/').split('/').pop() || p;
                const isCurrent = workspacePath === p;
                const isExpanded = expandedProjects.includes(p);

                return (
                  <div key={p}>
                    <button 
                      onClick={() => {
                        setExpandedProjects(prev => 
                          prev.includes(p) 
                            ? prev.filter(proj => proj !== p) // Collapse
                            : [...prev, p] // Expand
                        );
                        if (!isCurrent) {
                          setWorkspacePath(p);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-editor-hover transition-colors text-left ${
                        isCurrent ? 'text-editor-text' : 'text-editor-textDark hover:text-editor-text'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder className={`w-3.5 h-3.5 ${isCurrent ? 'text-editor-textDark' : ''}`} />
                        <span className="truncate">{folderName}</span>
                      </div>
                      <ChevronDown className={`w-3 h-3 text-editor-textDark transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                    </button>
                    
                    {/* Render cached chat history if expanded */}
                    {isExpanded && renderConversations(p)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="px-2 text-[11px] font-semibold text-editor-textDark mb-2">Chats</h3>
            <div className="px-2 text-editor-textDark text-[12px]">Sin chats</div>
          </div>
        </div>

        <div className="pt-2 border-t border-editor-border">
          <button 
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-editor-hover transition-colors text-left w-full text-editor-text"
          >
            <Settings className="w-4 h-4 text-editor-textDark" />
            <span>Configuración</span>
          </button>
        </div>
      </div>

      {/* Center Column: Main Content Area + Terminal */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-row overflow-hidden bg-editor-bg select-none relative">
          
          {/* 1. Chat Area */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
            {isConversationEmpty ? (
              <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar-agent scroll-smooth justify-center items-center px-8 pb-8 relative">
                <div className="w-full max-w-3xl flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 py-12">
                  <h1 className="text-3xl font-medium text-editor-accent mb-10 tracking-tight text-center">
                    ¿Qué deberíamos crear en {workspaceName}?
                  </h1>
                  
                  {/* Centered Input Box when empty */}
                  <div className="w-full bg-white/5 border border-editor-border rounded-xl flex flex-col shadow-2xl backdrop-blur-md transition-all duration-300">
                    <textarea 
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Pregunta lo que quieras"
                      className="w-full bg-transparent text-editor-text p-4 min-h-[120px] outline-none resize-none placeholder:text-editor-textDark text-[14px]"
                      disabled={isGenerating}
                    />
                    
                    <div className="flex items-center justify-between p-3 pt-0">
                      <div className="flex items-center gap-3">
                        <button className="p-1.5 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                        <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text text-[12px] transition-colors">
                          <Hand className="w-3.5 h-3.5" />
                          <span>Permisos predeterminados</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text text-[12px] transition-colors" title={`Proveedor activo: ${activeProvider}`}>
                          <span>{activeProvider || 'Modelo'}</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text transition-colors">
                          <Mic className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={handleSend}
                          disabled={isGenerating || !prompt.trim()}
                          className={`p-1 rounded-full transition-colors ${
                            isGenerating || !prompt.trim() 
                              ? 'bg-white/5 text-editor-textDark cursor-not-allowed' 
                              : 'bg-white/20 text-editor-text hover:bg-white/30'
                          }`}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-5 h-5 p-0.5 animate-spin" />
                          ) : (
                            <ArrowUp className="w-5 h-5 p-0.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom tags (Only shown when no messages) */}
                  <div className="w-full flex items-center justify-center gap-3 mt-8 px-1 relative">
                    <button 
                      onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                      className="flex items-center gap-1.5 text-[12px] text-editor-textDark hover:text-editor-text transition-colors"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>{workspaceName}</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    
                    {isProjectMenuOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40 cursor-default" 
                          onClick={() => setIsProjectMenuOpen(false)} 
                        />
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-64 bg-editor-sidebar border border-editor-border rounded-md shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-100 ease-out">
                          <div className="px-3 py-1 text-[10px] text-editor-textDark font-bold uppercase tracking-wider border-b border-editor-border pb-1.5 mb-1.5 text-left text-white">
                            Cambiar proyecto
                          </div>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            {displayedProjects.map((p) => {
                              const folderName = p.replace(/\\/g, '/').split('/').pop() || p;
                              const isCurrent = workspacePath === p;
                              return (
                                <button
                                  key={p}
                                  onClick={() => {
                                    setWorkspacePath(p);
                                    setIsProjectMenuOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 hover:bg-editor-hover hover:text-editor-accent flex items-center gap-2 transition-colors ${
                                    isCurrent ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-textDark pl-2.5' : 'text-editor-text'
                                  }`}
                                  title={p}
                                >
                                  <Folder className={`w-3.5 h-3.5 ${isCurrent ? 'text-editor-text' : 'text-editor-textDark'}`} />
                                  <span className="truncate text-[12.5px] font-medium">{folderName}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    
                    <button className="flex items-center gap-1.5 text-[12px] text-editor-textDark hover:text-editor-text transition-colors">
                      <Monitor className="w-3.5 h-3.5" />
                      <span>Trabajar localmente</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    
                    <button className="flex items-center gap-1.5 text-[12px] text-editor-textDark hover:text-editor-text transition-colors">
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>main</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Scrollable Messages Area */}
                <div
                  className="absolute inset-0 overflow-y-auto custom-scrollbar-agent scroll-smooth pl-8 pt-6 pb-44"
                  style={{ paddingRight: isChangesPanelOpen ? '2rem' : '280px' }}
                >
                  <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 px-2 pb-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div 
                          className={`max-w-[85%] rounded-2xl px-5 py-3.5 ${
                            msg.role === 'user' 
                              ? 'bg-white/5 backdrop-blur-md text-white ml-auto border border-editor-border shadow-sm' 
                              : 'bg-white/5 backdrop-blur-md border border-editor-border shadow-sm'
                          }`}
                        >
                          {msg.role === 'user' ? (
                            <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap select-text selection:bg-zinc-800 break-words">
                              {msg.content}
                            </div>
                          ) : (
                            <div className="bg-transparent">
                              {renderAssistantMessage(msg.content, msg.id)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {incomingStreamText && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl">
                          <div className="bg-white/5 backdrop-blur-md border border-editor-border rounded-2xl px-5 py-3.5 shadow-sm">
                            {renderAssistantMessage(incomingStreamText, 'stream')}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Chat input box (Bottom pinned when chatting) */}
                <div 
                  className="absolute bottom-0 left-0 right-0 pl-8 pb-6 pt-12 flex flex-col items-center pointer-events-none"
                  style={{
                    paddingRight: isChangesPanelOpen ? '2rem' : '280px',
                    background: 'linear-gradient(to top, var(--editor-bg) 60%, transparent 100%)'
                  }}
                >
                  <div className="w-full max-w-3xl bg-white/5 border border-editor-border rounded-xl flex flex-col shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-300 pointer-events-auto">
                    <textarea 
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Pregunta lo que quieras"
                      className="w-full bg-transparent text-editor-text p-4 min-h-[120px] outline-none resize-none placeholder:text-editor-textDark text-[14px]"
                      disabled={isGenerating}
                    />
                    
                    <div className="flex items-center justify-between p-3 pt-0">
                      <div className="flex items-center gap-3">
                        <button className="p-1.5 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                        <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text text-[12px] transition-colors">
                          <Hand className="w-3.5 h-3.5" />
                          <span>Permisos predeterminados</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text text-[12px] transition-colors" title={`Proveedor activo: ${activeProvider}`}>
                          <span>{activeProvider || 'Modelo'}</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text transition-colors">
                          <Mic className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={handleSend}
                          disabled={isGenerating || !prompt.trim()}
                          className={`p-1 rounded-full transition-colors ${
                            isGenerating || !prompt.trim() 
                              ? 'bg-white/5 text-editor-textDark cursor-not-allowed' 
                              : 'bg-white/20 text-editor-text hover:bg-white/30'
                          }`}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-5 h-5 p-0.5 animate-spin" />
                          ) : (
                            <ArrowUp className="w-5 h-5 p-0.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Right Environment Panel (FIXED POSITION) */}
          {!isConversationEmpty && !isChangesPanelOpen && (
            <div className="absolute top-0 right-4 bottom-0 w-[280px] p-6 pl-0 shrink-0 flex flex-col animate-in fade-in duration-300 pointer-events-none">
              <div className="bg-white/5 backdrop-blur-md border border-editor-border rounded-xl p-3 flex flex-col gap-0.5 shadow-xl pointer-events-auto">
                <div className="flex items-center justify-between text-editor-textDark mb-2 px-1">
                  <span className="text-[12px] font-medium uppercase tracking-wider opacity-80">Entorno</span>
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={handleOpenExplorer}
                      className="p-1 rounded hover:bg-white/10 hover:text-editor-text transition-colors"
                      title="Abrir en explorador"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenChangesPanel}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/10 text-editor-text transition-colors text-[13px]"
                >
                  <FilePlus className="w-4 h-4 text-editor-textDark" />
                  <span className="flex-1 text-left">Cambios</span>
                  {hasDiffChanges && (
                    <span className="ml-auto flex items-center gap-1 font-mono text-[12px] tabular-nums">
                      <span className="text-emerald-400">+{diffStats.added}</span>
                      <span className="text-red-400">-{diffStats.deleted}</span>
                    </span>
                  )}
                </button>
                
                <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/10 text-editor-text transition-colors text-[13px]">
                  <Monitor className="w-4 h-4 text-editor-textDark" />
                  <span>Local</span>
                </button>
                
                <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/10 text-editor-text transition-colors text-[13px]">
                  <GitBranch className="w-4 h-4 text-editor-textDark" />
                  <span>main</span>
                </button>
                
                <div className="h-px bg-white/10 my-1.5 mx-2" />
                
                <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/10 text-editor-textDark transition-colors text-[13px] opacity-60 cursor-not-allowed" title="Sin confirmaciones pendientes">
                  <GitCommit className="w-4 h-4" />
                  <span>Confirmación</span>
                </button>
                
                <button className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/10 text-editor-text transition-colors text-[13px]">
                  <GitPullRequest className="w-4 h-4 text-editor-textDark" />
                  <span>Crear pull request</span>
                </button>
              </div>
            </div>
          )}

          {isChangesPanelOpen && !isConversationEmpty && (
            <aside
              className="relative z-30 flex h-full shrink-0 flex-col border-l border-editor-border bg-editor-bg shadow-2xl pointer-events-auto animate-in slide-in-from-right-2 duration-200"
              style={{ width: changesPanelWidth }}
            >
              <div
                onMouseDown={handleChangesPanelResizeStart}
                className="absolute bottom-0 left-0 top-0 z-40 w-1 cursor-col-resize bg-transparent hover:bg-editor-accent/60"
                title="Redimensionar revisión"
              />
              <div className="flex h-12 shrink-0 items-center gap-3 border-b border-editor-border px-4">
                <div className="flex h-7 items-center gap-2 rounded-lg bg-editor-active px-3 text-[13px] font-semibold text-editor-text">
                  <FilePlus className="h-4 w-4" />
                  Revisión
                </div>
                <div className="min-w-0 flex-1 text-[13px] text-editor-textDark">
                  Cambios locales
                </div>
                {hasDiffChanges && (
                  <div className="flex items-center gap-1 font-mono text-[13px] tabular-nums">
                    <span className="text-emerald-400">+{diffStats.added}</span>
                    <span className="text-red-400">-{diffStats.deleted}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsChangesPanelOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 text-editor-textDark hover:text-editor-text"
                  title="Cerrar revisión"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 border-b border-editor-border px-5 py-3 text-[13px] text-editor-textDark">
                <span className="font-medium text-editor-text">Rama</span>
                <span>main</span>
                <span>→</span>
                <span>origin/main</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                {diffFiles.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-8 text-center text-editor-textDark">
                    <FilePlus className="mb-3 h-8 w-8 opacity-70" />
                    <div className="text-[14px] font-medium text-editor-text">No hay cambios para revisar</div>
                    <div className="mt-1 text-[12px]">Cuando haya cambios locales, van a aparecer acá con sus líneas agregadas y eliminadas.</div>
                  </div>
                ) : (
                  diffFiles.map((file) => (
                    <section key={file.filePath} className="border-b border-editor-border">
                      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-editor-border bg-editor-bg/95 px-5 py-3 backdrop-blur">
                        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-editor-text" title={file.filePath}>
                          {file.filePath}
                        </span>
                        <span className="font-mono text-[12px] text-emerald-400">+{file.stats.added}</span>
                        <span className="font-mono text-[12px] text-red-400">-{file.stats.deleted}</span>
                      </div>

                      <div className="overflow-x-auto custom-scrollbar bg-editor-sidebar/40 py-2 font-mono text-[12px] leading-5">
                        {file.lines.map((line, index) => {
                          const lineClass = line.type === 'add'
                            ? 'border-l-2 border-emerald-400 bg-emerald-500/15 text-emerald-200'
                            : line.type === 'delete'
                              ? 'border-l-2 border-red-400 bg-red-500/15 text-red-200'
                              : line.type === 'meta'
                                ? 'bg-editor-active text-editor-textDark'
                                : 'border-l-2 border-transparent text-editor-textDark';

                          return (
                            <div key={`${file.filePath}:${index}`} className={`grid min-w-full w-max grid-cols-[52px_52px_max-content] ${lineClass}`}>
                              <span className="select-none border-r border-editor-border/60 px-2 text-right text-editor-textDark/70">
                                {line.oldLine ?? ''}
                              </span>
                              <span className="select-none border-r border-editor-border/60 px-2 text-right text-editor-textDark/70">
                                {line.newLine ?? ''}
                              </span>
                              <code className="whitespace-pre px-3">
                                {line.content || ' '}
                              </code>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </aside>
          )}
        </div>
        <ConsolePanel />
      </div>

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm app-non-draggable">
          <div className="w-[420px] rounded-xl border border-editor-border bg-editor-bg p-5 shadow-2xl flex flex-col gap-4 text-editor-text animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-editor-border">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-editor-textDark" />
                <h2 className="font-semibold text-[14px]">Configuración de Spigot</h2>
              </div>
              <button 
                onClick={() => setSettingsModalOpen(false)}
                className="p-1 rounded hover:bg-editor-hover text-editor-textDark hover:text-editor-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-editor-textDark font-bold uppercase">Tema de color</label>
                <select
                  value={theme}
                  onChange={(event) => {
                    const nextTheme = event.target.value as 'spigot-dark' | 'grayish-dark' | 'solarized-dark';
                    setTheme(nextTheme);
                  }}
                  className="bg-editor-sidebar border border-editor-border text-[13px] px-3 py-2 rounded outline-none focus:border-editor-textDark transition-colors"
                >
                  <option value="spigot-dark">Spigot Dark (Por defecto)</option>
                  <option value="grayish-dark">Grisáceo</option>
                  <option value="solarized-dark">Solarized Dark</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-editor-textDark font-bold uppercase">Tamaño de fuente</label>
                <input type="number" defaultValue={14} className="bg-editor-sidebar border border-editor-border text-[13px] px-3 py-2 rounded outline-none focus:border-editor-textDark transition-colors w-24" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" defaultChecked className="rounded-none border-editor-border accent-editor-textDark" />
                <span className="text-[13px]">Auto-Guardado</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setSettingsModalOpen(false)}
                className="bg-editor-active hover:bg-editor-hover border border-editor-border text-editor-text px-4 py-1.5 rounded font-medium text-[13px] transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentModeView;
