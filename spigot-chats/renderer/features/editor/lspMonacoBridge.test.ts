import { describe, expect, it } from 'vitest';
import { toLspLanguageId } from './lspMonacoBridge';

describe('toLspLanguageId', () => {
  it('maps TSX files to the TypeScript React language id', () => {
    expect(toLspLanguageId('typescript', 'file:///workspace/src/TitleBar.tsx')).toBe('typescriptreact');
    expect(toLspLanguageId('typescript', 'C:\\workspace\\src\\TitleBar.tsx')).toBe('typescriptreact');
  });

  it('maps JSX files to the JavaScript React language id', () => {
    expect(toLspLanguageId('javascript', 'file:///workspace/src/App.jsx')).toBe('javascriptreact');
  });

  it('keeps plain TypeScript and JavaScript files unchanged', () => {
    expect(toLspLanguageId('typescript', 'file:///workspace/src/index.ts')).toBe('typescript');
    expect(toLspLanguageId('javascript', 'file:///workspace/src/index.js')).toBe('javascript');
  });
});
