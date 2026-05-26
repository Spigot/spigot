import { randomUUID } from 'crypto';

import type { AgentRunOptions } from '../agentRunner';
import { PermissionBroker, type PermissionDecision } from './PermissionBroker';
import type { EngineAdapter } from './SpigotChatsEngineAdapter';
import type { EngineEvent, EngineEventListener, EngineTurnRequest } from './types';
import { EngineHistoryStore } from './historyStore';

export type EngineSessionInput = {
  sessionId: string;
  mode: 'chat' | 'agent';
  provider: string;
  model: string;
  apiKey: string;
  prompt: string;
  contextText?: string | null;
  history: unknown[];
  image?: string | null;
  workspacePath: string;
};

export type LegacyRunner = (opts: AgentRunOptions) => Promise<boolean>;

type ActiveTurn = {
  turnId: string;
  abortController: AbortController;
  permissionBroker: PermissionBroker;
  emit: EngineEventListener;
  closed: boolean;
};

export class EngineSessionService {
  private activeTurn: ActiveTurn | null = null;
  private readonly historyStore: EngineHistoryStore;

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly options: {
      enabled?: boolean;
      legacyRunner?: LegacyRunner;
      historyStore?: EngineHistoryStore;
    } = {},
  ) {
    this.historyStore = options.historyStore ?? new EngineHistoryStore();
  }

  async startTurn(
    input: EngineSessionInput,
    onEvent: EngineEventListener,
  ): Promise<boolean> {
    if (this.activeTurn) {
      this.activeTurn.closed = true;
      this.activeTurn.abortController.abort();
      this.adapter.abortTurn(this.activeTurn.turnId);
    }

    const abortController = new AbortController();
    const turnId = randomUUID();
    const permissionBroker = new PermissionBroker();
    const assistantMessages: unknown[] = [];
    const fileHistory: Array<{ path: string; action: 'snapshot' | 'restore' }> = [];
    const persistedHistory = await this.historyStore.load(input.workspacePath, input.sessionId);
    const effectiveHistory = input.history.length > 0 ? input.history : persistedHistory.messages;

    const emit = (event: EngineEvent) => {
      const active = this.activeTurn;
      if (!active || active.closed || active.turnId !== turnId || event.turnId !== turnId) {
        return;
      }

      if (event.type === 'end' || event.type === 'error') {
        active.closed = true;
        this.activeTurn = null;
      }

      if (event.type === 'content') {
        assistantMessages.push({ role: 'assistant', content: event.text });
      }

      if (event.type === 'history:file') {
        fileHistory.push({ path: event.path, action: event.action });
      }

      onEvent(event);
    };

    this.activeTurn = { turnId, abortController, permissionBroker, emit, closed: false };

    if (!this.options.enabled && this.options.legacyRunner) {
      const success = await this.runLegacy(
        { ...input, history: effectiveHistory },
        turnId,
        abortController.signal,
        emit,
      );
      await this.historyStore.append(input.workspacePath, input.sessionId, {
        messages: [...effectiveHistory, ...assistantMessages],
        fileHistory: [...persistedHistory.fileHistory, ...fileHistory],
      });
      return success;
    }

    const request: EngineTurnRequest = {
      ...input,
      history: effectiveHistory,
      turnId,
      signal: abortController.signal,
      fileHistory: persistedHistory.fileHistory,
      requestToolPermission: async ({ tool, input: permissionInput }) => {
        const active = this.activeTurn;
        if (!active || active.turnId !== turnId) {
          return null;
        }

        const pending = active.permissionBroker.requestPermission({
          turnId,
          tool,
          input: permissionInput,
        });

        active.emit({
          type: 'permission:request',
          turnId,
          id: pending.request.id,
          tool,
          input: permissionInput,
        });

        const result = await pending.promise;
        active.emit({
          type: 'permission:result',
          turnId,
          id: pending.request.id,
          granted: result.granted,
        });

        return result.granted ? pending.request.id : null;
      },
    };

    const success = await this.adapter.startTurn(request, emit);
    await this.historyStore.append(input.workspacePath, input.sessionId, {
      messages: [...effectiveHistory, ...assistantMessages],
      fileHistory: [...persistedHistory.fileHistory, ...fileHistory],
    });
    if (this.activeTurn?.turnId === turnId) {
      this.activeTurn = null;
    }
    return success;
  }

  abortActiveTurn(): void {
    if (!this.activeTurn) {
      return;
    }

    this.activeTurn.abortController.abort();
    this.activeTurn.closed = true;
    this.adapter.abortTurn(this.activeTurn.turnId);
    this.activeTurn = null;
  }

  resolvePermissionRequest(requestId: string, decision: PermissionDecision): boolean {
    if (!this.activeTurn) {
      return false;
    }

    return this.activeTurn.permissionBroker.resolvePermission({ requestId, decision });
  }

  private async runLegacy(
    input: EngineSessionInput,
    turnId: string,
    signal: AbortSignal,
    onEvent: EngineEventListener,
  ): Promise<boolean> {
    const runner = this.options.legacyRunner;
    if (!runner) {
      onEvent({ type: 'error', turnId, message: 'Legacy runner not configured' });
      return false;
    }

    try {
      const success = await runner({
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        prompt: input.prompt,
        contextText: input.contextText ?? null,
        history: input.history,
        image: input.image ?? null,
        workspacePath: input.workspacePath,
        signal,
        sendChunk: (chunk: string) => onEvent({ type: 'content', turnId, text: chunk }),
        sendError: (message: string) => onEvent({ type: 'error', turnId, message }),
        sendEnd: (aborted?: boolean) => onEvent({ type: 'end', turnId, aborted }),
      });

      return success;
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        onEvent({ type: 'end', turnId, aborted: true });
        return false;
      }

      onEvent({
        type: 'error',
        turnId,
        message: error instanceof Error ? error.message : String(error),
      });
      onEvent({ type: 'end', turnId, aborted: false });
      return false;
    }
  }
}
