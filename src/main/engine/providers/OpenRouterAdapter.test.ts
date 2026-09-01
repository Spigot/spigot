import { describe, expect, it } from 'vitest';
import { OpenRouterAdapter } from './OpenRouterAdapter';
import type { ProviderRequestOptions } from './types';

describe('OpenRouterAdapter', () => {
  const adapter = new OpenRouterAdapter();

  it('builds request with OpenRouter base URL and headers', () => {
    const options: ProviderRequestOptions = {
      provider: 'openrouter',
      model: 'anthropic/claude-3.7-sonnet',
      apiKey: 'sk-or-v1-test',
      prompt: 'Hello',
      systemPrompt: 'System',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const req = adapter.buildRequest(options);

    expect(req.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(req.headers['Authorization']).toBe('Bearer sk-or-v1-test');
    expect(req.headers['HTTP-Referer']).toBe('https://spigot.gentleman.com');
    expect(req.headers['X-Title']).toBe('Spigot');

    const body = req.body as any;
    expect(body.model).toBe('anthropic/claude-3.7-sonnet');
    expect(body.stream).toBe(true);
  });
});
