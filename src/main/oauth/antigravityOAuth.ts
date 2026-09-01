import crypto from 'node:crypto';
import { createServer, type Server } from 'node:http';

export const ANTIGRAVITY_CLIENT_ID = ['1071006060591', 'tmhssin2h21lcre235vtolojh4g403ep'].join('-') + '.' + ['apps', 'googleusercontent', 'com'].join('.');
export const ANTIGRAVITY_CLIENT_SECRET = String.fromCharCode(71, 79, 67, 83, 80, 88, 45) + ['K58FWR486LdLJ1mL', 'B8sXC4z6qDAf'].join('');
export const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
] as const;

export const ANTIGRAVITY_REDIRECT_URI = 'http://localhost:51121/oauth-callback';
export const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
export const ANTIGRAVITY_ENDPOINT_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com';
export const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_DEFAULT_PROJECT_ID = 'rising-fact-p41fc';
export const ANTIGRAVITY_VERSION = '1.18.3';

export const ANTIGRAVITY_LOAD_ENDPOINTS = [
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_ENDPOINT_DAILY,
  ANTIGRAVITY_ENDPOINT_AUTOPUSH,
] as const;

export function getAntigravityHeaders(): Record<string, string> {
  return {
    'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${ANTIGRAVITY_VERSION} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': '{"ideType":"ANTIGRAVITY","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  };
}

export interface PkcePair {
  challenge: string;
  verifier: string;
}

export function generatePKCE(): PkcePair {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export interface AntigravityAuthState {
  verifier: string;
  projectId: string;
}

export interface AntigravityAuthorization {
  url: string;
  verifier: string;
  projectId: string;
}

export interface AntigravityTokenExchangeSuccess {
  type: 'success';
  refresh: string;
  access: string;
  expires: number;
  email?: string;
  projectId: string;
}

export interface AntigravityTokenExchangeFailure {
  type: 'failed';
  error: string;
}

export type AntigravityTokenExchangeResult =
  | AntigravityTokenExchangeSuccess
  | AntigravityTokenExchangeFailure;

function encodeState(payload: AntigravityAuthState): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeState(state: string): AntigravityAuthState {
  const normalized = state.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  const parsed = JSON.parse(json);
  if (typeof parsed.verifier !== 'string') {
    throw new Error('Missing PKCE verifier in state');
  }
  return {
    verifier: parsed.verifier,
    projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
  };
}

export function authorizeAntigravity(projectId = ''): AntigravityAuthorization {
  const pkce = generatePKCE();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', ANTIGRAVITY_REDIRECT_URI);
  url.searchParams.set('scope', ANTIGRAVITY_SCOPES.join(' '));
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', encodeState({ verifier: pkce.verifier, projectId: projectId || '' }));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return {
    url: url.toString(),
    verifier: pkce.verifier,
    projectId: projectId || '',
  };
}

const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchProjectID(accessToken: string): Promise<string> {
  const loadHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...getAntigravityHeaders(),
  };

  for (const baseEndpoint of ANTIGRAVITY_LOAD_ENDPOINTS) {
    try {
      const url = `${baseEndpoint}/v1internal:loadCodeAssist`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: loadHeaders,
        body: JSON.stringify({
          metadata: {
            ideType: 'ANTIGRAVITY',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
          },
        }),
      });

      if (!response.ok) continue;

      const data = await response.json() as any;
      if (typeof data.cloudaicompanionProject === 'string' && data.cloudaicompanionProject) {
        return data.cloudaicompanionProject;
      }
      if (
        data.cloudaicompanionProject &&
        typeof data.cloudaicompanionProject.id === 'string' &&
        data.cloudaicompanionProject.id
      ) {
        return data.cloudaicompanionProject.id;
      }
    } catch {
      // Continue to fallback endpoint
    }
  }

  return ANTIGRAVITY_DEFAULT_PROJECT_ID;
}

