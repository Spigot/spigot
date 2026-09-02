import { shell } from 'electron';

const SERVER_URL = 'https://opencode.ai/console';
const CLIENT_ID = 'opencode-cli';

export interface OpenCodeAuthResult {
  email: string;
  accessToken: string;
  refreshToken?: string;
}

export async function startOpenCodeConsoleOAuthFlow(): Promise<OpenCodeAuthResult> {
  const deviceRes = await fetch(`${SERVER_URL}/auth/device/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Spigot/0.0.6',
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });

  if (!deviceRes.ok) {
    throw new Error(`Failed to initiate OpenCode Console authorization (${deviceRes.status})`);
  }

  const deviceData = (await deviceRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };

  await shell.openExternal(deviceData.verification_uri_complete);

  const pollInterval = Math.max(deviceData.interval || 5, 2) * 1000;
  const deadline = Date.now() + (deviceData.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const tokenRes = await fetch(`${SERVER_URL}/auth/device/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Spigot/0.0.6',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceData.device_code,
      }),
    });

    if (tokenRes.ok) {
      const data = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
      };

      if (data.access_token) {
        let userEmail = 'opencode-console-user';
        try {
          const userRes = await fetch(`${SERVER_URL}/api/user`, {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
              'User-Agent': 'Spigot/0.0.6',
            },
          });
          if (userRes.ok) {
            const userObj = await userRes.json() as any;
            userEmail = userObj.email || userObj.username || userEmail;
          }
        } catch {}

        return {
          email: userEmail,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
      }

      if (data.error === 'authorization_pending') {
        continue;
      }
      if (data.error) {
        throw new Error(`OpenCode authorization failed: ${data.error}`);
      }
    }
  }

  throw new Error('OpenCode Console authorization timed out');
}
