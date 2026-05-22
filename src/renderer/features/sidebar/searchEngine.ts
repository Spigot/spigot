import { FileNode } from '../../store/workspaceStore';

export interface SearchMatch {
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  length: number;
  lineContent: string;
}

export const MAX_SEARCH_RESULTS = 500;
export const MAX_SEARCH_FILE_BYTES = 1024 * 1024;

const SEARCHABLE_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'html',
  'java',
  'js',
  'jsx',
  'json',
  'md',
  'mjs',
  'py',
  'rs',
  'scss',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

const ALWAYS_SEARCHABLE_FILENAMES = new Set([
  '.gitignore',
  '.npmrc',
  '.env',
  '.env.example',
]);

export const escapeRegex = (str: string) => str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

export const buildSearchRegex = (
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; isRegex: boolean },
) => {
  let pattern = options.isRegex ? query : escapeRegex(query);
  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  return new RegExp(pattern, options.matchCase ? 'g' : 'gi');
};

export const isSearchableFilePath = (filePath: string) => {
  const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  if (ALWAYS_SEARCHABLE_FILENAMES.has(fileName)) return true;

  const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
  return Boolean(extension && SEARCHABLE_EXTENSIONS.has(extension));
};

export const collectSearchableFilePaths = (nodes: FileNode[]): string[] => {
  const files: string[] = [];

  const visit = (items: FileNode[]) => {
    for (const node of items) {
      if (node.isDirectory) {
        if (node.children) visit(node.children);
      } else if (isSearchableFilePath(node.path)) {
        files.push(node.path);
      }
    }
  };

  visit(nodes);
  return files;
};

export const searchInContent = (
  filePath: string,
  content: string,
  regex: RegExp,
  resultLimit = MAX_SEARCH_RESULTS,
): SearchMatch[] => {
  const matches: SearchMatch[] = [];
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length && matches.length < resultLimit; lineIdx++) {
    const lineText = lines[lineIdx];
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      matches.push({
        filePath,
        fileName,
        line: lineIdx + 1,
        column: match.index + 1,
        length: match[0].length,
        lineContent: lineText,
      });

      if (matches.length >= resultLimit) break;
      if (match[0].length === 0) regex.lastIndex++;
    }
  }

  return matches;
};
