import { getValidAccessToken } from './antigravityOAuth';

export interface OAuthAccount {
  id: string;
  email: string;
  projectId: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  addedAt: number;
  lastUsedAt: number;
  cooldownUntil?: number;
  cooldownReason?: string;
  errorCount?: number;
}

export interface OAuthAccountPublic {
  id: string;
  email: string;
  projectId: string;
  addedAt: number;
  lastUsedAt: number;
  isActive: boolean;
  isCoolingDown: boolean;
  cooldownRemainingSeconds?: number;
  cooldownReason?: string;
}

/**
 * Parses duration strings like "17940s", "4h59m", "5m30s", "10s" into milliseconds.
 */
export function parseDurationToMs(duration: string): number | null {
  if (!duration || typeof duration !== 'string') return null;
  const simpleMatch = duration.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i);
  if (simpleMatch) {
    const value = parseFloat(simpleMatch[1]);
    const unit = (simpleMatch[2] || 's').toLowerCase();
    switch (unit) {
      case 'd': return value * 86400 * 1000;
      case 'h': return value * 3600 * 1000;
      case 'm': return value * 60 * 1000;
      case 's': return value * 1000;
      case 'ms': return value;
      default: return value * 1000;
    }
  }

  const compoundRegex = /(\d+(?:\.\d+)?)(d|h|m(?!s)|s|ms)/gi;
  let totalMs = 0;
  let matchFound = false;
  let match: RegExpExecArray | null;
  while ((match = compoundRegex.exec(duration)) !== null) {
    matchFound = true;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'd': totalMs += value * 86400 * 1000; break;
      case 'h': totalMs += value * 3600 * 1000; break;
      case 'm': totalMs += value * 60 * 1000; break;
      case 's': totalMs += value * 1000; break;
      case 'ms': totalMs += value; break;
    }
  }

  return matchFound ? totalMs : null;
}

/**
 * Extracts the real reset delay in ms from Google or other provider error payloads/headers.
 */
export function extractResetDelayFromError(errText?: string, retryAfterHeader?: string | null): number | null {
  if (retryAfterHeader) {
    const parsed = Number(retryAfterHeader);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1000;
    }
  }

  if (!errText || typeof errText !== 'string') return null;

  try {
    const parsed = JSON.parse(errText);
    const details = parsed?.error?.details || [];
    if (Array.isArray(details)) {
      for (const detail of details) {
        if (!detail || typeof detail !== 'object') continue;

        if (detail.retryDelay && typeof detail.retryDelay === 'string') {
          const ms = parseDurationToMs(detail.retryDelay);
          if (ms !== null && ms > 0) return ms;
        }

        const metadata = detail.metadata;
        if (metadata && typeof metadata === 'object') {
          if (metadata.quotaResetDelay && typeof metadata.quotaResetDelay === 'string') {
            const ms = parseDurationToMs(metadata.quotaResetDelay);
            if (ms !== null && ms > 0) return ms;
          }
          if (metadata.quotaResetTimeStamp && typeof metadata.quotaResetTimeStamp === 'string') {
            const date = Date.parse(metadata.quotaResetTimeStamp);
            if (Number.isFinite(date)) {
              const diff = date - Date.now();
              if (diff > 0) return diff;
            }
          }
        }
      }
    }

    const message = parsed?.error?.message;
    if (typeof message === 'string') {
      const match = message.match(/reset after\s+([0-9hmsd.]+)/i) || message.match(/resets in\s+([0-9hmsd.]+)/i);
      if (match?.[1]) {
        const ms = parseDurationToMs(match[1]);
        if (ms !== null && ms > 0) return ms;
      }
    }
  } catch {
    const match = errText.match(/reset after\s+([0-9hmsd.]+)/i) || errText.match(/resets in\s+([0-9hmsd.]+)/i);
    if (match?.[1]) {
      const ms = parseDurationToMs(match[1]);
      if (ms !== null && ms > 0) return ms;
    }
  }

  return null;
}

export class OAuthAccountPool {
  private accounts: OAuthAccount[] = [];
  private activeAccountId: string | null = null;
  private onStateChange?: (accounts: OAuthAccount[], activeId: string | null) => void;

