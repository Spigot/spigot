import React, { useState, useEffect } from 'react';
import { useAIStore } from '../../store/aiStore';
import { X, Key, Check, AlertCircle, Eye, EyeOff, Settings, Sparkles, LogIn, Plus } from 'lucide-react';
import { StyledSelect } from './StyledSelect';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

const PROVIDER_OPTIONS = PROVIDERS.map((provider) => ({
  value: provider.id,
  label: provider.name,
}));

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const {
    providers,
    setApiKey,
    loginWithOAuth,
    oauthAccounts,
    removeOAuthAccount,
    setActiveOAuthAccount,
  } = useAIStore();
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [authType, setAuthType] = useState<'api' | 'oauth'>('api');
  const [apiKey, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const isOAuthSupported = OAUTH_SUPPORTED_PROVIDERS.includes(selectedProvider);

  // Load existing key and authType when provider changes
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
    setStatus('idle');
    setErrorMsg('');
  }, [selectedProvider, providers, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');

    try {
      await setApiKey(selectedProvider, apiKey.trim(), authType);
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Error al guardar la clave.');
    }
  };

  const handleOAuthConnect = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const res = await loginWithOAuth(selectedProvider);
      setStatus('success');
      setApiKeyInput(res.token);
      setTimeout(() => {
        setStatus('idle');
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Error al conectar por OAuth.');
    }
  };

  const handleDisconnect = async (providerId: string) => {
    try {
      await setApiKey(providerId, '', 'api');
      if (providerId === selectedProvider) {
        setApiKeyInput('');
      }
    } catch (err) {
      console.error('Error disconnecting provider:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none p-4 animate-fade-in">
      <div 
        className="w-full max-w-lg bg-editor-bg border-2 border-editor-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-visible flex flex-col transition-all-custom max-h-[90vh] overflow-y-auto text-editor-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-[48px] flex items-center justify-between px-5 border-b border-editor-border bg-editor-sidebar rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded bg-editor-hover border border-editor-border text-editor-accent">
              <Settings className="w-4 h-4" />
            </div>
            <span className="font-bold text-[14px] tracking-wide text-editor-text">Ajustes del Agente IA</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-editor-hover text-editor-textDark hover:text-editor-text border border-transparent hover:border-editor-border transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="bg-editor-bg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-editor-border bg-editor-sidebar px-3 py-2 text-[11px] text-editor-textDark">
            <Key className="w-3.5 h-3.5 text-editor-accent" />
            <span>Configuración de Proveedores e Inteligencias Artificiales</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-editor-textDark font-bold uppercase tracking-wider">
              Proveedor
            </label>
            <StyledSelect
              value={selectedProvider}
              options={PROVIDER_OPTIONS}
              onChange={setSelectedProvider}
              placeholder="Seleccionar proveedor"
              buttonClassName="px-3 py-2 text-xs"
            />
          </div>

          {/* Auth Type Selector - Only visible for OAuth supported providers */}
          {isOAuthSupported && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-editor-textDark font-bold uppercase tracking-wider">
                Tipo de Autenticación
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
                  OAuth Token / Flujo OAuth
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

          {selectedProvider === 'openrouter' && (
            <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-editor-hover border border-editor-border text-[11px] text-editor-textDark leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-editor-text uppercase tracking-wider text-[9px]">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Soporte de OpenRouter Activo</span>
              </div>
              <span>
                ¡Podés usar <strong>OpenRouter</strong> para conectar decenas de modelos externos (como Claude 3.5 Sonnet, GPT-4o, Llama 3, DeepSeek, etc.)!
                Conseguí tu clave en{' '}
                <a
                  href="https://openrouter.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-editor-text hover:text-editor-accent font-bold transition-colors cursor-pointer"
                >
                  openrouter.ai
                </a>.
              </span>
            </div>
          )}

          {selectedProvider === 'minimax' && (
            <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-editor-hover border border-editor-border text-[11px] text-editor-textDark leading-relaxed animate-fade-in">
              <div className="flex items-center gap-1.5 font-bold text-editor-text uppercase tracking-wider text-[9px]">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Soporte de MiniMax Activo</span>
              </div>
              <span>
                ¡Conectá <strong>MiniMax</strong> para utilizar modelos como MiniMax-Text-01 o abab6.5s!
                Conseguí tu clave en{' '}
                <a
                  href="https://platform.minimax.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-editor-text hover:text-editor-accent font-bold transition-colors cursor-pointer"
                >
                  platform.minimax.io
                </a>.
              </span>
            </div>
          )}

          {authType === 'api' && (
            <div className="flex flex-col gap-1.5 relative animate-fade-in">
              <label className="text-[11px] text-editor-textDark font-bold uppercase tracking-wider">
                Clave API (API Key)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={`Ingresá tu clave de API de ${PROVIDERS.find(p => p.id === selectedProvider)?.name}`}
                  className="w-full bg-editor-bg border border-editor-border text-xs rounded-lg pl-3 pr-10 py-2 text-editor-text placeholder:text-editor-textDark outline-none focus:border-editor-accent transition-all-custom font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 text-editor-textDark hover:text-editor-text p-0.5 rounded transition-all-custom"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-editor-textDark leading-normal mt-0.5">
                Esta credencial se almacena de forma local y segura en tu equipo.
              </p>
            </div>
          )}

          {/* Messages */}
          {status === 'error' && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-editor-hover border border-editor-error text-editor-error text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg || 'Ocurrió un error'}</span>
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-editor-hover border border-editor-success text-editor-success text-xs">
              <Check className="w-4 h-4 shrink-0 animate-bounce" />
              <span>¡Guardado correctamente! Modelos vinculados.</span>
            </div>
          )}

          {/* Section: Connected Providers status at the bottom */}
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-editor-border bg-editor-sidebar p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-editor-text uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-editor-accent" />
                Proveedores conectados
              </span>
              <span className="text-[10px] text-editor-textDark font-medium">
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
                  <div className="flex items-center gap-2 py-2 px-2.5 rounded-md bg-editor-bg border border-dashed border-editor-border text-[11px] text-editor-textDark">
                    <AlertCircle className="w-3.5 h-3.5 text-editor-accent shrink-0" />
                    <span>Ninguna IA conectada actualmente. Ingresá una clave o conectá una cuenta.</span>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {/* Google OAuth Accounts for Gemini */}
                  {geminiOAuthList.map((acc) => {
                    const isCurrent = selectedProvider === 'gemini';
                    return (
                      <div
                        key={acc.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                          isCurrent && acc.isActive
                            ? 'bg-editor-active border-editor-accent'
                            : 'bg-editor-bg border-editor-border hover:border-editor-accent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-editor-success animate-pulse shrink-0" />
                          <span className="font-semibold text-editor-text shrink-0">Gemini</span>
                          <span className="text-[10.5px] text-editor-textDark font-mono truncate">
                            ({acc.email})
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {acc.isCoolingDown ? (
                            <span className="text-[9.5px] bg-editor-bg text-editor-warning border border-editor-warning px-1.5 py-0.5 rounded">
                              En enfriamiento ({acc.cooldownRemainingSeconds}s)
                            </span>
                          ) : acc.isActive ? (
                            <span className="text-[9.5px] bg-editor-bg text-editor-accent border border-editor-accent px-1.5 py-0.5 rounded font-bold">
                              Activa
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActiveOAuthAccount(acc.id)}
                              className="text-[10px] px-2 py-0.5 rounded bg-editor-active hover:bg-editor-hover text-editor-text border border-editor-border cursor-pointer transition-colors"
                            >
                              Usar
                            </button>
                          )}

                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-editor-active text-editor-success border-editor-border">
                            ● OAuth
                          </span>

                          <button
                            type="button"
                            onClick={() => removeOAuthAccount(acc.id)}
                            className="text-[10px] text-editor-textDark hover:text-editor-error px-1.5 py-0.5 rounded hover:bg-editor-hover transition-colors cursor-pointer"
                            title="Desconectar cuenta"
                          >
                            Desconectar
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* API Key Providers */}
                  {otherConfigured.map(([id]) => {
                    const provInfo = PROVIDERS.find((p) => p.id === id);
                    const isCurrent = id === selectedProvider;
                    return (
                      <div
                        key={id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                          isCurrent
                            ? 'bg-editor-active border-editor-accent'
                            : 'bg-editor-bg border-editor-border hover:border-editor-accent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-editor-success animate-pulse" />
                          <span className="font-semibold text-editor-text">{provInfo?.name || id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-editor-active text-editor-accent border-editor-border">
                            ● API Key
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDisconnect(id)}
                            className="text-[10px] text-editor-textDark hover:text-editor-error px-1.5 py-0.5 rounded hover:bg-editor-hover transition-colors cursor-pointer"
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

          {/* Footer Actions */}
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-1 flex h-[48px] items-center justify-end gap-2.5 border-t border-editor-border bg-editor-sidebar px-5">
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'saving'}
              className="px-4 py-1.5 bg-editor-active hover:bg-editor-hover border border-editor-border text-editor-text font-bold text-xs rounded-md active:scale-95 transition-all-custom"
            >
              Cerrar
            </button>
            {authType === 'api' && (
              <button
                type="submit"
                disabled={status === 'saving' || status === 'success'}
                className="px-4 py-1.5 bg-editor-accent hover:brightness-110 text-editor-bg font-bold text-xs rounded-md shadow active:scale-95 disabled:opacity-40 transition-all-custom"
              >
                {status === 'saving' ? 'Guardando...' : 'Guardar y Conectar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
export default ApiKeyModal;
