import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useGlobalShortcuts } from './useGlobalShortcuts';

const mockSaveActiveFile = vi.fn();
const mockSelectWorkspace = vi.fn();
const mockCreateItem = vi.fn();

const mockWorkspaceState = {
  workspacePath: '/workspace',
  saveActiveFile: mockSaveActiveFile,
  selectWorkspace: mockSelectWorkspace,
  createItem: mockCreateItem,
};

vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => mockWorkspaceState,
  },
}));

const ShortcutHarness = () => {
  useGlobalShortcuts();
  return null;
};

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceState.workspacePath = '/workspace';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves the active file with Ctrl+S', () => {
    render(<ShortcutHarness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));

    expect(mockSaveActiveFile).toHaveBeenCalledOnce();
  });

  it('opens the folder picker with Ctrl+O', () => {
    render(<ShortcutHarness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }));

    expect(mockSelectWorkspace).toHaveBeenCalledOnce();
  });

  it('creates a new file with Ctrl+N when a workspace is open', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('feature.ts');
    render(<ShortcutHarness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));

    expect(mockCreateItem).toHaveBeenCalledWith('feature.ts', 'file');
  });

  it('does not steal Ctrl+N from editable fields', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('feature.ts');
    render(<ShortcutHarness />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));

    expect(mockCreateItem).not.toHaveBeenCalled();
  });
});
