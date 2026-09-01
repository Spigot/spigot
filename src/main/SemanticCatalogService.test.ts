import { describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { canonicalWorkspaceFile, SemanticCatalogService, SEMANTIC_LIMITS } from './SemanticCatalogService';

const location = (name: string, filePath: string, line = 1) => ({ name, kind: 12, filePath, range: { startLine: line, startCharacter: 1, endLine: line, endCharacter: 8 } });

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-semantic-'));
  await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'src', 'api.ts'), 'export function ApiClient() {\n  return 1;\n}\n', 'utf8');
  return workspace;
}

describe('SemanticCatalogService', () => {
  it('ranks exact names before path matches and formats source citations', async () => {
    const workspace = await fixture();
    const service = new SemanticCatalogService({ workspaceSymbols: async () => ({ status: 'ok', items: [location('api', 'src/api.ts'), location('ApiClient', 'src/api.ts')] }) } as any);
    const result = await service.retrieve({ workspacePath: workspace, query: 'api', explicitPaths: [path.join(workspace, 'src/api.ts')] });
    expect(result.status).toBe('ok');
    expect(result.symbols[0].name).toBe('api');
    expect(result.snippets[0]).toMatchObject({ citation: 'src/api.ts:1-3' });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('invalidates catalog records and excludes ignored or escaped paths', async () => {
    const workspace = await fixture();
    let calls = 0;
    const service = new SemanticCatalogService({ workspaceSymbols: async () => ({ status: 'ok', items: calls++ === 0 ? [location('ApiClient', 'src/api.ts')] : [] }) } as any);
    expect((await service.retrieve({ workspacePath: workspace, query: 'ApiClient' })).symbols).toHaveLength(1);
    service.invalidate(workspace, 'src/api.ts');
    expect((await service.retrieve({ workspacePath: workspace, query: 'ApiClient' })).symbols).toHaveLength(0);
    expect(canonicalWorkspaceFile(workspace, '../outside.ts')).toBeNull();
    expect(canonicalWorkspaceFile(workspace, 'node_modules/lib/index.ts')).toBeNull();
    expect(canonicalWorkspaceFile(workspace, 'vendor/lib.ts')).toBeNull();
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('enforces source size and cancellation limits', async () => {
    const workspace = await fixture();
    await fs.writeFile(path.join(workspace, 'src', 'large.ts'), 'x'.repeat(SEMANTIC_LIMITS.maxFileBytes + 1), 'utf8');
    const service = new SemanticCatalogService({ workspaceSymbols: async () => ({ status: 'ok', items: [location('large', 'src/large.ts')] }) } as any);
    expect((await service.retrieve({ workspacePath: workspace, query: 'large' })).snippets).toEqual([]);

    const controller = new AbortController();
    const pending = new SemanticCatalogService({ workspaceSymbols: () => new Promise(() => {}) } as any)
      .retrieve({ workspacePath: workspace, query: 'anything', signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ status: 'aborted' });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('returns within the semantic time budget when the LSP request does not settle', async () => {
    const workspace = await fixture();
    const started = Date.now();
    const service = new SemanticCatalogService({ workspaceSymbols: () => new Promise(() => {}) } as any);
    await expect(service.retrieve({ workspacePath: workspace, query: 'ApiClient' })).resolves.toMatchObject({ status: 'timeout' });
    expect(Date.now() - started).toBeLessThan(SEMANTIC_LIMITS.timeoutMs + 200);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('uses constrained lexical fallback for unavailable language service', async () => {
    const workspace = await fixture();
    const service = new SemanticCatalogService({ workspaceSymbols: async () => ({ status: 'not_ready', items: [] }) } as any);
    const result = await service.retrieve({ workspacePath: workspace, query: 'ApiClient', explicitPaths: [path.join(workspace, 'src/api.ts')] });
    expect(result).toMatchObject({ status: 'fallback_lexical', fallbackQuery: 'ApiClient' });
    expect(result.symbols[0].filePath).toBe('src/api.ts');
    await fs.rm(workspace, { recursive: true, force: true });
  });
});
