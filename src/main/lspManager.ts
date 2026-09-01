import { BrowserWindow } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { join, relative, resolve, isAbsolute } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, MessageConnection } from 'vscode-jsonrpc/node';
import {
  CompletionRequest,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  ReferencesRequest,
  ShutdownRequest,
  DocumentSymbolRequest,
  WorkspaceSymbolRequest,
} from 'vscode-languageserver-protocol';

export interface LspDocumentOpenArgs {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface LspDocumentChangeArgs {
  uri: string;
  version: number;
  text: string;
}

export interface LspCompletionArgs {
  uri: string;
  line: number;
  character: number;
}

type LspConnection = Pick<MessageConnection, 'sendNotification' | 'sendRequest' | 'onNotification' | 'listen' | 'dispose'>;

type SessionState = {
  workspacePath: string;
  process?: ChildProcessWithoutNullStreams;
  connection: LspConnection;
  initialized: boolean;
  initPromise: Promise<void>;
};

export type LspSourceLocation = {
  filePath: string;
  range: { startLine: number; startCharacter: number; endLine: number; endCharacter: number };
};

export type LspDiagnostic = LspSourceLocation & {
  severity: 'error';
  message: string;
  source?: string;
  code?: string | number;
};

export type LspQueryResult<T> =
  | { status: 'ok'; version?: number; items: T[] }
  | { status: 'unsupported' | 'not_ready' | 'stale' | 'timeout' | 'invalid_path'; items: [] };

const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_DIAGNOSTICS = 50;
const MAX_SYMBOLS = 100;
const MAX_REFERENCES = 100;

const TYPESCRIPT_LANGUAGE_IDS = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact']);

export class LspManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly documentVersions = new Map<string, number>();
  private readonly diagnostics = new Map<string, { version: number; items: LspDiagnostic[] }>();

  async openDocument(window: BrowserWindow, workspacePath: string, document: LspDocumentOpenArgs) {
    const session = await this.ensureSession(window, workspacePath, document.languageId);
    if (!session) return false;

    await session.initPromise;
    session.connection.sendNotification(DidOpenTextDocumentNotification.method, {
      textDocument: document,
    });
    this.rememberDocumentVersion(workspacePath, document.uri, document.version);
    return true;
  }

  async changeDocument(workspacePath: string, languageId: string, document: LspDocumentChangeArgs) {
    const session = this.getSession(workspacePath, languageId);
    if (!session) return false;

    await session.initPromise;
    session.connection.sendNotification(DidChangeTextDocumentNotification.method, {
      textDocument: {
        uri: document.uri,
        version: document.version,
      },
      contentChanges: [{ text: document.text }],
    });
    this.rememberDocumentVersion(workspacePath, document.uri, document.version);
    return true;
  }

  async saveDocument(workspacePath: string, languageId: string, uri: string, text?: string) {
    const session = this.getSession(workspacePath, languageId);
    if (!session) return false;

    await session.initPromise;
    session.connection.sendNotification(DidSaveTextDocumentNotification.method, {
      textDocument: { uri },
      text,
    });
    return true;
  }

  async completion(workspacePath: string, languageId: string, args: LspCompletionArgs) {
    const session = this.getSession(workspacePath, languageId);
    if (!session) return null;

    await session.initPromise;
    return session.connection.sendRequest(CompletionRequest.method, {
      textDocument: { uri: args.uri },
      position: {
        line: args.line,
        character: args.character,
      },
    });
  }

  async errorDiagnostics(
    workspacePath: string,
    languageId: string,
    args: { filePath: string; version: number; timeoutMs?: number; maxResults?: number },
  ): Promise<LspQueryResult<LspDiagnostic>> {
    const filePath = this.canonicalPath(workspacePath, args.filePath);
    if (!filePath) return { status: 'invalid_path', items: [] };
    if (!this.getSession(workspacePath, languageId)) return { status: 'not_ready', items: [] };

    const key = this.documentKey(workspacePath, filePath);
    const currentVersion = this.documentVersions.get(key);
    if (currentVersion !== args.version) return { status: 'stale', items: [] };

    const snapshot = this.diagnostics.get(key);
    if (snapshot?.version === args.version) {
      return { status: 'ok', version: args.version, items: snapshot.items.slice(0, this.limit(args.maxResults, MAX_DIAGNOSTICS)) };
    }

    const timeoutMs = this.limit(args.timeoutMs, DEFAULT_TIMEOUT_MS, 50);
    const received = await this.waitForDiagnostics(key, args.version, timeoutMs);
    if (!received) {
      return this.documentVersions.get(key) === args.version ? { status: 'timeout', items: [] } : { status: 'stale', items: [] };
    }
    return { status: 'ok', version: args.version, items: received.items.slice(0, this.limit(args.maxResults, MAX_DIAGNOSTICS)) };
  }

