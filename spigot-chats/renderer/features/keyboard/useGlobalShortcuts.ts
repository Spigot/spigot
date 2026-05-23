import { useEffect } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
};

export const useGlobalShortcuts = () => {
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.altKey) return;

      const key = event.key.toLowerCase();
      const workspace = useWorkspaceStore.getState();

      if (key === 's') {
        event.preventDefault();
        await workspace.saveActiveFile();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (key === 'o') {
        event.preventDefault();
        await workspace.selectWorkspace();
        return;
      }

      if (key === 'n') {
        event.preventDefault();

        if (!workspace.workspacePath) {
          await workspace.selectWorkspace();
          return;
        }

        const name = window.prompt('New file name:', 'untitled.txt')?.trim();
        if (name) {
          await workspace.createItem(name, 'file');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
