import { describe, expect, it } from 'vitest';
import { OAuthAccountPool } from './accountPool';

describe('OAuthAccountPool', () => {
  it('adds accounts and sets the latest added as active', () => {
    const pool = new OAuthAccountPool();
    const acc1 = pool.addAccount({
      email: 'user1@gmail.com',
      projectId: 'proj-1',
      refreshToken: 'refresh-1',
    });

    expect(acc1.email).toBe('user1@gmail.com');
    expect(pool.getActiveAccountId()).toBe('user1@gmail.com');
    expect(pool.getAccounts()).toHaveLength(1);

    const acc2 = pool.addAccount({
      email: 'user2@gmail.com',
      projectId: 'proj-2',
      refreshToken: 'refresh-2',
    });

    expect(pool.getActiveAccountId()).toBe('user2@gmail.com');
    expect(pool.getAccounts()).toHaveLength(2);
  });

  it('updates existing account on duplicate add', () => {
    const pool = new OAuthAccountPool();
    pool.addAccount({
      email: 'user1@gmail.com',
      projectId: 'proj-old',
      refreshToken: 'refresh-old',
    });

    pool.addAccount({
      email: 'user1@gmail.com',
      projectId: 'proj-new',
      refreshToken: 'refresh-new',
    });

    expect(pool.getAccounts()).toHaveLength(1);
    expect(pool.getActiveAccount()?.projectId).toBe('proj-new');
    expect(pool.getActiveAccount()?.refreshToken).toBe('refresh-new');
  });

  it('rotates to next available account when active is in cooldown', () => {
    const pool = new OAuthAccountPool();
    pool.addAccount({
      email: 'user1@gmail.com',
      projectId: 'proj-1',
      refreshToken: 'refresh-1',
    });
    pool.addAccount({
      email: 'user2@gmail.com',
      projectId: 'proj-2',
      refreshToken: 'refresh-2',
    });

    // Set user1 as active
    pool.setActiveAccount('user1@gmail.com');
    expect(pool.getNextAvailableAccount()?.email).toBe('user1@gmail.com');

    // Put user1 in cooldown
    pool.markAccountCooldown('user1@gmail.com', 'QUOTA_EXHAUSTED', 60_000);

    // Should now automatically pick user2
    const next = pool.getNextAvailableAccount();
    expect(next?.email).toBe('user2@gmail.com');
  });

  it('removes accounts and reassigns active', () => {
    const pool = new OAuthAccountPool();
    pool.addAccount({ email: 'u1@gmail.com', projectId: 'p1', refreshToken: 'r1' });
    pool.addAccount({ email: 'u2@gmail.com', projectId: 'p2', refreshToken: 'r2' });

    pool.setActiveAccount('u2@gmail.com');
    pool.removeAccount('u2@gmail.com');

    expect(pool.getAccounts()).toHaveLength(1);
    expect(pool.getActiveAccountId()).toBe('u1@gmail.com');
  });

  it('lists public representations correctly with remaining cooldown seconds', () => {
    const pool = new OAuthAccountPool();
    pool.addAccount({ email: 'u1@gmail.com', projectId: 'p1', refreshToken: 'r1' });
    pool.markAccountCooldown('u1@gmail.com', 'RATE_LIMIT_EXCEEDED', 10_000);

    const publicList = pool.listPublic();
    expect(publicList).toHaveLength(1);
    expect(publicList[0].isCoolingDown).toBe(true);
    expect(publicList[0].cooldownRemainingSeconds).toBeGreaterThan(0);
    expect(publicList[0].cooldownReason).toBe('RATE_LIMIT_EXCEEDED');
  });
});
