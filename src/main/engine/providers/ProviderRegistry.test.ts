import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from './ProviderRegistry';
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { OpenRouterAdapter } from './OpenRouterAdapter';

describe('ProviderRegistry', () => {
  it('retrieves registered adapters for standard providers', () => {
    const registry = new ProviderRegistry();

    expect(registry.getAdapter('openai')).toBeInstanceOf(OpenAIAdapter);
    expect(registry.getAdapter('anthropic')).toBeInstanceOf(AnthropicAdapter);
    expect(registry.getAdapter('gemini')).toBeInstanceOf(GeminiAdapter);
    expect(registry.getAdapter('openrouter')).toBeInstanceOf(OpenRouterAdapter);
    expect(registry.getAdapter('deepseek')).toBeInstanceOf(OpenAIAdapter);
    expect(registry.getAdapter('kimi')).toBeInstanceOf(OpenAIAdapter);
    expect(registry.getAdapter('qwen')).toBeInstanceOf(OpenAIAdapter);
    expect(registry.getAdapter('minimax')).toBeInstanceOf(OpenAIAdapter);
  });

  it('falls back to default OpenAI-compatible adapter for unknown providers', () => {
    const registry = new ProviderRegistry();
    const adapter = registry.getAdapter('unknown-custom-llm');

    expect(adapter).toBeInstanceOf(OpenAIAdapter);
    expect(adapter.id).toBe('openai');
  });

  it('allows registering and overriding custom adapters', () => {
    const registry = new ProviderRegistry();
    const customAdapter = new OpenAIAdapter('my-custom', 'https://custom-ai.org/v1/chat');
    registry.registerAdapter(customAdapter);

    expect(registry.hasAdapter('my-custom')).toBe(true);
    expect(registry.getAdapter('my-custom')).toBe(customAdapter);
  });

  describe('resolveForProvider', () => {
    it('keeps the bespoke registered adapter when no routing is available', () => {
      const registry = new ProviderRegistry();
      const { adapter, baseUrl } = registry.resolveForProvider('minimax', null);

      expect(adapter).toBeInstanceOf(OpenAIAdapter);
      expect(baseUrl).toBeUndefined();
    });

    it('falls back to the default adapter for unknown providers without routing', () => {
      const registry = new ProviderRegistry();
      const { adapter } = registry.resolveForProvider('totally-unknown', null);

      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });

    it('switches protocol adapters when the catalog knows a different wire format', () => {
      const registry = new ProviderRegistry();
      const routing = {
        protocol: 'anthropic' as const,
        baseUrl: 'https://api.minimax.io/anthropic/v1/messages',
        catalogId: 'minimax',
      };
      const { adapter, baseUrl } = registry.resolveForProvider('minimax', routing);

      expect(adapter).toBeInstanceOf(AnthropicAdapter);
      expect(baseUrl).toBe('https://api.minimax.io/anthropic/v1/messages');
    });

    it('keeps the bespoke adapter when the catalog protocol agrees with it', () => {
      const registry = new ProviderRegistry();

      const openai = registry.resolveForProvider('openai', { protocol: 'openai', catalogId: 'openai' });
      expect(openai.adapter).toBe(registry.get('openai'));
      expect(openai.baseUrl).toBeUndefined();

      const openrouter = registry.resolveForProvider('openrouter', {
        protocol: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        catalogId: 'openrouter',
      });
      expect(openrouter.adapter).toBeInstanceOf(OpenRouterAdapter);

      const gemini = registry.resolveForProvider('gemini', { protocol: 'google', catalogId: 'google' });
      expect(gemini.adapter).toBeInstanceOf(GeminiAdapter);
    });

    it('routes unregistered catalog providers through the shared protocol adapter', () => {
      const registry = new ProviderRegistry();
      const { adapter, baseUrl } = registry.resolveForProvider('zhipuai', {
        protocol: 'openai',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        catalogId: 'zhipuai',
      });

      expect(adapter).toBeInstanceOf(OpenAIAdapter);
      expect(baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    });
  });
});
