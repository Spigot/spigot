import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/renderer/features/chat/ChangeSetReviewCard.tsx'), 'utf8');

describe('ChangeSetReviewCard', () => {
  it('renders a keyboard-selectable file list, Monaco diff preview, atomic actions, and guarded rollback confirmation', () => {
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain('<DiffEditor');
    expect(source).toContain('Accept all');
    expect(source).toContain('Reject all');
    expect(source).toContain('dirtyPaths: dirtyFiles');
    expect(source).toContain('Roll back turn');
    expect(source).toContain('Confirm rollback');
    expect(source).toContain('previewRollback');
    expect(source).toContain("onStateChange('rolled-back')");
    expect(source).toContain('No files will be changed');
  });
});
