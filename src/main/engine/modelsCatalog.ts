import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

const CATALOG_URL = 'https://models.opencode.ai/api.json';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export type ProviderProtocol = 'openai' | 'anthropic' | 'google';

export interface OpenCodeModelInfo {
  id: string;
  name: string;
  family?: string;
  reasoning?: boolean;
}

export interface OpenCodeProviderInfo {
  id: string;
  name: string;
  /** Base URL of the provider API, when advertised by the catalog. */
  api?: string;
  /** SDK package the catalog uses for this provider; it reveals the wire protocol. */
  npm?: string;
  models: Record<string, OpenCodeModelInfo>;
}

export interface ProviderRouting {
  protocol: ProviderProtocol;
  /** Full chat endpoint (base URL + path) derived from the catalog, when advertised. */
  baseUrl?: string;
  catalogId?: string;
}

export interface CatalogProviderSummary {
  id: string;
  name: string;
  modelCount: number;
}

// Spigot provider ids that differ from their catalog (models.opencode.ai) ids.
const CATALOG_ALIASES: Record<string, string> = {
  gemini: 'google',
  qwen: 'alibaba',
  kimi: 'moonshotai',
  zhipu: 'zhipuai',
};

// Well-known base URLs for catalog providers that rely on an SDK default.
const NPM_DEFAULT_API: Record<string, string> = {
  '@ai-sdk/openai': 'https://api.openai.com/v1',
  '@ai-sdk/anthropic': 'https://api.anthropic.com/v1',
  '@ai-sdk/groq': 'https://api.groq.com/openai/v1',
  '@ai-sdk/cerebras': 'https://api.cerebras.ai/v1',
  '@ai-sdk/xai': 'https://api.x.ai/v1',
  '@ai-sdk/mistral': 'https://api.mistral.ai/v1',
  '@ai-sdk/togetherai': 'https://api.together.xyz/v1',
  '@ai-sdk/perplexity': 'https://api.perplexity.ai',
  '@ai-sdk/cohere': 'https://api.cohere.ai/compatibility/v1',
  '@ai-sdk/deepinfra': 'https://api.deepinfra.com/v1/openai',
};

function catalogIdFor(providerId: string): string {
  const normalized = providerId.toLowerCase().trim();
  return CATALOG_ALIASES[normalized] ?? normalized;
}

function protocolFor(npm: string | undefined): ProviderProtocol {
  const pkg = npm || '';
  if (pkg.includes('anthropic')) return 'anthropic';
  if (pkg.includes('google')) return 'google';
  return 'openai';
}

/** Turns the catalog `api` base URL into the full chat endpoint each adapter expects. */
function normalizeEndpoint(api: string | undefined, protocol: ProviderProtocol): string | undefined {
  if (!api || !/^https?:\/\//i.test(api)) return undefined;
  const trimmed = api.trim().replace(/\/+$/, '');
  if (protocol === 'google') return undefined;
  if (protocol === 'anthropic') {
    return trimmed.endsWith('/messages') ? trimmed : `${trimmed}/messages`;
  }
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

export class ModelsCatalogService {
  private cachePath: string;
  private catalog: Record<string, OpenCodeProviderInfo> | null = null;
  private lastFetchTime = 0;
  private lastAttemptTime = 0;
  private diskCacheRead = false;

  constructor(userDataDir?: string) {
    const dir = userDataDir || (app?.getPath ? app.getPath('userData') : process.cwd());
    this.cachePath = path.join(dir, 'opencode-models-catalog.json');
  }

  private readDiskCache(): Record<string, OpenCodeProviderInfo> | null {
    if (this.diskCacheRead) return this.catalog;
    this.diskCacheRead = true;
    if (fs.existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        if (data && typeof data === 'object') this.catalog = data;
      } catch {}
    }
    return this.catalog;
  }

  private writeDiskCache(data: Record<string, OpenCodeProviderInfo>): void {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(data), 'utf8');
    } catch {}
  }

  /** Cached catalog only (memory or disk); never touches the network. */
  private cachedCatalog(): Record<string, OpenCodeProviderInfo> {
    return this.readDiskCache() || {};
  }

  async getCatalog(): Promise<Record<string, OpenCodeProviderInfo>> {
    const now = Date.now();
    if (this.catalog && now - this.lastFetchTime < CACHE_TTL_MS) {
      return this.catalog;
    }

    // Serve whatever cache exists and refresh in the background when possible;
    // at most one refresh attempt per TTL keeps failures from spamming the API.
    const cached = this.readDiskCache();
    if (cached) {
      if (now - this.lastAttemptTime >= CACHE_TTL_MS) {
        this.lastAttemptTime = now;
        void this.refresh().catch(() => {});
      }
      return cached;
    }

    // First run: no cache at all, so the fetch is the only data source.
    this.lastAttemptTime = now;
    await this.refresh().catch(() => {});
    return this.catalog || {};
  }

  private async refresh(): Promise<void> {
    const res = await fetch(CATALOG_URL, {
      headers: { 'User-Agent': 'Spigot/0.0.6' },
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, OpenCodeProviderInfo>;
      if (!data || typeof data !== 'object') return;
      this.catalog = data;
      this.lastFetchTime = Date.now();
      this.writeDiskCache(data);
    }
  }

  async getModelsForProvider(providerId: string): Promise<string[]> {
    const catalog = await this.getCatalog();
    const targetKey = catalogIdFor(providerId);
    const provider = catalog[targetKey] || catalog[providerId.toLowerCase().trim()];

    if (provider && provider.models) {
      return Object.keys(provider.models);
    }

    return [];
  }

  /**
   * Resolves how to talk to a catalog provider: which wire protocol and, when
   * the catalog advertises a base URL, the exact chat endpoint to hit.
   * Returns null when the provider is not part of the catalog.
   */
  async resolveProviderRouting(providerId: string): Promise<ProviderRouting | null> {
    const catalog = await this.getCatalog();
    return this.resolveRoutingFrom(catalog, providerId);
  }

  /** Hot-path variant: uses only the warm cache, never fetches. */
  resolveCachedProviderRouting(providerId: string): ProviderRouting | null {
    return this.resolveRoutingFrom(this.cachedCatalog(), providerId);
  }

  private resolveRoutingFrom(
    catalog: Record<string, OpenCodeProviderInfo>,
    providerId: string,
  ): ProviderRouting | null {
    const catalogId = catalogIdFor(providerId);
    const provider = catalog[catalogId] || catalog[providerId.toLowerCase().trim()];
    if (!provider) return null;

    const protocol = protocolFor(provider.npm);
    const api = provider.api || NPM_DEFAULT_API[provider.npm || ''];
    return {
      protocol,
      baseUrl: normalizeEndpoint(api, protocol),
      catalogId: catalog[catalogId] ? catalogId : providerId.toLowerCase().trim(),
    };
  }

  async getProviders(): Promise<CatalogProviderSummary[]> {
    const catalog = await this.getCatalog();
    return Object.values(catalog)
      .filter(provider => provider.models && Object.keys(provider.models).length > 0)
      .map(provider => ({
        id: provider.id,
        name: provider.name,
        modelCount: Object.keys(provider.models).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const modelsCatalogService = new ModelsCatalogService();
