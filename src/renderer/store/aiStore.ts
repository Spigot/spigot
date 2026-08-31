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
  authType?: 'api' | 'oauth';
  activeModel: string;
  availableModels: string[];
}

export interface ActiveStreamState {
  conversationId: string;
  turnId: string;
  text: string;
  isGenerating: boolean;
  error?: string | null;
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
  activeStreams: Record<string, ActiveStreamState>;

  initializeStore: () => Promise<void>;
  setApiKey: (provider: string, key: string, authType?: 'api' | 'oauth') => Promise<void>;
  selectModel: (provider: string, model: string) => Promise<void>;
  setActiveProvider: (provider: string) => void;
  sendMessage: (prompt: string, contextText: string | null, image?: string | null, mode?: 'orchestrator' | 'build' | 'plan' | 'review') => Promise<void>;
  abortChat: (conversationId?: string) => void;
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
  deepseek: ['deepseek-reasoner', 'deepseek-chat', 'deepseek-coder'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  openrouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'meta-llama/llama-3.1-8b-instruct:free', 'google/gemini-flash-1.5', 'mistralai/mistral-7b-instruct:free'],
  minimax: ['MiniMax-Text-01', 'MiniMax-M2.5', 'MiniMax-M2.7', 'abab6.5g-chat', 'abab6.5-chat'],
};

let turnCounter = 0;
function generateTurnId(): string {
  turnCounter += 1;
  return `turn-${Date.now()}-${turnCounter}-${Math.random().toString(36).substring(2, 7)}`;
}