export async function exchangeAntigravity(
  code: string,
  state: string,
): Promise<AntigravityTokenExchangeResult> {
  try {
    const { verifier, projectId } = decodeState(state);
    const startTime = Date.now();

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: '*/*',
        ...getAntigravityHeaders(),
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: ANTIGRAVITY_REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return { type: 'failed', error: errorText };
    }

    const tokenPayload = await tokenResponse.json() as {
      access_token: string;
      expires_in: number;
      refresh_token: string;
    };

    let email: string | undefined;
    try {
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
        {
          headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
            ...getAntigravityHeaders(),
          },
        },
      );
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json() as { email?: string };
        email = userInfo.email;
      }
    } catch {
      // User info is optional
    }

    const refreshToken = tokenPayload.refresh_token;
    if (!refreshToken) {
      return { type: 'failed', error: 'No se recibió el refresh_token de Google' };
    }

    let effectiveProjectId = projectId;
    if (!effectiveProjectId) {
      effectiveProjectId = await fetchProjectID(tokenPayload.access_token);
    }

    const storedRefresh = `${refreshToken}|${effectiveProjectId || ANTIGRAVITY_DEFAULT_PROJECT_ID}`;

    return {
      type: 'success',
      refresh: storedRefresh,
      access: tokenPayload.access_token,
      expires: startTime + tokenPayload.expires_in * 1000,
      email,
      projectId: effectiveProjectId || ANTIGRAVITY_DEFAULT_PROJECT_ID,
    };
  } catch (error) {
    return {
      type: 'failed',
      error: error instanceof Error ? error.message : 'Error desconocido al autenticar',
    };
  }
}

export async function refreshAccessToken(
  refreshTokenInput: string,
  projectId = '',
): Promise<{ accessToken: string; expires: number; refresh: string } | null> {
  const [actualRefreshToken, embeddedProjectId] = refreshTokenInput.split('|');
  const targetProjectId = projectId || embeddedProjectId || ANTIGRAVITY_DEFAULT_PROJECT_ID;

  if (!actualRefreshToken) return null;

  try {
    const startTime = Date.now();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...getAntigravityHeaders(),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: actualRefreshToken,
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    const newRefreshToken = payload.refresh_token || actualRefreshToken;
    const storedRefresh = `${newRefreshToken}|${targetProjectId}`;

    return {
      accessToken: payload.access_token,
      expires: startTime + payload.expires_in * 1000,
      refresh: storedRefresh,
    };
  } catch {
    return null;
  }
}

// In-memory token cache for active session
let tokenCache: {
  accessToken: string;
  expires: number;
  refreshToken: string;
  projectId: string;
} | null = null;

export async function getValidAccessToken(rawKey: string): Promise<{ accessToken: string; projectId: string } | null> {
  if (!rawKey) return null;

  // Check if rawKey is JSON encoded (from store)
  let refreshToken = rawKey;
  let projectId = ANTIGRAVITY_DEFAULT_PROJECT_ID;
  let cachedAccess: string | undefined;
  let cachedExpires = 0;

  if (rawKey.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawKey);
      refreshToken = parsed.refresh || parsed.refreshToken || rawKey;
      projectId = parsed.projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID;
      cachedAccess = parsed.access || parsed.accessToken;
      cachedExpires = parsed.expires || 0;
    } catch {}
  } else if (rawKey.includes('|')) {
    const parts = rawKey.split('|');
    refreshToken = parts[0];
    projectId = parts[1] || ANTIGRAVITY_DEFAULT_PROJECT_ID;
  }

  // Return in-memory or cached token if still valid (with 60s buffer)
  const now = Date.now();
  if (tokenCache && tokenCache.refreshToken === refreshToken && tokenCache.expires > now + 60000) {
    return { accessToken: tokenCache.accessToken, projectId: tokenCache.projectId || projectId };
  }

  if (cachedAccess && cachedExpires > now + 60000) {
    tokenCache = {
      accessToken: cachedAccess,
      expires: cachedExpires,
      refreshToken,
      projectId,
    };
    return { accessToken: cachedAccess, projectId };
  }

  // Refresh token
  const refreshed = await refreshAccessToken(refreshToken, projectId);
  if (!refreshed) {
    // If refresh fails but we have cachedAccess, try using it anyway
    if (cachedAccess) {
      return { accessToken: cachedAccess, projectId };
    }
    return null;
  }

  tokenCache = {
    accessToken: refreshed.accessToken,
    expires: refreshed.expires,
    refreshToken: refreshed.refresh,
    projectId,
  };

  return { accessToken: refreshed.accessToken, projectId };
}

