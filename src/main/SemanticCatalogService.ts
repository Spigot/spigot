import { promises as fs } from 'fs';
import { extname, isAbsolute, relative, resolve } from 'path';
import { lspManager, type LspSourceLocation } from './lspManager';

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', 'generated']);
export const SEMANTIC_LIMITS = {
  maxQueryLength: 120,
  maxResults: 8,
  maxLspSymbols: 32,
  maxFileBytes: 256 * 1024,
  maxSnippetChars: 800,
  maxTotalTextChars: 4_000,
  timeoutMs: 750,
} as const;

export type SemanticSymbol = LspSourceLocation & { name: string; kind: number };
export type SemanticSnippet = { citation: string; text: string };
export type SemanticResult = {
  status: 'ok' | 'fallback_lexical' | 'unsupported' | 'not_ready' | 'timeout' | 'aborted' | 'invalid_query';
  symbols: SemanticSymbol[];
  snippets: SemanticSnippet[];
  fallbackQuery?: string;
};

type CatalogEntry = SemanticSymbol & { updatedAt: number };
type SymbolProvider = Pick<typeof lspManager, 'workspaceSymbols'>;

export function canonicalWorkspaceFile(workspacePath: string, filePath: string): string | null {
  const workspace = resolve(workspacePath);
  const target = isAbsolute(filePath) ? resolve(filePath) : resolve(workspace, filePath);
  const file = relative(workspace, target).replace(/\\/g, '/');
  if (!file || file.startsWith('../') || file === '..' || isAbsolute(file)) return null;
  const segments = file.split('/');
  if (segments.some(segment => IGNORED_DIRECTORIES.has(segment.toLowerCase()))) return null;
  return ALLOWED_EXTENSIONS.has(extname(file).toLowerCase()) ? file : null;
}

export class SemanticCatalogService {
  private readonly catalogs = new Map<string, Map<string, CatalogEntry[]>>();

  constructor(private readonly symbols: SymbolProvider = lspManager) {}

  invalidate(workspacePath: string, filePath: string): void {
    const file = canonicalWorkspaceFile(workspacePath, filePath);
    if (!file) return;
    this.catalogs.get(resolve(workspacePath))?.delete(file);
  }

  clearWorkspace(workspacePath: string): void {
    this.catalogs.delete(resolve(workspacePath));
  }

  async retrieve(input: { workspacePath: string; query: string; explicitPaths?: string[]; signal?: AbortSignal }): Promise<SemanticResult> {
    const query = String(input.query || '').trim().slice(0, SEMANTIC_LIMITS.maxQueryLength);
    if (!query) return { status: 'invalid_query', symbols: [], snippets: [] };
    if (input.signal?.aborted) return { status: 'aborted', symbols: [], snippets: [] };

    const started = Date.now();
    const lsp = await this.requestSymbols(input.workspacePath, query, input.signal);
    if (!lsp) {
      if (input.signal?.aborted) return { status: 'aborted', symbols: [], snippets: [] };
      const fallback = await this.retrieveLexical(input.workspacePath, query, input.explicitPaths || [], input.signal, started);
      return { ...fallback, status: 'timeout', fallbackQuery: query };
    }
    if (input.signal?.aborted) return { status: 'aborted', symbols: [], snippets: [] };

    if (lsp.status !== 'ok') {
      const fallback = await this.retrieveLexical(input.workspacePath, query, input.explicitPaths || [], input.signal, started);
      return { ...fallback, status: lsp.status === 'unsupported' ? 'unsupported' : 'fallback_lexical', fallbackQuery: query };
    }

    const catalog = this.catalogFor(input.workspacePath);
    for (const symbol of lsp.items) {
      const filePath = canonicalWorkspaceFile(input.workspacePath, symbol.filePath);
      if (!filePath) continue;
      const entries = catalog.get(filePath) || [];
      const duplicate = entries.some(entry => entry.name === symbol.name && entry.range.startLine === symbol.range.startLine);
      if (!duplicate) entries.push({ ...symbol, filePath, updatedAt: Date.now() });
      catalog.set(filePath, entries.slice(-SEMANTIC_LIMITS.maxLspSymbols));
    }

    const records = [...catalog.values()].flat().filter(symbol => this.matches(symbol, query))
      .sort((a, b) => this.score(b, query) - this.score(a, query) || a.filePath.localeCompare(b.filePath))
      .slice(0, SEMANTIC_LIMITS.maxResults);
    const snippets = await this.snippets(input.workspacePath, records, input.signal, started);
    if (input.signal?.aborted) return { status: 'aborted', symbols: [], snippets: [] };
    return { status: Date.now() - started > SEMANTIC_LIMITS.timeoutMs ? 'timeout' : 'ok', symbols: records, snippets };
  }

