const LSP_MARKER_OWNER = 'spigot-lsp';

type Monaco = typeof import('monaco-editor');

type LspDiagnostic = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number;
  source?: string;
  code?: string | number;
};

type LspCompletionItem = {
  label: string | { label: string };
  kind?: number;
  detail?: string;
  documentation?: string | { value?: string };
  insertText?: string;
  textEdit?: {
    newText: string;
  };
};

const modelVersions = new Map<string, number>();
const openedDocuments = new Set<string>();
const registeredLanguages = new Set<string>();
let diagnosticsDisposer: (() => void) | null = null;

export const toFileUri = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, '/');
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(prefixed)}`;
};

const toLspLanguageId = (language: string) => {
  if (language === 'typescript') return 'typescript';
  if (language === 'javascript') return 'javascript';
  return language;
};

const toMonacoSeverity = (monaco: Monaco, severity?: number) => {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
};

const toCompletionKind = (monaco: Monaco, kind?: number) => {
  const fallback = monaco.languages.CompletionItemKind.Text;
  if (!kind) return fallback;

  const map: Record<number, import('monaco-editor').languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    20: monaco.languages.CompletionItemKind.Folder,
    21: monaco.languages.CompletionItemKind.EnumMember,
    22: monaco.languages.CompletionItemKind.Constant,
    23: monaco.languages.CompletionItemKind.Struct,
    24: monaco.languages.CompletionItemKind.Event,
    25: monaco.languages.CompletionItemKind.Operator,
    26: monaco.languages.CompletionItemKind.TypeParameter,
  };

  return map[kind] ?? fallback;
};

export const initializeLspDiagnosticsBridge = (monaco: Monaco) => {
  if (diagnosticsDisposer) return;

  diagnosticsDisposer = (window as any).api?.lsp?.onDiagnostics?.(
    (payload: { uri: string; diagnostics: LspDiagnostic[] }) => {
      const model = monaco.editor.getModels().find((candidate) => candidate.uri.toString() === payload.uri);
      if (!model) return;

      monaco.editor.setModelMarkers(
        model,
        LSP_MARKER_OWNER,
        payload.diagnostics.map((diagnostic) => ({
          startLineNumber: diagnostic.range.start.line + 1,
          startColumn: diagnostic.range.start.character + 1,
          endLineNumber: diagnostic.range.end.line + 1,
          endColumn: diagnostic.range.end.character + 1,
          message: diagnostic.message,
          severity: toMonacoSeverity(monaco, diagnostic.severity),
          source: diagnostic.source ?? 'LSP',
          code: diagnostic.code ? String(diagnostic.code) : undefined,
        })),
      );
    },
  );
};

export const registerLspCompletionProvider = (monaco: Monaco, languageId: string, workspacePath: string | null) => {
  const lspLanguageId = toLspLanguageId(languageId);
  const providerKey = `${workspacePath ?? ''}:${lspLanguageId}`;

  if (!workspacePath || !['typescript', 'javascript'].includes(lspLanguageId) || registeredLanguages.has(providerKey)) {
    return;
  }

  registeredLanguages.add(providerKey);

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', '"', "'", '/', '@'],
    async provideCompletionItems(model, position) {
      const result = await (window as any).api?.lsp?.completion?.({
        workspacePath,
        languageId: lspLanguageId,
        uri: model.uri.toString(),
        line: position.lineNumber - 1,
        character: position.column - 1,
      });

      const items: LspCompletionItem[] = Array.isArray(result) ? result : result?.items ?? [];
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: items.map((item) => {
          const label = typeof item.label === 'string' ? item.label : item.label.label;
          const documentation = typeof item.documentation === 'string' ? item.documentation : item.documentation?.value;

          return {
            label,
            kind: toCompletionKind(monaco, item.kind),
            insertText: item.textEdit?.newText ?? item.insertText ?? label,
            detail: item.detail,
            documentation,
            range,
          };
        }),
      };
    },
  });
};

export const openLspDocument = async (workspacePath: string | null, filePath: string, languageId: string, text: string) => {
  const lspLanguageId = toLspLanguageId(languageId);
  if (!workspacePath || !['typescript', 'javascript'].includes(lspLanguageId)) return;

  const uri = toFileUri(filePath);
  if (openedDocuments.has(uri)) return;

  try {
    await (window as any).api?.lsp?.openDocument?.({
      workspacePath,
      document: {
        uri,
        languageId: lspLanguageId,
        version: 1,
        text,
      },
    });
    openedDocuments.add(uri);
    modelVersions.set(uri, 1);
  } catch (error) {
    openedDocuments.delete(uri);
    modelVersions.delete(uri);
    console.warn('Unable to open LSP document:', error);
  }
};

export const changeLspDocument = async (workspacePath: string | null, filePath: string, languageId: string, text: string) => {
  const lspLanguageId = toLspLanguageId(languageId);
  if (!workspacePath || !['typescript', 'javascript'].includes(lspLanguageId)) return;

  const uri = toFileUri(filePath);
  const nextVersion = (modelVersions.get(uri) ?? 1) + 1;
  modelVersions.set(uri, nextVersion);

  if (!openedDocuments.has(uri)) {
    await openLspDocument(workspacePath, filePath, languageId, text);
    return;
  }

  try {
    await (window as any).api?.lsp?.changeDocument?.({
      workspacePath,
      languageId: lspLanguageId,
      document: {
        uri,
        version: nextVersion,
        text,
      },
    });
  } catch (error) {
    console.warn('Unable to sync LSP document change:', error);
  }
};

export const saveLspDocument = async (workspacePath: string | null, filePath: string, languageId: string, text: string) => {
  const lspLanguageId = toLspLanguageId(languageId);
  if (!workspacePath || !['typescript', 'javascript'].includes(lspLanguageId)) return;

  await (window as any).api?.lsp?.saveDocument?.({
    workspacePath,
    languageId: lspLanguageId,
    uri: toFileUri(filePath),
    text,
  });
};

export const clearLspMarkersForFile = (monaco: Monaco, filePath: string) => {
  const uri = toFileUri(filePath);
  const model = monaco.editor.getModels().find((candidate) => candidate.uri.toString() === uri);
  if (model) {
    monaco.editor.setModelMarkers(model, LSP_MARKER_OWNER, []);
  }
};
