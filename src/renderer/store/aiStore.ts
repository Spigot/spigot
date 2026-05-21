import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ProviderState {
  key: string;
  activeModel: string;
  availableModels: string[];
}

interface AIState {
  messages: ChatMessage[];
  providers: Record<string, ProviderState>;
  activeProvider: string;
  isGenerating: boolean;
  incomingStreamText: string;
  error: string | null;

  initializeStore: () => Promise<void>;
  setApiKey: (provider: string, key: string) => Promise<void>;
  selectModel: (provider: string, model: string) => Promise<void>;
  setActiveProvider: (provider: string) => void;
  sendMessage: (prompt: string, contextText: string | null) => Promise<void>;
  clearHistory: () => void;
}

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
};

export const useAIStore = create<AIState>((set, get) => ({
  messages: [],
  providers: {
    openai: { key: '', activeModel: 'gpt-4o', availableModels: DEFAULT_MODELS.openai },
    anthropic: { key: '', activeModel: 'claude-3-5-sonnet-20241022', availableModels: DEFAULT_MODELS.anthropic },
    gemini: { key: '', activeModel: 'gemini-1.5-flash', availableModels: DEFAULT_MODELS.gemini },
    deepseek: { key: '', activeModel: 'deepseek-chat', availableModels: DEFAULT_MODELS.deepseek },
    qwen: { key: '', activeModel: 'qwen-plus', availableModels: DEFAULT_MODELS.qwen },
    kimi: { key: '', activeModel: 'moonshot-v1-8k', availableModels: DEFAULT_MODELS.kimi },
  },
  activeProvider: 'openai',
  isGenerating: false,
  incomingStreamText: '',
  error: null,

  initializeStore: async () => {
    try {
      const keys = await (window as any).api.store.getKeys();
      const selectedModels = await (window as any).api.store.getSelectedModels();
      
      set((state) => {
        const updated = { ...state.providers };
        for (const [provider, key] of Object.entries(keys)) {
          if (updated[provider]) {
            updated[provider].key = key as string;
          }
        }
        for (const [provider, model] of Object.entries(selectedModels)) {
          if (updated[provider]) {
            updated[provider].activeModel = model as string;
          }
        }
        return { providers: updated };
      });

      // Query models dynamically for configured providers
      const { providers } = get();
      for (const [provider, data] of Object.entries(providers)) {
        if (data.key) {
          try {
            const dynamic = await (window as any).api.ai.fetchModels(provider, data.key);
            if (dynamic && dynamic.length > 0) {
              set((state) => {
                const updated = { ...state.providers };
                updated[provider].availableModels = dynamic;
                // If current model is not in new list, reset to first available
                if (!dynamic.includes(updated[provider].activeModel)) {
                  updated[provider].activeModel = dynamic[0];
                }
                return { providers: updated };
              });
            }
          } catch (e) {
            console.error(`Failed to refresh dynamic models on init for ${provider}`, e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to initialize AI store:', err);
    }
  },

  setApiKey: async (provider: string, key: string) => {
    try {
      await (window as any).api.store.setKey(provider, key);
      
      set((state) => {
        const updated = { ...state.providers };
        if (updated[provider]) {
          updated[provider].key = key;
        }
        return { providers: updated };
      });

      // Dynamically load models
      if (key) {
        const dynamic = await (window as any).api.ai.fetchModels(provider, key);
        if (dynamic && dynamic.length > 0) {
          set((state) => {
            const updated = { ...state.providers };
            updated[provider].availableModels = dynamic;
            // Select first model if current isn't valid
            if (!dynamic.includes(updated[provider].activeModel)) {
              updated[provider].activeModel = dynamic[0];
            }
            return { providers: updated };
          });
        }
      }
    } catch (err) {
      console.error(`Failed setting API key for ${provider}`, err);
    }
  },

  selectModel: async (provider: string, model: string) => {
    try {
      await (window as any).api.store.setSelectedModel(provider, model);
      set((state) => {
        const updated = { ...state.providers };
        if (updated[provider]) {
          updated[provider].activeModel = model;
        }
        return { providers: updated };
      });
    } catch (err) {
      console.error(`Failed to store selected model for ${provider}:`, err);
    }
  },

  setActiveProvider: (provider: string) => {
    set({ activeProvider: provider });
  },

  sendMessage: async (prompt: string, contextText: string | null) => {
    const { activeProvider, providers, messages, isGenerating } = get();
    if (isGenerating || !prompt.trim()) return;

    const providerData = providers[activeProvider];
    if (!providerData || !providerData.key) {
      set({ error: 'Falta configurar la API Key para este proveedor.' });
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    set({ 
      messages: [...messages, userMessage], 
      isGenerating: true, 
      incomingStreamText: '', 
      error: null 
    });

    // Set up listeners for SSE stream
    const removeChunkListener = (window as any).api.ai.onChunk((chunk: string) => {
      set((state) => ({ incomingStreamText: state.incomingStreamText + chunk }));
    });

    const removeErrorListener = (window as any).api.ai.onError((err: string) => {
      set({ error: err, isGenerating: false });
      cleanup();
    });

    const removeEndListener = (window as any).api.ai.onEnd((aborted?: boolean) => {
      const { incomingStreamText, messages: currentMessages } = get();
      if (incomingStreamText.trim() || aborted) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: incomingStreamText || (aborted ? '*Generación cancelada por el usuario.*' : ''),
          timestamp: Date.now(),
        };
        set({ messages: [...currentMessages, assistantMessage] });
      }
      set({ isGenerating: false, incomingStreamText: '' });
      cleanup();
    });

    const cleanup = () => {
      removeChunkListener();
      removeErrorListener();
      removeEndListener();
    };

    try {
      await (window as any).api.ai.streamChat({
        provider: activeProvider,
        model: providerData.activeModel,
        apiKey: providerData.key,
        prompt,
        contextText,
        history: messages.slice(-10), // Send last 10 messages for lightweight context
      });
    } catch (err: any) {
      set({ error: err.message || 'Error al conectar con la API.', isGenerating: false });
      cleanup();
    }
  },

  clearHistory: () => {
    set({ messages: [], error: null });
  },
}));
