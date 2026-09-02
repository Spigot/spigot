import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useSystemDialogStore } from '../../components/ui/systemDialogStore';
import { useLayoutStore } from '../../store/layoutStore';

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
    useLayoutStore.setState({ isSettingsModalOpen: false, settingsCategory: null });
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

  it('creates a new file with Ctrl+N when a workspace is open', async () => {
    vi.spyOn(useSystemDialogStore.getState(), 'prompt').mockResolvedValue('feature.ts');
    render(<ShortcutHarness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));

    await vi.waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith('feature.ts', 'file'));
  });

  it('does not steal Ctrl+N from editable fields', () => {
    vi.spyOn(useSystemDialogStore.getState(), 'prompt').mockResolvedValue('feature.ts');
    render(<ShortcutHarness />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));

    expect(mockCreateItem).not.toHaveBeenCalled();
  });

  it('opens provider settings with Ctrl+A outside editable fields', () => {
    render(<ShortcutHarness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));

    expect(useLayoutStore.getState()).toMatchObject({ isSettingsModalOpen: true, settingsCategory: 'ai' });
  });

  it('does not steal Ctrl+A from editable fields', () => {
    render(<ShortcutHarness />);
    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));

    expect(useLayoutStore.getState().isSettingsModalOpen).toBe(false);
  });

  it('triggers zoomIn on Ctrl++', () => {
    const zoomIn = vi.fn();
    (window as any).api = { app: { zoomIn } };

    render(<ShortcutHarness />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true }));

    expect(zoomIn).toHaveBeenCalledOnce();
  });

  it('triggers zoomOut on Ctrl+-', () => {
    const zoomOut = vi.fn();
    (window as any).api = { app: { zoomOut } };

    render(<ShortcutHarness />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', ctrlKey: true }));

    expect(zoomOut).toHaveBeenCalledOnce();
  });

  it('triggers zoomReset on Ctrl+0', () => {
    const zoomReset = vi.fn();
    (window as any).api = { app: { zoomReset } };

    render(<ShortcutHarness />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));

    expect(zoomReset).toHaveBeenCalledOnce();
  });
});
