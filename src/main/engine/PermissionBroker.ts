import { randomUUID } from 'crypto';

// 'always' grants the same tool for the rest of the session and 'full' grants
// every gated tool; the session layer records those before resolving the wait.
export type PermissionDecision = 'grant' | 'deny' | 'always' | 'full';

export type PermissionRequestEvent = {
  id: string;
  turnId: string;
  tool: string;
  input: unknown;
};

export class PermissionBroker {
  private readonly pending = new Map<string, (granted: boolean) => void>();

  requestPermission(input: {
    turnId: string;
    tool: string;
    input: unknown;
  }): { request: PermissionRequestEvent; promise: Promise<{ granted: boolean }> } {
    const id = randomUUID();
    const request: PermissionRequestEvent = { id, ...input };

    const promise = new Promise<{ granted: boolean }>(resolve => {
      this.pending.set(id, granted => {
        this.pending.delete(id);
        resolve({ granted });
      });
    });

    return { request, promise };
  }

  /** Resolves a wait that will never be answered (turn abort, shutdown). */
  abandon(requestId: string): void {
    const resolver = this.pending.get(requestId);
    if (resolver) {
      this.pending.delete(requestId);
      resolver(false);
    }
  }

  resolvePermission(input: { requestId: string; decision: PermissionDecision }): boolean {
    const resolver = this.pending.get(input.requestId);
    if (!resolver) {
      return false;
    }

    resolver(input.decision !== 'deny');
    return true;
  }
}
