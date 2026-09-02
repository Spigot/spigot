import { AnthropicAdapter } from './AnthropicAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { OpenRouterAdapter } from './OpenRouterAdapter';
import type { ProviderProtocol, ProviderRouting } from '../modelsCatalog';
import type { AIProviderAdapter } from './types';

export class ProviderRegistry {
  private readonly adapters = new Map<string, AIProviderAdapter>();
  private readonly defaultAdapter: AIProviderAdapter;
  private readonly protocolAdapters: Record<ProviderProtocol, AIProviderAdapter>;

  constructor() {
    this.defaultAdapter = new OpenAIAdapter('openai');
    const anthropicAdapter = new AnthropicAdapter();
    const geminiAdapter = new GeminiAdapter();
    this.protocolAdapters = {
      openai: this.defaultAdapter,
      anthropic: anthropicAdapter,
      google: geminiAdapter,
    };

    // Register built-in adapters
    this.registerAdapter(this.defaultAdapter);
    this.registerAdapter(new OpenAIAdapter('deepseek', 'https://api.deepseek.com/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('kimi', 'https://api.moonshot.cn/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('minimax', 'https://api.minimax.io/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('groq', 'https://api.groq.com/openai/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('mistral', 'https://api.mistral.ai/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('xai', 'https://api.x.ai/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('togetherai', 'https://api.together.xyz/v1/chat/completions'));
    this.registerAdapter(new OpenAIAdapter('perplexity', 'https://api.perplexity.ai/chat/completions'));
    this.registerAdapter(anthropicAdapter);
    this.registerAdapter(geminiAdapter);
    this.registerAdapter(new OpenRouterAdapter());
  }

  registerAdapter(adapter: AIProviderAdapter): void {
    const key = adapter.id.toLowerCase().trim();
    this.adapters.set(key, adapter);
  }

  getAdapter(providerId: string): AIProviderAdapter {
    const key = (providerId || '').toLowerCase().trim();
    const adapter = this.adapters.get(key);
    if (adapter) {
      return adapter;
    }
    return this.defaultAdapter;
  }

  get(providerId: string): AIProviderAdapter {
    return this.getAdapter(providerId);
  }

  hasAdapter(providerId: string): boolean {
    const key = (providerId || '').toLowerCase().trim();
    return this.adapters.has(key);
  }

  listSupportedProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  private protocolOf(adapter: AIProviderAdapter): ProviderProtocol {
    if (adapter instanceof AnthropicAdapter) return 'anthropic';
    if (adapter instanceof GeminiAdapter) return 'google';
    return 'openai';
  }

  /**
   * Resolves the adapter and endpoint for a provider, optionally guided by the
   * OpenCode catalog routing. Bespoke registered adapters are kept when the
   * catalog protocol agrees with them; otherwise (or for unregistered
   * catalog providers) the shared protocol adapter runs with the catalog URL.
   */
  resolveForProvider(
    providerId: string,
    routing?: ProviderRouting | null,
  ): { adapter: AIProviderAdapter; baseUrl?: string } {
    const key = (providerId || '').toLowerCase().trim();
    const registered = this.adapters.get(key);

    if (!routing) {
      return { adapter: registered ?? this.defaultAdapter };
    }

    if (registered && this.protocolOf(registered) === routing.protocol) {
      return { adapter: registered };
    }

    const shared = this.protocolAdapters[routing.protocol];
    // The protocol adapter owns its default endpoint; the catalog base URL,
    // when advertised, is passed through the request options instead.
    return { adapter: shared, baseUrl: routing.baseUrl };
  }
}

export const providerRegistry = new ProviderRegistry();
