import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import {
  ANTIGRAVITY_ENDPOINT_PROD,
  getAntigravityHeaders,
  ANTIGRAVITY_DEFAULT_PROJECT_ID,
  getValidAccessToken,
  refreshAccessToken,
} from './antigravityOAuth';
import { getGlobalOAuthAccountPool } from './accountPool';

export interface QuotaGroupInfo {
  name: string; // "Claude", "Gemini 3 Pro", "Gemini 3 Flash"
  remainingFraction: number; // 0..1
  remainingPercent: number; // 0..100
  resetTime?: string;
  resetText?: string; // "resets in 4h 59m"
  unavailable?: boolean;
}

export interface AccountQuotaReport {
  accountId: string;
  email: string;
  projectId: string;
  disabled?: boolean;
  status: 'ok' | 'error' | 'no_token';
  error?: string;
  items: QuotaGroupInfo[];
}

export interface OpenAIWindowReport {
  name: string; // "5h window", "Weekly window"
  remainingPercent: number; // 0..100
  resetTimeText?: string; // "3h", "5d"
}

export interface OpenAIQuotaReport {
  planType: string; // "Pro", "Plus", "Team"
  email?: string;
  status: 'ok' | 'error';
  error?: string;
  windows: OpenAIWindowReport[];
}

export interface FullQuotaResponse {
  googleAccounts: AccountQuotaReport[];
  openai?: OpenAIQuotaReport | null;
  checkedAt: number;
}

export function classifyQuotaGroup(modelName: string, displayName?: string): 'Claude' | 'Gemini 3 Pro' | 'Gemini 3 Flash' | null {
  const combined = `${modelName} ${displayName ?? ''}`.toLowerCase();
  if (combined.includes('claude')) {
    return 'Claude';
  }
  const isGemini = combined.includes('gemini');
  if (!isGemini) {
    return null;
  }
  if (combined.includes('flash')) {
    return 'Gemini 3 Flash';
  }
  if (combined.includes('pro')) {
    return 'Gemini 3 Pro';
  }
  return null;
}

export function normalizeFraction(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  if (val < 0) return 0;
  if (val > 1) return 1;
  return val;
}

export function formatAntigravityReset(resetTime?: string): string {
  if (!resetTime) return '';
  const date = new Date(resetTime);
  const diffMs = date.getTime() - Date.now();
  if (isNaN(diffMs) || diffMs <= 0) return 'resets in 0m';
  const totalMins = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `resets in ${hours}h ${mins}m`;
  return `resets in ${mins}m`;
}

export function formatOpenAIReset(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds >= 86400) {
    const days = Math.round(seconds / 86400);
    return `${days}d`;
  }
  const hours = Math.round(seconds / 3600);
  return `${hours}h`;
}

