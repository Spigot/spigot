import React, { useState, useEffect, useRef } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAIStore } from '../../store/aiStore';
import { compileContext } from './contextCompiler';
import { ApiKeyModal } from './ApiKeyModal';
import { StyledSelect } from './StyledSelect';
import { 
  Sparkles, Settings, Send, HelpCircle, 
  ShieldAlert, Folder, FileText, 
  Loader2, AlertCircle, Copy, Check, Key, X
} from 'lucide-react';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
};

export const AIPanel: React.FC = () => {
  const { isAIPanelOpen, aiPanelWidth, setAIPanelWidth } = useLayoutStore();
  const { workspacePath, fileTree, explorerSelectedPath } = useWorkspaceStore();
  const { 
    messages, providers, activeProvider, isGenerating, incomingStreamText, error,
    initializeStore, setActiveProvider, selectModel, sendMessage, clearHistory
  } = useAIStore();

  const [prompt, setPrompt] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize key store on mount
  useEffect(() => {
    initializeStore();
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, incomingStreamText]);

  // Adjust textarea height on typing
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(180, textareaRef.current.scrollHeight)}px`;
    }
  }, [prompt]);

  if (!isAIPanelOpen) return null;

  // Active Key Check
  const activeKeysConfigured = Object.values(providers).some(p => p.key.trim().length > 0);
  const currentProviderData = providers[activeProvider];
  const hasActiveKey = currentProviderData?.key.trim().length > 0;
  const configuredProviderOptions = Object.entries(providers)
    .filter(([, provider]) => provider.key.trim().length > 0)
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
      // Simple heuristic: if it has an extension, it's a file
      if (contextName.includes('.')) {
        isFolder = false;
      }
    } else if (workspacePath) {
      const parts = workspacePath.split(/[/\\]/);
      contextName = parts[parts.length - 1] + ' (Raíz)';
    }

    const projectMdExists = fileTree.some(n => n.name.toLowerCase() === 'project.md');

    return { name: contextName, isFolder, projectMdExists };
  };

  const contextInfo = getContextInfo();

  // Resize handler (drag-resizing from left border)
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = aiPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Subtract deltaX because dragging left (negative deltaX) should increase panel width
      const newWidth = Math.max(260, Math.min(650, startWidth - deltaX));
      setAIPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Submit Prompt
  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || prompt;
    if (!textToSend.trim() || isGenerating) return;

    setPrompt('');
    setShowCommands(false);

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

  // Slash commands
  const commands = [
    { cmd: '/explain', label: 'Explicar código', desc: 'Explica el código seleccionado en detalle' },
    { cmd: '/fix', label: 'Corregir errores', desc: 'Encuentra y corrige errores en el contexto activo' },
    { cmd: '/refactor', label: 'Refactorizar', desc: 'Optimiza, limpia y refactoriza el código' },
    { cmd: '/clear', label: 'Limpiar chat', desc: 'Limpia el historial de chat actual' },
    { cmd: '/help', label: 'Ayuda', desc: 'Muestra los comandos disponibles' },
  ];

  const handleCommandClick = (cmd: string) => {
    if (cmd === '/clear') {
      clearHistory();
      setShowCommands(false);
    } else if (cmd === '/help') {
      setPrompt('¿Cómo puedo usar los comandos del agente? Muestra una guía.');
      setShowCommands(false);
    } else if (cmd === '/explain') {
      handleSend('Analizá detalladamente este código, explicá su arquitectura y cómo funciona.');
    } else if (cmd === '/fix') {
      handleSend('Buscá posibles fallos, bugs o problemas de rendimiento en este código y mostrá cómo corregirlos.');
    } else if (cmd === '/refactor') {
      handleSend('Refactorizá este código para que sea más legible, limpio y eficiente, aplicando principios SOLID.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Format assistant message content to display code blocks neatly
  const renderMessageContent = (content: string, id: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, idx) => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const firstLine = lines[0].replace('```', '').trim();
        const code = lines.slice(1, -1).join('\n');
        const codeId = `${id}-${idx}`;

        return (
          <div key={idx} className="my-3 border border-editor-border rounded-lg overflow-hidden bg-editor-bg">
            <div className="flex items-center justify-between px-3 py-1.5 bg-editor-hover/50 text-[10px] text-editor-textDark border-b border-editor-border">
              <span className="font-mono uppercase font-bold">{firstLine || 'code'}</span>
              <button 
                onClick={() => copyToClipboard(code, codeId)}
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
            <pre className="p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed whitespace-pre select-text selection:bg-zinc-800">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      return (
        <span 
          key={idx} 
          className="text-xs leading-relaxed whitespace-pre-wrap select-text selection:bg-zinc-800 break-words"
        >
          {part}
        </span>
      );
    });
  };

  return (
    <div 
      style={{ width: `${aiPanelWidth}px` }}
      className="h-full bg-editor-sidebar border-l border-editor-border flex flex-col relative select-none shrink-0"
    >
      {/* 1. Left drag resizer handle */}
      <div 
        onMouseDown={handleResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-zinc-700/80 active:bg-white z-40 transition-all-custom"
      />

      {/* 2. Top bar header */}
      <div className="h-9 min-h-[36px] bg-editor-titleBar border-b border-editor-border flex items-center justify-between pl-3 pr-2 select-none app-non-draggable">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-editor-accent shrink-0" />
          
          {activeKeysConfigured ? (
            <>
              <StyledSelect
                value={activeProvider}
                options={configuredProviderOptions}
                onChange={setActiveProvider}
                placeholder="Proveedor"
                disabled={configuredProviderOptions.length <= 1}
                className="w-[104px] shrink-0"
                buttonClassName="border-0 bg-transparent px-0 py-0 text-[11px] font-bold uppercase tracking-wider hover:border-transparent focus:border-transparent"
              />

              {hasConfiguredModel && (
                <>
                  <span className="text-[10px] text-editor-textDark shrink-0">|</span>
                  <StyledSelect
                    value={currentProviderData.activeModel}
                    options={modelOptions}
                    onChange={(model) => selectModel(activeProvider, model)}
                    placeholder="Modelo"
                    disabled={modelOptions.length <= 1}
                    className="max-w-[130px] min-w-0 shrink"
                    buttonClassName="border-0 bg-transparent px-0 py-0 text-[10px] font-medium text-editor-textDark hover:border-transparent hover:text-white focus:border-transparent"
                  />
                </>
              )}
            </>
          ) : (
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-editor-textDark">
              Sin proveedor
            </span>
          )}
        </div>

        {/* Agent settings button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-1 hover:bg-editor-hover text-editor-textDark hover:text-white rounded transition-all-custom"
          title="Ajustes del agente"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. Conversation Area / History */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {!activeKeysConfigured ? (
          /* Welcome screen when no keys are configured */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
            <div className="w-12 h-12 bg-editor-hover rounded-xl flex items-center justify-center border border-zinc-800 shadow-md mb-4">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <h2 className="text-sm font-semibold text-white mb-2 tracking-wide">Asistente Inteligente</h2>
            <p className="text-xs text-editor-textDark leading-relaxed mb-6 max-w-[220px]">
              Ingresá una API Key de tu proveedor preferido para habilitar el agente y empezar a programar juntos.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-white hover:bg-zinc-200 text-black font-semibold text-xs px-4 py-2 rounded-lg shadow active:scale-95 transition-all-custom flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configurar API Key</span>
            </button>
          </div>
        ) : !hasActiveKey ? (
          /* Warning when the active provider doesn't have a key configured */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
            <ShieldAlert className="w-10 h-10 text-amber-500 mb-3" />
            <h3 className="text-xs font-semibold text-white mb-2">Clave faltante para {PROVIDER_LABELS[activeProvider] || activeProvider.toUpperCase()}</h3>
            <p className="text-[11px] text-editor-textDark leading-relaxed mb-4 max-w-[200px]">
              No has configurado una API Key para este proveedor específico.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="border border-editor-border hover:bg-editor-hover text-white text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all-custom flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Ingresar Clave</span>
            </button>
          </div>
        ) : messages.length === 0 ? (
          /* Empty Chat Welcome */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-editor-textDark select-none">
            <Sparkles className="w-8 h-8 opacity-20 mb-3 animate-pulse" />
            <span className="text-xs font-medium text-white mb-1">Agente de IA Activo</span>
            <span className="text-[10px] leading-relaxed max-w-[200px]">
              Escribí tu consulta abajo. Inyectaremos automáticamente el archivo o carpeta seleccionada como contexto.
            </span>
          </div>
        ) : (
          /* Active Chat Messages */
          <>
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col max-w-[90%] rounded-xl p-3 shadow-sm ${
                  msg.role === 'user' 
                    ? 'self-end bg-zinc-800/80 text-white border border-zinc-700/40' 
                    : 'self-start bg-editor-hover/40 text-editor-text border border-editor-border'
                }`}
              >
                <div className="text-[9px] text-editor-textDark font-bold uppercase tracking-wider mb-1 select-none">
                  {msg.role === 'user' ? 'Tú' : 'Agente'}
                </div>
                <div className="flex flex-col gap-1">
                  {msg.role === 'user' ? (
                    <span className="text-xs leading-normal select-text selection:bg-zinc-800 whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    renderMessageContent(msg.content, msg.id)
                  )}
                </div>
              </div>
            ))}

            {/* Dynamic Real-time Incoming SSE Stream */}
            {isGenerating && incomingStreamText && (
              <div className="flex flex-col max-w-[90%] rounded-xl p-3 bg-editor-hover/40 text-editor-text border border-editor-border self-start">
                <div className="text-[9px] text-editor-textDark font-bold uppercase tracking-wider mb-1 select-none">
                  Agente (Streaming...)
                </div>
                <div className="flex flex-col gap-1">
                  {renderMessageContent(incomingStreamText, 'streaming')}
                </div>
              </div>
            )}

            {/* Loader indicator while waiting for the first chunk */}
            {isGenerating && !incomingStreamText && (
              <div className="flex items-center gap-2 text-editor-textDark text-[11px] self-start bg-editor-hover/20 px-3 py-2 rounded-lg border border-editor-border select-none">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Generando respuesta...</span>
              </div>
            )}

            {/* Error notifications */}
            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-950/20 border border-red-900/40 text-red-400 text-[11px] self-start select-text max-w-[95%]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-bold">Error del Agente:</span>
                  <span className="leading-relaxed">{error}</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 4. Bottom Input Area */}
      <div className="p-3 border-t border-editor-border bg-editor-titleBar flex flex-col gap-2 relative">
        
        {/* Slash Command Popover Flotante */}
        {showCommands && (
          <div className="absolute left-3 bottom-[calc(100%+8px)] right-3 bg-editor-bg border border-editor-border rounded-xl shadow-2xl overflow-hidden glass-panel z-50 animate-slide-up select-none max-w-sm">
            <div className="px-3 py-2 border-b border-editor-border bg-editor-titleBar flex items-center justify-between">
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Comandos del Agente</span>
              <button 
                onClick={() => setShowCommands(false)}
                className="text-editor-textDark hover:text-white p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col max-h-[220px] overflow-y-auto">
              {commands.map((c) => (
                <button
                  key={c.cmd}
                  onClick={() => handleCommandClick(c.cmd)}
                  className="px-3 py-2 text-left hover:bg-editor-hover transition-colors flex flex-col gap-0.5 border-b border-editor-border/20 last:border-0"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-white">{c.cmd}</span>
                    <span className="text-[10px] text-editor-textDark font-medium">— {c.label}</span>
                  </div>
                  <span className="text-[10px] text-editor-textDark truncate">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input box wrap */}
        <div className="flex flex-col border border-editor-border rounded-lg bg-editor-hover/30 overflow-hidden focus-within:border-zinc-500 transition-colors">
          {/* Top text prompt textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Pregúntale algo al agente..."
            className="w-full bg-transparent border-0 text-xs px-3 pt-2.5 pb-1 text-white placeholder-zinc-600 outline-none resize-none min-h-[32px] select-text selection:bg-zinc-800 leading-normal"
          />

          {/* Bottom active context bar */}
          <div className="h-7 border-t border-editor-border/40 px-2.5 flex items-center justify-between text-[10px] text-editor-textDark bg-editor-hover/10 select-none">
            <div className="flex items-center gap-1.5 truncate">
              {contextInfo.isFolder ? (
                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              )}
              <span className="truncate max-w-[130px]" title={explorerSelectedPath || workspacePath || ''}>
                {contextInfo.name}
              </span>

              {/* PROJECT.md exists badge */}
              {contextInfo.projectMdExists && (
                <span className="px-1.5 py-0.5 rounded bg-editor-active text-white text-[8px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-0.5 select-none" title="PROJECT.md se incluye automáticamente en el contexto">
                  + PROJECT.md
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 select-none">
              {/* Slash commands button */}
              <button
                onClick={() => setShowCommands(!showCommands)}
                className={`p-1 rounded text-editor-textDark hover:text-white hover:bg-editor-hover flex items-center justify-center font-bold text-xs tracking-wider transition-all-custom w-5 h-5`}
                title="Comandos rápidos"
              >
                /
              </button>

              {/* Stop / Send Button */}
              {isGenerating ? (
                <button
                  onClick={() => (window as any).api.ai.abortChat()}
                  className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded flex items-center justify-center transition-all-custom w-5 h-5 animate-pulse"
                  title="Cancelar generación"
                >
                  <HelpCircle className="w-3.5 h-3.5 animate-spin" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!prompt.trim() || !hasActiveKey}
                  className="p-1 text-editor-textDark hover:text-white disabled:opacity-30 disabled:hover:text-editor-textDark rounded flex items-center justify-center transition-all-custom w-5 h-5"
                  title="Enviar"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Key configurator modal element */}
      <ApiKeyModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
export default AIPanel;
