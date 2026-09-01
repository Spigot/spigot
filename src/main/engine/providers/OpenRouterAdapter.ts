import { OpenAIAdapter } from './OpenAIAdapter';
import type { ProviderHttpRequest, ProviderRequestOptions } from './types';

export class OpenRouterAdapter extends OpenAIAdapter {
  constructor(id: string = 'openrouter', defaultBaseUrl: string = 'https://openrouter.ai/api/v1/chat/completions') {
    super(id, defaultBaseUrl);
  }

  override buildRequest(options: ProviderRequestOptions): ProviderHttpRequest {
    const extraHeaders: Record<string, string> = {
      'HTTP-Referer': 'https://spigot.gentleman.com',
      'X-Title': 'Spigot',
      ...(options.extraHeaders || {}),
    };

    return super.buildRequest({
      ...options,
      extraHeaders,
    });
  }
}
