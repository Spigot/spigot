import { randomUUID } from 'crypto';

import type { ModelConfiguration } from '../../shared/modelConfiguration';
import type { AgentRunOptions } from '../agentRunner';
import type { WorkspaceChangeSetService } from '../changes/WorkspaceChangeSetService';
import { PermissionBroker, type PermissionDecision } from './PermissionBroker';
import type { EngineAdapter } from './SpigotChatsEngineAdapter';
import type { AssistantPart, EngineEvent, EngineEventListener, EngineModelEffort, EngineTurnRequest } from './types';
import { EngineHistoryStore } from './historyStore';
type TurnChangeSetBoundary = {
  beginTurn(input: { turnId: string; conversationId: string; workspacePath: string }): Promise<{ id: string }>;
  closeTurn(turnId: string): void;
};

export type EngineSessionInput = {
  sessionId: string;
  turnId?: string;
  mode: 'orchestrator' | 'build' | 'plan' | 'review';
  provider: string;
  model: string;
  apiKey: string;
  effort?: EngineModelEffort;
  prompt: string;
  contextText?: string | null;
  history: unknown[];
  image?: string | null;
  contextSource?: 'default' | 'explicit';
  workspacePath: string;
  modelConfig?: ModelConfiguration;
  providers?: Record<string, { apiKey: string; [key: string]: unknown }>;
};

export type LegacyRunner = (opts: AgentRunOptions) => Promise<boolean>;

type ActiveTurn = {
  turnId: string;
  sessionId: string;
  abortController: AbortController;
  permissionBroker: PermissionBroker;
  emit: EngineEventListener;
  closed: boolean;
};

