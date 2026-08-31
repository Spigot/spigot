import { describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  findAndReplaceContent,
  normalizeQuotes,
  executeTool,
  assertPathContained,
  getToolsForMode
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

  describe('Mode Capability Security & Gating', () => {
    it('provides all workspace tools in orchestrator and build modes', () => {
      const orchestratorTools = getToolsForMode('orchestrator').map(t => t.name);
      expect(orchestratorTools).toContain('write_file');
      expect(orchestratorTools).toContain('edit_file');
      expect(orchestratorTools).toContain('run_command');
      expect(orchestratorTools).toContain('read_file');

      const buildTools = getToolsForMode('build').map(t => t.name);
      expect(buildTools).toContain('write_file');
      expect(buildTools).toContain('edit_file');
      expect(buildTools).toContain('run_command');
    });

    it('provides only read-only analysis tools in plan and review modes', () => {
      const planTools = getToolsForMode('plan');
      const planNames = planTools.map(t => t.name);

      expect(planNames).toContain('read_file');
      expect(planNames).toContain('list_dir');
      expect(planNames).toContain('glob_search');
      expect(planNames).toContain('grep_search');
      expect(planNames).not.toContain('write_file');
      expect(planNames).not.toContain('edit_file');
      expect(planNames).not.toContain('run_command');

      const reviewTools = getToolsForMode('review');
      const reviewNames = reviewTools.map(t => t.name);
      expect(reviewNames).not.toContain('write_file');
      expect(reviewNames).not.toContain('edit_file');
      expect(reviewNames).not.toContain('run_command');
    });

    it('rejects mutating tools in plan and review modes while allowing read tools', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-mode-test-'));
      const testFile = path.join(tempDir, 'file.txt');
      await fs.writeFile(testFile, 'hello plan and review', 'utf-8');

      // Plan mode rejects write_file
      const planWrite = await executeTool('write_file', { filePath: 'f2.txt', content: 'hack' }, tempDir, 'plan');
      expect(planWrite).toContain('Acceso denegado');
      expect(planWrite).toContain('modo Plan solo permite herramientas de lectura');

      // Review mode rejects write_file
      const reviewWrite = await executeTool('write_file', { filePath: 'f2.txt', content: 'hack' }, tempDir, 'review');
      expect(reviewWrite).toContain('Acceso denegado');
      expect(reviewWrite).toContain('modo Review solo permite herramientas de lectura');

      // Both permit read_file
      const planRead = await executeTool('read_file', { filePath: 'file.txt' }, tempDir, 'plan');
      expect(planRead).toBe('hello plan and review');

      const reviewRead = await executeTool('read_file', { filePath: 'file.txt' }, tempDir, 'review');
      expect(reviewRead).toBe('hello plan and review');

      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('Workspace Path Containment & Security', () => {
    it('allows valid relative and absolute paths inside the workspace', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-path-test-'));
      const resolved = assertPathContained('src/app.ts', tempDir);
      expect(resolved).toBe(path.resolve(tempDir, 'src/app.ts'));

      const absoluteInside = path.join(tempDir, 'package.json');
      expect(assertPathContained(absoluteInside, tempDir)).toBe(path.resolve(absoluteInside));

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('blocks directory traversal escape attempts (../)', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-path-test-'));

      expect(() => {
        assertPathContained('../../../etc/passwd', tempDir);
      }).toThrow(/fuera del workspace/);

      expect(() => {
        assertPathContained('..\\..\\secret.key', tempDir);
      }).toThrow(/fuera del workspace/);

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('blocks absolute paths outside the workspace', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-path-test-'));
      const outsidePath = path.resolve(os.tmpdir(), 'unrelated-outside.txt');

      expect(() => {
        assertPathContained(outsidePath, tempDir);
      }).toThrow(/fuera del workspace/);

      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('executeTool blocks write_file escape attempts with security error', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-path-test-'));

      const result = await executeTool(
        'write_file',
        {
          filePath: '../../escape.txt',
          content: 'malicious'
        },
        tempDir
      );

      expect(result).toContain('ERROR ejecutando la herramienta');
      expect(result).toContain('fuera del workspace');

      await fs.rm(tempDir, { recursive: true, force: true });
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