export async function checkAccountQuota(
  accessToken: string,
  projectId: string,
  email = '',
  accountId = '',
  disabled = false,
): Promise<AccountQuotaReport> {
  const targetProjectId = projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID;
  const report: AccountQuotaReport = {
    accountId: accountId || email || 'default',
    email: email || 'Google Account',
    projectId: targetProjectId,
    disabled,
    status: 'ok',
    items: [],
  };

  try {
    const antigravityHeaders = getAntigravityHeaders();
    const res = await fetch(`${ANTIGRAVITY_ENDPOINT_PROD}/v1internal:fetchAvailableModels`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...antigravityHeaders,
      },
      body: JSON.stringify(targetProjectId ? { project: targetProjectId } : {}),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error ${res.status}: ${errText.slice(0, 150)}`);
    }

    const json = (await res.json()) as {
      models?: Record<
        string,
        {
          displayName?: string;
          modelName?: string;
          quotaInfo?: { remainingFraction?: number; resetTime?: string };
        }
      >;
    };

    const groupMap = new Map<string, QuotaGroupInfo>();

    // Initialize required categories: Claude, Gemini 3 Pro, Gemini 3 Flash
    for (const name of ['Claude', 'Gemini 3 Pro', 'Gemini 3 Flash'] as const) {
      groupMap.set(name, {
        name,
        remainingFraction: 1.0,
        remainingPercent: 100,
        unavailable: disabled,
      });
    }

    if (json.models) {
      for (const [modelKey, entry] of Object.entries(json.models)) {
        const groupName = classifyQuotaGroup(entry.modelName || modelKey, entry.displayName);
        if (!groupName) continue;

        const fraction = normalizeFraction(entry.quotaInfo?.remainingFraction);
        const resetTime = entry.quotaInfo?.resetTime;
        const existing = groupMap.get(groupName);

        if (existing) {
          existing.remainingFraction = Math.min(existing.remainingFraction, fraction);
          existing.remainingPercent = Math.round(existing.remainingFraction * 100);
          if (resetTime && !existing.resetTime) {
            existing.resetTime = resetTime;
            existing.resetText = formatAntigravityReset(resetTime);
          }
          if (disabled || existing.remainingPercent === 0) {
            existing.unavailable = true;
          }
        }
      }
    }

    report.items = Array.from(groupMap.values());
  } catch (err: any) {
    report.status = 'error';
    report.error = err?.message || String(err);
  }

  return report;
}

export async function checkOpenAIQuota(token?: string): Promise<OpenAIQuotaReport | null> {
  if (!token || !token.trim()) {
    return null;
  }

  let accessToken = token.trim();
  if (accessToken.startsWith('{')) {
    try {
      const parsed = JSON.parse(accessToken);
      accessToken = parsed.accessToken || parsed.access || accessToken;
    } catch {}
  }

  let res: Response | null = null;
  // If the token is not an 'sk-' API key, try querying ChatGPT usage directly
  if (accessToken && !accessToken.startsWith('sk-')) {
    try {
      res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'OpenCode-Quota-Toast/1.0',
        },
      });
    } catch {}
  }

  // Fallback: check ~/.local/share/opencode/auth.json for ChatGPT OAuth token
  if (!res || !res.ok) {
    try {
      const authPath = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
      if (existsSync(authPath)) {
        const authData = JSON.parse(readFileSync(authPath, 'utf8'));
        if (authData.openai?.access) {
          const opencodeToken = authData.openai.access;
          res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${opencodeToken}`,
              'User-Agent': 'OpenCode-Quota-Toast/1.0',
            },
          });
        }
      }
    } catch {}
  }

  if (!res || !res.ok) {
    return null;
  }

  try {
    const data = (await res.json()) as any;
    const rawPlan = (data.plan_type || '').toLowerCase();
    let planType = 'OpenAI';
    if (rawPlan.includes('pro')) planType = 'Pro';
    else if (rawPlan.includes('plus')) planType = 'Plus';
    else if (rawPlan.includes('team')) planType = 'Team';
    else if (rawPlan.includes('business')) planType = 'Business';

    const windows: OpenAIWindowReport[] = [];
    const primary = data.rate_limit?.primary_window;
    const secondary = data.rate_limit?.secondary_window;

    if (primary && typeof primary.used_percent === 'number') {
      const remainingPercent = Math.max(0, Math.min(100, 100 - primary.used_percent));
      windows.push({
        name: '5h window',
        remainingPercent,
        resetTimeText: formatOpenAIReset(primary.reset_after_seconds),
      });
    }

    if (secondary && typeof secondary.used_percent === 'number') {
      const remainingPercent = Math.max(0, Math.min(100, 100 - secondary.used_percent));
      windows.push({
        name: 'Weekly window',
        remainingPercent,
        resetTimeText: formatOpenAIReset(secondary.reset_after_seconds),
      });
    }

    return {
      planType,
      email: data.email,
      status: 'ok',
      windows,
    };
  } catch (err: any) {
    return {
      planType: 'OpenAI',
      status: 'error',
      error: err?.message || String(err),
      windows: [],
    };
  }
}

export async function checkAllQuotas(openaiToken?: string): Promise<FullQuotaResponse> {
  const pool = getGlobalOAuthAccountPool();
  const poolAccounts = pool.getAccounts();
  const reports: AccountQuotaReport[] = [];

  // Query ONLY accounts connected in Spigot's pool
  for (const acc of poolAccounts) {
    try {
      let accessToken = '';
      if (acc.refreshToken) {
        const rawKey = `${acc.refreshToken}|${acc.projectId}`;
        const valid = await getValidAccessToken(rawKey);
        accessToken = valid?.accessToken || '';
        if (!accessToken) {
          const refreshed = await refreshAccessToken(acc.refreshToken, acc.projectId);
          accessToken = refreshed?.accessToken || '';
        }
      }

      const isDisabled = Boolean(acc.cooldownUntil && acc.cooldownUntil > Date.now());

      if (accessToken) {
        const report = await checkAccountQuota(
          accessToken,
          acc.projectId,
          acc.email,
          acc.id,
          isDisabled,
        );
        reports.push(report);
      } else {
        reports.push({
          accountId: acc.id || acc.email,
          email: acc.email,
          projectId: acc.projectId,
          disabled: isDisabled,
          status: 'no_token',
          error: 'No se pudo obtener token de acceso.',
          items: [],
        });
      }
    } catch (err: any) {
      reports.push({
        accountId: acc.id || acc.email,
        email: acc.email,
        projectId: acc.projectId,
        disabled: Boolean(acc.cooldownUntil && acc.cooldownUntil > Date.now()),
        status: 'error',
        error: err?.message || String(err),
        items: [],
      });
    }
  }

  // Query OpenAI Quota ONLY if OpenAI is connected in Spigot
  const openai = openaiToken && openaiToken.trim() ? await checkOpenAIQuota(openaiToken) : null;

  return {
    googleAccounts: reports,
    openai,
    checkedAt: Date.now(),
  };
}

// Backward compatibility alias
export const checkAllGoogleQuotas = checkAllQuotas;
