import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

const CATALOG_URL = 'https://models.opencode.ai/api.json';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface OpenCodeModelInfo {
  id: string;
  name: string;
  family?: string;
  reasoning?: boolean;
}

export interface OpenCodeProviderInfo {
  id: string;
  name: string;
  models: Record<string, OpenCodeModelInfo>;
}

export class ModelsCatalogService {
  private cachePath: string;
  private catalog: Record<string, OpenCodeProviderInfo> | null = null;
  private lastFetchTime = 0;

  constructor(userDataDir?: string) {
    const dir = userDataDir || (app?.getPath ? app.getPath('userData') : process.cwd());
    this.cachePath = path.join(dir, 'opencode-models-catalog.json');
  }

  async getCatalog(): Promise<Record<string, OpenCodeProviderInfo>> {
    const now = Date.now();
    if (this.catalog && now - this.lastFetchTime < CACHE_TTL_MS) {
      return this.catalog;
    }

    // Try reading from disk cache
    if (!this.catalog && fs.existsSync(this.cachePath)) {
      try {
        const raw = fs.readFileSync(this.cachePath, 'utf8');
        const data = JSON.parse(raw);
        this.catalog = data;
      } catch {}
    }

    // Refresh in background or foreground
    try {
      const res = await fetch(CATALOG_URL, {
        headers: { 'User-Agent': 'Spigot/0.0.6' },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, OpenCodeProviderInfo>;
        this.catalog = data;
        this.lastFetchTime = now;
        fs.writeFileSync(this.cachePath, JSON.stringify(data), 'utf8');
      }
    } catch (err) {
      // Fallback to memory or disk cache
    }

    return this.catalog || {};
  }

  async getModelsForProvider(providerId: string): Promise<string[]> {
    const catalog = await this.getCatalog();
    const normalized = providerId.toLowerCase().trim();

    // Map common aliases
    const targetKey = normalized === 'gemini' ? 'google' : normalized;
    const provider = catalog[targetKey] || catalog[normalized];

    if (provider && provider.models) {
      return Object.keys(provider.models);
    }

    return [];
  }
}

export const modelsCatalogService = new ModelsCatalogService();
