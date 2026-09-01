import { describe, expect, it } from 'vitest';
import {
  generatePKCE,
  authorizeAntigravity,
  decodeState,
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_REDIRECT_URI,
  getAntigravityHeaders,
} from './antigravityOAuth';

describe('antigravityOAuth', () => {
  it('generates valid PKCE pair with verifier and challenge', () => {
    const pkce = generatePKCE();
    expect(pkce.verifier).toBeTruthy();
    expect(pkce.challenge).toBeTruthy();
    expect(typeof pkce.verifier).toBe('string');
    expect(typeof pkce.challenge).toBe('string');
  });

  it('builds a valid Google Antigravity OAuth authorization URL', () => {
    const auth = authorizeAntigravity('test-project-123');
    expect(auth.url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(auth.url).toContain(`client_id=${encodeURIComponent(ANTIGRAVITY_CLIENT_ID)}`);
    expect(auth.url).toContain(`redirect_uri=${encodeURIComponent(ANTIGRAVITY_REDIRECT_URI)}`);
    expect(auth.url).toContain('code_challenge_method=S256');

    const urlObj = new URL(auth.url);
    const state = urlObj.searchParams.get('state');
    expect(state).toBeTruthy();

    const decoded = decodeState(state!);
    expect(decoded.verifier).toBe(auth.verifier);
    expect(decoded.projectId).toBe('test-project-123');
  });

  it('provides the required Antigravity headers with metadata', () => {
    const headers = getAntigravityHeaders();
    expect(headers['Client-Metadata']).toContain('ANTIGRAVITY');
    expect(headers['User-Agent']).toContain('Antigravity');
    expect(headers['X-Goog-Api-Client']).toContain('google-cloud-sdk');
  });
});