  private async requestSymbols(workspacePath: string, query: string, signal?: AbortSignal) {
    const request = this.symbols.workspaceSymbols(workspacePath, 'typescript', {
      query,
      maxResults: SEMANTIC_LIMITS.maxLspSymbols,
      timeoutMs: SEMANTIC_LIMITS.timeoutMs,
      signal,
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(resolveTimeout => { timeoutId = setTimeout(() => resolveTimeout(null), SEMANTIC_LIMITS.timeoutMs); });
    const aborted = new Promise<null>(resolveAbort => signal?.addEventListener('abort', () => resolveAbort(null), { once: true }));
    try { return await Promise.race([request, timeout, aborted]); } finally { if (timeoutId) clearTimeout(timeoutId); }
  }

  private catalogFor(workspacePath: string) {
    const key = resolve(workspacePath);
    let catalog = this.catalogs.get(key);
    if (!catalog) {
      catalog = new Map();
      this.catalogs.set(key, catalog);
    }
    return catalog;
  }

  private matches(symbol: SemanticSymbol, query: string) {
    const normalized = query.toLowerCase();
    return symbol.name.toLowerCase().includes(normalized) || symbol.filePath.toLowerCase().includes(normalized);
  }

  private score(symbol: SemanticSymbol, query: string) {
    const normalized = query.toLowerCase();
    const name = symbol.name.toLowerCase();
    const file = symbol.filePath.toLowerCase();
    if (name === normalized) return 100;
    if (file === normalized || file.endsWith(`/${normalized}`)) return 90;
    if (name.startsWith(normalized)) return 70;
    if (file.includes(normalized)) return 50;
    return 10;
  }

  private async snippets(workspacePath: string, symbols: SemanticSymbol[], signal: AbortSignal | undefined, started: number) {
    const snippets: SemanticSnippet[] = [];
    let total = 0;
    for (const symbol of symbols) {
      if (signal?.aborted || Date.now() - started > SEMANTIC_LIMITS.timeoutMs || total >= SEMANTIC_LIMITS.maxTotalTextChars) break;
      const snippet = await this.readSnippet(workspacePath, symbol, signal);
      if (!snippet) continue;
      const available = SEMANTIC_LIMITS.maxTotalTextChars - total;
      snippets.push({ ...snippet, text: snippet.text.slice(0, available) });
      total += snippets[snippets.length - 1].text.length;
    }
    return snippets;
  }

  private async retrieveLexical(workspacePath: string, query: string, explicitPaths: string[], signal: AbortSignal | undefined, started: number): Promise<SemanticResult> {
    const symbols: SemanticSymbol[] = [];
    for (const candidate of explicitPaths.slice(0, SEMANTIC_LIMITS.maxResults)) {
      if (signal?.aborted || Date.now() - started > SEMANTIC_LIMITS.timeoutMs) break;
      const filePath = canonicalWorkspaceFile(workspacePath, candidate);
      if (!filePath) continue;
      const text = await this.readText(workspacePath, filePath, signal);
      if (!text) continue;
      const line = text.split(/\r?\n/).findIndex(value => value.toLowerCase().includes(query.toLowerCase()));
      if (line >= 0) symbols.push({ name: query, kind: 0, filePath, range: { startLine: line + 1, startCharacter: 1, endLine: line + 1, endCharacter: 1 } });
    }
    return { status: 'fallback_lexical', symbols, snippets: await this.snippets(workspacePath, symbols, signal, started) };
  }

  private async readSnippet(workspacePath: string, symbol: SemanticSymbol, signal?: AbortSignal): Promise<SemanticSnippet | null> {
    const text = await this.readText(workspacePath, symbol.filePath, signal);
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    const from = Math.max(0, symbol.range.startLine - 2);
    const to = Math.min(lines.length, Math.max(symbol.range.endLine, symbol.range.startLine) + 2);
    return { citation: `${symbol.filePath}:${from + 1}-${to}`, text: lines.slice(from, to).join('\n').slice(0, SEMANTIC_LIMITS.maxSnippetChars) };
  }

  private async readText(workspacePath: string, filePath: string, signal?: AbortSignal): Promise<string | null> {
    if (signal?.aborted) return null;
    try {
      const absolute = resolve(workspacePath, filePath);
      const stats = await fs.stat(absolute);
      if (!stats.isFile() || stats.size > SEMANTIC_LIMITS.maxFileBytes || signal?.aborted) return null;
      return await fs.readFile(absolute, 'utf-8');
    } catch {
      return null;
    }
  }
}

export const semanticCatalogService = new SemanticCatalogService();
