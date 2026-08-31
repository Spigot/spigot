import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAIStore } from '../../store/aiStore';
import { compileContext } from './contextCompiler';
import { ApiKeyModal } from './ApiKeyModal';
import { StyledSelect } from './StyledSelect';
import { SLASH_COMMANDS, SlashCommand } from './slashCommands';
import { parseMessageThinking } from '../chat/messageParser';
import { 
  Sparkles, Settings, 
  ShieldAlert, Folder, FileText, 
  Loader2, AlertCircle, Copy, Check, Key, X,
  Trash2, Brain, Clock, Plus, ChevronDown, ChevronRight,
  ArrowUp, Square, Paperclip, Terminal, FileCode2, Wrench
} from 'lucide-react';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
  minimax: 'MiniMax',
};

const ThoughtBlock: React.FC<{
  thought: string;
  isThinking: boolean;
}> = ({ thought, isThinking }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!thought.trim() && isThinking) {
    return (
      <div className="flex items-center gap-2 py-1 px-2.5 rounded bg-editor-bg text-editor-textDark text-[11px] mb-2 select-none border border-editor-border w-fit">
        <Loader2 className="w-3 h-3 animate-spin text-editor-accent" />
        <span className="font-medium">Razonando y procesando herramientas...</span>
      </div>
    );
  }

  const renderThoughtLine = (line: string, index: number) => {
    const isExecuting = line.includes('Ejecutando herramienta');
    const isCompleted = line.includes('Herramienta') && (line.includes('completada') || line.includes('finalizada'));
    const isWarning = line.includes('ADVERTENCIA') || line.includes('Advertencia') || line.includes('⚠️');

    if (isExecuting) {
      const toolMatch = line.match(/`([^`]+)`/);
      const toolName = toolMatch ? toolMatch[1] : 'herramienta';
      return (
        <div key={index} className="flex items-center gap-2 py-1 px-1.5 text-editor-textDark text-[11px] font-sans">
          <Loader2 className="w-3 h-3 animate-spin text-sky-400 shrink-0" />
          <span>Ejecutando <code className="px-1.5 py-0.5 rounded bg-editor-active font-mono text-[10px] text-sky-300 border border-editor-border font-semibold">{toolName}</code></span>
        </div>
      );
    }

    if (isCompleted) {
      const toolMatch = line.match(/`([^`]+)`/);
      const toolName = toolMatch ? toolMatch[1] : 'herramienta';
      return (
        <div key={index} className="flex items-center gap-2 py-1 px-1.5 text-editor-text text-[11px] font-sans">
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>Herramienta <code className="px-1.5 py-0.5 rounded bg-emerald-950/30 font-mono text-[10px] text-emerald-300 border border-emerald-900/40 font-semibold">{toolName}</code> finalizada.</span>
        </div>
      );
    }

    if (isWarning) {
      return (
        <div key={index} className="flex items-start gap-2 py-1 px-1.5 text-amber-300 text-[11px] font-sans">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>{line.replace(/^\[ADVERTENCIA\]\s*/i, '').replace('⚠️', '').trim()}</span>
        </div>
      );
    }

    return (
      <div key={index} className="text-editor-textDark text-[11px] font-mono leading-relaxed pl-2 border-l border-editor-border py-0.5 my-0.5 select-text selection:bg-editor-active">
        {line}
      </div>
    );
  };

  const thoughtLines = thought.split('\n').filter(l => l.trim().length > 0);

  return (
    <div className="mb-3 border border-editor-border rounded-[4px] overflow-hidden bg-editor-bg transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-editor-hover text-[11px] text-editor-textDark transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-editor-textDark" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-editor-textDark" />
          )}
          {isThinking ? (
            <Loader2 className="w-3 h-3 animate-spin text-editor-accent" />
          ) : (
            <Brain className="w-3.5 h-3.5 text-editor-accent" />
          )}
          <span className="text-editor-text font-medium">
            {isThinking ? 'Razonando y ejecutando tareas...' : 'Proceso de razonamiento'}
          </span>
        </div>
        <span className="text-[10px] text-editor-textDark">
          {thoughtLines.length} {thoughtLines.length === 1 ? 'paso' : 'pasos'}
        </span>
      </button>
      {isOpen && (
        <div className="px-2.5 py-2 border-t border-editor-border bg-editor-sidebar flex flex-col gap-1">
          {thoughtLines.map((line, idx) => renderThoughtLine(line, idx))}
        </div>
      )}
    </div>
  );
};

