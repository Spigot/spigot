import { create } from 'zustand';
import { useWorkspaceStore } from './workspaceStore';
import { parseMessageThinking } from '../features/chat/messageParser';
import type { ChangeSetReview } from '../features/chat/ChangeSetReviewCard';
import type { AssistantPart } from '../../main/engine/types';
import type { ContextBoundEvent } from '../../shared/contextBudget';
import { createChatLogger, type ChatLogContext } from '../../shared/chatLogger';
import {
  createModelConfiguration,
  getAssignmentEffort,
  resolveModeAssignment,
  resolveRoleAssignment,
  setModeAssignment,
  setModeEffort,
  setModelEffort,
  setRoleAssignment,
  setRoleEffort,
  type ChatMode,
  type GentleRoleId,
  type ModelAssignment,
  type ModelConfiguration,
  type ModelEffort,
} from '../../shared/modelConfiguration';

export interface ToolCallState {
  id: string;
  name: string;
  status: 'start' | 'progress' | 'end';
  data?: any;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: PersistedAssistantPart[];
  image?: string; // Base64 data URL
  timestamp: number;
  tools?: ToolCallState[];
  changeSet?: ChangeSetReview;
  contextWarning?: ContextBoundEvent;
}

export type PersistedAssistantPart = Pick<AssistantPart, 'partId' | 'kind' | 'ordinal'> & { text: string; terminal?: 'completed' | 'cancelled' | 'error' };

export function assistantPartsFromLegacy(content: string): PersistedAssistantPart[] {
  return content === '' ? [] : [{ partId: 'legacy-text-0', kind: 'text', ordinal: 0, text: content }];
}

export function messageParts(message: Pick<ChatMessage, 'content' | 'parts'>): PersistedAssistantPart[] {
  return message.parts ?? assistantPartsFromLegacy(message.content);
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
  parts?: PersistedAssistantPart[];
  sawTypedParts?: boolean;
  isGenerating: boolean;
  error?: string | null;
  tools?: ToolCallState[];
  changeSet?: ChangeSetReview;
  contextWarning?: ContextBoundEvent;
}

export interface OAuthAccountInfo {
  id: string;
  email: string;
  projectId: string;
  addedAt: number;
  lastUsedAt: number;
  isActive: boolean;
  isCoolingDown: boolean;
  cooldownRemainingSeconds?: number;
  cooldownReason?: string;
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
  modelConfiguration: ModelConfiguration;
  chatModelOverrides: Partial<Record<ChatMode, ModelAssignment>>;
  oauthAccounts: OAuthAccountInfo[];

  loginWithOAuth: (provider: string) => Promise<{ email?: string; projectId?: string; token: string; accounts?: OAuthAccountInfo[] }>;
  loginWithGoogleOAuth: () => Promise<{ email?: string; projectId?: string; token: string; accounts?: OAuthAccountInfo[] }>;
  fetchOAuthAccounts: () => Promise<OAuthAccountInfo[]>;
  removeOAuthAccount: (accountId: string) => Promise<void>;
  setActiveOAuthAccount: (accountId: string) => Promise<void>;
  initializeStore: () => Promise<void>;
  setApiKey: (provider: string, key: string, authType?: 'api' | 'oauth') => Promise<void>;
  selectModel: (provider: string, model: string) => Promise<void>;
  setModeModelAssignment: (mode: ChatMode, assignment: ModelAssignment) => Promise<void>;
  setModeModelEffort: (mode: ChatMode, effort: ModelEffort | undefined) => Promise<void>;
  setChatModelOverride: (mode: ChatMode, assignment: ModelAssignment) => void;
  setChatModelOverrideEffort: (mode: ChatMode, effort: ModelEffort | undefined) => void;
  setRoleModelAssignment: (role: GentleRoleId, assignment: ModelAssignment) => Promise<void>;
  setRoleModelEffort: (role: GentleRoleId, effort: ModelEffort | undefined) => Promise<void>;
  setActiveProvider: (provider: string) => void;
  sendMessage: (prompt: string, contextText: string | null, image?: string | null, mode?: 'orchestrator' | 'build' | 'plan' | 'review', contextSource?: 'default' | 'explicit') => Promise<void>;
  abortChat: (conversationId?: string) => void;
  generateCommitMessage: (gitDiff: string, onChunk: (chunk: string) => void) => Promise<string>;
  clearHistory: () => void;
  createConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-5.6-terra',
    'gpt-5.6-terra-pro',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'o1',
    'o3',
    'o3-mini',
    'o4-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  'github-copilot': [
    'gpt-5.6-terra',
    'claude-3.7-sonnet',
    'claude-3.5-sonnet',
    'gpt-4o',
    'o1',
    'o3-mini',
  ],
  opencode: [
    'gpt-5.6-terra',
    'claude-3-7-sonnet',
    'gpt-5',
    'claude-3-5-sonnet',
    'gemini-2.5-pro',
  ],
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'claude-sonnet-4-6',
    'claude-opus-4-6-thinking',
    'antigravity-gemini-3-pro',
    'antigravity-gemini-3.1-pro',
    'antigravity-gemini-3-flash',
    'antigravity-gemini-3.7-flash',
    'antigravity-gemini-3.1-flash-lite',
    'antigravity-claude-sonnet-4-6',
    'antigravity-claude-opus-4-6-thinking',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  deepseek: [
    'deepseek-reasoner',
    'deepseek-chat',
    'deepseek-coder',
  ],
  qwen: [
    'qwen-max',
    'qwen-plus',
    'qwen-turbo',
    'qwen-2.5-coder-32b',
    'qwen-2.5-72b-instruct',
  ],
  kimi: [
    'moonshot-v1-128k',
    'moonshot-v1-32k',
    'moonshot-v1-8k',
    'kimi-latest',
  ],
  openrouter: [
    'openai/gpt-5.6-terra',
    'openai/gpt-5.6-terra-pro',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'deepseek/deepseek-r1',
    'deepseek/deepseek-chat',
    'meta-llama/llama-3.3-70b-instruct',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemini-2.0-flash-001',
    'google/gemini-flash-1.5',
    'mistralai/mistral-large-2411',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2.5-coder-32b-instruct',
  ],
  minimax: [
    'MiniMax-Text-01',
    'MiniMax-M2.5',
    'MiniMax-M2.7',
    'abab6.5g-chat',
    'abab6.5-chat',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  mistral: [
    'mistral-large-latest',
    'pixtral-large-latest',
    'codestral-latest',
    'mistral-small-latest',
  ],
  xai: [
    'grok-2-latest',
    'grok-2-vision-latest',
    'grok-beta',
  ],
  togetherai: [
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-V3',
  ],
  perplexity: [
    'sonar-pro',
    'sonar',
    'sonar-reasoning',
  ],
};