export const useAIStore = create<AIState>((set, get) => {
  let boundApiAi: any = null;

  const setupAiListeners = () => {
    const apiAi = (window as any).api?.ai;
    if (!apiAi || boundApiAi === apiAi) return;
    boundApiAi = apiAi;

    (window as any).api.ai.onChunk((payload: any) => {
      const isObject = typeof payload === 'object' && payload !== null;
      const conversationId: string = isObject ? payload.conversationId : get().activeConversationId;
      const turnId: string | undefined = isObject ? payload.turnId : undefined;
      const chunk: string = isObject ? payload.chunk : payload;

      if (!conversationId || typeof chunk !== 'string') return;

      set((state: AIState) => {
        const existing = state.activeStreams[conversationId];
        if (turnId && existing && existing.turnId !== turnId) {
          return {};
        }

        const currentText = existing?.text || '';
        const newText = currentText + chunk;
        const updatedStream: ActiveStreamState = {
          conversationId,
          turnId: turnId || existing?.turnId || 'turn-default',
          text: newText,
          isGenerating: true,
          error: null,
        };

        const updatedStreams = {
          ...state.activeStreams,
          [conversationId]: updatedStream,
        };

        const isActive = conversationId === state.activeConversationId;
        return {
          activeStreams: updatedStreams,
          ...(isActive ? { incomingStreamText: newText, isGenerating: true } : {}),
        };
      });
    });

    (window as any).api.ai.onError((payload: any) => {
      const isObject = typeof payload === 'object' && payload !== null;
      const conversationId: string = isObject ? payload.conversationId : get().activeConversationId;
      const turnId: string | undefined = isObject ? payload.turnId : undefined;
      const errorMsg: string = isObject ? payload.error : payload;

      if (!conversationId) return;

      set((state: AIState) => {
        const existing = state.activeStreams[conversationId];
        if (turnId && existing && existing.turnId !== turnId) {
          return {};
        }

        const updatedStreams = { ...state.activeStreams };
        delete updatedStreams[conversationId];

        const isActive = conversationId === state.activeConversationId;
        return {
          activeStreams: updatedStreams,
          ...(isActive ? { error: errorMsg || 'Error desconocido.', isGenerating: false, incomingStreamText: '' } : {}),
        };
      });
    });

    (window as any).api.ai.onEnd(async (payload: any) => {
      const isObject = typeof payload === 'object' && payload !== null;
      const conversationId: string = isObject ? payload.conversationId : get().activeConversationId;
      const turnId: string | undefined = isObject ? payload.turnId : undefined;
      const aborted: boolean = isObject ? Boolean(payload.aborted) : Boolean(payload);

      if (!conversationId) return;

      const { activeStreams, conversations } = get();
      const stream = activeStreams[conversationId];
      if (turnId && stream && stream.turnId !== turnId) {
        return;
      }

      const finalContent = stream?.text || (aborted ? '*Generación cancelada por el usuario.*' : '');

      let updatedConvs = conversations;
      if (finalContent.trim()) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
        };

        updatedConvs = conversations.map(c => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: [...c.messages, assistantMessage],
            };
          }
          return c;
        });
      }

      set((state: AIState) => {
        const updatedStreams = { ...state.activeStreams };
        delete updatedStreams[conversationId];

        const isActive = conversationId === state.activeConversationId;
        const activeConv = updatedConvs.find(c => c.id === state.activeConversationId);

        return {
          conversations: updatedConvs,
          activeStreams: updatedStreams,
          ...(isActive ? {
            messages: activeConv ? activeConv.messages : state.messages,
            isGenerating: false,
            incomingStreamText: '',
          } : {}),
        };
      });

      if ((window as any).api?.store && updatedConvs !== conversations) {
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        await (window as any).api.store.setChatHistory(updatedConvs, workspacePath).catch(console.error);
      }
    });
  };

  return {
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
    activeStreams: {},

    initializeStore: async () => {
      setupAiListeners();

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
              const storedAuthType = (localStorage.getItem(`spigot_ai_authtype_${provider}`) as 'api' | 'oauth') || 'api';
              updated[provider].authType = storedAuthType;
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
          if (chatHistory && Array.isArray(chatHistory)) {
            if (chatHistory.length > 0 && (chatHistory[0] as any).messages) {
              loadedConvs = chatHistory as ChatConversation[];
              loadedActiveId = loadedConvs[0]?.id ?? null;
              loadedMessages = loadedConvs[0]?.messages ?? [];
            } else {
              const legacyMessages: ChatMessage[] = (chatHistory as any[]).map((msg: any, idx: number) => ({
                id: msg.id || `legacy-${idx}`,
                role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
                content: msg.content || '',
                timestamp: msg.timestamp || Date.now() - (chatHistory.length - idx) * 1000,
              }));
              const legacyConv: ChatConversation = {
                id: 'conv-legacy',
                title: legacyMessages[0]?.content.slice(0, 30) || 'Conversación anterior',
                messages: legacyMessages,
                timestamp: Date.now(),
              };
              loadedConvs = [legacyConv];
              loadedActiveId = legacyConv.id;
              loadedMessages = legacyMessages;
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

    setApiKey: async (provider: string, key: string, authType: 'api' | 'oauth' = 'api') => {
      try {
        await (window as any).api.store.setKey(provider, key);
        try {
          localStorage.setItem(`spigot_ai_authtype_${provider}`, authType);
        } catch {}
        
        set((state) => {
          const updated = { ...state.providers };
          if (updated[provider]) {
            updated[provider].key = key;
            updated[provider].authType = authType;
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

    sendMessage: async (prompt: string, contextText: string | null, image?: string | null, mode: 'orchestrator' | 'build' | 'plan' | 'review' = 'orchestrator') => {
      setupAiListeners();

      const { activeProvider, providers, conversations, activeConversationId, activeStreams } = get();
      const targetConvId = activeConversationId || `conv-${Date.now()}`;
      const isTargetGenerating = Boolean(activeStreams[targetConvId]?.isGenerating);
      if (isTargetGenerating || (!prompt.trim() && !image)) return;

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

      let updatedConvs = [...conversations];
      let activeConv = updatedConvs.find(c => c.id === targetConvId);

      if (!activeConv) {
        activeConv = {
          id: targetConvId,
          title: prompt.trim().substring(0, 25) || 'Nueva conversación',
          messages: [],
          timestamp: Date.now(),
        };
        updatedConvs = [activeConv, ...updatedConvs];
      }

      activeConv.messages = [...activeConv.messages, userMessage];

      if (activeConv.title === 'Nueva conversación' || activeConv.title === 'Conversación inicial') {
        activeConv.title = prompt.trim().substring(0, 25) || 'Conversación';
      }

      const turnId = generateTurnId();
      const newStreamState: ActiveStreamState = {
        conversationId: targetConvId,
        turnId,
        text: '',
        isGenerating: true,
        error: null,
      };

      set((state) => ({
        conversations: updatedConvs,
        activeConversationId: targetConvId,
        messages: activeConv ? activeConv.messages : state.messages,
        activeStreams: {
          ...state.activeStreams,
          [targetConvId]: newStreamState,
        },
        isGenerating: targetConvId === state.activeConversationId ? true : state.isGenerating,
        incomingStreamText: targetConvId === state.activeConversationId ? '' : state.incomingStreamText,
        error: null,
      }));

      if ((window as any).api?.store) {
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        (window as any).api.store.setChatHistory(updatedConvs, workspacePath).catch(console.error);
      }

      try {
        await (window as any).api.ai.streamChat({
          conversationId: targetConvId,
          turnId,
          mode,
          provider: activeProvider,
          model: providerData.activeModel,
          apiKey: providerData.key,
          prompt,
          contextText,
          history: activeConv.messages.slice(-11, -1),
          image,
        });
      } catch (err: any) {
        set((state) => {
          const updatedStreams = { ...state.activeStreams };
          delete updatedStreams[targetConvId];
          return {
            activeStreams: updatedStreams,
            error: err.message || 'Error al conectar con la API.',
            isGenerating: targetConvId === state.activeConversationId ? false : state.isGenerating,
          };
        });
      }
    },

    abortChat: (conversationId?: string) => {
      const targetId = conversationId || get().activeConversationId;
      if (!targetId) return;

      const stream = get().activeStreams[targetId];
      if ((window as any).api?.ai) {
        (window as any).api.ai.abortChat({
          conversationId: targetId,
          turnId: stream?.turnId,
        });
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
        const removeChunkListener = (window as any).api.ai.onChunk((payload: any) => {
          const chunk = typeof payload === 'object' && payload !== null ? payload.chunk : payload;
          if (typeof chunk === 'string') {
            accumulatedText += chunk;
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
          }
        });

        const removeErrorListener = (window as any).api.ai.onError((payload: any) => {
          const err = typeof payload === 'object' && payload !== null ? payload.error : payload;
          cleanup();
          set({ isGenerating: false });
          reject(new Error(err || 'Error al generar el mensaje de commit.'));
        });

        const removeEndListener = (window as any).api.ai.onEnd((payload: any) => {
          const aborted = typeof payload === 'object' && payload !== null ? payload.aborted : payload;
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
      for (const [sId, stream] of Object.entries(get().activeStreams)) {
        if ((window as any).api?.ai) {
          (window as any).api.ai.abortChat({ conversationId: sId, turnId: stream.turnId });
        }
      }

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
        activeStreams: {},
        incomingStreamText: '',
        isGenerating: false,
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
          isGenerating: false,
          error: null,
        };
      });
    },

    selectConversation: (id: string) => {
      const { conversations, activeStreams } = get();
      const conv = conversations.find(c => c.id === id);
      if (!conv) return;
      const stream = activeStreams[id];
      set({
        activeConversationId: id,
        messages: conv.messages,
        incomingStreamText: stream?.text || '',
        isGenerating: Boolean(stream?.isGenerating),
        error: stream?.error || null,
      });
    },

    deleteConversation: (id: string) => {
      const stream = get().activeStreams[id];
      if (stream && (window as any).api?.ai) {
        (window as any).api.ai.abortChat({
          conversationId: id,
          turnId: stream.turnId,
        });
      }

      set((state) => {
        const updatedConvs = state.conversations.filter(c => c.id !== id);
        const updatedStreams = { ...state.activeStreams };
        delete updatedStreams[id];

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

        const nextStream = nextActiveId ? updatedStreams[nextActiveId] : null;

        return {
          conversations: updatedConvs,
          activeConversationId: nextActiveId,
          messages: nextMessages,
          activeStreams: updatedStreams,
          incomingStreamText: nextStream?.text || '',
          isGenerating: Boolean(nextStream?.isGenerating),
          error: nextStream?.error || null,
        };
      });
    },
  };
});
