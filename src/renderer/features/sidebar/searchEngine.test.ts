import { describe, expect, it } from 'vitest';
import { buildSearchRegex, collectSearchableFilePaths, isSearchableFilePath, searchInContent } from './searchEngine';

describe('searchEngine', () => {
  it('collects only searchable text-like files', () => {
    const files = collectSearchableFilePaths([
      {
        name: 'src',
        path: '/workspace/src',
        isDirectory: true,
        children: [
          { name: 'App.tsx', path: '/workspace/src/App.tsx', isDirectory: false },
          { name: 'logo.png', path: '/workspace/src/logo.png', isDirectory: false },
        ],
      },
      { name: '.npmrc', path: '/workspace/.npmrc', isDirectory: false },
    ]);

    expect(files).toEqual(['/workspace/src/App.tsx', '/workspace/.npmrc']);
    expect(isSearchableFilePath('/workspace/image.ico')).toBe(false);
  });

  it('finds matches with line and column metadata', () => {
    const regex = buildSearchRegex('hello', { matchCase: false, wholeWord: false, isRegex: false });
    const matches = searchInContent('/workspace/README.md', 'one\nhello world\nHello again', regex);

    expect(matches).toEqual([
      expect.objectContaining({ line: 2, column: 1, length: 5 }),
      expect.objectContaining({ line: 3, column: 1, length: 5 }),
    ]);
  });

  it('respects the result limit', () => {
    const regex = buildSearchRegex('a', { matchCase: false, wholeWord: false, isRegex: false });
    const matches = searchInContent('/workspace/file.txt', 'a a a a a', regex, 3);

    expect(matches).toHaveLength(3);
  });
});