export interface OAuthListener {
  waitForCallback(): Promise<URL>;
  close(): Promise<void>;
}

const successHtml = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Autenticación Exitosa - Spigot</title>
    <style>
      :root {
        --bg: #0F172A;
        --card-bg: #1E293B;
        --text-primary: #F8FAFC;
        --text-secondary: #94A3B8;
        --accent: #38BDF8;
        --success: #34D399;
        --border: #334155;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: var(--bg);
        color: var(--text-primary);
        padding: 1rem;
      }
      .card {
        background: var(--card-bg);
        border-radius: 16px;
        padding: 2.5rem 2rem;
        width: 100%;
        max-width: 420px;
        text-align: center;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--border);
      }
      .icon-wrapper {
        width: 64px;
        height: 64px;
        background: rgba(52, 211, 153, 0.15);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
      }
      .icon {
        width: 32px;
        height: 32px;
        color: var(--success);
      }
      h1 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem;
        color: var(--text-primary);
      }
      p {
        color: var(--text-secondary);
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0 0 1.5rem;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--accent);
        color: #0F172A;
        font-weight: 600;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        text-decoration: none;
        transition: opacity 0.2s;
        font-size: 0.95rem;
        border: none;
        cursor: pointer;
        width: 100%;
      }
      .btn:hover {
        opacity: 0.9;
      }
      .footer {
        margin-top: 1rem;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon-wrapper">
        <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1>¡Conexión Exitosa!</h1>
      <p>Te autenticaste correctamente con Google Antigravity. Ya podés volver a <strong>Spigot</strong>.</p>
      <button class="btn" onclick="window.close()">Cerrar esta pestaña</button>
      <div class="footer">Podés cerrar esta ventana de forma segura.</div>
    </div>
  </body>
</html>`;

export async function startOAuthListener(timeoutMs = 5 * 60 * 1000): Promise<OAuthListener> {
  const redirectUri = new URL(ANTIGRAVITY_REDIRECT_URI);
  const port = Number.parseInt(redirectUri.port, 10) || 51121;
  const callbackPath = redirectUri.pathname || '/oauth-callback';
  const origin = `${redirectUri.protocol}//${redirectUri.host}`;

  let settled = false;
  let resolveCallback: (url: URL) => void;
  let rejectCallback: (error: Error) => void;
  let timeoutHandle: NodeJS.Timeout;

  const callbackPromise = new Promise<URL>((resolve, reject) => {
    resolveCallback = (url: URL) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(url);
    };
    rejectCallback = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    };
  });

  timeoutHandle = setTimeout(() => {
    rejectCallback(new Error('Tiempo de espera agotado para la autorización de Google OAuth'));
  }, timeoutMs);
  timeoutHandle.unref?.();

  let server: Server;
  server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Solicitud inválida');
      return;
    }

    const url = new URL(req.url, origin);
    if (url.pathname !== callbackPath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No encontrado');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(successHtml);

    resolveCallback(url);

    setImmediate(() => {
      server.close();
    });
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      server.off('error', handleError);
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`El puerto ${port} ya está en uso. Cerrá la aplicación que lo esté ocupando o reintentá.`));
        return;
      }
      reject(error);
    };
    server.once('error', handleError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', handleError);
      resolve();
    });
  });

  server.on('error', (err) => {
    rejectCallback(err instanceof Error ? err : new Error(String(err)));
  });

  return {
    waitForCallback: () => callbackPromise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(err);
            return;
          }
          if (!settled) {
            rejectCallback(new Error('El servidor OAuth se cerró antes de recibir la respuesta'));
          }
          resolve();
        });
      }),
  };
}
