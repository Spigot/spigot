import { runAgentLoop } from '../agentRunner';
import type { EngineEventListener, EngineTurnRequest } from './types';

export interface EngineAdapter {
  startTurn(request: EngineTurnRequest, onEvent: EngineEventListener): Promise<boolean>;
  abortTurn(turnId: string): void;
}

type AdapterRuntimeEvent =
  | { type: 'content'; text: string }
  | { type: 'tool'; id: string; name: string; status: 'start' | 'progress' | 'end'; data?: unknown }
  | { type: 'bridge'; name: string; data: unknown }
  | { type: 'history:file'; path: string; action: 'snapshot' | 'restore' }
  | { type: 'end'; aborted?: boolean }
  | { type: 'error'; message: string };

type AdapterRuntime = {
  executeTurn(input: {
    request: EngineTurnRequest;
    onEvent: (event: AdapterRuntimeEvent) => void;
  }): Promise<boolean>;
};

function createLegacyRuntime(): AdapterRuntime {
  return {
    async executeTurn({ request, onEvent }): Promise<boolean> {
      return runAgentLoop({
        provider: request.provider,
        model: request.model,
        apiKey: request.apiKey,
        prompt: request.prompt,
        contextText: request.contextText ?? null,
        history: request.history,
        image: request.image ?? null,
        workspacePath: request.workspacePath,
        signal: request.signal,
        sendChunk: (chunk: string) => {
          onEvent({ type: 'content', text: chunk });
        },
        sendError: (message: string) => {
          onEvent({ type: 'error', message });
        },
        sendEnd: (aborted?: boolean) => {
          onEvent({ type: 'end', aborted });
        },
      });
    },
  };
}

export class SpigotChatsEngineAdapter implements EngineAdapter {
  private readonly runtime: AdapterRuntime;

  constructor(options: { runtime?: AdapterRuntime } = {}) {
    this.runtime = options.runtime ?? createLegacyRuntime();
  }

  async startTurn(request: EngineTurnRequest, onEvent: EngineEventListener): Promise<boolean> {
    let sawTerminal = false;
    const emit = (event: AdapterRuntimeEvent): void => {
      if (sawTerminal) {
        return;
      }

      switch (event.type) {
        case 'content':
          onEvent({ type: 'content', turnId: request.turnId, text: event.text });
          break;
        case 'tool':
          onEvent({ ...event, type: 'tool', turnId: request.turnId });
          break;
        case 'bridge':
          onEvent({ ...event, type: 'bridge', turnId: request.turnId });
          break;
        case 'history:file':
          onEvent({ ...event, type: 'history:file', turnId: request.turnId });
          break;
        case 'error':
          sawTerminal = true;
          onEvent({ type: 'error', turnId: request.turnId, message: event.message });
          break;
        case 'end':
          sawTerminal = true;
          onEvent({ type: 'end', turnId: request.turnId, aborted: event.aborted });
          break;
      }
    };

    try {
      const success = await this.runtime.executeTurn({ request, onEvent: emit });

      return success;
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        onEvent({ type: 'end', turnId: request.turnId, aborted: true });
        return false;
      }

      onEvent({
        type: 'error',
        turnId: request.turnId,
        message: error instanceof Error ? error.message : String(error),
      });
      onEvent({ type: 'end', turnId: request.turnId, aborted: false });
      return false;
    }
  }

  abortTurn(_turnId: string): void {
    // Abort is currently controlled by the service AbortController.
  }
}
