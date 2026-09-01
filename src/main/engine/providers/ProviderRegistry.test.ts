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
});