export class EngineSessionService {
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private readonly historyStore: EngineHistoryStore;

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly options: {
      enabled?: boolean;
      legacyRunner?: LegacyRunner;
      historyStore?: EngineHistoryStore;
      changeSetService?: TurnChangeSetBoundary;
    } = {},
  ) {
    this.historyStore = options.historyStore ?? new EngineHistoryStore();
  }

  async startTurn(
    input: EngineSessionInput,
    onEvent: EngineEventListener,
  ): Promise<boolean> {
    const existing = this.activeTurns.get(input.sessionId);
    if (existing) {
      existing.closed = true;
      existing.abortController.abort();
      this.adapter.abortTurn(existing.turnId);
      this.options.changeSetService?.closeTurn(existing.turnId);
      this.activeTurns.delete(input.sessionId);
    }

    const abortController = new AbortController();
    const turnId = input.turnId || randomUUID();
    let changeSetId: string | undefined;
    if (this.options.changeSetService) {
      changeSetId = (await this.options.changeSetService.beginTurn({
        turnId,
        conversationId: input.sessionId,
        workspacePath: input.workspacePath,
      })).id;
    }
    const permissionBroker = new PermissionBroker();
    const assistantMessages: unknown[] = [];
    const assistantParts = new Map<string, AssistantPart & { content: string }>();
    const fileHistory: Array<{ path: string; action: 'snapshot' | 'restore' }> = [];
    const persistedHistory = await this.historyStore.load(input.workspacePath, input.sessionId);
    const effectiveHistory = input.history.length > 0 ? input.history : persistedHistory.messages;

    const emit = (event: EngineEvent) => {
      const active = this.activeTurns.get(input.sessionId);
      if (!active || active.closed || active.turnId !== turnId || event.turnId !== turnId) {
        return;
      }

      if (event.type === 'end' || event.type === 'error') {
        active.closed = true;
        this.activeTurns.delete(input.sessionId);
        this.options.changeSetService?.closeTurn(turnId);
      }

      if (event.type === 'content') {
        assistantMessages.push({ role: 'assistant', content: event.text });
      }

      if (event.type === 'part') {
        const existingPart = assistantParts.get(event.part.partId);
        assistantParts.set(event.part.partId, {
          ...event.part,
          content: (existingPart?.content ?? '') + (event.part.lifecycle === 'delta' ? event.part.text ?? '' : ''),
        });
      }

      if (event.type === 'history:file') {
        fileHistory.push({ path: event.path, action: event.action });
      }

      onEvent(event);
    };

    const activeTurn: ActiveTurn = {
      turnId,
      sessionId: input.sessionId,
      abortController,
      permissionBroker,
      emit,
      closed: false,
    };
    this.activeTurns.set(input.sessionId, activeTurn);

    if (!this.options.enabled && this.options.legacyRunner) {
      const success = await this.runLegacy(
        { ...input, history: effectiveHistory },
        turnId,
        abortController.signal,
        emit,
        changeSetId,
      );
      if (assistantParts.size > 0) {
        const parts = [...assistantParts.values()].sort((a, b) => a.ordinal - b.ordinal);
        assistantMessages.push({ role: 'assistant', content: parts.filter(part => part.kind === 'text').map(part => part.content).join(''), parts: parts.map(({ content, ...part }) => ({ ...part, text: content })) });
      }
      await this.historyStore.append(input.workspacePath, input.sessionId, {
        messages: [...effectiveHistory, ...assistantMessages],
        fileHistory: [...persistedHistory.fileHistory, ...fileHistory],
      });
      this.options.changeSetService?.closeTurn(turnId);
      return success;
    }

    const request: EngineTurnRequest = {
      ...input,
      history: effectiveHistory,
      turnId,
      signal: abortController.signal,
      changeSetService: this.options.changeSetService as WorkspaceChangeSetService | undefined,
      changeSetId,
      fileHistory: persistedHistory.fileHistory,
      requestToolPermission: async ({ tool, input: permissionInput }) => {
        const active = this.activeTurns.get(input.sessionId);
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
    if (assistantParts.size > 0) {
      const parts = [...assistantParts.values()].sort((a, b) => a.ordinal - b.ordinal);
      assistantMessages.push({
        role: 'assistant',
        content: parts.filter(part => part.kind === 'text').map(part => part.content).join(''),
        parts: parts.map(({ content, ...part }) => ({ ...part, text: content })),
      });
    }
    await this.historyStore.append(input.workspacePath, input.sessionId, {
      messages: [...effectiveHistory, ...assistantMessages],
      fileHistory: [...persistedHistory.fileHistory, ...fileHistory],
    });
    if (this.activeTurns.get(input.sessionId)?.turnId === turnId) {
      this.activeTurns.delete(input.sessionId);
    }
    this.options.changeSetService?.closeTurn(turnId);
    return success;
  }

  abortActiveTurn(sessionId?: string, turnId?: string): void {
    if (sessionId) {
      const turn = this.activeTurns.get(sessionId);
      if (turn) {
        turn.abortController.abort();
        this.adapter.abortTurn(turn.turnId);
        turn.emit({ type: 'end', turnId: turn.turnId, aborted: true });
        turn.closed = true;
        this.activeTurns.delete(sessionId);
      }
      return;
    }

    if (turnId) {
      for (const [sId, turn] of this.activeTurns.entries()) {
        if (turn.turnId === turnId) {
          turn.abortController.abort();
          this.adapter.abortTurn(turn.turnId);
          turn.emit({ type: 'end', turnId: turn.turnId, aborted: true });
          turn.closed = true;
          this.activeTurns.delete(sId);
          return;
        }
      }
      return;
    }

    // If no target specified, abort all active turns
    for (const turn of this.activeTurns.values()) {
      turn.abortController.abort();
      this.adapter.abortTurn(turn.turnId);
      turn.emit({ type: 'end', turnId: turn.turnId, aborted: true });
      turn.closed = true;
    }
    this.activeTurns.clear();
  }

  resolvePermissionRequest(requestId: string, decision: PermissionDecision, sessionId?: string): boolean {
    if (sessionId) {
      const turn = this.activeTurns.get(sessionId);
      return turn ? turn.permissionBroker.resolvePermission({ requestId, decision }) : false;
    }
    for (const turn of this.activeTurns.values()) {
      if (turn.permissionBroker.resolvePermission({ requestId, decision })) {
        return true;
      }
    }
    return false;
  }

  private async runLegacy(
    input: EngineSessionInput,
    turnId: string,
    signal: AbortSignal,
    onEvent: EngineEventListener,
    changeSetId?: string,
  ): Promise<boolean> {
    const runner = this.options.legacyRunner;
    let nextPartOrdinal = 0;
    if (!runner) {
      onEvent({ type: 'error', turnId, message: 'Legacy runner not configured' });
      return false;
    }

    try {
      const success = await runner({
        mode: input.mode,
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        effort: input.effort,
        prompt: input.prompt,
        contextText: input.contextText ?? null,
        history: input.history,
        image: input.image ?? null,
        contextSource: input.contextSource,
        workspacePath: input.workspacePath,
        signal,
        modelConfig: input.modelConfig,
        providers: input.providers,
        turnId,
        onEvent: (event) => onEvent(event),
        changeSetService: this.options.changeSetService as WorkspaceChangeSetService | undefined,
        changeSetId,
        sendChunk: (chunk: string) => onEvent({ type: 'content', turnId, text: chunk }),
        sendPart: (part) => onEvent({
          type: 'part',
          turnId,
          part: {
            ...part,
            ordinal: nextPartOrdinal++,
            conversationId: input.sessionId,
            turnId,
          },
        }),
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