  async documentSymbols(workspacePath: string, languageId: string, args: { filePath: string; timeoutMs?: number; maxResults?: number }): Promise<LspQueryResult<LspSourceLocation & { name: string; kind: number }>> {
    const filePath = this.canonicalPath(workspacePath, args.filePath);
    const session = this.getSession(workspacePath, languageId);
    if (!filePath) return { status: 'invalid_path', items: [] };
    if (!session) return { status: 'not_ready', items: [] };
    const result = await this.request(session, DocumentSymbolRequest.method, { textDocument: { uri: pathToFileURL(resolve(workspacePath, filePath)).toString() } }, args.timeoutMs);
    if (!result) return { status: 'timeout', items: [] };
    return { status: 'ok', items: this.normalizeSymbols(workspacePath, result, this.limit(args.maxResults, MAX_SYMBOLS), pathToFileURL(resolve(workspacePath, filePath)).toString()) };
  }

  async workspaceSymbols(workspacePath: string, languageId: string, args: { query: string; timeoutMs?: number; maxResults?: number; signal?: AbortSignal }): Promise<LspQueryResult<LspSourceLocation & { name: string; kind: number }>> {
    const session = this.getSession(workspacePath, languageId);
    if (!session) return { status: 'not_ready', items: [] };
    const result = await this.request(session, WorkspaceSymbolRequest.method, { query: String(args.query || '').slice(0, 120) }, args.timeoutMs, args.signal);
    if (!result) return { status: 'timeout', items: [] };
    return { status: 'ok', items: this.normalizeSymbols(workspacePath, result, this.limit(args.maxResults, MAX_SYMBOLS)) };
  }

  async definition(workspacePath: string, languageId: string, args: LspCompletionArgs & { timeoutMs?: number; maxResults?: number }): Promise<LspQueryResult<LspSourceLocation>> {
    return this.locationsRequest(workspacePath, languageId, DefinitionRequest.method, args, MAX_SYMBOLS);
  }

  async references(workspacePath: string, languageId: string, args: LspCompletionArgs & { includeDeclaration?: boolean; timeoutMs?: number; maxResults?: number }): Promise<LspQueryResult<LspSourceLocation>> {
    return this.locationsRequest(workspacePath, languageId, ReferencesRequest.method, args, MAX_REFERENCES, { includeDeclaration: Boolean(args.includeDeclaration) });
  }

  async synchronizeAndRefresh(workspacePath: string, languageId: string, filePath: string, text: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<LspQueryResult<LspDiagnostic>> {
    const canonical = this.canonicalPath(workspacePath, filePath);
    const session = this.getSession(workspacePath, languageId);
    if (!canonical) return { status: 'invalid_path', items: [] };
    if (!session) return { status: 'not_ready', items: [] };
    const uri = pathToFileURL(resolve(workspacePath, canonical)).toString();
    const key = this.documentKey(workspacePath, canonical);
    const version = (this.documentVersions.get(key) || 0) + 1;
    const notification = this.documentVersions.has(key) ? DidChangeTextDocumentNotification.method : DidOpenTextDocumentNotification.method;
    const params = notification === DidChangeTextDocumentNotification.method
      ? { textDocument: { uri, version }, contentChanges: [{ text }] }
      : { textDocument: { uri, languageId, version, text } };
    session.connection.sendNotification(notification, params);
    this.documentVersions.set(key, version);
    return this.errorDiagnostics(workspacePath, languageId, { filePath: canonical, version, timeoutMs });
  }

  // Test-only seam; production sessions remain created by ensureSession.
  addSessionForTesting(workspacePath: string, languageId: string, connection: LspConnection) {
    const session: SessionState = { workspacePath, connection, initialized: true, initPromise: Promise.resolve() };
    this.sessions.set(this.getSessionKey(workspacePath, languageId), session);
    this.installDiagnosticsHandler(undefined, session, languageId);
  }

  async shutdownAll() {
    await Promise.all([...this.sessions.values()].map((session) => this.shutdownSession(session)));
    this.sessions.clear();
  }

  private getSession(workspacePath: string, languageId: string) {
    return this.sessions.get(this.getSessionKey(workspacePath, languageId));
  }

  private async ensureSession(window: BrowserWindow, workspacePath: string, languageId: string) {
    if (!TYPESCRIPT_LANGUAGE_IDS.has(languageId)) return null;

    const sessionKey = this.getSessionKey(workspacePath, languageId);
    const existing = this.sessions.get(sessionKey);
    if (existing) return existing;

    const serverCommand = this.resolveTypeScriptLanguageServerCommand();
    const child = spawn(serverCommand.command, serverCommand.args, {
      cwd: workspacePath,
      env: process.env,
      shell: process.platform === 'win32',
    });

    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );

    const session: SessionState = {
      workspacePath,
      process: child,
      connection,
      initialized: false,
      initPromise: Promise.resolve(),
    };

    this.sessions.set(sessionKey, session);

    child.stderr.on('data', (chunk) => {
      console.warn(`[lsp:${languageId}] ${chunk.toString()}`);
    });

    child.on('exit', (code, signal) => {
      console.warn(`[lsp:${languageId}] exited`, { code, signal });
      this.sessions.delete(sessionKey);
    });

    connection.listen();
    session.initPromise = this.initializeSession(window, session, languageId);
    return session;
  }

