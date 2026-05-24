import { randomUUID } from 'crypto';

export type PermissionDecision = 'grant' | 'deny';

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

  resolvePermission(input: { requestId: string; decision: PermissionDecision }): boolean {
    const resolver = this.pending.get(input.requestId);
    if (!resolver) {
      return false;
    }

    resolver(input.decision === 'grant');
    return true;
  }
}