let turnCounter = 0;
const chatLog = createChatLogger();
function generateTurnId(): string {
  turnCounter += 1;
  return `turn-${Date.now()}-${turnCounter}-${Math.random().toString(36).substring(2, 7)}`;
}

export const useAIStore = create<AIState>((set, get) => {
  let boundApiAi: any = null;
  const pendingChunks = new Map<string, { turnId?: string; chunks: string[]; parts: AssistantPart[]; sawTypedParts: boolean }>();
  let pendingFrame: number | null = null;
  // The watchdog is idle-based: it re-arms on every stream activity, so long
  // reasoning turns are never killed while the provider keeps sending data.
  const TERMINAL_WATCHDOG_MS = 120_000;
  type TerminalWatchdog = { timer: number; turnId: string; logContext: ChatLogContext };
  const terminalWatchdogs = new Map<string, TerminalWatchdog>();
  const turnContexts = new Map<string, ChatLogContext>();
  const legacyFallbackTurns = new Set<string>();
  const contextFor = (conversationId: string, turnId?: string): ChatLogContext => turnContexts.get(`${conversationId}:${turnId}`) ?? { conversationId, turnId };

  const clearTerminalWatchdog = (conversationId: string) => {
    const watchdog = terminalWatchdogs.get(conversationId);
    if (watchdog !== undefined) window.clearTimeout(watchdog.timer);
    terminalWatchdogs.delete(conversationId);
  };

  const fireTerminalWatchdog = (conversationId: string, turnId: string, logContext: ChatLogContext) => {
    const stream = get().activeStreams[conversationId];
    if (!stream || stream.turnId !== turnId) {
      chatLog('warn', logContext, 'renderer.watchdog', 'watchdog.ignored_stale');
      return;
    }
    chatLog('error', logContext, 'renderer.watchdog', 'watchdog.fired', { partCount: stream.parts?.length ?? 0, textBytes: stream.text.length });
    flushPendingChunks();
    set(state => {
      const current = state.activeStreams[conversationId];
      if (!current || current.turnId !== turnId) return {};
      const finalParts = (current.parts || []).map(part => ({ ...part, terminal: 'error' as const }));
      const finalContent = current.text || finalParts.filter(part => part.kind === 'text').map(part => part.text).join('');
      const conversations = state.conversations.map(conversation => conversation.id === conversationId ? {
        ...conversation,
        messages: finalParts.length || finalContent ? [...conversation.messages, { id: `assistant-${conversationId}-${turnId}`, role: 'assistant' as const, content: finalContent, parts: finalParts, timestamp: Date.now(), tools: current.tools, changeSet: current.changeSet }] : conversation.messages,
      } : conversation);
      const activeStreams = { ...state.activeStreams };
      delete activeStreams[conversationId];
      const isActive = state.activeConversationId === conversationId;
      return { activeStreams, conversations, ...(isActive ? { messages: conversations.find(conversation => conversation.id === conversationId)?.messages || state.messages, isGenerating: false, incomingStreamText: '', error: 'La generación no finalizó. Se conservó la respuesta parcial.' } : {}) };
    });
    clearTerminalWatchdog(conversationId);
    legacyFallbackTurns.delete(`${conversationId}:${turnId}`);
    turnContexts.delete(`${conversationId}:${turnId}`);
  };

  const armTerminalWatchdog = (conversationId: string, turnId: string, logContext: ChatLogContext) => {
    clearTerminalWatchdog(conversationId);
    const timer = window.setTimeout(() => {
      const watchdog = terminalWatchdogs.get(conversationId);
      if (!watchdog || watchdog.turnId !== turnId) return;
      fireTerminalWatchdog(conversationId, watchdog.turnId, watchdog.logContext);
    }, TERMINAL_WATCHDOG_MS);
    terminalWatchdogs.set(conversationId, { timer, turnId, logContext });
  };

  const touchTerminalWatchdog = (conversationId: string) => {
    const watchdog = terminalWatchdogs.get(conversationId);
    if (!watchdog) return;
    const stream = get().activeStreams[conversationId];
    if (!stream || stream.turnId !== watchdog.turnId) return;
    armTerminalWatchdog(conversationId, watchdog.turnId, watchdog.logContext);
  };

  const isValidTypedPart = (payload: any, existing: ActiveStreamState): payload is { conversationId: string; turnId: string; part: AssistantPart } => {
    const part = payload?.part;
    return payload?.conversationId === existing.conversationId
      && payload?.turnId === existing.turnId
      && typeof part?.partId === 'string' && part.partId.length > 0
      && (part.kind === 'text' || part.kind === 'reasoning')
      && (part.lifecycle === 'start' || part.lifecycle === 'delta' || part.lifecycle === 'end')
      && Number.isInteger(part.ordinal) && part.ordinal >= 0
      && part.conversationId === existing.conversationId
      && part.turnId === existing.turnId
      && (part.lifecycle !== 'delta' || typeof part.text === 'string');
  };

  const flushPendingChunks = () => {
    if (pendingFrame !== null) {
      const cancel = typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame.bind(window) : window.clearTimeout.bind(window);
      cancel(pendingFrame);
      pendingFrame = null;
    }
    if (pendingChunks.size === 0) return;

    const chunks = [...pendingChunks.entries()];
    pendingChunks.clear();
    set((state: AIState) => {
      let activeStreams = state.activeStreams;
      let incomingStreamText = state.incomingStreamText;
      let isGenerating = state.isGenerating;
      for (const [conversationId, pending] of chunks) {
        const existing = activeStreams[conversationId];
        if (!existing || (pending.turnId && existing.turnId !== pending.turnId)) {
          chatLog('warn', contextFor(conversationId, pending.turnId), 'renderer.stream', 'chunk.batch_ignored_stale', { chunkCount: pending.chunks.length, partCount: pending.parts.length });
          continue;
        }
        let parts = existing.parts ?? [];
        const sawTypedParts = existing.sawTypedParts || pending.sawTypedParts;
        for (const part of pending.parts) {
          const index = parts.findIndex(candidate => candidate.partId === part.partId);
          if (part.lifecycle === 'start' && index === -1) {
            parts = [...parts, { partId: part.partId, kind: part.kind, ordinal: part.ordinal, text: '' }];
          } else if (part.lifecycle === 'delta') {
            if (index === -1) parts = [...parts, { partId: part.partId, kind: part.kind, ordinal: part.ordinal, text: part.text ?? '' }];
            else parts = parts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, text: candidate.text + (part.text ?? '') } : candidate);
          } else if (index >= 0) {
            parts = parts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, terminal: 'completed' } : candidate);
          }
        }
        const typedText = parts.filter(part => part.kind === 'text').map(part => part.text).join('');
        const text = sawTypedParts ? typedText : existing.text + pending.chunks.join('');
        chatLog('debug', contextFor(conversationId, existing.turnId), 'renderer.stream', 'chunk.batch_flushed', { chunkCount: pending.chunks.length, partCount: pending.parts.length, textBytes: text.length });
        activeStreams = { ...activeStreams, [conversationId]: { ...existing, text, parts, sawTypedParts } };
        if (conversationId === state.activeConversationId) {
          incomingStreamText = text;
          isGenerating = true;
        }
      }
      return activeStreams === state.activeStreams ? {} : { activeStreams, incomingStreamText, isGenerating };
    });
  };

  const schedulePendingChunkFlush = () => {
    if (pendingFrame !== null) return;
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16);
    pendingFrame = schedule(() => {
      pendingFrame = null;
      flushPendingChunks();
    });
  };

  const setupAiListeners = () => {
    const apiAi = (window as any).api?.ai;
    if (!apiAi || boundApiAi === apiAi) return;
    boundApiAi = apiAi;

    (window as any).api.ai.onChunk((payload: any) => {
      const isObject = typeof payload === 'object' && payload !== null;
      const conversationId: string = isObject ? payload.conversationId : get().activeConversationId;
      const turnId: string | undefined = isObject ? payload.turnId : undefined;
      const chunk: string = isObject ? payload.chunk : payload;

      if (!conversationId || typeof chunk !== 'string') {
        chatLog('warn', { conversationId, turnId }, 'renderer.ipc', 'chunk.ignored_malformed');
        return;
      }

      const existing = get().activeStreams[conversationId];
      if (!existing || (turnId && existing.turnId !== turnId)) {
        chatLog('warn', contextFor(conversationId, turnId), 'renderer.ipc', 'chunk.ignored_stale');
        return;
      }
      touchTerminalWatchdog(conversationId);
      const pending = pendingChunks.get(conversationId);
      if (existing.sawTypedParts || (pending && (pending.turnId !== turnId || pending.sawTypedParts))) {
        chatLog('info', contextFor(conversationId, turnId), 'renderer.stream', 'legacy_fallback.rejected_typed_authoritative');
        return;
      }
      const streamKey = `${conversationId}:${existing.turnId}`;
      if (!legacyFallbackTurns.has(streamKey)) {
        legacyFallbackTurns.add(streamKey);
        chatLog('info', contextFor(conversationId, turnId), 'renderer.stream', 'legacy_fallback.selected', { initialChunkBytes: chunk.length });
      }
      pendingChunks.set(conversationId, { turnId, chunks: [...(pending?.chunks || []), chunk], parts: pending?.parts || [], sawTypedParts: false });
      schedulePendingChunkFlush();
    });

    (window as any).api.ai.onPart?.((payload: any) => {
      const conversationId = payload?.conversationId;
      const turnId = payload?.turnId;
      if (!conversationId) {
        chatLog('warn', { turnId }, 'renderer.ipc', 'part.ignored_malformed');
        return;
      }
      const existing = get().activeStreams[conversationId];
      if (!existing || existing.turnId !== turnId || !isValidTypedPart(payload, existing)) {
        chatLog('warn', contextFor(conversationId, turnId), 'renderer.ipc', 'part.rejected', { hasActiveStream: Boolean(existing) });
        return;
      }
      touchTerminalWatchdog(conversationId);
      const part = payload.part;
      if (part.lifecycle !== 'delta') chatLog('info', contextFor(conversationId, turnId), 'renderer.stream', `part.${part.lifecycle}`, { ordinal: part.ordinal, textBytes: part.text?.length ?? 0 });
      const pending = pendingChunks.get(conversationId);
      if (pending && pending.turnId !== turnId) {
        chatLog('warn', contextFor(conversationId, turnId), 'renderer.ipc', 'part.ignored_stale_pending');
        return;
      }
      pendingChunks.set(conversationId, { turnId, chunks: [], parts: [...(pending?.parts || []), part], sawTypedParts: true });
      schedulePendingChunkFlush();
    });

    (window as any).api.ai.onChangeSetReady?.((payload: any) => {
      if (!payload?.conversationId || !payload?.turnId || !payload?.changeSet) return;
      if (get().activeStreams[payload.conversationId]?.turnId === payload.turnId) touchTerminalWatchdog(payload.conversationId);
      set((state: AIState) => {
        const stream = state.activeStreams[payload.conversationId];
        if (stream?.turnId === payload.turnId) {
          return { activeStreams: { ...state.activeStreams, [payload.conversationId]: { ...stream, changeSet: payload.changeSet } } };
        }
        const conversations = state.conversations.map(conversation => conversation.id === payload.conversationId
          ? { ...conversation, messages: conversation.messages.map((message, index, messages) => message.role === 'assistant' && index === messages.length - 1 ? { ...message, changeSet: payload.changeSet } : message) }
          : conversation);
        const active = conversations.find(conversation => conversation.id === state.activeConversationId);
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        (window as any).api?.store?.setChatHistory(conversations, workspacePath).catch(console.error);
        return { conversations, ...(active ? { messages: active.messages } : {}) };
      });
    });

    if ((window as any).api?.ai?.onTool) {
      (window as any).api.ai.onTool((payload: any) => {
        const isObject = typeof payload === 'object' && payload !== null;
        const conversationId: string = isObject ? payload.conversationId : get().activeConversationId;
        const turnId: string | undefined = isObject ? payload.turnId : undefined;
        const toolData = isObject ? payload.tool : payload;

        if (!conversationId || !toolData) return;
        if (turnId && get().activeStreams[conversationId]?.turnId === turnId) touchTerminalWatchdog(conversationId);

        set((state: AIState) => {
          const existing = state.activeStreams[conversationId];
          if (turnId && existing && existing.turnId !== turnId) {
            return {};
          }

          const existingTools = existing?.tools || [];
          const toolIndex = existingTools.findIndex(t => t.id === toolData.id);
          let newTools: ToolCallState[];
          if (toolIndex >= 0) {
            newTools = [...existingTools];
            newTools[toolIndex] = {
              ...newTools[toolIndex],
              status: toolData.status ?? newTools[toolIndex].status,
              data: toolData.data !== undefined ? toolData.data : newTools[toolIndex].data,
              name: toolData.name || newTools[toolIndex].name,
            };
          } else {
            newTools = [
              ...existingTools,
              {
                id: toolData.id || `tool-${Date.now()}`,
                name: toolData.name || 'tool',
                status: toolData.status || 'start',
                data: toolData.data,
                timestamp: Date.now(),
              },
            ];
          }

          const updatedStream: ActiveStreamState = {
            conversationId,
            turnId: turnId || existing?.turnId || 'turn-default',
            text: existing?.text || '',
            parts: existing?.parts || [],
            isGenerating: true,
            error: null,
            tools: newTools,
          };

          const updatedStreams = {
            ...state.activeStreams,
            [conversationId]: updatedStream,
          };

          return {
            activeStreams: updatedStreams,
          };
        });
      });
    }

    (window as any).api.ai.onContextBounded?.((payload: any) => {
      if (!payload?.conversationId || !payload?.turnId || !payload.warning) return;
      set((state: AIState) => {
        const stream = state.activeStreams[payload.conversationId];
        if (!stream || stream.turnId !== payload.turnId) return {};
        return { activeStreams: { ...state.activeStreams, [payload.conversationId]: { ...stream, contextWarning: payload.warning } } };
      });
    });

    (window as any).api.ai.onError((payload: any) => {
      const isObject = typeof payload === 'object' && payload !== null;
      const conversationId: string = isObject ? payload.conversationId : get().activeConversationId;
      const turnId: string | undefined = isObject ? payload.turnId : undefined;
      const errorMsg: string = isObject ? payload.error : payload;

      if (!conversationId) return;
      flushPendingChunks();

      set((state: AIState) => {
        const existing = state.activeStreams[conversationId];
        if (!existing || !turnId || existing.turnId !== turnId) {
          chatLog('warn', contextFor(conversationId, turnId), 'renderer.stream', 'terminal.error_ignored');
          return {};
        }
        chatLog('error', contextFor(conversationId, turnId), 'renderer.stream', 'terminal.error_accepted', { partCount: existing.parts?.length ?? 0, textBytes: existing.text.length });
        clearTerminalWatchdog(conversationId);
        legacyFallbackTurns.delete(`${conversationId}:${turnId}`);
        turnContexts.delete(`${conversationId}:${turnId}`);

        const finalParts = (existing?.parts || []).map(part => ({ ...part, terminal: 'error' as const }));
        const finalContent = existing?.text || finalParts.filter(part => part.kind === 'text').map(part => part.text).join('');
        const updatedConversations = finalParts.length || finalContent
          ? state.conversations.map(conversation => conversation.id === conversationId ? {
            ...conversation,
            messages: [...conversation.messages, {
              id: `assistant-${conversationId}-${existing?.turnId || turnId || 'turn-default'}`,
              role: 'assistant' as const,
              content: finalContent,
              parts: finalParts,
              timestamp: Date.now(),
              tools: existing?.tools,
              changeSet: existing?.changeSet,
            }],
          } : conversation)
          : state.conversations;
        const updatedStreams = { ...state.activeStreams };
        delete updatedStreams[conversationId];

        const isActive = conversationId === state.activeConversationId;
        return {
          activeStreams: updatedStreams,
          conversations: updatedConversations,
          ...(isActive ? { messages: updatedConversations.find(conversation => conversation.id === conversationId)?.messages || state.messages } : {}),
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
      flushPendingChunks();

      const { activeStreams, conversations } = get();
      const stream = activeStreams[conversationId];
      if (!stream || !turnId || stream.turnId !== turnId) {
        chatLog('warn', contextFor(conversationId, turnId), 'renderer.stream', 'terminal.ignored_stale', { hasActiveStream: Boolean(stream) });
        return;
      }
      chatLog('info', contextFor(conversationId, turnId), 'renderer.stream', aborted ? 'terminal.cancelled_accepted' : 'terminal.completed_accepted', { partCount: stream.parts?.length ?? 0, textBytes: stream.text.length });
      clearTerminalWatchdog(conversationId);
      legacyFallbackTurns.delete(`${conversationId}:${turnId}`);
      turnContexts.delete(`${conversationId}:${turnId}`);

       const rawParts = (stream?.parts || []).map(part => ({ ...part, terminal: aborted ? 'cancelled' as const : 'completed' as const }));
       let finalParts = rawParts;
       let finalContent = stream?.text || rawParts.filter(part => part.kind === 'text').map(part => part.text).join('');

       if (finalContent.includes('<think>') || finalContent.includes('</think>') || finalContent.toLowerCase().includes('<think')) {
         const parsed = parseMessageThinking(finalContent);
         finalContent = parsed.response;
         if (parsed.thought && !finalParts.some(p => p.kind === 'reasoning')) {
           finalParts = [
             { partId: `reasoning-parsed-${Date.now()}`, kind: 'reasoning', ordinal: 0, text: parsed.thought, terminal: aborted ? 'cancelled' : 'completed' },
             { partId: `text-parsed-${Date.now()}`, kind: 'text', ordinal: 1, text: parsed.response, terminal: aborted ? 'cancelled' : 'completed' },
           ];
         }
       }

      let updatedConvs = conversations;
       if (finalParts.length || finalContent) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${conversationId}-${stream?.turnId || turnId || 'turn-default'}`,
          role: 'assistant',
            content: finalContent,
            parts: finalParts,
          timestamp: Date.now(),
            tools: stream?.tools,
            changeSet: stream?.changeSet,
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
    modelConfiguration: createModelConfiguration(undefined),
    chatModelOverrides: {},
    oauthAccounts: [],

    fetchOAuthAccounts: async () => {
      try {
        if ((window as any).api?.oauth?.listAccounts) {
          const accounts = await (window as any).api.oauth.listAccounts();
          set({ oauthAccounts: accounts || [] });
          return accounts || [];
        }
      } catch (err) {
        console.error('Failed to fetch OAuth accounts:', err);
      }
      return [];
    },

    removeOAuthAccount: async (accountId: string) => {
      try {
        if ((window as any).api?.oauth?.removeAccount) {
          const res = await (window as any).api.oauth.removeAccount(accountId);
          const accounts = res?.accounts || [];
          set({ oauthAccounts: accounts });
          if (accounts.length === 0) {
            await get().setApiKey('gemini', '', 'api');
          } else {
            const active = accounts.find((a: any) => a.isActive) || accounts[0];
            if (active) {
              await get().setApiKey('gemini', `oauth_${active.id}`, 'oauth');
            }
          }
        }
      } catch (err) {
        console.error('Failed to remove OAuth account:', err);
      }
    },

    setActiveOAuthAccount: async (accountId: string) => {
      try {
        if ((window as any).api?.oauth?.setActiveAccount) {
          const res = await (window as any).api.oauth.setActiveAccount(accountId);
          const accounts = res?.accounts || [];
          set({ oauthAccounts: accounts });
        }
      } catch (err) {
        console.error('Failed to set active OAuth account:', err);
      }
    },

    loginWithOAuth: async (provider: string) => {
      let result: any;
      if (provider === 'gemini') {
        result = await (window as any).api?.oauth?.loginGoogle?.();
      } else if (provider === 'openai') {
        result = await (window as any).api?.oauth?.loginOpenAI?.();
      } else if (provider === 'github-copilot') {
        result = await (window as any).api?.oauth?.loginCopilot?.();
      } else if (provider === 'opencode') {
        result = await (window as any).api?.oauth?.loginOpenCode?.();
      } else {
        throw new Error(`OAuth no está disponible para el proveedor ${provider}`);
      }

      if (!result?.token) {
        throw new Error(`No se recibió token de autenticación para ${provider}`);
      }

      await get().setApiKey(provider, result.token, 'oauth');

      if (provider === 'gemini') {
        if (result.accounts) {
          set({ oauthAccounts: result.accounts });
        } else {
          await get().fetchOAuthAccounts();
        }
      }

      try {
        localStorage.setItem(`spigot_ai_oauth_email_${provider}`, result.email || '');
      } catch {}

      return {
        email: result.email,
        projectId: result.projectId,
        token: result.token,
        accounts: result.accounts,
      };
    },

    loginWithGoogleOAuth: async () => {
      return get().loginWithOAuth('gemini');
    },

    initializeStore: async () => {
      setupAiListeners();

      if (!(window as any).api?.store || !(window as any).api?.ai) {
        return;
      }

      try {
        const keys = await (window as any).api.store.getKeys();
        const selectedModels = await (window as any).api.store.getSelectedModels();
        const storedModelConfiguration = await (window as any).api.store.getModelConfiguration();
        const modelConfiguration = createModelConfiguration(storedModelConfiguration, selectedModels);
        if ((storedModelConfiguration as { version?: unknown } | undefined)?.version !== 2) {
          await (window as any).api.store.setModelConfiguration(modelConfiguration);
        }
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        const chatHistory = await (window as any).api.store.getChatHistory(workspacePath);
        const accounts = await get().fetchOAuthAccounts();

        set((state) => {
          const updated = { ...state.providers };
          for (const [provider, defaultList] of Object.entries(DEFAULT_MODELS)) {
            if (updated[provider]) {
              updated[provider].availableModels = [...defaultList];
              if (!updated[provider].activeModel && defaultList.length > 0) {
                updated[provider].activeModel = defaultList[0];
              }
            }
          }

          for (const [provider, key] of Object.entries(keys)) {
            if (updated[provider]) {
              updated[provider].key = key as string;
              const storedAuthType = (localStorage.getItem(`spigot_ai_authtype_${provider}`) as 'api' | 'oauth') || 'api';
              updated[provider].authType = storedAuthType;
            }
          }

          if (accounts && accounts.length > 0 && updated.gemini) {
            updated.gemini.authType = 'oauth';
            if (!updated.gemini.key) {
              const activeAcc = accounts.find((a: any) => a.isActive) || accounts[0];
              updated.gemini.key = `oauth_${activeAcc?.id || 'active'}`;
            }
          }

          for (const [provider, model] of Object.entries(selectedModels)) {
            if (updated[provider] && model) {
              updated[provider].activeModel = model as string;
            }
          }
          const firstConfiguredProvider = Object.entries(updated).find(([, data]) => Boolean(data.key && data.key.trim().length > 0))?.[0];

          // Parse and migrate chatHistory
          let loadedConvs: ChatConversation[] = [];
          let loadedActiveId: string | null = null;
          let loadedMessages: ChatMessage[] = [];
          if (chatHistory && Array.isArray(chatHistory)) {
            if (chatHistory.length > 0 && (chatHistory[0] as any).messages) {
              loadedConvs = (chatHistory as ChatConversation[]).map(conversation => ({ ...conversation, messages: conversation.messages.map(message => message.role === 'assistant' && !message.parts ? { ...message, parts: assistantPartsFromLegacy(message.content) } : message) }));
              loadedActiveId = loadedConvs[0]?.id ?? null;
              loadedMessages = loadedConvs[0]?.messages ?? [];
            } else {
              const legacyMessages: ChatMessage[] = (chatHistory as any[]).map((msg: any, idx: number) => ({
                id: msg.id || `legacy-${idx}`,
                role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
                content: msg.content || '',
                ...(msg.role === 'assistant' ? { parts: assistantPartsFromLegacy(msg.content || '') } : {}),
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
            modelConfiguration,
          };
        });

        // Query models dynamically for configured providers
        const { providers } = get();
        for (const [provider, data] of Object.entries(providers)) {
          try {
            const dynamic = await (window as any).api.ai.fetchModels(provider, data.key || undefined);
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
      } catch (err) {
        console.error('Failed to initialize AI store:', err);
      }
    },

    setApiKey: async (provider: string, key: string, authType: 'api' | 'oauth' = 'api') => {
      try {
        await (window as any).api.store.setKey(provider, key, authType);
        try {
          localStorage.setItem(`spigot_ai_authtype_${provider}`, authType);
        } catch {}
        
        set((state) => {
          const updated = { ...state.providers };
          if (updated[provider]) {
            updated[provider].key = key;
            updated[provider].authType = authType;
          }
          const firstConfiguredProvider = Object.entries(updated).find(([, data]) => Boolean(data.key && data.key.trim().length > 0))?.[0];
          return {
            providers: updated,
            activeProvider: key ? provider : firstConfiguredProvider ?? state.activeProvider,
          };
        });

        const dynamic = await (window as any).api.ai.fetchModels(provider, key || undefined);
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
          // A chat model identifies both its provider and model without changing the active conversation.
          return { providers: updated, activeProvider: provider };
        });
      } catch (err) {
        console.error(`Failed to store selected model for ${provider}:`, err);
      }
    },

    setModeModelAssignment: async (mode: ChatMode, assignment: ModelAssignment) => {
      const next = setModeAssignment(get().modelConfiguration, mode, assignment);
      await (window as any).api.store.setModelConfiguration(next);
      set({ modelConfiguration: next });
    },

    setModeModelEffort: async (mode: ChatMode, effort: ModelEffort | undefined) => {
      const next = setModeEffort(get().modelConfiguration, mode, effort);
      await (window as any).api.store.setModelConfiguration(next);
      set({ modelConfiguration: next });
    },

    setChatModelOverride: (mode: ChatMode, assignment: ModelAssignment) => {
      set(state => ({ chatModelOverrides: { ...state.chatModelOverrides, [mode]: assignment } }));
    },

    setChatModelOverrideEffort: (mode: ChatMode, effort: ModelEffort | undefined) => {
      set(state => {
        const configured = mode === 'orchestrator'
          ? resolveRoleAssignment(state.modelConfiguration, 'gentle-orchestrator', state.modelConfiguration.assignments.orchestrator)
          : state.modelConfiguration.assignments[mode];
        const assignment = state.chatModelOverrides[mode] ?? configured;
        if (!assignment) return {};
        return {
          chatModelOverrides: {
            ...state.chatModelOverrides,
            [mode]: setModelEffort(assignment, effort),
          },
        };
      });
    },

    setRoleModelAssignment: async (role: GentleRoleId, assignment: ModelAssignment) => {
      const next = setRoleAssignment(get().modelConfiguration, role, assignment);
      await (window as any).api.store.setModelConfiguration(next);
      set({ modelConfiguration: next });
    },

    setRoleModelEffort: async (role: GentleRoleId, effort: ModelEffort | undefined) => {
      const next = setRoleEffort(get().modelConfiguration, role, effort);
      await (window as any).api.store.setModelConfiguration(next);
      set({ modelConfiguration: next });
    },

    setActiveProvider: (provider: string) => {
      set({ activeProvider: provider });
    },

    sendMessage: async (prompt: string, contextText: string | null, image?: string | null, mode: 'orchestrator' | 'build' | 'plan' | 'review' = 'orchestrator', contextSource: 'default' | 'explicit' = 'default') => {
      setupAiListeners();

      const { activeProvider, providers, conversations, activeConversationId, activeStreams, modelConfiguration } = get();
      const targetConvId = activeConversationId || `conv-${Date.now()}`;
      const isTargetGenerating = Boolean(activeStreams[targetConvId]?.isGenerating);
      if (isTargetGenerating || (!prompt.trim() && !image)) return;

      const fallbackAssignment = providers[activeProvider]?.activeModel
        ? { providerId: activeProvider, modelId: providers[activeProvider].activeModel }
        : undefined;
      const legacyAssignment = resolveModeAssignment(modelConfiguration, mode, fallbackAssignment);
      const configuredAssignment = mode === 'orchestrator'
        ? resolveRoleAssignment(modelConfiguration, 'gentle-orchestrator', legacyAssignment)
        : legacyAssignment;
      const assignment = get().chatModelOverrides[mode] ?? configuredAssignment;
      const providerData = assignment ? providers[assignment.providerId] : undefined;
      if (!providerData || !providerData.key) {
        set({ error: 'Falta configurar la API Key para este proveedor.' });
        return;
      }

      if (!assignment?.modelId) {
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
      const logContext: ChatLogContext = { conversationId: targetConvId, turnId, mode: mode ?? 'orchestrator', providerModelId: `${assignment.providerId}/${assignment.modelId}`, startedAt: Date.now() };
      turnContexts.set(`${targetConvId}:${turnId}`, logContext);
      chatLog('info', logContext, 'renderer.stream', 'turn.accepted', { promptBytes: prompt.length, contextBytes: contextText?.length ?? 0, historyCount: activeConv.messages.length });
      const newStreamState: ActiveStreamState = {
        conversationId: targetConvId,
        turnId,
        text: '',
        parts: [],
        isGenerating: true,
        error: null,
      };

      clearTerminalWatchdog(targetConvId);
      armTerminalWatchdog(targetConvId, turnId, logContext);

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
        chatLog('info', logContext, 'renderer.ipc', 'provider.dispatch');
        await (window as any).api.ai.streamChat({
          conversationId: targetConvId,
          turnId,
          mode,
          provider: assignment.providerId,
          model: assignment.modelId,
          effort: getAssignmentEffort(assignment),
          apiKey: providerData.key,
          prompt,
          contextText,
          contextSource,
          history: activeConv.messages.slice(-11, -1),
          image,
        });
      } catch (err: any) {
        chatLog('error', logContext, 'renderer.ipc', 'provider.dispatch_error');
        clearTerminalWatchdog(targetConvId);
        legacyFallbackTurns.delete(`${targetConvId}:${turnId}`);
        turnContexts.delete(`${targetConvId}:${turnId}`);
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

      flushPendingChunks();
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
        clearTerminalWatchdog(sId);
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
      clearTerminalWatchdog(id);
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