export const AIPanel: React.FC = () => {
  const { isAIPanelOpen, aiPanelWidth } = useLayoutStore();
  const { workspacePath, fileTree, explorerSelectedPath, activeTabPath, updateFileBuffer } = useWorkspaceStore();
  const { 
    messages, providers, activeProvider, isGenerating, incomingStreamText, error,
    conversations, activeConversationId,
    initializeStore, setActiveProvider, selectModel, sendMessage, clearHistory, abortChat,
    createConversation, selectConversation, deleteConversation
  } = useAIStore();

  const [prompt, setPrompt] = useState('');
  const [agentModeType, setAgentModeType] = useState<'agent' | 'chat' | 'review'>('agent');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content?: string; image?: string }>>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flatten all workspace files for instant @ mention lookup
  const allWorkspaceFiles = useMemo(() => {
    const list: Array<{ name: string; path: string; relPath: string; isDir: boolean }> = [];
    const walk = (nodes: typeof fileTree) => {
      for (const n of nodes) {
        const rel = workspacePath && n.path.startsWith(workspacePath)
          ? n.path.slice(workspacePath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
          : n.name;
        list.push({ name: n.name, path: n.path, relPath: rel, isDir: n.isDirectory });
        if (n.children) walk(n.children);
      }
    };
    walk(fileTree);
    return list;
  }, [fileTree, workspacePath]);

  // Filtered files for @ mention popover
  const filteredMentionFiles = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allWorkspaceFiles.filter((f: { name: string; path: string; relPath: string; isDir: boolean }) => !f.isDir && (f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q))).slice(0, 8);
  }, [allWorkspaceFiles, mentionQuery]);

  // Initialize key store on mount and reload on workspace switch
  useEffect(() => {
    initializeStore();
  }, [workspacePath]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, incomingStreamText]);

  // Adjust textarea height on typing
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(160, Math.max(38, textareaRef.current.scrollHeight))}px`;
    }
  }, [prompt]);

  if (!isAIPanelOpen) return null;

  // Active Key Check
  const activeKeysConfigured = Object.values(providers).some(p => p.key.trim().length > 0);
  const currentProviderData = providers[activeProvider];
  const hasActiveKey = currentProviderData?.key.trim().length > 0;
  const configuredProviderOptions = Object.entries(providers)
    .map(([id]) => ({ value: id, label: PROVIDER_LABELS[id] ?? id }));
  const modelOptions = hasActiveKey
    ? currentProviderData.availableModels.map((model) => ({ value: model, label: model }))
    : [];
  const hasConfiguredModel = hasActiveKey && currentProviderData.activeModel && modelOptions.length > 0;

  // Get active explorer path context names
  const getContextInfo = () => {
    let contextName = 'Raíz del proyecto';
    let isFolder = true;

    if (explorerSelectedPath && workspacePath) {
      const parts = explorerSelectedPath.split(/[/\\]/);
      contextName = parts[parts.length - 1];
      if (contextName.includes('.')) {
        isFolder = false;
      }
    } else if (workspacePath) {
      const parts = workspacePath.split(/[/\\]/);
      contextName = parts[parts.length - 1];
    }

    const projectMdExists = fileTree.some(n => n.name.toLowerCase() === 'project.md');

    return { name: contextName, isFolder, projectMdExists };
  };

  const contextInfo = getContextInfo();

  // Insert selected @ mention
  const insertMention = (file: { name: string; relPath: string; path: string }) => {
    if (!textareaRef.current) return;
    const caret = textareaRef.current.selectionStart || prompt.length;
    const textBeforeCaret = prompt.slice(0, caret);
    const textAfterCaret = prompt.slice(caret);
    const newTextBefore = textBeforeCaret.replace(/@([a-zA-Z0-9_\-\.\/]*)$/, `@${file.relPath} `);
    setPrompt(newTextBefore + textAfterCaret);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 10);
  };

  // Submit Prompt
  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt !== undefined ? customPrompt : prompt;
    if (!textToSend.trim() && attachedFiles.length === 0) return;
    if (isGenerating) return;

    setPrompt('');
    setShowCommands(false);
    setMentionQuery(null);

    let rawText = textToSend.trim();

    // Direct slash command execution fallback (if typed directly)
    if (rawText.startsWith('/')) {
      const parts = rawText.split(/\s+/);
      const cmdKey = parts[0].toLowerCase();
      const matchedCmd = SLASH_COMMANDS.find(c => c.cmd.toLowerCase() === cmdKey);
      if (matchedCmd) {
        if (matchedCmd.cmd === '/clear') {
          clearHistory();
          return;
        }
        if (matchedCmd.cmd === '/models') {
          setIsModalOpen(true);
          return;
        }
        if (matchedCmd.actionPrompt) {
          const args = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
          rawText = matchedCmd.actionPrompt(args);
        }
      }
    }

    let finalPrompt = rawText;
    let attachedImage: string | null = null;

    // Extract @ mentions
    const mentionMatches = Array.from(finalPrompt.matchAll(/@([a-zA-Z0-9_\-\.\/]+)/g)).map(m => m[1]);
    const mentionedPaths: string[] = [];
    for (const m of mentionMatches) {
      if (m === 'workspace') continue;
      const found = allWorkspaceFiles.find((f: { name: string; path: string; relPath: string; isDir: boolean }) => f.relPath.toLowerCase() === m.toLowerCase() || f.name.toLowerCase() === m.toLowerCase());
      if (found && !mentionedPaths.includes(found.path)) {
        mentionedPaths.push(found.path);
      }
    }

    // Process attached files
    if (attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        if (file.image) {
          attachedImage = file.image;
        } else if (file.content) {
          finalPrompt += `\n\n### Archivo adjunto: ${file.name}\n\`\`\`\n${file.content}\n\`\`\``;
        }
      }
      setAttachedFiles([]);
    }

    // Apply Mode behavior prefix
    if (agentModeType === 'chat') {
      finalPrompt = `[MODO CHAT / SOLO LECTURA: No ejecutes herramientas de modificación de archivos ni terminal. Responde de forma puramente conversacional y explicativa.]\n\n${finalPrompt}`;
    } else if (agentModeType === 'review') {
      finalPrompt = `[MODO REVIEW / CRÍTICA ARQUITECTÓNICA: Realiza una auditoría exhaustiva del código analizando Clean Architecture, principios SOLID, mantenibilidad, edge cases y rendimiento.]\n\n${finalPrompt}`;
    }

    // Compile active context including explicit mentions
    let contextText = null;
    try {
      const compiled = await compileContext(workspacePath, fileTree, explorerSelectedPath, mentionedPaths);
      contextText = compiled.text;
    } catch (e) {
      console.error('Failed to compile context:', e);
    }

    await sendMessage(finalPrompt, contextText, attachedImage);
  };

  const handleStop = () => {
    try {
      abortChat();
    } catch (err) {
      console.error('Failed to abort chat:', err);
    }
  };

  // Handle File Attachment
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const image = ev.target?.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, image }]);
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, content }]);
      };
      reader.readAsText(file);
    }

    if (e.target) e.target.value = '';
  };

  // Filter slash commands dynamically based on typed prefix
  const filteredCommands = useMemo(() => {
    if (!prompt.startsWith('/')) return SLASH_COMMANDS;
    const search = prompt.split(/\s+/)[0].toLowerCase();
    return SLASH_COMMANDS.filter(c => c.cmd.toLowerCase().startsWith(search));
  }, [prompt]);

  const handleCommandClick = (slashCmd: SlashCommand) => {
    setShowCommands(false);
    if (slashCmd.cmd === '/clear') {
      clearHistory();
      setPrompt('');
    } else if (slashCmd.cmd === '/models') {
      setIsModalOpen(true);
      setPrompt('');
    } else if (slashCmd.actionPrompt) {
      const parts = prompt.trim().split(/\s+/);
      const args = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
      handleSend(slashCmd.actionPrompt(args));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applyToActiveEditor = (code: string, id: string) => {
    if (!activeTabPath) {
      copyToClipboard(code, id);
      return;
    }
    updateFileBuffer(activeTabPath, code);
    setAppliedId(id);
    setTimeout(() => setAppliedId(null), 1800);
  };

  // Format assistant message content to display code blocks neatly
  const renderMessageContent = (content: string, id: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    const renderInlineCode = (text: string) => {
      const codeParts = text.split(/(`.*?`)/g);
      return codeParts.map((codePart, idx) => {
        if (codePart.startsWith('`') && codePart.endsWith('`')) {
          return (
            <code 
              key={`c-${idx}`} 
              className="px-1.5 py-0.5 mx-0.5 rounded bg-editor-hover font-mono text-[11.5px] text-[#ce9178] border border-editor-border select-all"
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
            <strong key={`b-${idx}`} className="font-semibold text-editor-text">
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
          <div key={idx} className="my-2.5 rounded-[5px] overflow-hidden border border-editor-border bg-editor-bg">
            {/* VS Code CodeBlock Header Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-editor-sidebar text-[11px] text-editor-textDark border-b border-editor-border font-mono select-none">
              <span className="font-bold text-editor-text uppercase text-[10px] tracking-wider">
                {firstLine || 'code'}
              </span>
              <div className="flex items-center gap-2">
                {activeTabPath && (
                  <button 
                    onClick={() => applyToActiveEditor(code, codeId)}
                    className="flex items-center gap-1 text-editor-textDark hover:text-editor-text transition-colors text-[11px]"
                    title="Insertar en el archivo abierto"
                  >
                    {appliedId === codeId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Aplicado</span>
                      </>
                    ) : (
                      <>
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>Aplicar en editor</span>
                      </>
                    )}
                  </button>
                )}
                <button 
                  onClick={() => copyToClipboard(code, codeId)}
                  className="flex items-center gap-1 text-editor-textDark hover:text-editor-text transition-colors text-[11px]"
                  title="Copiar código"
                >
                  {copiedId === codeId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            {/* Code Body */}
            <pre className="p-3 text-[12px] font-mono text-editor-text overflow-x-auto leading-relaxed whitespace-pre select-text selection:bg-editor-active">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      return (
        <span 
          key={idx} 
          className="text-[13px] leading-[1.55] whitespace-pre-wrap select-text selection:bg-editor-active break-words text-editor-text"
        >
          {renderInlineMarkdown(part)}
        </span>
      );
    });
  };

  const renderAssistantMessage = (content: string, id: string) => {
    const { thought, response, isThinking } = parseMessageThinking(content);

    return (
      <div className="flex flex-col gap-1.5">
        {thought.trim() && (
          <ThoughtBlock thought={thought} isThinking={isThinking} />
        )}
        {response.trim() && (
          <div className="flex flex-col gap-1">
            {renderMessageContent(response, id)}
          </div>
        )}
        {!response.trim() && isThinking && (
          <div className="flex items-center gap-2 text-editor-textDark text-[12px] select-none py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-editor-accent" />
            <span>Generando respuesta...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      style={{ width: `${aiPanelWidth}px` }}
      className="h-full bg-editor-sidebar border border-editor-border rounded-[6px] flex flex-col relative select-none shrink-0 font-sans shadow-sm overflow-hidden"
    >
      {/* Top bar header (VS Code Style) */}
      <div className="h-[35px] min-h-[35px] bg-editor-sidebar border-b border-editor-border flex items-center justify-between px-3 select-none app-non-draggable">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold text-editor-text tracking-wider uppercase shrink-0">
            CHAT
          </span>

          {activeKeysConfigured ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <StyledSelect
                value={activeProvider}
                options={configuredProviderOptions}
                onChange={setActiveProvider}
                placeholder="Proveedor"
                disabled={configuredProviderOptions.length <= 1}
                className="w-auto shrink-0"
                buttonClassName="border border-editor-border bg-editor-active hover:bg-editor-hover px-2 py-0.5 rounded text-[11px] font-medium text-editor-text h-6 flex items-center gap-1"
              />

              {hasConfiguredModel && (
                <StyledSelect
                  value={currentProviderData.activeModel}
                  options={modelOptions}
                  onChange={(model) => selectModel(activeProvider, model)}
                  placeholder="Modelo"
                  disabled={modelOptions.length <= 1}
                  className="max-w-[140px] min-w-0 shrink"
                  buttonClassName="border border-editor-border bg-editor-active hover:bg-editor-hover px-2 py-0.5 rounded text-[11px] font-medium text-editor-text h-6 flex items-center gap-1 truncate"
                />
              )}
            </div>
          ) : null}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-0.5">
          {activeKeysConfigured && (
            <button
              onClick={createConversation}
              className="p-1 hover:bg-editor-hover text-editor-textDark hover:text-editor-text rounded transition-colors"
              title="Nuevo chat (+)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className={`p-1 rounded transition-colors ${
              showHistoryPanel 
                ? 'bg-editor-active text-editor-text' 
                : 'hover:bg-editor-hover text-editor-textDark hover:text-editor-text'
            }`}
            title="Historial de sesiones"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {messages.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('¿Vaciar la conversación actual?')) {
                  clearHistory();
                }
              }}
              className="p-1 hover:bg-editor-hover text-editor-textDark hover:text-editor-text rounded transition-colors"
              title="Limpiar conversación"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1 hover:bg-editor-hover text-editor-textDark hover:text-editor-text rounded transition-colors"
            title="Configurar proveedores de IA"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chat History Panel Popover */}
      {showHistoryPanel && (
        <div className="absolute top-9 right-2 w-72 bg-editor-bg border border-editor-border rounded-[6px] shadow-2xl overflow-hidden z-50 select-none max-h-[380px] flex flex-col animate-slide-down">
          <div className="px-3 py-2 border-b border-editor-border bg-editor-sidebar flex items-center justify-between">
            <span className="text-[11px] font-semibold text-editor-text uppercase tracking-wider">Historial de Conversaciones</span>
            <button 
              onClick={() => setShowHistoryPanel(false)}
              className="text-editor-textDark hover:text-editor-text p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="p-2 border-b border-editor-border bg-editor-sidebar">
            <button
              onClick={() => {
                createConversation();
                setShowHistoryPanel(false);
              }}
              className="w-full bg-editor-accent text-editor-sidebar font-semibold text-[12px] py-1 px-3 rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva conversación</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5 max-h-[260px]">
            {conversations.length === 0 ? (
              <div className="text-center py-4 text-[11px] text-editor-textDark">
                Sin conversaciones previas
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <div
                    key={conv.id}
                    className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded text-[12px] cursor-pointer transition-colors ${
                      isActive 
                        ? 'bg-editor-active text-editor-text font-medium border border-editor-border' 
                        : 'hover:bg-editor-hover text-editor-text'
                    }`}
                    onClick={() => {
                      selectConversation(conv.id);
                      setShowHistoryPanel(false);
                    }}
                  >
                    <span className="truncate pr-6 select-none max-w-[200px]" title={conv.title}>
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('¿Eliminar esta conversación?')) {
                          deleteConversation(conv.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-all shrink-0 ml-1 absolute right-2"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. Conversation Area / History */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {!activeKeysConfigured ? (
          /* Welcome screen when no keys are configured */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
            <div className="w-12 h-12 bg-editor-hover rounded-xl flex items-center justify-center border border-editor-border shadow mb-4">
              <Sparkles className="w-6 h-6 text-editor-accent animate-pulse" />
            </div>
            <h2 className="text-[13px] font-semibold text-editor-text mb-1.5 tracking-wide">Spigot Copilot</h2>
            <p className="text-[12px] text-editor-textDark leading-relaxed mb-5 max-w-[240px]">
              Configurá una clave de API para activar el asistente de IA y empezar a construir en tu proyecto.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-editor-accent text-editor-sidebar font-semibold text-[12px] px-4 py-1.5 rounded flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configurar API Key</span>
            </button>
          </div>
        ) : !hasActiveKey ? (
          /* Warning when the active provider doesn't have a key configured */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
            <ShieldAlert className="w-9 h-9 text-amber-500 mb-3" />
            <h3 className="text-[13px] font-semibold text-editor-text mb-1.5">Falta API Key para {PROVIDER_LABELS[activeProvider] || activeProvider.toUpperCase()}</h3>
            <p className="text-[12px] text-editor-textDark leading-relaxed mb-4 max-w-[220px]">
              Ingresá tu clave para este proveedor para continuar utilizando el chat.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="border border-editor-border bg-editor-active hover:bg-editor-hover text-editor-text text-[12px] px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Ingresar Clave</span>
            </button>
          </div>
        ) : messages.length === 0 ? (
          /* Empty Chat Welcome with VS Code Quick Prompts */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-editor-textDark select-none">
            <div className="w-10 h-10 rounded-full bg-editor-hover border border-editor-border flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-editor-accent" />
            </div>
            <span className="text-[13px] font-semibold text-editor-text mb-1">Spigot Copilot</span>
            <p className="text-[11.5px] text-editor-textDark leading-relaxed max-w-[260px] mb-5">
              Preguntá sobre tu código, generá funciones, encontrá errores o realizá cambios con contexto automático.
            </p>

            {/* Quick Action Suggestions */}
            <div className="w-full flex flex-col gap-2 max-w-[280px]">
              <button
                onClick={() => handleSend('Analizá el código del archivo activo y explicá su estructura y funcionamiento principal.')}
                className="w-full text-left p-2 rounded-[5px] bg-editor-bg hover:bg-editor-hover border border-editor-border text-[12px] text-editor-text flex items-center gap-2 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">Explicar código activo</span>
              </button>

              <button
                onClick={() => handleSend('Revisá el código actual en busca de bugs, vulnerabilidades o problemas de rendimiento y proponé soluciones.')}
                className="w-full text-left p-2 rounded-[5px] bg-editor-bg hover:bg-editor-hover border border-editor-border text-[12px] text-editor-text flex items-center gap-2 transition-all"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Buscar y corregir errores</span>
              </button>

              <button
                onClick={() => handleSend('Refactorizá este código para hacerlo más limpio, eficiente y mantenible.')}
                className="w-full text-left p-2 rounded-[5px] bg-editor-bg hover:bg-editor-hover border border-editor-border text-[12px] text-editor-text flex items-center gap-2 transition-all"
              >
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Refactorizar código</span>
              </button>

              <button
                onClick={() => handleSend('Analizá los cambios en Git pendientes en el workspace y sugerime mensajes de commit apropiados.')}
                className="w-full text-left p-2 rounded-[5px] bg-editor-bg hover:bg-editor-hover border border-editor-border text-[12px] text-editor-text flex items-center gap-2 transition-all"
              >
                <Terminal className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">Revisar cambios de Git</span>
              </button>
            </div>
          </div>
        ) : (
          /* Active Chat Messages */
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className="flex flex-col gap-1.5">
                  {/* Message Header */}
                  <div className="flex items-center justify-between text-[11px] text-editor-textDark select-none px-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {isUser ? (
                        <div className="w-4 h-4 rounded-full bg-editor-active text-editor-text flex items-center justify-center text-[9px] font-bold">
                          U
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-editor-active border border-editor-border text-editor-accent flex items-center justify-center">
                          <Sparkles className="w-2.5 h-2.5" />
                        </div>
                      )}
                      <span className={isUser ? 'text-editor-text' : 'text-editor-accent'}>
                        {isUser ? 'Tú' : 'Spigot Copilot'}
                      </span>
                    </div>

                    {isUser && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="hover:text-editor-text p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
                        title="Copiar consulta"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Message Body Container */}
                  <div 
                    className={`rounded-[6px] p-2.5 text-[13px] leading-[1.55] ${
                      isUser 
                        ? 'bg-editor-active border border-editor-border text-editor-text' 
                        : 'bg-editor-bg border border-editor-border text-editor-text'
                    }`}
                  >
                    {isUser ? (
                      <div className="flex flex-col gap-2">
                        {msg.image && (
                          <div className="w-full max-w-[240px] rounded overflow-hidden border border-editor-border select-none">
                            <img src={msg.image} alt="Adjunto" className="w-full object-contain" />
                          </div>
                        )}
                        <span className="select-text selection:bg-editor-hover whitespace-pre-wrap break-words font-sans">
                          {msg.content}
                        </span>
                      </div>
                    ) : (
                      renderAssistantMessage(msg.content, msg.id)
                    )}
                  </div>
                </div>
              );
            })}

            {/* Dynamic Real-time Incoming SSE Stream */}
            {isGenerating && incomingStreamText && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-editor-accent select-none px-1 font-medium">
                  <div className="w-4 h-4 rounded-full bg-editor-active border border-editor-border text-editor-accent flex items-center justify-center">
                    <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                  </div>
                  <span>Spigot Copilot</span>
                </div>
                <div className="rounded-[6px] p-2.5 text-[13px] leading-[1.55] bg-editor-bg border border-editor-border text-editor-text">
                  {renderAssistantMessage(incomingStreamText, 'streaming')}
                </div>
              </div>
            )}

            {/* Loader indicator while waiting for the first chunk */}
            {isGenerating && !incomingStreamText && (
              <div className="flex items-center gap-2 text-editor-textDark text-[12px] bg-editor-bg px-3 py-2 rounded-[6px] border border-editor-border select-none w-fit">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-editor-accent" />
                <span>Analizando contexto y generando...</span>
              </div>
            )}

            {/* Error notifications */}
            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-[5px] bg-red-950/20 border border-red-900/40 text-red-400 text-[12px] select-text">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">Error del Agente:</span>
                  <span className="leading-relaxed">{error}</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 4. Bottom Input Area (VS Code Copilot Chat Style) */}
      <div className="p-3 border-t border-editor-border bg-editor-sidebar flex flex-col gap-2 relative">
        {/* Slash Command Popover */}
        {showCommands && filteredCommands.length > 0 && (
          <div className="absolute left-3 bottom-[calc(100%+8px)] right-3 bg-editor-bg border border-editor-border rounded-lg shadow-2xl overflow-hidden z-50 select-none animate-slide-up ring-1 ring-black/40">
            <div className="px-3 py-2 border-b border-editor-border bg-editor-sidebar flex items-center justify-between text-[11px] font-semibold">
              <span className="uppercase tracking-wider text-sky-400 font-bold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                Comandos Spigot ({filteredCommands.length})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-editor-text/60 font-normal">↑↓ Navegar • Enter Ejecutar</span>
                <button 
                  onClick={() => setShowCommands(false)}
                  className="text-editor-text/70 hover:text-editor-text hover:bg-editor-hover p-1 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-col max-h-[260px] overflow-y-auto">
              {filteredCommands.map((c, idx) => {
                const isSelected = idx === commandIndex;
                return (
                  <button
                    key={c.cmd}
                    onClick={() => handleCommandClick(c)}
                    className={`px-3 py-2 text-left transition-colors flex flex-col gap-1 border-b border-editor-border/40 last:border-0 ${
                      isSelected
                        ? 'bg-editor-active text-editor-text border-l-2 border-sky-400'
                        : 'hover:bg-editor-hover text-editor-text'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[12.5px] font-mono font-bold text-sky-400 dark:text-cyan-300">
                          {c.cmd}
                        </span>
                        <span className="text-[11.5px] font-semibold text-editor-text truncate">
                          — {c.label}
                        </span>
                      </div>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-editor-hover border border-editor-border/80 text-editor-text/80 font-mono shrink-0">
                        {c.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-editor-text/80 leading-snug line-clamp-2">
                      {c.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* @ Mention File Popover */}
        {mentionQuery !== null && filteredMentionFiles.length > 0 && (
          <div className="absolute left-3 bottom-[calc(100%+8px)] right-3 bg-editor-bg border border-editor-border rounded-lg shadow-2xl overflow-hidden z-50 select-none animate-slide-up ring-1 ring-black/40">
            <div className="px-3 py-2 border-b border-editor-border bg-editor-sidebar flex items-center justify-between text-[11px] font-semibold">
              <span className="uppercase tracking-wider flex items-center gap-1.5 text-sky-400 font-bold">
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                Mencionar archivo (@)
              </span>
              <span className="text-[10.5px] text-editor-text/60 font-normal">
                ↑↓ Navegar • Enter Seleccionar
              </span>
            </div>
            <div className="flex flex-col max-h-[220px] overflow-y-auto">
              {filteredMentionFiles.map((file: { name: string; path: string; relPath: string; isDir: boolean }, idx: number) => {
                const isSelected = idx === mentionIndex;
                return (
                  <button
                    key={file.path}
                    onClick={() => insertMention(file)}
                    className={`px-3 py-2 text-left transition-colors flex items-center justify-between border-b border-editor-border/40 last:border-0 ${
                      isSelected
                        ? 'bg-editor-active text-editor-text border-l-2 border-sky-400'
                        : 'hover:bg-editor-hover text-editor-text'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-sky-400' : 'text-editor-text/70'}`} />
                      <span className="text-[12px] font-medium text-editor-text truncate">{file.name}</span>
                    </div>
                    <span className="text-[10.5px] text-editor-text/70 truncate max-w-[160px] font-mono">
                      {file.relPath}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Embedded Input Box */}
        <div className="bg-editor-bg border border-editor-border focus-within:border-editor-accent focus-within:ring-1 focus-within:ring-editor-accent rounded-[6px] p-2 flex flex-col gap-1.5 transition-all">
          {/* Active Context Chips & OpenCode Mode Selector */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 select-none pb-1 border-b border-editor-border/30">
            <div className="flex items-center gap-1 flex-wrap">
              <div className="bg-editor-hover text-editor-accent border border-editor-border text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 font-medium" title="Contexto del workspace incluido">
                <span>@workspace</span>
              </div>

              <div className="bg-editor-active text-editor-text border border-editor-border text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 font-medium truncate max-w-[120px]" title={explorerSelectedPath || workspacePath || ''}>
                {contextInfo.isFolder ? (
                  <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                ) : (
                  <FileText className="w-3 h-3 text-sky-400 shrink-0" />
                )}
                <span className="truncate">{contextInfo.name}</span>
              </div>

              {attachedFiles.map((file, idx) => (
                <div key={idx} className="bg-emerald-950/30 text-emerald-300 border border-emerald-900/40 text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                  <Paperclip className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[80px]">{file.name}</span>
                  <button
                    onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                    className="hover:text-white"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Mode Pills: Agent | Chat | Review */}
            <div className="flex items-center bg-editor-sidebar rounded-md border border-editor-border p-0.5 text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setAgentModeType('agent')}
                className={`px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${
                  agentModeType === 'agent'
                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 shadow-xs'
                    : 'text-editor-textDark hover:text-editor-text'
                }`}
                title="Modo Agente: ejecución autónoma y edición de archivos"
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>Agente</span>
              </button>
              <button
                type="button"
                onClick={() => setAgentModeType('chat')}
                className={`px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${
                  agentModeType === 'chat'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-xs'
                    : 'text-editor-textDark hover:text-editor-text'
                }`}
                title="Modo Chat: sólo lectura y explicaciones"
              >
                <span>Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setAgentModeType('review')}
                className={`px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${
                  agentModeType === 'review'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-xs'
                    : 'text-editor-textDark hover:text-editor-text'
                }`}
                title="Modo Review: auditoría arquitectónica"
              >
                <span>Review</span>
              </button>
            </div>
          </div>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              const val = e.target.value;
              setPrompt(val);
              if (val.startsWith('/') && !val.includes(' ') && !showCommands) {
                setShowCommands(true);
              } else if (!val.startsWith('/') && showCommands) {
                setShowCommands(false);
              }
              const caret = e.target.selectionStart || val.length;
              const textBefore = val.slice(0, caret);
              const match = textBefore.match(/@([a-zA-Z0-9_\-\.\/]*)$/);
              if (match) {
                setMentionQuery(match[1]);
                setMentionIndex(0);
              } else {
                setMentionQuery(null);
              }
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && filteredMentionFiles.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex(prev => (prev + 1) % filteredMentionFiles.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(prev => (prev - 1 + filteredMentionFiles.length) % filteredMentionFiles.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  insertMention(filteredMentionFiles[mentionIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  setMentionQuery(null);
                  return;
                }
              }

              if (showCommands && filteredCommands.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCommandIndex(prev => (prev + 1) % filteredCommands.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  handleCommandClick(filteredCommands[commandIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  setShowCommands(false);
                  return;
                }
              }

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Preguntale a Spigot (@archivo para contexto, / para comandos)..."
            disabled={!hasActiveKey}
            rows={1}
            className="w-full bg-transparent border-0 outline-none text-[13px] text-editor-text placeholder:text-editor-textDark resize-none leading-relaxed min-h-[38px] max-h-[160px] p-0 font-sans"
          />

          {/* Bottom Action Row inside Input Box */}
          <div className="flex items-center justify-between pt-1 border-t border-editor-border/40">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-editor-textDark hover:text-editor-text hover:bg-editor-hover rounded transition-colors"
                title="Adjuntar archivo o imagen"
              >
                <Paperclip className="w-4 h-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </button>

              <button
                type="button"
                onClick={() => setShowCommands(!showCommands)}
                className="px-1.5 py-0.5 text-editor-text hover:text-editor-accent hover:bg-editor-hover rounded text-[11px] font-mono font-bold transition-colors"
                title="Comandos rápidos (/)"
              >
                /
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="bg-red-600 hover:bg-red-500 text-white p-1 rounded-full flex items-center justify-center transition-colors shadow-sm"
                  title="Detener generación"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!prompt.trim() && attachedFiles.length === 0}
                  className={`p-1 rounded-full flex items-center justify-center transition-all ${
                    prompt.trim() || attachedFiles.length > 0
                      ? 'bg-editor-accent text-editor-sidebar shadow-sm' 
                      : 'bg-editor-hover text-editor-textDark cursor-default opacity-50'
                  }`}
                  title="Enviar consulta (Enter)"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ApiKeyModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default AIPanel;
