import { createServer } from 'http';
import { shell } from 'electron';
import * as crypto from 'crypto';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const CALLBACK_PORT = 1455;

export interface OpenAITokenResponse {
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  email?: string;
}

export interface OpenAIAuthResult {
  email: string;
  accessToken: string;
  refreshToken: string;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function parseEmailFromIdToken(idToken: string): string | undefined {
  const parts = idToken.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.email || payload['https://api.openai.com/auth']?.email;
  } catch {
    return undefined;
  }
}

export function startOpenAIOAuthFlow(): Promise<OpenAIAuthResult> {
  return new Promise((resolve, reject) => {
    const pkce = generatePKCE();
    const state = base64UrlEncode(crypto.randomBytes(16));
    const redirectUri = `http://localhost:${CALLBACK_PORT}/auth/callback`;

    let server: ReturnType<typeof createServer>;

    const timeout = setTimeout(() => {
      if (server) server.close();
      reject(new Error('OpenAI OAuth authorization timed out after 3 minutes'));
    }, 180000);

    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://localhost:${CALLBACK_PORT}`);
        if (url.pathname !== '/auth/callback') {
          res.writeHead(404).end('Not found');
          return;
        }

        const error = url.searchParams.get('error_description') || url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (error) {
          clearTimeout(timeout);
          server.close();
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Error de autorización</h2><p>${error}</p></body></html>`);
          reject(new Error(error));
          return;
        }

        if (!code || returnedState !== state) {
          clearTimeout(timeout);
          server.close();
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Estado de OAuth inválido</h2></body></html>');
          reject(new Error('Invalid OAuth state'));
          return;
        }

        // Exchange authorization code for tokens
        const tokenRes = await fetch(`${ISSUER}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: CLIENT_ID,
            code_verifier: pkce.verifier,
          }).toString(),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
        }

        const tokenData = (await tokenRes.json()) as OpenAITokenResponse;
        const email = parseEmailFromIdToken(tokenData.id_token) || 'chatgpt-user@openai.com';

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e2e;color:#cdd6f4;">
              <div style="text-align:center;background:#181825;padding:40px;border-radius:12px;border:1px solid #313244;box-shadow:0 8px 24px rgba(0,0,0,0.4);">
                <h2 style="color:#a6e3a1;margin-bottom:12px;">✓ Conectado con ChatGPT</h2>
                <p style="color:#a6adc8;margin:0;">Podés cerrar esta ventana y volver a Spigot.</p>
              </div>
            </body>
          </html>
        `);

        clearTimeout(timeout);
        server.close();
        resolve({
          email,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        });
      } catch (err: any) {
        clearTimeout(timeout);
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, 'localhost', () => {
      const authUrl = `${ISSUER}/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'openid profile email offline_access',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        id_token_add_organizations: 'true',
        codex_cli_simplified_flow: 'true',
        state,
        originator: 'opencode',
      }).toString()}`;

      shell.openExternal(authUrl).catch((err) => {
        clearTimeout(timeout);
        server.close();
        reject(err);
      });
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to bind callback server on port ${CALLBACK_PORT}: ${err.message}`));
    });
  });
}
