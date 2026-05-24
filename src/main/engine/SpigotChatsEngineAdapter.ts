import { runAgentLoop } from '../agentRunner';
import type { EngineEventListener, EngineTurnRequest } from './types';

export interface EngineAdapter {
  startTurn(request: EngineTurnRequest, onEvent: EngineEventListener): Promise<boolean>;
  abortTurn(turnId: string): void;
}

export class SpigotChatsEngineAdapter implements EngineAdapter {
  async startTurn(request: EngineTurnRequest, onEvent: EngineEventListener): Promise<boolean> {
    try {
      const success = await runAgentLoop({
        provider: request.provider,
        model: request.model,
        apiKey: request.apiKey,
        prompt: request.prompt,
        contextText: request.contextText,
        history: request.history,
        image: request.image,
        workspacePath: request.workspacePath,
        signal: request.signal,
        sendChunk: (chunk: string) => {
          onEvent({ type: 'content', turnId: request.turnId, text: chunk });
        },
        sendError: (message: string) => {
          onEvent({ type: 'error', turnId: request.turnId, message });
        },
        sendEnd: (aborted?: boolean) => {
          onEvent({ type: 'end', turnId: request.turnId, aborted });
        },
      });

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
