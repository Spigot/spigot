import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(resolve(process.cwd(), 'src/renderer/features/ai-panel/ApiKeyModal.tsx'), 'utf8');

describe('ApiKeyModal theme surfaces', () => {
  it('uses solid editor tokens for the actual agent settings panel', () => {
    expect(modalSource).toContain('bg-editor-bg border-2 border-editor-border');
    expect(modalSource).toContain('h-[48px] flex items-center justify-between px-5 border-b border-editor-border bg-editor-sidebar');
    expect(modalSource).toContain('className="bg-editor-bg p-5 flex flex-col gap-4"');
    expect(modalSource).toContain('bg-editor-sidebar px-3 py-2');
    expect(modalSource).toContain('bg-editor-sidebar p-3');
    expect(modalSource).toContain('border-t border-editor-border bg-editor-sidebar px-5');
    expect(modalSource).not.toContain('glass-panel');
    expect(modalSource).not.toContain('bg-editor-hover/');
    expect(modalSource).not.toContain('bg-editor-active/');
  });
});
