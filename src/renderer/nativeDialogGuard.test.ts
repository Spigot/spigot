import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer native dialog guard', () => {
  it('does not reintroduce browser dialog APIs into active renderer source', () => {
    const root = resolve(process.cwd(), 'src/renderer');
    const files: string[] = [];
    const visit = (directory: string) => readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'vendor') visit(path);
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) files.push(path);
    });
    visit(root);
    const nativeDialogCall = /(?<![\w.])(?:alert|confirm|prompt)\s*\(/;
    expect(files.filter(file => nativeDialogCall.test(readFileSync(file, 'utf8')))).toEqual([]);
  });
});
