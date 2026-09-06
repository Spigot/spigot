import { describe, expect, it, vi } from 'vitest';
import {
  classifyQuotaGroup,
  normalizeFraction,
  formatAntigravityReset,
  formatOpenAIReset,
  checkAccountQuota,
  checkOpenAIQuota,
} from './quotaService';

describe('quotaService', () => {
  it('classifies models into proper quota groups', () => {
    expect(classifyQuotaGroup('claude-3-7-sonnet')).toBe('Claude');
    expect(classifyQuotaGroup('claude-opus-4-6-thinking')).toBe('Claude');
    expect(classifyQuotaGroup('gemini-3-flash')).toBe('Gemini 3 Flash');
    expect(classifyQuotaGroup('gemini-3.7-flash-tiered')).toBe('Gemini 3 Flash');
    expect(classifyQuotaGroup('gemini-3.8-flash-tiered')).toBe('Gemini 3 Flash');
    expect(classifyQuotaGroup('gemini-3-pro')).toBe('Gemini 3 Pro');
    expect(classifyQuotaGroup('gemini-3.1-pro-low')).toBe('Gemini 3 Pro');
    expect(classifyQuotaGroup('gemini-2.5-flash')).toBe('Gemini 3 Flash');
    expect(classifyQuotaGroup('gemini-2.5-pro')).toBe('Gemini 3 Pro');
    expect(classifyQuotaGroup('gpt-4o')).toBeNull();
  });

  it('normalizes fractions safely between 0 and 1', () => {
    expect(normalizeFraction(undefined)).toBe(0);
    expect(normalizeFraction(null)).toBe(0);
    expect(normalizeFraction(-0.5)).toBe(0);
    expect(normalizeFraction(1.5)).toBe(1);
    expect(normalizeFraction(0.75)).toBe(0.75);
  });

  it('formats reset times accurately', () => {
    expect(formatOpenAIReset(18000)).toBe('5h');
    expect(formatOpenAIReset(604800)).toBe('7d');
    expect(formatOpenAIReset(0)).toBe('');

    const future = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    expect(formatAntigravityReset(future)).toContain('resets in 5h');
  });

  it('fetches and parses available models quota', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('fetchAvailableModels')) {
        return new Response(
          JSON.stringify({
            models: {
              'models/gemini-3-flash': {
                displayName: 'Gemini 3 Flash',
                modelName: 'gemini-3-flash',
                quotaInfo: {
                  remainingFraction: 0.85,
                  resetTime: '2026-09-05T21:00:00Z',
                },
              },
              'models/claude-opus-4-6-thinking': {
                displayName: 'Claude Opus 4.6 Thinking',
                modelName: 'claude-opus-4-6-thinking',
                quotaInfo: {
                  remainingFraction: 0.5,
                  resetTime: '2026-09-05T22:00:00Z',
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', mockFetch);

    const report = await checkAccountQuota('fake-access-token', 'test-project', 'test@gmail.com', 'acc-1');
    expect(report.status).toBe('ok');
    expect(report.email).toBe('test@gmail.com');
    expect(report.items).toHaveLength(3);

    const flash = report.items.find(i => i.name === 'Gemini 3 Flash');
    expect(flash?.remainingPercent).toBe(85);

    const claude = report.items.find(i => i.name === 'Claude');
    expect(claude?.remainingPercent).toBe(50);

    vi.unstubAllGlobals();
  });

  it('fetches and parses OpenAI usage response correctly', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('chatgpt.com/backend-api/wham/usage')) {
        return new Response(
          JSON.stringify({
            plan_type: 'plus',
            email: 'user@openai.com',
            rate_limit: {
              primary_window: {
                used_percent: 10,
                reset_after_seconds: 18000,
              },
              secondary_window: {
                used_percent: 25,
                reset_after_seconds: 604800,
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', mockFetch);

    const report = await checkOpenAIQuota('fake-oauth-jwt-token');
    expect(report).not.toBeNull();
    expect(report?.status).toBe('ok');
    expect(report?.planType).toBe('Plus');
    expect(report?.email).toBe('user@openai.com');
    expect(report?.windows).toHaveLength(2);
    expect(report?.windows[0].name).toBe('5h window');
    expect(report?.windows[0].remainingPercent).toBe(90);
    expect(report?.windows[0].resetTimeText).toBe('5h');
    expect(report?.windows[1].name).toBe('Weekly window');
    expect(report?.windows[1].remainingPercent).toBe(75);
    expect(report?.windows[1].resetTimeText).toBe('7d');

    vi.unstubAllGlobals();
  });
});