  constructor(
    initialAccounts: OAuthAccount[] = [],
    initialActiveId: string | null = null,
    onStateChange?: (accounts: OAuthAccount[], activeId: string | null) => void
  ) {
    this.accounts = [...initialAccounts];
    this.activeAccountId = initialActiveId || (this.accounts[0]?.id ?? null);
    this.onStateChange = onStateChange;
  }

  public setOnChange(callback: (accounts: OAuthAccount[], activeId: string | null) => void): void {
    this.onStateChange = callback;
  }

  private notify(): void {
    if (this.onStateChange) {
      this.onStateChange([...this.accounts], this.activeAccountId);
    }
  }

  public getAccounts(): OAuthAccount[] {
    return [...this.accounts];
  }

  public getActiveAccountId(): string | null {
    return this.activeAccountId;
  }

  public addAccount(accountData: {
    email: string;
    projectId: string;
    refreshToken: string;
    accessToken?: string;
    expiresAt?: number;
  }): OAuthAccount {
    const emailNorm = accountData.email.trim().toLowerCase();
    const existingIndex = this.accounts.findIndex(
      (a) => a.email.trim().toLowerCase() === emailNorm || a.id === emailNorm
    );

    const now = Date.now();
    let account: OAuthAccount;

    if (existingIndex >= 0) {
      account = {
        ...this.accounts[existingIndex],
        email: accountData.email,
        projectId: accountData.projectId,
        refreshToken: accountData.refreshToken,
        accessToken: accountData.accessToken ?? this.accounts[existingIndex].accessToken,
        expiresAt: accountData.expiresAt ?? this.accounts[existingIndex].expiresAt,
        lastUsedAt: now,
        cooldownUntil: undefined,
        cooldownReason: undefined,
        errorCount: 0,
      };
      this.accounts[existingIndex] = account;
    } else {
      account = {
        id: emailNorm || `acc_${now}_${Math.random().toString(36).substring(2, 7)}`,
        email: accountData.email,
        projectId: accountData.projectId,
        refreshToken: accountData.refreshToken,
        accessToken: accountData.accessToken,
        expiresAt: accountData.expiresAt,
        addedAt: now,
        lastUsedAt: now,
        errorCount: 0,
      };
      this.accounts.push(account);
    }

    this.activeAccountId = account.id;
    this.notify();
    return account;
  }

  public removeAccount(idOrEmail: string): boolean {
    const norm = idOrEmail.trim().toLowerCase();
    const index = this.accounts.findIndex(
      (a) => a.id.toLowerCase() === norm || a.email.toLowerCase() === norm
    );

    if (index === -1) return false;

    const [removed] = this.accounts.splice(index, 1);
    if (this.activeAccountId === removed.id) {
      this.activeAccountId = this.accounts[0]?.id ?? null;
    }

    this.notify();
    return true;
  }

  public setActiveAccount(idOrEmail: string): boolean {
    const norm = idOrEmail.trim().toLowerCase();
    const found = this.accounts.find(
      (a) => a.id.toLowerCase() === norm || a.email.toLowerCase() === norm
    );

    if (!found) return false;

    this.activeAccountId = found.id;
    this.notify();
    return true;
  }

  public getActiveAccount(): OAuthAccount | null {
    if (!this.activeAccountId) {
      return this.accounts[0] ?? null;
    }
    return this.accounts.find((a) => a.id === this.activeAccountId) ?? this.accounts[0] ?? null;
  }

  public getNextAvailableAccount(): OAuthAccount | null {
    if (this.accounts.length === 0) return null;

    const now = Date.now();
    const active = this.getActiveAccount();

    // 1. If active account is healthy and not in cooldown, use it
    if (active && (!active.cooldownUntil || active.cooldownUntil <= now)) {
      return active;
    }

    // 2. Look for any other available account not in cooldown
    const available = this.accounts.filter(
      (a) => !a.cooldownUntil || a.cooldownUntil <= now
    );

    if (available.length > 0) {
      // Pick the least recently used account
      available.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      const chosen = available[0];
      return chosen;
    }

    // 3. All in cooldown: pick the one expiring earliest
    const sorted = [...this.accounts].sort(
      (a, b) => (a.cooldownUntil ?? 0) - (b.cooldownUntil ?? 0)
    );
    return sorted[0];
  }