  private async initializeSession(window: BrowserWindow, session: SessionState, languageId: string) {
    this.installDiagnosticsHandler(window, session, languageId);

    await session.connection.sendRequest(InitializeRequest.method, {
      processId: process.pid,
      rootUri: pathToFileURL(session.workspacePath).toString(),
      workspaceFolders: [
        {
          uri: pathToFileURL(session.workspacePath).toString(),
          name: session.workspacePath.split(/[\\/]/).pop() || 'workspace',
        },
      ],
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
          },
        },
        workspace: {
          configuration: true,
          workspaceFolders: true,
        },
      },
      initializationOptions: {},
    });

    session.connection.sendNotification(InitializedNotification.method, {});
    session.initialized = true;
  }

  private async shutdownSession(session: SessionState) {
    try {
      if (session.initialized) {
        await session.connection.sendRequest(ShutdownRequest.method);
        session.connection.sendNotification('exit');
      }
    } catch (err) {
      console.warn('Error shutting down LSP session:', err);
    } finally {
      session.connection.dispose();
      session.process?.kill();
    }
  }

  private getSessionKey(workspacePath: string, languageId: string) {
    const serverKind = TYPESCRIPT_LANGUAGE_IDS.has(languageId) ? 'typescript' : languageId;
    return `${workspacePath}::${serverKind}`;
  }

  private resolveTypeScriptLanguageServerCommand() {
    const extension = process.platform === 'win32' ? '.cmd' : '';
    const localBinary = join(process.cwd(), 'node_modules', '.bin', `typescript-language-server${extension}`);

    if (existsSync(localBinary)) {
      return { command: localBinary, args: ['--stdio'] };
    }

    return { command: `typescript-language-server${extension}`, args: ['--stdio'] };
  }

  private installDiagnosticsHandler(window: BrowserWindow | undefined, session: SessionState, languageId: string) {
    session.connection.onNotification(PublishDiagnosticsNotification.method, (params: any) => {
      const filePath = this.canonicalPath(session.workspacePath, this.uriPath(params.uri));
      const version = typeof params.version === 'number' ? params.version : undefined;
      if (!filePath || version === undefined) return;
      const key = this.documentKey(session.workspacePath, filePath);
      if (this.documentVersions.get(key) !== version) return;
      const items = (params.diagnostics || [])
        .filter((diagnostic: any) => diagnostic.severity === 1)
        .slice(0, MAX_DIAGNOSTICS)
        .map((diagnostic: any) => this.normalizeDiagnostic(filePath, diagnostic));
      this.diagnostics.set(key, { version, items });
      window?.webContents.send('lsp:diagnostics', { languageId, uri: params.uri, diagnostics: params.diagnostics, version });
    });
  }

  private async locationsRequest(workspacePath: string, languageId: string, method: string, args: LspCompletionArgs & { timeoutMs?: number; maxResults?: number }, cap: number, extra: Record<string, unknown> = {}): Promise<LspQueryResult<LspSourceLocation>> {
    const filePath = this.canonicalPath(workspacePath, this.uriPath(args.uri));
    const session = this.getSession(workspacePath, languageId);
    if (!filePath) return { status: 'invalid_path', items: [] };
    if (!session) return { status: 'not_ready', items: [] };
    const result = await this.request(session, method, { textDocument: { uri: args.uri }, position: { line: args.line, character: args.character }, ...extra }, args.timeoutMs);
    if (!result) return { status: 'timeout', items: [] };
    return { status: 'ok', items: this.normalizeLocations(workspacePath, result, this.limit(args.maxResults, cap)) };
  }

  private normalizeDiagnostic(filePath: string, diagnostic: any): LspDiagnostic {
    return { filePath, severity: 'error', message: String(diagnostic.message || '').slice(0, 1_000), source: diagnostic.source, code: diagnostic.code, range: this.normalizeRange(diagnostic.range) };
  }

  private normalizeSymbols(workspacePath: string, input: any, maxResults: number, fallbackUri?: string) {
    const items: Array<LspSourceLocation & { name: string; kind: number }> = [];
    const visit = (symbol: any, inheritedUri?: string) => {
      if (items.length >= maxResults || !symbol) return;
      const location = symbol.location || (symbol.range ? { uri: inheritedUri, range: symbol.selectionRange || symbol.range } : undefined);
      const filePath = location?.uri && this.canonicalPath(workspacePath, this.uriPath(location.uri));
      if (filePath && location?.range) items.push({ filePath, name: String(symbol.name || '').slice(0, 300), kind: Number(symbol.kind || 0), range: this.normalizeRange(location.range) });
      for (const child of symbol.children || []) visit(child, inheritedUri);
    };
    for (const symbol of Array.isArray(input) ? input : []) visit(symbol, fallbackUri);
    return items;
  }

  private normalizeLocations(workspacePath: string, input: any, maxResults: number): LspSourceLocation[] {
    const locations = Array.isArray(input) ? input : input ? [input] : [];
    return locations.slice(0, maxResults).flatMap((location: any) => {
      const uri = location.uri || location.targetUri;
      const range = location.range || location.targetSelectionRange || location.targetRange;
      const filePath = uri && this.canonicalPath(workspacePath, this.uriPath(uri));
      return filePath && range ? [{ filePath, range: this.normalizeRange(range) }] : [];
    });
  }

  private normalizeRange(range: any) {
    return { startLine: Number(range?.start?.line || 0) + 1, startCharacter: Number(range?.start?.character || 0) + 1, endLine: Number(range?.end?.line || 0) + 1, endCharacter: Number(range?.end?.character || 0) + 1 };
  }

  private async request(session: SessionState, method: string, params: unknown, timeoutMs?: number, signal?: AbortSignal): Promise<any | null> {
    if (signal?.aborted) return null;
    const request = session.connection.sendRequest(method, params as any);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolveTimeout) => { timeoutId = setTimeout(() => resolveTimeout(null), this.limit(timeoutMs, DEFAULT_TIMEOUT_MS, 50)); });
    const aborted = new Promise<null>((resolveAbort) => signal?.addEventListener('abort', () => resolveAbort(null), { once: true }));
    try { return await Promise.race([request, timeout, aborted]); } catch { return null; } finally { if (timeoutId) clearTimeout(timeoutId); }
  }

  private waitForDiagnostics(key: string, version: number, timeoutMs: number) {
    return new Promise<{ version: number; items: LspDiagnostic[] } | null>((resolveSnapshot) => {
      const started = Date.now();
      const check = () => {
        const snapshot = this.diagnostics.get(key);
        if (snapshot?.version === version) return resolveSnapshot(snapshot);
        if (Date.now() - started >= timeoutMs) return resolveSnapshot(null);
        setTimeout(check, 10);
      };
      check();
    });
  }

  private rememberDocumentVersion(workspacePath: string, uri: string, version: number) {
    const filePath = this.canonicalPath(workspacePath, this.uriPath(uri));
    if (!filePath) return;
    const key = this.documentKey(workspacePath, filePath);
    this.documentVersions.set(key, version);
    const snapshot = this.diagnostics.get(key);
    if (snapshot && snapshot.version !== version) this.diagnostics.delete(key);
  }

  private canonicalPath(workspacePath: string, targetPath: string) {
    try {
      const workspace = resolve(workspacePath);
      const target = isAbsolute(targetPath) ? resolve(targetPath) : resolve(workspace, targetPath);
      const rel = relative(workspace, target);
      return !rel.startsWith('..') && !isAbsolute(rel) ? rel.replace(/\\/g, '/') : null;
    } catch { return null; }
  }

  private uriPath(uri: string) {
    try { return fileURLToPath(uri); } catch { return uri; }
  }

  private documentKey(workspacePath: string, filePath: string) { return `${resolve(workspacePath)}::${filePath}`; }

  private limit(value: number | undefined, fallback: number, minimum = 1) { return Math.max(minimum, Math.min(Number.isFinite(value) ? Number(value) : fallback, fallback)); }
}

export const lspManager = new LspManager();
