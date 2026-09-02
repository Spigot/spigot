import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModelsCatalogService, type ProviderRouting } from './modelsCatalog';

function seedCatalog(dir: string, catalog: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, 'opencode-models-catalog.json'), JSON.stringify(catalog), 'utf8');
}

describe('ModelsCatalogService', () => {
  it('loads models from catalog', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-catalog-test-'));
    const service = new ModelsCatalogService(tmpDir);

    const models = await service.getModelsForProvider('openai');
    expect(models).toContain('gpt-5.6-terra');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('provider routing', () => {
    it('resolves protocol and chat endpoint from cached catalog data without fetching', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-routing-test-'));
      seedCatalog(tmpDir, {
        minimax: {
          id: 'minimax',
          name: 'MiniMax',
          npm: '@ai-sdk/anthropic',
          api: 'https://api.minimax.io/anthropic/v1',
          models: { 'MiniMax-M3': { id: 'MiniMax-M3', name: 'MiniMax M3' } },
        },
        zhipuai: {
          id: 'zhipuai',
          name: 'Z.ai',
          npm: '@ai-sdk/openai-compatible',
          api: 'https://open.bigmodel.cn/api/paas/v4/',
          models: { 'glm-4.6': { id: 'glm-4.6', name: 'GLM 4.6' } },
        },
        google: {
          id: 'google',
          name: 'Google',
          npm: '@ai-sdk/google',
          models: { 'gemini-2.5-pro': { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' } },
        },
        anthropic: {
          id: 'anthropic',
          name: 'Anthropic',
          npm: '@ai-sdk/anthropic',
          models: { 'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' } },
        },
      });
      const service = new ModelsCatalogService(tmpDir);

      expect(service.resolveCachedProviderRouting('minimax')).toEqual({
        protocol: 'anthropic',
        baseUrl: 'https://api.minimax.io/anthropic/v1/messages',
        catalogId: 'minimax',
      } satisfies ProviderRouting);

      expect(service.resolveCachedProviderRouting('zhipu')).toEqual({
        protocol: 'openai',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        catalogId: 'zhipuai',
      } satisfies ProviderRouting);

      expect(service.resolveCachedProviderRouting('gemini')).toEqual({
        protocol: 'google',
        baseUrl: undefined,
        catalogId: 'google',
      } satisfies ProviderRouting);

      expect(service.resolveCachedProviderRouting('anthropic')).toEqual({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        catalogId: 'anthropic',
      } satisfies ProviderRouting);

      expect(service.resolveCachedProviderRouting('not-in-catalog')).toBeNull();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('falls back to well-known SDK base URLs when the catalog omits api', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-npm-test-'));
      seedCatalog(tmpDir, {
        cerebras: {
          id: 'cerebras',
          name: 'Cerebras',
          npm: '@ai-sdk/cerebras',
          models: { 'llama3.3-70b': { id: 'llama3.3-70b', name: 'Llama 3.3 70B' } },
        },
      });
      const service = new ModelsCatalogService(tmpDir);

      expect(service.resolveCachedProviderRouting('cerebras')).toEqual({
        protocol: 'openai',
        baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
        catalogId: 'cerebras',
      } satisfies ProviderRouting);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('getModelsForProvider aliases', () => {
    it('maps spigot provider ids to catalog ids', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-alias-test-'));
      seedCatalog(tmpDir, {
        alibaba: {
          id: 'alibaba',
          name: 'Alibaba',
          models: { 'qwen3-max': { id: 'qwen3-max', name: 'Qwen3 Max' } },
        },
      });
      const service = new ModelsCatalogService(tmpDir);
      // Seed the memory cache through the awaited path without hitting the network.
      await service.resolveProviderRouting('alibaba');

      const qwenModels = await service.getModelsForProvider('qwen');
      expect(qwenModels).toEqual(['qwen3-max']);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('getProviders', () => {
    it('summarizes every catalog provider with models', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-providers-test-'));
      seedCatalog(tmpDir, {
        zhipuai: { id: 'zhipuai', name: 'Z.ai', models: { 'glm-4.6': {} } },
        empty: { id: 'empty', name: 'Empty', models: {} },
        openai: { id: 'openai', name: 'OpenAI', models: { 'gpt-5': {}, 'gpt-4o': {} } },
      });
      const service = new ModelsCatalogService(tmpDir);
      await service.resolveProviderRouting('openai');

      const providers = await service.getProviders();
      expect(providers).toEqual([
        { id: 'openai', name: 'OpenAI', modelCount: 2 },
        { id: 'zhipuai', name: 'Z.ai', modelCount: 1 },
      ]);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
