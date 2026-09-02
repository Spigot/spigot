import { shell } from 'electron';

const CLIENT_ID = 'Ov23li8tweQw6odWQebz';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface CopilotAuthResult {
  email: string;
  accessToken: string;
}

export async function startCopilotOAuthFlow(): Promise<CopilotAuthResult> {
  const deviceRes = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Spigot/0.0.6',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: 'read:user',
    }),
  });

  if (!deviceRes.ok) {
    throw new Error(`Failed to initiate GitHub Copilot authorization (${deviceRes.status})`);
  }

  const deviceData = (await deviceRes.json()) as {
    verification_uri: string;
    user_code: string;
    device_code: string;
    interval: number;
    expires_in: number;
  };

  // Open browser to verification URI
  await shell.openExternal(deviceData.verification_uri);

  const pollInterval = Math.max(deviceData.interval || 5, 2) * 1000;
  const deadline = Date.now() + (deviceData.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const tokenRes = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Spigot/0.0.6',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (tokenRes.ok) {
      const data = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };

      if (data.access_token) {
        // Fetch GitHub username
        let userLogin = 'github-copilot-user';
        try {
          const userRes = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
              'User-Agent': 'Spigot/0.0.6',
            },
          });
          if (userRes.ok) {
            const userObj = await userRes.json() as any;
            userLogin = userObj.login || userObj.email || userLogin;
          }
        } catch {}

        return {
          email: userLogin,
          accessToken: data.access_token,
        };
      }

      if (data.error === 'authorization_pending') {
        continue;
      }
      if (data.error === 'slow_down') {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      if (data.error) {
        throw new Error(`Copilot authorization failed: ${data.error}`);
      }
    }
  }

  throw new Error('Copilot authorization timed out');
}
