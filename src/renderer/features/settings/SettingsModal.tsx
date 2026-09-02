import React, { useState, useEffect } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAIStore } from '../../store/aiStore';
import { 
  Settings, X, Search, Palette, Code, Terminal, GitBranch, 
  Sparkles, Keyboard, Check, Eye, EyeOff, ChevronDown, AlertCircle, LogIn,
  Plus
} from 'lucide-react';
import { ProviderIcon } from '../../components/ui/ProviderIcon';
import { GentleRoleSettingsFields } from '../ai-panel/ModeModelSettings';
import { GENTLE_ROLE_GROUPS, GENTLE_ROLE_LABELS } from '../../../shared/modelConfiguration';

type SettingsCategory = 'appearance' | 'editor' | 'terminal' | 'git' | 'ai' | 'orchestrator' | 'shortcuts';

const OAUTH_SUPPORTED_PROVIDERS = ['gemini', 'openai', 'github-copilot', 'opencode'];

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
  { id: 'opencode', name: 'OpenCode Console' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'qwen', name: 'Qwen' },
  { id: 'kimi', name: 'Kimi' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'minimax', name: 'MiniMax' },
  { id: 'groq', name: 'Groq' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'xai', name: 'xAI' },
  { id: 'togetherai', name: 'Together AI' },
  { id: 'perplexity', name: 'Perplexity' },
];

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setSettingsModalOpen } = useLayoutStore();
  const { theme, setTheme } = useWorkspaceStore();
  const {
    providers,
    setApiKey,
    loginWithOAuth,
    oauthAccounts,
    removeOAuthAccount,
    setActiveOAuthAccount,
  } = useAIStore();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance');
  const [searchQuery, setSearchQuery] = useState('');

  // Local settings state
  const [fontSize, setFontSize] = useState<number>(() => {
    return parseInt(localStorage.getItem('spigot_font_size') || '14', 10);
  });
  const [fontFamily, setFontFamily] = useState<string>(() => {
    return localStorage.getItem('spigot_font_family') || "Consolas, 'Courier New', monospace";
  });
  const [tabSize, setTabSize] = useState<number>(() => {
    return parseInt(localStorage.getItem('spigot_tab_size') || '2', 10);
  });
  const [autoSave, setAutoSave] = useState<boolean>(() => {
    return localStorage.getItem('spigot_auto_save') !== 'false';
  });
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    return localStorage.getItem('spigot_word_wrap') === 'true';
  });
  const [minimap, setMinimap] = useState<boolean>(() => {
    return localStorage.getItem('spigot_minimap') !== 'false';
  });
  const [terminalFontSize, setTerminalFontSize] = useState<number>(() => {
    return parseInt(localStorage.getItem('spigot_terminal_font_size') || '13', 10);
  });
  const [terminalCursorBlink, setTerminalCursorBlink] = useState<boolean>(() => {
    return localStorage.getItem('spigot_terminal_cursor_blink') !== 'false';
  });
  const [gitAutofetch, setGitAutofetch] = useState<boolean>(() => {
    return localStorage.getItem('spigot_git_autofetch') === 'true';
  });

  // AI Key state in settings
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [authType, setAuthType] = useState<'api' | 'oauth'>('api');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [keySavedStatus, setKeySavedStatus] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const isOAuthSupported = OAUTH_SUPPORTED_PROVIDERS.includes(selectedProvider);

  // Sync AI key and authType when selected provider changes
  useEffect(() => {
    if (!OAUTH_SUPPORTED_PROVIDERS.includes(selectedProvider)) {
      setAuthType('api');
      setApiKeyInput(providers[selectedProvider]?.key || '');
    } else if (providers[selectedProvider]) {
      const currentAuth = providers[selectedProvider].authType || 'api';
      setAuthType(currentAuth);
      if (currentAuth === 'api') {
        setApiKeyInput(providers[selectedProvider].key || '');
      } else {
        setApiKeyInput('');
      }
    } else {
      setApiKeyInput('');
      setAuthType('api');
    }
  }, [selectedProvider, providers, isSettingsModalOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsModalOpen) {
        setSettingsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsModalOpen, setSettingsModalOpen]);

  if (!isSettingsModalOpen) return null;

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setApiKey(selectedProvider, apiKeyInput.trim(), authType);
      setKeySavedStatus({ message: 'Clave guardada con éxito', tone: 'success' });
      setTimeout(() => setKeySavedStatus(null), 2500);
    } catch (err: any) {
      setKeySavedStatus({ message: 'Error al guardar clave', tone: 'error' });
    }
  };

  const handleOAuthConnect = async () => {
    try {
      setKeySavedStatus({ message: 'Esperando autorización en el navegador...', tone: 'success' });
      const res = await loginWithOAuth(selectedProvider);
      setApiKeyInput(res.token);
      setKeySavedStatus({ message: `¡Conectado exitosamente${res.email ? ` como ${res.email}` : ''}!`, tone: 'success' });
      setTimeout(() => setKeySavedStatus(null), 3000);
    } catch (err: any) {
      setKeySavedStatus({ message: err.message || 'Error al conectar por OAuth', tone: 'error' });
    }
  };

  const handleDisconnectProvider = async (providerId: string) => {
    try {
      await setApiKey(providerId, '', 'api');
      if (providerId === selectedProvider) {
        setApiKeyInput('');
      }
    } catch (err) {
      console.error('Error disconnecting provider in settings:', err);
    }
  };

  const updateSetting = (key: string, value: any, setter: (val: any) => void) => {
    setter(value);
    localStorage.setItem(key, String(value));
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-editor-bg/80 backdrop-blur-sm app-non-draggable p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsModalOpen(false);
      }}
    >
      <div className="w-[880px] max-w-[95vw] h-[640px] max-h-[90vh] bg-editor-bg border-2 border-editor-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden text-editor-text animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Header Bar */}
        <div className="h-[48px] border-b border-editor-border px-5 flex items-center justify-between bg-editor-sidebar select-none shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded bg-editor-hover border border-editor-border text-editor-accent">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="text-[14px] font-bold tracking-wide text-editor-text">Configuración</h2>
          </div>

          {/* Search Box */}
          <div className="relative w-80">
            <Search className="w-3.5 h-3.5 text-editor-textDark absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar ajustes... (Ctrl+F)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-editor-bg border border-editor-border text-[12px] pl-9 pr-8 py-1.5 rounded-md text-editor-text placeholder:text-editor-textDark outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-editor-textDark hover:text-editor-text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setSettingsModalOpen(false)}
            className="p-1.5 rounded-md hover:bg-editor-hover text-editor-textDark hover:text-editor-text border border-transparent hover:border-editor-border transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Main Body: Two Column High-Contrast Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categories Sidebar */}
          <div className="w-56 border-r border-editor-border bg-editor-sidebar p-3 flex flex-col gap-1.5 select-none shrink-0 overflow-y-auto custom-scrollbar">
            <span className="text-[10px] font-bold text-editor-textDark px-2.5 py-1 uppercase tracking-wider">
              Categorías
            </span>

            <button
              onClick={() => { setActiveCategory('appearance'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'appearance' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <Palette className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Apariencia y Temas</span>
            </button>

            <button
              onClick={() => { setActiveCategory('editor'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'editor' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <Code className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Editor de Código</span>
            </button>

            <button
              onClick={() => { setActiveCategory('terminal'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'terminal' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <Terminal className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Terminal Integrada</span>
            </button>

            <button
              onClick={() => { setActiveCategory('git'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'git' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <GitBranch className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Control de Versiones</span>
            </button>

            <button
              onClick={() => { setActiveCategory('ai'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'ai' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <ProviderIcon className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Provider (IA)</span>
            </button>

            <button
              onClick={() => { setActiveCategory('orchestrator'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'orchestrator' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Orchestrator</span>
            </button>

            <button
              onClick={() => { setActiveCategory('shortcuts'); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] transition-all text-left ${
                activeCategory === 'shortcuts' && !searchQuery
                  ? 'bg-editor-active text-editor-text font-semibold border-l-2 border-editor-accent shadow-sm'
                  : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover font-medium'
              }`}
            >
              <Keyboard className="w-4 h-4 shrink-0 text-editor-accent" />
              <span>Atajos de Teclado</span>
            </button>
          </div>

          {/* Right Setting Panels Content Area with clear high-contrast cards */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-editor-bg flex flex-col gap-6">
            {/* Category 1: Apariencia */}
            {(activeCategory === 'appearance' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <Palette className="w-4 h-4 text-editor-accent" />
                    Apariencia y Aspecto
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Personaliza la estética, el contraste y la paleta de colores de Spigot.
                  </p>
                </div>

                {/* Color Theme Setting */}
                <div className="flex flex-col gap-2 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <label className="text-[13px] font-semibold text-editor-text">
                    Tema de Color de la Interfaz
                  </label>
                  <p className="text-[12px] text-editor-textDark">
                    Selecciona entre el modo Spigot Dark, Grisáceo Oscuro o Solarized Dark con alto contraste.
                  </p>
                  <div className="relative w-80 mt-1">
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as any)}
                      className="w-full bg-editor-bg border border-editor-border text-[12.5px] px-3 py-2 rounded-md text-editor-text outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent appearance-none cursor-pointer"
                    >
                      <option value="spigot-dark">Spigot Dark (Por Defecto)</option>
                      <option value="grayish-dark">Grisáceo Oscuro</option>
                      <option value="solarized-dark">Solarized Dark</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-editor-textDark absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* UI Panels setting */}
                <div className="flex flex-col gap-2 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <label className="text-[13px] font-semibold text-editor-text">
                    Diseño Modular de Paneles
                  </label>
                  <p className="text-[12px] text-editor-textDark">
                    Tarjetas redondeadas con divisores sash de precisión inspirados en VS Code.
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2.5 py-1 rounded bg-editor-hover border border-editor-accent text-editor-accent text-[11px] font-bold">
                      Habilitado
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Category 2: Editor */}
            {(activeCategory === 'editor' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <Code className="w-4 h-4 text-editor-accent" />
                    Editor de Código
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Configura el comportamiento del editor Monaco, fuentes e indentación.
                  </p>
                </div>

                {/* Font Size Setting */}
                <div className="flex flex-col gap-2 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <label className="text-[13px] font-semibold text-editor-text">
                    Tamaño de Fuente del Editor (px)
                  </label>
                  <p className="text-[12px] text-editor-textDark">
                    Controla el tamaño de la fuente en píxeles dentro del editor de código.
                  </p>
                  <input
                    type="number"
                    min={10}
                    max={32}
                    value={fontSize}
                    onChange={(e) => updateSetting('spigot_font_size', parseInt(e.target.value, 10), setFontSize)}
                    className="mt-1 bg-editor-bg border border-editor-border text-[12.5px] px-3 py-1.5 rounded-md text-editor-text outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent w-28"
                  />
                </div>

                {/* Font Family Setting */}
                <div className="flex flex-col gap-2 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <label className="text-[13px] font-semibold text-editor-text">
                    Familia Tipográfica
                  </label>
                  <p className="text-[12px] text-editor-textDark">
                    Lista de fuentes monospace a utilizar en el editor de código.
                  </p>
                  <input
                    type="text"
                    value={fontFamily}
                    onChange={(e) => updateSetting('spigot_font_family', e.target.value, setFontFamily)}
                    className="mt-1 bg-editor-bg border border-editor-border text-[12.5px] px-3 py-1.5 rounded-md text-editor-text font-mono outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent w-full max-w-md"
                  />
                </div>

                {/* Tab Size */}
                <div className="flex flex-col gap-2 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <label className="text-[13px] font-semibold text-editor-text">
                    Tamaño de Tabulación (Tab Size)
                  </label>
                  <p className="text-[12px] text-editor-textDark">
                    El número de espacios a los que equivale una tabulación.
                  </p>
                  <div className="relative w-48 mt-1">
                    <select
                      value={tabSize}
                      onChange={(e) => updateSetting('spigot_tab_size', parseInt(e.target.value, 10), setTabSize)}
                      className="w-full bg-editor-bg border border-editor-border text-[12.5px] px-3 py-1.5 rounded-md text-editor-text outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent appearance-none cursor-pointer"
                    >
                      <option value={2}>2 espacios</option>
                      <option value={4}>4 espacios</option>
                      <option value={8}>8 espacios</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-editor-textDark absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Auto Save Toggle */}
                <div className="flex items-center justify-between bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-semibold text-editor-text">
                      Guardado Automático (Auto Save)
                    </label>
                    <p className="text-[12px] text-editor-textDark">
                      Guarda automáticamente los archivos editados al cambiar de foco.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => updateSetting('spigot_auto_save', e.target.checked, setAutoSave)}
                    className="w-5 h-5 rounded accent-editor-accent cursor-pointer"
                  />
                </div>

                {/* Word Wrap */}
                <div className="flex items-center justify-between bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-semibold text-editor-text">
                      Ajuste de Línea (Word Wrap)
                    </label>
                    <p className="text-[12px] text-editor-textDark">
                      Las líneas que sobrepasen el viewport se ajustarán al siguiente renglón.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={wordWrap}
                    onChange={(e) => updateSetting('spigot_word_wrap', e.target.checked, setWordWrap)}
                    className="w-5 h-5 rounded accent-editor-accent cursor-pointer"
                  />
                </div>

                {/* Minimap */}
                <div className="flex items-center justify-between bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-semibold text-editor-text">
                      Mostrar Minimapa del Código
                    </label>
                    <p className="text-[12px] text-editor-textDark">
                      Muestra una vista previa en miniatura en el lateral derecho del editor.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={minimap}
                    onChange={(e) => updateSetting('spigot_minimap', e.target.checked, setMinimap)}
                    className="w-5 h-5 rounded accent-editor-accent cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Category 3: Terminal */}
            {(activeCategory === 'terminal' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-editor-accent" />
                    Terminal Integrada
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Ajusta la consola interactiva, sesiones múltiples y emulación de terminal.
                  </p>
                </div>

                {/* Terminal Font Size */}
                <div className="flex flex-col gap-2 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <label className="text-[13px] font-semibold text-editor-text">
                    Tamaño de Fuente de la Terminal (px)
                  </label>
                  <p className="text-[12px] text-editor-textDark">
                    Tamaño de letra utilizado dentro de las instancias de terminal xterm.
                  </p>
                  <input
                    type="number"
                    min={10}
                    max={24}
                    value={terminalFontSize}
                    onChange={(e) => updateSetting('spigot_terminal_font_size', parseInt(e.target.value, 10), setTerminalFontSize)}
                    className="mt-1 bg-editor-bg border border-editor-border text-[12.5px] px-3 py-1.5 rounded-md text-editor-text outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent w-28"
                  />
                </div>

                {/* Cursor Blink */}
                <div className="flex items-center justify-between bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-semibold text-editor-text">
                      Parpadeo del Cursor en Terminal
                    </label>
                    <p className="text-[12px] text-editor-textDark">
                      Habilita la animación de parpadeo en el cursor de la terminal interactiva.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={terminalCursorBlink}
                    onChange={(e) => updateSetting('spigot_terminal_cursor_blink', e.target.checked, setTerminalCursorBlink)}
                    className="w-5 h-5 rounded accent-editor-accent cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Category 4: Git */}
            {(activeCategory === 'git' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-editor-accent" />
                    Control de Versiones (Git)
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Preferencias de integración Git, submódulos y gráfico interactivo de ramas.
                  </p>
                </div>

                {/* Git Auto-fetch */}
                <div className="flex items-center justify-between bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-semibold text-editor-text">
                      Autofetch Periódico de Repositorios
                    </label>
                    <p className="text-[12px] text-editor-textDark">
                      Comprueba periódicamente los cambios del repositorio remoto de forma automática.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={gitAutofetch}
                    onChange={(e) => updateSetting('spigot_git_autofetch', e.target.checked, setGitAutofetch)}
                    className="w-5 h-5 rounded accent-editor-accent cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Category 5: AI & Models */}
            {(activeCategory === 'ai' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <ProviderIcon className="w-4 h-4 text-editor-accent" />
                    Provider & Modelos de Inteligencia Artificial
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Gestiona las claves de API (API Keys) y tokens OAuth para el agente y asistente Provider.
                  </p>
                </div>

                {/* API Key configuration form */}
                <form onSubmit={handleSaveApiKey} className="flex flex-col gap-3 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-semibold text-editor-text">
                      Proveedor de Inteligencia Artificial
                    </label>
                    <div className="relative w-full">
                      <select
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        className="w-full bg-editor-bg border border-editor-border text-[12.5px] px-3 py-2 rounded-md text-editor-text outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent appearance-none cursor-pointer"
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-editor-textDark absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Auth Type Selector - Only visible for OAuth supported providers */}
                  {isOAuthSupported && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-semibold text-editor-text">
                        Método de Conexión
                      </label>
                      <div className="grid grid-cols-2 gap-2 bg-editor-bg p-1 rounded-lg border border-editor-border text-xs">
                        <button
                          type="button"
                          onClick={() => setAuthType('api')}
                          className={`py-1.5 px-3 rounded-md font-medium transition-all ${
                            authType === 'api'
                              ? 'bg-editor-active text-editor-text border border-editor-accent shadow-sm'
                              : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover'
                          }`}
                        >
                          Clave de API (API Key)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthType('oauth')}
                          className={`py-1.5 px-3 rounded-md font-medium transition-all ${
                            authType === 'oauth'
                              ? 'bg-editor-active text-editor-text border border-editor-accent shadow-sm'
                              : 'text-editor-textDark hover:text-editor-text hover:bg-editor-hover'
                          }`}
                        >
                          OAuth Token
                        </button>
                      </div>
                    </div>
                  )}

                  {/* OAuth Connection Card */}
                  {isOAuthSupported && authType === 'oauth' && (
                    <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-editor-hover border border-editor-accent animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-editor-text flex items-center gap-1.5">
                          <LogIn className="w-3.5 h-3.5 text-editor-accent" />
                          Conexión Automática OAuth 2.0
                        </span>
                        <span className="text-[10px] bg-editor-active text-editor-accent border border-editor-border px-2 py-0.5 rounded-full font-bold">
                          {selectedProvider === 'gemini' && oauthAccounts.length > 0
                            ? `${oauthAccounts.length} ${oauthAccounts.length === 1 ? 'cuenta' : 'cuentas'}`
                            : 'Recomendado'}
                        </span>
                      </div>
                      <p className="text-[11px] text-editor-textDark leading-relaxed">
                        {selectedProvider === 'gemini'
                          ? (oauthAccounts.length > 0
                            ? 'Podés vincular cuentas adicionales de Google para alternar o activar rotación automática en caso de límite de cuota.'
                            : 'Iniciá sesión para autorizar y conectar automáticamente tu cuenta de Google Antigravity sin ingresar tokens manualmente.')
                          : selectedProvider === 'openai'
                          ? 'Iniciá sesión con tu cuenta de ChatGPT Plus o Pro para usar tus suscripciones de OpenAI sin costo adicional de API.'
                          : selectedProvider === 'github-copilot'
                          ? 'Iniciá sesión con GitHub Device Code para usar tu suscripción activa de GitHub Copilot.'
                          : 'Iniciá sesión con tu cuenta de OpenCode Console para conectar balance y créditos compartidos.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleOAuthConnect}
                        className="w-full py-2 px-3 rounded-md bg-editor-accent text-editor-bg text-xs font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110 shadow-md cursor-pointer mt-1"
                      >
                        {selectedProvider === 'gemini' && oauthAccounts.length > 0 ? <Plus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                        <span>
                          {selectedProvider === 'gemini' && oauthAccounts.length > 0
                            ? 'Conectar otra cuenta'
                            : `Conectar con ${PROVIDERS.find((p) => p.id === selectedProvider)?.name}`}
                        </span>
                      </button>
                    </div>
                  )}

                  {authType === 'api' && (
                    <>
                      <div className="flex flex-col gap-1.5 animate-fade-in">
                        <label className="text-[13px] font-semibold text-editor-text flex items-center justify-between">
                          <span>Clave de API (API Key)</span>
                          {providers[selectedProvider]?.authType === 'api' && Boolean(providers[selectedProvider]?.key?.trim()) && (
                            <span className="text-[11px] text-editor-success font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Conectada
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            placeholder="sk-..."
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            className="w-full bg-editor-bg border border-editor-border text-[12.5px] pl-3 pr-10 py-2 rounded-md text-editor-text font-mono outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-editor-textDark hover:text-editor-text"
                            title={showApiKey ? "Ocultar" : "Mostrar"}
                          >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        {keySavedStatus ? (
                          <span className={`text-[12px] font-semibold ${keySavedStatus.tone === 'success' ? 'text-editor-success' : 'text-editor-error'}`}>{keySavedStatus.message}</span>
                        ) : <span />}
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-editor-active hover:bg-editor-hover border border-editor-border rounded-md text-[12.5px] font-semibold text-editor-text transition-colors"
                        >
                          Guardar y Vincular
                        </button>
                      </div>
                    </>
                  )}

                  {authType === 'oauth' && keySavedStatus && (
                    <div className="pt-1">
                      <span className={`text-[12px] font-semibold ${keySavedStatus.tone === 'success' ? 'text-editor-success' : 'text-editor-error'}`}>{keySavedStatus.message}</span>
                    </div>
                  )}
                </form>

                {/* Section: Connected Providers status */}
                <div className="flex flex-col gap-2.5 bg-editor-sidebar border border-editor-border p-4 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between border-b border-editor-border pb-2">
                    <span className="text-[13px] font-bold text-editor-text flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-editor-accent" />
                      Proveedores conectados
                    </span>
                    <span className="text-[11px] text-editor-textDark">
                      {(() => {
                        const isGeminiOAuth = providers.gemini?.authType === 'oauth';
                        const oCount = isGeminiOAuth ? oauthAccounts.length : (providers.gemini?.key ? 1 : 0);
                        const apiCount = Object.entries(providers).filter(([id, d]) => id !== 'gemini' && Boolean(d.key && d.key.trim().length > 0)).length;
                        const total = oCount + apiCount;
                        return `${total} ${total === 1 ? 'conexión activa' : 'conexiones activas'}`;
                      })()}
                    </span>
                  </div>

                  {(() => {
                    const isGeminiOAuth = providers.gemini?.authType === 'oauth';
                    const geminiOAuthList = isGeminiOAuth ? oauthAccounts : [];
                    const otherConfigured = Object.entries(providers).filter(
                      ([id, data]) => (id !== 'gemini' || !isGeminiOAuth) && Boolean(data.key && data.key.trim().length > 0)
                    );
                    const total = geminiOAuthList.length + otherConfigured.length;

                    if (total === 0) {
                      return (
                        <div className="flex items-center gap-2 py-3 px-3 rounded-md bg-editor-bg border border-dashed border-editor-border text-[12px] text-editor-textDark">
                          <AlertCircle className="w-4 h-4 text-editor-accent shrink-0" />
                          <span>No hay ninguna IA conectada todavía. Ingresá una clave o conectá una cuenta.</span>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                        {/* 1. Google OAuth Accounts for Gemini */}
                        {geminiOAuthList.map((acc) => {
                          const isSelected = selectedProvider === 'gemini';
                          return (
                            <div
                              key={acc.id}
                              className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                                isSelected && acc.isActive
                                  ? 'bg-editor-active border-editor-accent'
                                  : 'bg-editor-bg border-editor-border hover:border-editor-accent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full bg-editor-success animate-pulse shrink-0" />
                                <span className="font-semibold text-editor-text text-[12.5px] shrink-0">
                                  Gemini
                                </span>
                                <span className="text-[11px] text-editor-textDark font-mono truncate">
                                  ({acc.email})
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {acc.isCoolingDown ? (
                                  <span className="text-[10px] bg-editor-bg text-editor-warning border border-editor-warning px-2 py-0.5 rounded">
                                    En enfriamiento ({acc.cooldownRemainingSeconds}s)
                                  </span>
                                ) : acc.isActive ? (
                                  <span className="text-[10px] bg-editor-bg text-editor-accent border border-editor-accent px-2 py-0.5 rounded font-bold">
                                    Activa
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setActiveOAuthAccount(acc.id)}
                                    className="text-[10.5px] px-2 py-0.5 rounded bg-editor-active hover:bg-editor-hover text-editor-text border border-editor-border cursor-pointer transition-colors"
                                  >
                                    Usar
                                  </button>
                                )}

                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-editor-active text-editor-success border-editor-border">
                                  ● OAuth
                                </span>

                                <button
                                  type="button"
                                  onClick={() => removeOAuthAccount(acc.id)}
                                  className="text-[11px] text-editor-textDark hover:text-editor-error px-2 py-0.5 rounded hover:bg-editor-hover transition-colors cursor-pointer"
                                  title="Desconectar cuenta"
                                >
                                  Desconectar
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. API Key Providers */}
                        {otherConfigured.map(([id]) => {
                          const provInfo = PROVIDERS.find((p) => p.id === id);
                          const isSelected = id === selectedProvider;
                          return (
                            <div
                              key={id}
                              className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                                isSelected
                                  ? 'bg-editor-active border-editor-accent'
                                  : 'bg-editor-bg border-editor-border hover:border-editor-accent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-editor-success animate-pulse" />
                                <span className="font-semibold text-editor-text text-[12.5px]">
                                  {provInfo?.name || id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-editor-active text-editor-accent border-editor-border">
                                  ● API Key
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDisconnectProvider(id)}
                                  className="text-[11px] text-editor-textDark hover:text-editor-error px-2 py-0.5 rounded hover:bg-editor-hover transition-colors cursor-pointer"
                                  title="Desconectar"
                                >
                                  Desconectar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Category 6: Orchestrator */}
            {(activeCategory === 'orchestrator' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-editor-accent" />
                    Orchestrator
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Configurá el coordinador y cada rol verificado de Gentle AI.
                  </p>
                  <p className="mt-2 text-xs text-editor-textDark" role="note">
                    El esfuerzo solo está disponible para combinaciones de proveedor y modelo con capacidad registrada.
                  </p>
                </div>

                <section className="overflow-hidden rounded-lg border border-editor-border bg-editor-sidebar shadow-sm" aria-labelledby="orchestrator-model-heading">
                  <div className="hidden grid-cols-[minmax(12rem,1.35fr)_minmax(12rem,1fr)_minmax(10rem,0.7fr)] gap-4 border-b border-editor-border bg-editor-active/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-editor-textDark sm:grid">
                    <span>Rol</span>
                    <span>Modelo</span>
                    <span>Esfuerzo</span>
                  </div>
                    <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[minmax(12rem,1.35fr)_minmax(12rem,1fr)_minmax(10rem,0.7fr)] sm:items-start sm:gap-4">
                      <div>
                        <h4 id="orchestrator-model-heading" className="text-[13px] font-semibold text-editor-text">Orquestador de Gentle AI</h4>
                      </div>
                    <GentleRoleSettingsFields role="gentle-orchestrator" label="Orquestador de Gentle AI" compact />
                  </div>
                </section>
                {GENTLE_ROLE_GROUPS.map((group) => (
                  <details key={group.label} className="rounded-lg border border-editor-border bg-editor-sidebar shadow-sm">
                    <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold text-editor-text focus:outline-none focus-visible:ring-1 focus-visible:ring-editor-accent">
                      Roles de {group.label} ({group.roles.length})
                    </summary>
                    <div className="border-t border-editor-border">
                      <div className="hidden grid-cols-[minmax(12rem,1.35fr)_minmax(12rem,1fr)_minmax(10rem,0.7fr)] gap-4 border-b border-editor-border bg-editor-active/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-editor-textDark sm:grid">
                        <span>Rol</span>
                        <span>Modelo</span>
                        <span>Esfuerzo</span>
                      </div>
                      {group.roles.map((role) => {
                        const label = GENTLE_ROLE_LABELS[role];
                        return (
                          <section key={role} className="grid grid-cols-1 gap-3 border-b border-editor-border px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(12rem,1.35fr)_minmax(12rem,1fr)_minmax(10rem,0.7fr)] sm:items-start sm:gap-4" aria-labelledby={`${role}-heading`}>
                            <div>
                            <h5 id={`${role}-heading`} className="text-xs font-semibold text-editor-text">{label}</h5>
                            </div>
                            <GentleRoleSettingsFields role={role} label={label} compact />
                          </section>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            )}

            {/* Category 7: Keyboard Shortcuts */}
            {(activeCategory === 'shortcuts' || searchQuery) && (
              <div className="flex flex-col gap-4">
                <div className="border-b border-editor-border pb-2">
                  <h3 className="text-[14px] font-bold text-editor-text flex items-center gap-2">
                    <Keyboard className="w-4 h-4 text-editor-accent" />
                    Atajos de Teclado
                  </h3>
                  <p className="text-[12px] text-editor-textDark mt-1">
                    Combinaciones de teclas rápidas predeterminadas en Spigot IDE.
                  </p>
                </div>

                <div className="flex flex-col border border-editor-border rounded-lg overflow-hidden bg-editor-sidebar text-[12.5px] shadow-sm">
                  <div className="grid grid-cols-2 bg-editor-active/50 px-4 py-2 font-bold text-editor-textDark text-[11px] uppercase tracking-wider border-b border-editor-border">
                    <span>Comando / Acción</span>
                    <span className="text-right">Atajo de Teclado</span>
                  </div>

                  <div className="grid grid-cols-2 px-4 py-2.5 border-b border-editor-border/60 hover:bg-editor-hover/50 items-center">
                    <span className="font-medium text-editor-text">Abrir Configuración (Settings)</span>
                    <div className="flex justify-end gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">Ctrl</kbd>
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">,</kbd>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 px-4 py-2.5 border-b border-editor-border/60 hover:bg-editor-hover/50 items-center">
                    <span className="font-medium text-editor-text">Guardar Archivo Activo</span>
                    <div className="flex justify-end gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">Ctrl</kbd>
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">S</kbd>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 px-4 py-2.5 border-b border-editor-border/60 hover:bg-editor-hover/50 items-center">
                    <span className="font-medium text-editor-text">Abrir Espacio de Trabajo</span>
                    <div className="flex justify-end gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">Ctrl</kbd>
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">O</kbd>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 px-4 py-2.5 border-b border-editor-border/60 hover:bg-editor-hover/50 items-center">
                    <span className="font-medium text-editor-text">Crear Nuevo Archivo</span>
                    <div className="flex justify-end gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">Ctrl</kbd>
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">N</kbd>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-editor-hover/50 items-center">
                    <span className="font-medium text-editor-text">Alternar Terminal Integrada</span>
                    <div className="flex justify-end gap-1">
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">Ctrl</kbd>
                      <kbd className="px-2 py-0.5 rounded bg-editor-bg border border-editor-border text-[11px] font-mono text-editor-text font-bold">`</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Bar */}
        <div className="h-[48px] border-t border-editor-border px-5 flex items-center justify-end bg-editor-sidebar select-none shrink-0">
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="px-5 py-1.5 bg-editor-active hover:bg-editor-hover border border-editor-border rounded-md text-[12.5px] font-bold text-editor-text transition-colors shadow-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
