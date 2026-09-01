import { describe, expect, it } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { LspManager } from './lspManager';

class FakeConnection {
  private readonly handlers = new Map<string, (params: any) => void>();
  readonly notifications: Array<{ method: string; params: any }> = [];
  requests = new Map<string, unknown>();

  sendNotification(method: string, params: any) { this.notifications.push({ method, params }); }
  sendRequest(method: string) { return Promise.resolve(this.requests.get(method)); }
  onNotification(method: string, handler: (params: any) => void) { this.handlers.set(method, handler); }
  listen() {}
  dispose() {}
  emit(method: string, params: any) { this.handlers.get(method)?.(params); }
}

describe('LspManager bounded snapshots and requests', () => {
  it('accepts only diagnostics matching the current document version', async () => {
    const workspace = path.join(os.tmpdir(), 'spigot-lsp-version');
    const file = path.join(workspace, 'src', 'app.ts');
    const uri = pathToFileURL(file).toString();
    const connection = new FakeConnection();
    const manager = new LspManager();
    manager.addSessionForTesting(workspace, 'typescript', connection as any);
    await manager.openDocument(null as any, workspace, { uri, languageId: 'typescript', version: 2, text: 'const x = bad;' });

    connection.emit('textDocument/publishDiagnostics', { uri, version: 1, diagnostics: [{ severity: 1, message: 'old error', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }] });
    expect(await manager.errorDiagnostics(workspace, 'typescript', { filePath: 'src/app.ts', version: 2, timeoutMs: 50 })).toMatchObject({ status: 'timeout', items: [] });

    connection.emit('textDocument/publishDiagnostics', { uri, version: 2, diagnostics: [{ severity: 1, message: 'current error', range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } } }] });
    expect(await manager.errorDiagnostics(workspace, 'typescript', { filePath: 'src/app.ts', version: 2 })).toEqual({ status: 'ok', version: 2, items: [{ filePath: 'src/app.ts', severity: 'error', message: 'current error', source: undefined, code: undefined, range: { startLine: 2, startCharacter: 3, endLine: 2, endCharacter: 6 } }] });
  });

  it('normalizes requests and excludes out-of-workspace source locations', async () => {
    const workspace = path.join(os.tmpdir(), 'spigot-lsp-normalize');
    const file = path.join(workspace, 'src', 'app.ts');
    const uri = pathToFileURL(file).toString();
    const connection = new FakeConnection();
    const manager = new LspManager();
    manager.addSessionForTesting(workspace, 'typescript', connection as any);
    connection.requests.set('textDocument/definition', [
      { uri, range: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } } },
      { uri: pathToFileURL(path.join(os.tmpdir(), 'outside.ts')).toString(), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ]);
    connection.requests.set('workspace/symbol', [{ name: 'inside', kind: 12, location: { uri, range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } } } }]);

    expect(await manager.definition(workspace, 'typescript', { uri, line: 0, character: 1 })).toEqual({ status: 'ok', items: [{ filePath: 'src/app.ts', range: { startLine: 1, startCharacter: 2, endLine: 1, endCharacter: 5 } }] });
    expect(await manager.workspaceSymbols(workspace, 'typescript', { query: 'inside' })).toMatchObject({ status: 'ok', items: [{ filePath: 'src/app.ts', name: 'inside' }] });
  });
});
