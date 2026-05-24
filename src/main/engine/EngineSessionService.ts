import { randomUUID } from 'crypto';

import type { AgentRunOptions } from '../agentRunner';
import type { EngineAdapter } from './SpigotChatsEngineAdapter';
import type { EngineEvent, EngineEventListener, EngineTurnRequest } from './types';

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
};

export class EngineSessionService {
  private activeTurn: ActiveTurn | null = null;

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly options: { enabled?: boolean; legacyRunner?: LegacyRunner } = {},
  ) {}

  async startTurn(
    input: EngineSessionInput,
    onEvent: EngineEventListener,
  ): Promise<boolean> {
    if (this.activeTurn) {
      this.activeTurn.abortController.abort();
      this.adapter.abortTurn(this.activeTurn.turnId);
    }

    const abortController = new AbortController();
    const turnId = randomUUID();
    this.activeTurn = { turnId, abortController };

    const emit = (event: EngineEvent) => {
      if (event.type === 'end' || event.type === 'error') {
        this.activeTurn = null;
      }

      onEvent(event);
    };

    if (!this.options.enabled && this.options.legacyRunner) {
      return this.runLegacy(input, turnId, abortController.signal, emit);
    }

    const request: EngineTurnRequest = {
      ...input,
      turnId,
      signal: abortController.signal,
    };

    const success = await this.adapter.startTurn(request, emit);
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
    this.adapter.abortTurn(this.activeTurn.turnId);
    this.activeTurn = null;
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
        contextText: input.contextText,
        history: input.history,
        image: input.image,
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
