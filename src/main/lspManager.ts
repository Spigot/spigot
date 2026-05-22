import { BrowserWindow } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, MessageConnection } from 'vscode-jsonrpc/node';
import {
  CompletionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  ShutdownRequest,
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

type SessionState = {
  workspacePath: string;
  process: ChildProcessWithoutNullStreams;
  connection: MessageConnection;
  initialized: boolean;
  initPromise: Promise<void>;
};

const TYPESCRIPT_LANGUAGE_IDS = new Set(['typescript', 'javascript']);

class LspManager {
  private readonly sessions = new Map<string, SessionState>();

  async openDocument(window: BrowserWindow, workspacePath: string, document: LspDocumentOpenArgs) {
    const session = await this.ensureSession(window, workspacePath, document.languageId);
    if (!session) return false;

    await session.initPromise;
    session.connection.sendNotification(DidOpenTextDocumentNotification.method, {
      textDocument: document,
    });
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
    session.connection.onNotification(PublishDiagnosticsNotification.method, (params) => {
      window.webContents.send('lsp:diagnostics', {
        languageId,
        uri: params.uri,
        diagnostics: params.diagnostics,
      });
    });

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
            versionSupport: false,
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
      session.process.kill();
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
}

export const lspManager = new LspManager();
