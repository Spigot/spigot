import { create } from 'zustand';
import { useWorkspaceStore } from './workspaceStore';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; // Base64 data URL
  timestamp: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
}

export interface ProviderState {
  key: string;
  activeModel: string;
  availableModels: string[];
}

interface AIState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
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
  sendMessage: (prompt: string, contextText: string | null, image?: string | null) => Promise<void>;
  generateCommitMessage: (gitDiff: string, onChunk: (chunk: string) => void) => Promise<string>;
  clearHistory: () => void;
  createConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  openrouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'meta-llama/llama-3.1-8b-instruct:free', 'google/gemini-flash-1.5', 'mistralai/mistral-7b-instruct:free'],
  minimax: ['MiniMax-Text-01', 'MiniMax-M2.5', 'MiniMax-M2.7', 'abab6.5g-chat', 'abab6.5-chat'],
};

export const useAIStore = create<AIState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  providers: {
    openai: { key: '', activeModel: '', availableModels: [] },
    anthropic: { key: '', activeModel: '', availableModels: [] },
    gemini: { key: '', activeModel: '', availableModels: [] },
    deepseek: { key: '', activeModel: '', availableModels: [] },
    qwen: { key: '', activeModel: '', availableModels: [] },
    kimi: { key: '', activeModel: '', availableModels: [] },
    openrouter: { key: '', activeModel: '', availableModels: [] },
    minimax: { key: '', activeModel: '', availableModels: [] },
  },
  activeProvider: 'openai',
  isGenerating: false,
  incomingStreamText: '',
  error: null,

  initializeStore: async () => {
    if (!(window as any).api?.store || !(window as any).api?.ai) {
      return;
    }

    try {
      const keys = await (window as any).api.store.getKeys();
      const selectedModels = await (window as any).api.store.getSelectedModels();
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      const chatHistory = await (window as any).api.store.getChatHistory(workspacePath);
      
      set((state) => {
        const updated = { ...state.providers };
        for (const [provider, key] of Object.entries(keys)) {
          if (updated[provider]) {
            updated[provider].key = key as string;
            if (!key) {
              updated[provider].activeModel = '';
              updated[provider].availableModels = [];
            }
          }
        }
        for (const [provider, model] of Object.entries(selectedModels)) {
          if (updated[provider]?.key) {
            updated[provider].activeModel = model as string;
          }
        }
        const firstConfiguredProvider = Object.entries(updated).find(([, data]) => data.key.trim().length > 0)?.[0];

        // Parse and migrate chatHistory
        let loadedConvs: ChatConversation[] = [];
        let loadedActiveId: string | null = null;
        let loadedMessages: ChatMessage[] = [];

        if (Array.isArray(chatHistory)) {
          if (chatHistory.length > 0) {
            const isConversationsArray = chatHistory[0] && typeof chatHistory[0] === 'object' && 'messages' in chatHistory[0];
            if (isConversationsArray) {
              loadedConvs = chatHistory as ChatConversation[];
              loadedActiveId = loadedConvs[0]?.id || null;
              loadedMessages = loadedConvs[0]?.messages || [];
            } else {
              const defaultConv: ChatConversation = {
                id: 'initial-conv',
                title: 'Conversación inicial',
                messages: chatHistory as ChatMessage[],
                timestamp: Date.now()
              };
              loadedConvs = [defaultConv];
              loadedActiveId = defaultConv.id;
              loadedMessages = defaultConv.messages;
            }
          }
        }

        if (loadedConvs.length === 0) {
          const freshConv: ChatConversation = {
            id: `conv-${Date.now()}`,
            title: 'Nueva conversación',
            messages: [],
            timestamp: Date.now()
          };
          loadedConvs = [freshConv];
          loadedActiveId = freshConv.id;
          loadedMessages = [];
        }

        return {
          providers: updated,
          activeProvider: firstConfiguredProvider ?? state.activeProvider,
          conversations: loadedConvs,
          activeConversationId: loadedActiveId,
          messages: loadedMessages,
        };
      });

      // Query models dynamically for configured providers
      const { providers } = get();
      for (const [provider, data] of Object.entries(providers)) {
        if (data.key) {
          try {
            const dynamic = await (window as any).api.ai.fetchModels(provider, data.key);
            const availableModels = dynamic && dynamic.length > 0
              ? dynamic
              : DEFAULT_MODELS[provider] ?? [];

            if (availableModels.length > 0) {
              set((state) => {
                const updated = { ...state.providers };
                updated[provider].availableModels = availableModels;
                if (!availableModels.includes(updated[provider].activeModel)) {
                  updated[provider].activeModel = availableModels[0];
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
          if (!key) {
            updated[provider].activeModel = '';
            updated[provider].availableModels = [];
          }
        }
        const firstConfiguredProvider = Object.entries(updated).find(([, data]) => data.key.trim().length > 0)?.[0];
        return {
          providers: updated,
          activeProvider: key ? provider : firstConfiguredProvider ?? state.activeProvider,
        };
      });

      if (key) {
        const dynamic = await (window as any).api.ai.fetchModels(provider, key);
        const availableModels = dynamic && dynamic.length > 0
          ? dynamic
          : DEFAULT_MODELS[provider] ?? [];

        if (availableModels.length > 0) {
          set((state) => {
            const updated = { ...state.providers };
            updated[provider].availableModels = availableModels;
            if (!availableModels.includes(updated[provider].activeModel)) {
              updated[provider].activeModel = availableModels[0];
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

  sendMessage: async (prompt: string, contextText: string | null, image?: string | null) => {
    const { activeProvider, providers, conversations, activeConversationId, isGenerating } = get();
    if (isGenerating || (!prompt.trim() && !image)) return;

    const providerData = providers[activeProvider];
    if (!providerData || !providerData.key) {
      set({ error: 'Falta configurar la API Key para este proveedor.' });
      return;
    }

    if (!providerData.activeModel) {
      set({ error: 'No hay un modelo configurado para este proveedor.' });
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      image: image || undefined,
      timestamp: Date.now(),
    };

    let targetConvId = activeConversationId;
    let updatedConvs = [...conversations];
    let activeConv = updatedConvs.find(c => c.id === targetConvId);

    if (!activeConv) {
      activeConv = {
        id: `conv-${Date.now()}`,
        title: prompt.trim().substring(0, 25) || 'Nueva conversación',
        messages: [],
        timestamp: Date.now(),
      };
      updatedConvs = [activeConv, ...updatedConvs];
      targetConvId = activeConv.id;
    }

    activeConv.messages = [...activeConv.messages, userMessage];

    if (activeConv.title === 'Nueva conversación' || activeConv.title === 'Conversación inicial') {
      activeConv.title = prompt.trim().substring(0, 25) || 'Conversación';
    }

    set({ 
      conversations: updatedConvs,
      activeConversationId: targetConvId,
      messages: activeConv.messages, 
      isGenerating: true, 
      incomingStreamText: '', 
      error: null 
    });

    if ((window as any).api?.store) {
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      (window as any).api.store.setChatHistory(updatedConvs, workspacePath).catch(console.error);
    }

    const removeChunkListener = (window as any).api.ai.onChunk((chunk: string) => {
      set((state) => ({ incomingStreamText: state.incomingStreamText + chunk }));
    });

    const removeErrorListener = (window as any).api.ai.onError((err: string) => {
      set({ error: err, isGenerating: false });
      cleanup();
    });

    const removeEndListener = (window as any).api.ai.onEnd(async (aborted?: boolean) => {
      const { incomingStreamText, conversations: currentConvs, activeConversationId: currentActiveId } = get();
      if (incomingStreamText.trim() || aborted) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: incomingStreamText || (aborted ? '*Generación cancelada por el usuario.*' : ''),
          timestamp: Date.now(),
        };

        const updatedCurrentConvs = currentConvs.map(c => {
          if (c.id === currentActiveId) {
            return {
              ...c,
              messages: [...c.messages, assistantMessage]
            };
          }
          return c;
        });

        const updatedActiveConv = updatedCurrentConvs.find(c => c.id === currentActiveId);
        
        set({ 
          conversations: updatedCurrentConvs,
          messages: updatedActiveConv ? updatedActiveConv.messages : []
        });

        if ((window as any).api?.store) {
          const workspacePath = useWorkspaceStore.getState().workspacePath;
          await (window as any).api.store.setChatHistory(updatedCurrentConvs, workspacePath).catch(console.error);
        }
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
        history: activeConv.messages.slice(-11, -1),
        image,
      });
    } catch (err: any) {
      set({ error: err.message || 'Error al conectar con la API.', isGenerating: false });
      cleanup();
    }
  },

  generateCommitMessage: async (gitDiff: string, onChunk: (chunk: string) => void) => {
    const { activeProvider, providers, isGenerating } = get();
    if (isGenerating) throw new Error('El agente está ocupado generando una respuesta.');

    const providerData = providers[activeProvider];
    if (!providerData || !providerData.key) {
      throw new Error('Falta configurar la API Key para este proveedor en el panel de IA.');
    }

    if (!providerData.activeModel) {
      throw new Error('No hay un modelo configurado para este proveedor.');
    }

    const prompt = `Generá un mensaje de commit corto y descriptivo usando la convención de 'conventional commits' (ej: 'feat: add ...', 'fix: resolve ...') basado en los siguientes cambios de código.

Cambios (git diff):
${gitDiff}

---
INSTRUCCIÓN CRÍTICA Y MANDATORIA:
1. Respondé ÚNICAMENTE con el mensaje de commit propuesto, en una sola línea.
2. NO saludes, NO ofrezcas ayuda, NO hagas preguntas, NO des explicaciones de lo que cambió, ni agregues bloques de código markdown (\`\`\`).
3. Tu respuesta debe consistir EXCLUSIVAMENTE en la única línea de texto del commit directo.`;

    let accumulatedText = '';
    set({ isGenerating: true });

    return new Promise<string>((resolve, reject) => {
      const removeChunkListener = (window as any).api.ai.onChunk((chunk: string) => {
        accumulatedText += chunk;
        // Clean thinking process tag if present
        let cleaned = accumulatedText;
        if (cleaned.includes('<think>')) {
          const thinkIndex = cleaned.indexOf('<think>');
          const endThinkIndex = cleaned.indexOf('</think>');
          if (endThinkIndex !== -1) {
            cleaned = cleaned.slice(0, thinkIndex) + cleaned.slice(endThinkIndex + 8);
          } else {
            cleaned = cleaned.slice(0, thinkIndex);
          }
        }
        onChunk(cleaned.trim());
      });

      const removeErrorListener = (window as any).api.ai.onError((err: string) => {
        cleanup();
        set({ isGenerating: false });
        reject(new Error(err));
      });

      const removeEndListener = (window as any).api.ai.onEnd((aborted?: boolean) => {
        cleanup();
        set({ isGenerating: false });
        if (aborted) {
          reject(new Error('Generación cancelada.'));
        } else {
          let cleaned = accumulatedText;
          if (cleaned.includes('<think>')) {
            const thinkIndex = cleaned.indexOf('<think>');
            const endThinkIndex = cleaned.indexOf('</think>');
            if (endThinkIndex !== -1) {
              cleaned = cleaned.slice(0, thinkIndex) + cleaned.slice(endThinkIndex + 8);
            } else {
              cleaned = cleaned.slice(0, thinkIndex);
            }
          }
          resolve(cleaned.trim());
        }
      });

      const cleanup = () => {
        removeChunkListener();
        removeErrorListener();
        removeEndListener();
      };

      (window as any).api.ai.streamChat({
        provider: activeProvider,
        model: providerData.activeModel,
        apiKey: providerData.key,
        prompt: prompt,
        contextText: null,
        history: []
      }).catch((err: any) => {
        cleanup();
        set({ isGenerating: false });
        reject(err);
      });
    });
  },

  clearHistory: async () => {
    const freshConv: ChatConversation = {
      id: `conv-${Date.now()}`,
      title: 'Nueva conversación',
      messages: [],
      timestamp: Date.now()
    };
    set({
      conversations: [freshConv],
      activeConversationId: freshConv.id,
      messages: [],
      error: null
    });
    if ((window as any).api?.store) {
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      await (window as any).api.store.setChatHistory([freshConv], workspacePath).catch(console.error);
    }
  },

  createConversation: () => {
    const newConv: ChatConversation = {
      id: `conv-${Date.now()}`,
      title: 'Nueva conversación',
      messages: [],
      timestamp: Date.now(),
    };
    set((state) => {
      const updatedConvs = [newConv, ...state.conversations];
      if ((window as any).api?.store) {
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        (window as any).api.store.setChatHistory(updatedConvs, workspacePath).catch(console.error);
      }
      return {
        conversations: updatedConvs,
        activeConversationId: newConv.id,
        messages: [],
        incomingStreamText: '',
        error: null,
      };
    });
  },

  selectConversation: (id: string) => {
    const { conversations } = get();
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    set({
      activeConversationId: id,
      messages: conv.messages,
      incomingStreamText: '',
      error: null,
    });
  },

  deleteConversation: (id: string) => {
    set((state) => {
      const updatedConvs = state.conversations.filter(c => c.id !== id);
      let nextActiveId = state.activeConversationId;
      let nextMessages = state.messages;

      if (state.activeConversationId === id) {
        if (updatedConvs.length > 0) {
          nextActiveId = updatedConvs[0].id;
          nextMessages = updatedConvs[0].messages;
        } else {
          const freshConv: ChatConversation = {
            id: `conv-${Date.now()}`,
            title: 'Nueva conversación',
            messages: [],
            timestamp: Date.now(),
          };
          updatedConvs.push(freshConv);
          nextActiveId = freshConv.id;
          nextMessages = [];
        }
      }

      if ((window as any).api?.store) {
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        (window as any).api.store.setChatHistory(updatedConvs, workspacePath).catch(console.error);
      }

      return {
        conversations: updatedConvs,
        activeConversationId: nextActiveId,
        messages: nextMessages,
        incomingStreamText: '',
        error: null,
      };
    });
  },
}));
