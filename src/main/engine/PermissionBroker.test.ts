import { describe, expect, it } from 'vitest';

import { PermissionBroker } from './PermissionBroker';

describe('PermissionBroker', () => {
  it('resolves a pending permission request when granted', async () => {
    const broker = new PermissionBroker();
    const pending = broker.requestPermission({
      turnId: 'turn-1',
      tool: 'bash',
      input: { command: 'pwd' },
    });

    const settled = pending.promise;
    const resolved = broker.resolvePermission({
      requestId: pending.request.id,
      decision: 'grant',
    });

    expect(resolved).toBe(true);
    await expect(settled).resolves.toEqual({ granted: true });
  });

  it('returns false when trying to resolve unknown request id', () => {
    const broker = new PermissionBroker();
    const resolved = broker.resolvePermission({ requestId: 'missing', decision: 'deny' });
    expect(resolved).toBe(false);
  });
});
