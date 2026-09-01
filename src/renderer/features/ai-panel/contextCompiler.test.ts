import { describe, expect, it, vi } from 'vitest';
import { compileContext } from './contextCompiler';

describe('compileContext', () => {
  it('includes only root project instructions without an explicit selection', async () => {
    const workspacePath = '/workspace';
    const readFile = vi.fn().mockResolvedValue('# Project instructions');
    (window as any).api = { fs: { readFile } };
    const result = await compileContext(workspacePath, [
      { name: 'README.md', path: '/workspace/README.md', isDirectory: false },
      { name: 'src', path: '/workspace/src', isDirectory: true, children: [{ name: 'app.ts', path: '/workspace/src/app.ts', isDirectory: false }] },
    ], null);

    expect(result.contextSource).toBe('default');
    expect(result.filesCompiled).toEqual(['/README.md']);
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
