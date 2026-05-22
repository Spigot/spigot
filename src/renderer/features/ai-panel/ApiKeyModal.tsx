import React, { useState, useEffect } from 'react';
import { useAIStore } from '../../store/aiStore';
import { X, Key, Check, AlertCircle, Eye, EyeOff, Settings } from 'lucide-react';
import { StyledSelect } from './StyledSelect';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'qwen', name: 'Qwen' },
  { id: 'kimi', name: 'Kimi' },
];

const PROVIDER_OPTIONS = PROVIDERS.map((provider) => ({
  value: provider.id,
  label: provider.name,
}));

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const { providers, setApiKey } = useAIStore();
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [apiKey, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Load existing key when provider changes
  useEffect(() => {
    if (providers[selectedProvider]) {
      setApiKeyInput(providers[selectedProvider].key || '');
    } else {
      setApiKeyInput('');
    }
    setStatus('idle');
  }, [selectedProvider, providers, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');

    try {
      await setApiKey(selectedProvider, apiKey.trim());
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none p-4 animate-fade-in">
      <div 
        className="w-full max-w-md bg-editor-bg border border-editor-border rounded-xl shadow-2xl overflow-hidden glass-panel flex flex-col transition-all-custom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-editor-border bg-editor-titleBar">
          <div className="flex items-center gap-2 text-white">
            <Settings className="w-4 h-4 text-editor-accent" />
            <span className="font-semibold text-sm">Ajustes del Agente</span>
          </div>
          <button 
            onClick={onClose}
            className="text-editor-textDark hover:text-white rounded-lg p-1 hover:bg-editor-hover transition-all-custom"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-editor-border bg-editor-hover/30 px-3 py-2 text-[11px] text-editor-textDark">
            <Key className="w-3.5 h-3.5 text-editor-accent" />
            <span>Proveedores y claves API</span>
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

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-[11px] text-editor-textDark font-bold uppercase tracking-wider">
              Clave API (API Key)
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={`Ingresa tu clave de ${PROVIDERS.find(p => p.id === selectedProvider)?.name}`}
                className="w-full bg-editor-hover border border-editor-border text-xs rounded-lg pl-3 pr-10 py-2 text-white placeholder-zinc-600 outline-none focus:border-editor-accent transition-all-custom font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-editor-textDark hover:text-white p-0.5 rounded transition-all-custom"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-editor-textDark leading-normal mt-0.5">
              Esta clave se guardará de forma local y encriptada en tu equipo. Nunca se compartirá con servidores externos.
            </p>
          </div>

          {/* Messages */}
          {status === 'error' && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-950/40 border border-red-900/50 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-xs">
              <Check className="w-4 h-4 shrink-0 animate-bounce" />
              <span>¡Guardado correctamente! Cargando modelos...</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 mt-2 border-t border-editor-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'saving'}
              className="px-4 py-2 border border-editor-border hover:bg-editor-hover hover:border-zinc-700 text-editor-text font-medium text-xs rounded-lg active:scale-95 transition-all-custom"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={status === 'saving' || status === 'success'}
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-lg shadow active:scale-95 disabled:opacity-40 transition-all-custom"
            >
              {status === 'saving' ? 'Guardando...' : 'Conectar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default ApiKeyModal;
