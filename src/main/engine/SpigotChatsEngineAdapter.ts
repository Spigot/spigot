import { runAgentLoop } from '../agentRunner';
import type { AssistantPart, EngineEventListener, EngineTurnRequest } from './types';
import type { ProviderStreamPart } from './providers/types';
import type { ContextBoundEvent } from '../../shared/contextBudget';

export interface EngineAdapter {
  startTurn(request: EngineTurnRequest, onEvent: EngineEventListener): Promise<boolean>;
  abortTurn(turnId: string): void;
}

type AdapterRuntimeEvent =
  | { type: 'content'; text: string }
  | { type: 'part'; part: ProviderStreamPart }
  | { type: 'tool'; id: string; name: string; status: 'start' | 'progress' | 'end'; data?: unknown }
  | { type: 'bridge'; name: string; data: unknown }
  | { type: 'context:bounded'; data: ContextBoundEvent }
  | { type: 'history:file'; path: string; action: 'snapshot' | 'restore' }
  | { type: 'end'; aborted?: boolean }
  | { type: 'error'; message: string };

type AdapterRuntime = {
  executeTurn(input: {
    request: EngineTurnRequest;
    onEvent: (event: AdapterRuntimeEvent) => void;
  }): Promise<boolean>;
};

export function createE2ETypedStreamRuntime(): AdapterRuntime {
  if (process.env.SPIGOT_E2E_TYPED_STREAM !== '1') {
    throw new Error('The typed stream fixture is restricted to explicit E2E runs.');
  }
  return {
    async executeTurn({ onEvent }): Promise<boolean> {
      onEvent({
        type: 'part',
        part: {
          partId: 'e2e-text-0',
          kind: 'text',
          lifecycle: 'delta',
          text: 'Typed stream fixture response.',
        },
      });
      onEvent({ type: 'end', aborted: false });
      return true;
    },
  };
}

function createLegacyRuntime(legacyRunner = runAgentLoop): AdapterRuntime {
  return {
    async executeTurn({ request, onEvent }): Promise<boolean> {
      return legacyRunner({
        mode: request.mode,
        provider: request.provider,
        model: request.model,
        apiKey: request.apiKey,
        effort: request.effort,
        prompt: request.prompt,
        contextText: request.contextText ?? null,
        history: request.history,
        image: request.image ?? null,
        workspacePath: request.workspacePath,
        signal: request.signal,
        modelConfig: request.modelConfig,
        providers: request.providers,
        turnId: request.turnId,
        sessionId: request.sessionId,
        changeSetService: request.changeSetService,
        changeSetId: request.changeSetId,
        onEvent: (event) => {
          if (event.type === 'tool') {
            onEvent({
              type: 'tool',
              id: event.id,
              name: event.name,
              status: event.status,
              data: event.data,
            });
          } else if (event.type === 'context:bounded') {
            onEvent({ type: 'context:bounded', data: event.data });
          }
        },
        sendChunk: (chunk: string) => {
          onEvent({ type: 'content', text: chunk });
        },
        sendPart: (part: ProviderStreamPart) => onEvent({ type: 'part', part }),
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
  private readonly activeTurnControllers = new Map<string, AbortController>();

  constructor(options: { runtime?: AdapterRuntime; legacyRunner?: typeof runAgentLoop } = {}) {
    this.runtime = options.runtime ?? createLegacyRuntime(options.legacyRunner);
  }

  async startTurn(request: EngineTurnRequest, onEvent: EngineEventListener): Promise<boolean> {
    let sawTerminal = false;
    const turnController = new AbortController();
    this.activeTurnControllers.set(request.turnId, turnController);

    const onParentAbort = () => {
      turnController.abort();
    };

    if (request.signal.aborted) {
      turnController.abort();
    } else {
      request.signal.addEventListener('abort', onParentAbort, { once: true });
    }

    const emit = (event: AdapterRuntimeEvent): void => {
      if (sawTerminal) {
        return;
      }

      switch (event.type) {
        case 'content':
          onEvent({ type: 'content', turnId: request.turnId, text: event.text });
          // Compatibility adapter: legacy string producers remain visible as text parts.
          onEvent({
            type: 'part',
            turnId: request.turnId,
            part: {
              partId: `legacy-text-${nextOrdinal}`,
              kind: 'text',
              lifecycle: 'delta',
              ordinal: nextOrdinal++,
              conversationId: request.sessionId,
              turnId: request.turnId,
              text: event.text,
            },
          });
          break;
        case 'part': {
          const part: AssistantPart = {
            ...event.part,
            ordinal: nextOrdinal++,
            conversationId: request.sessionId,
            turnId: request.turnId,
          };
          onEvent({ type: 'part', turnId: request.turnId, part });
          break;
        }
        case 'tool':
          onEvent({ ...event, type: 'tool', turnId: request.turnId });
          break;
        case 'bridge':
          onEvent({ ...event, type: 'bridge', turnId: request.turnId });
          break;
        case 'context:bounded':
          onEvent({ ...event, type: 'context:bounded', turnId: request.turnId });
          break;
        case 'history:file':
          onEvent({ ...event, type: 'history:file', turnId: request.turnId });
          break;
        case 'error':
          sawTerminal = true;
          this.activeTurnControllers.delete(request.turnId);
          onEvent({ type: 'error', turnId: request.turnId, message: event.message });
          break;
        case 'end':
          sawTerminal = true;
          this.activeTurnControllers.delete(request.turnId);
          onEvent({ type: 'end', turnId: request.turnId, aborted: event.aborted });
          break;
      }
    };

    let nextOrdinal = 0;
    try {
      const turnRequest: EngineTurnRequest = {
        ...request,
        signal: turnController.signal,
      };
      const success = await this.runtime.executeTurn({ request: turnRequest, onEvent: emit });

      return success;
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError' || turnController.signal.aborted) {
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
    } finally {
      request.signal.removeEventListener('abort', onParentAbort);
      this.activeTurnControllers.delete(request.turnId);
    }
  }

  abortTurn(turnId: string): void {
    const controller = this.activeTurnControllers.get(turnId);
    if (controller) {
      controller.abort();
      this.activeTurnControllers.delete(turnId);
    }
  }
}
