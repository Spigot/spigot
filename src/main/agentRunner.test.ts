import { describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  findAndReplaceContent,
  normalizeQuotes,
  executeTool
} from './agentRunner';

describe('agentRunner - code editing tools', () => {
  describe('normalizeQuotes', () => {
    it('normalizes curly quotes to straight quotes', () => {
      const input = '“hello” and ‘world’';
      expect(normalizeQuotes(input)).toBe('"hello" and \'world\'');
    });
  });

  describe('findAndReplaceContent', () => {
    it('replaces exact single occurrence', () => {
      const original = 'const x = 1;\nconst y = 2;\n';
      const result = findAndReplaceContent(original, 'const y = 2;', 'const y = 20;');
      expect(result.count).toBe(1);
      expect(result.updatedContent).toBe('const x = 1;\nconst y = 20;\n');
    });

    it('replaces multiple occurrences when replaceAll is true', () => {
      const original = 'foo bar foo baz foo';
      const result = findAndReplaceContent(original, 'foo', 'qux', true);
      expect(result.count).toBe(3);
      expect(result.updatedContent).toBe('qux bar qux baz qux');
    });

    it('handles CRLF vs LF line endings correctly', () => {
      const original = 'function test() {\r\n  return 1;\r\n}\r\n';
      const oldStr = 'function test() {\n  return 1;\n}';
      const newStr = 'function test() {\n  return 42;\n}';
      const result = findAndReplaceContent(original, oldStr, newStr);
      expect(result.count).toBe(1);
      expect(result.updatedContent).toContain('return 42;');
    });

    it('matches with trailing whitespace variations', () => {
      const original = 'const a = 1;   \nconst b = 2;\n';
      const oldStr = 'const a = 1;\nconst b = 2;';
      const newStr = 'const a = 100;\nconst b = 200;';
      const result = findAndReplaceContent(original, oldStr, newStr);
      expect(result.count).toBe(1);
      expect(result.updatedContent).toBe('const a = 100;\nconst b = 200;\n');
    });

    it('throws error if oldString is not found', () => {
      const original = 'const a = 1;';
      expect(() => {
        findAndReplaceContent(original, 'const nonExistent = 99;', 'const b = 2;');
      }).toThrow(/No se encontró el bloque 'oldString'/);
    });
  });

  describe('executeTool integration', () => {
    it('executes edit_file tool on real temp file', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-test-'));
      const testFile = path.join(tempDir, 'sample.ts');
      await fs.writeFile(testFile, 'export function add(a: number, b: number) {\n  return a - b;\n}\n', 'utf-8');

      const toolResult = await executeTool(
        'edit_file',
        {
          filePath: 'sample.ts',
          oldString: 'return a - b;',
          newString: 'return a + b;'
        },
        tempDir
      );

      expect(toolResult).toContain('Edición exitosa');
      const updatedOnDisk = await fs.readFile(testFile, 'utf-8');
      expect(updatedOnDisk).toBe('export function add(a: number, b: number) {\n  return a + b;\n}\n');

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('executes glob_search tool', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-test-glob-'));
      const subDir = path.join(tempDir, 'src', 'components');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, 'Button.tsx'), 'export const Button = () => null;', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'package.json'), '{}', 'utf-8');

      const toolResult = await executeTool(
        'glob_search',
        {
          pattern: '**/*.tsx'
        },
        tempDir
      );

      const parsed = JSON.parse(toolResult);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.files[0]).toContain('Button.tsx');

      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });
});