  public markAccountCooldown(
    idOrEmail: string,
    reason: 'QUOTA_EXHAUSTED' | 'RATE_LIMIT_EXCEEDED' | 'MODEL_CAPACITY_EXHAUSTED' | 'SERVER_ERROR' | string = 'QUOTA_EXHAUSTED',
    durationMs?: number
  ): void {
    const norm = idOrEmail.trim().toLowerCase();
    const account = this.accounts.find(
      (a) => a.id.toLowerCase() === norm || a.email.toLowerCase() === norm
    );

    if (!account) return;

    let backoff = durationMs;
    if (!backoff) {
      switch (reason) {
        case 'RATE_LIMIT_EXCEEDED':
          backoff = 30_000; // 30s
          break;
        case 'MODEL_CAPACITY_EXHAUSTED':
          backoff = 45_000; // 45s
          break;
        case 'SERVER_ERROR':
          backoff = 20_000; // 20s
          break;
        case 'QUOTA_EXHAUSTED':
        default:
          backoff = 3600_000 * 5; // 5 hours default quota reset window
          break;
      }
    }

    account.cooldownUntil = Date.now() + backoff;
    account.cooldownReason = reason;
    account.errorCount = (account.errorCount || 0) + 1;

    this.notify();
  }

  public clearCooldown(idOrEmail: string): void {
    const norm = idOrEmail.trim().toLowerCase();
    const account = this.accounts.find(
      (a) => a.id.toLowerCase() === norm || a.email.toLowerCase() === norm
    );

    if (account) {
      account.cooldownUntil = undefined;
      account.cooldownReason = undefined;
      account.errorCount = 0;
      this.notify();
    }
  }

  public async getValidTokenForNextAccount(): Promise<{
    account: OAuthAccount;
    accessToken: string;
    projectId: string;
  } | null> {
    const account = this.getNextAvailableAccount();
    if (!account) return null;

    const rawKey = `${account.refreshToken}|${account.projectId}`;
    const tokenResolution = await getValidAccessToken(rawKey);

    if (tokenResolution) {
      account.accessToken = tokenResolution.accessToken;
      account.projectId = tokenResolution.projectId || account.projectId;
      account.lastUsedAt = Date.now();
      this.notify();

      return {
        account,
        accessToken: tokenResolution.accessToken,
        projectId: tokenResolution.projectId || account.projectId,
      };
    }

    return null;
  }

  public listPublic(): OAuthAccountPublic[] {
    const now = Date.now();
    return this.accounts.map((acc) => {
      const isCoolingDown = Boolean(acc.cooldownUntil && acc.cooldownUntil > now);
      const remaining = isCoolingDown && acc.cooldownUntil
        ? Math.ceil((acc.cooldownUntil - now) / 1000)
        : undefined;

      return {
        id: acc.id,
        email: acc.email,
        projectId: acc.projectId,
        addedAt: acc.addedAt,
        lastUsedAt: acc.lastUsedAt,
        isActive: acc.id === this.activeAccountId,
        isCoolingDown,
        cooldownRemainingSeconds: remaining,
        cooldownReason: isCoolingDown ? acc.cooldownReason : undefined,
      };
    });
  }

  public rehydrate(accounts: OAuthAccount[], activeId: string | null): void {
    this.accounts = [...accounts];
    this.activeAccountId = activeId || (this.accounts[0]?.id ?? null);
  }
}

let globalOAuthAccountPool: OAuthAccountPool | null = null;

export function getGlobalOAuthAccountPool(): OAuthAccountPool {
  if (!globalOAuthAccountPool) {
    globalOAuthAccountPool = new OAuthAccountPool();
  }
  return globalOAuthAccountPool;
}

export function setGlobalOAuthAccountPool(pool: OAuthAccountPool): void {
  globalOAuthAccountPool = pool;
}
