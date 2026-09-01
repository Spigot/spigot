import { useEffect } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useSystemDialogStore } from '../../components/ui/systemDialogStore';

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

      if (key === ',') {
        event.preventDefault();
        useLayoutStore.getState().setSettingsModalOpen(true);
        return;
      }

      if (key === 's') {
        event.preventDefault();
        await workspace.saveActiveFile();
        return;
      }

      // Zoom In (handles +, =, NumpadAdd, and Shift variants)
      if (
        key === '+' || 
        key === '=' || 
        event.code === 'NumpadAdd' || 
        event.code === 'Equal'
      ) {
        event.preventDefault();
        (window as any).api?.app?.zoomIn?.();
        return;
      }

      // Zoom Out (handles -, NumpadSubtract, Minus)
      if (key === '-' || event.code === 'NumpadSubtract' || event.code === 'Minus') {
        event.preventDefault();
        (window as any).api?.app?.zoomOut?.();
        return;
      }

      // Zoom Reset (handles 0, Numpad0, Digit0)
      if (key === '0' || event.code === 'Numpad0' || event.code === 'Digit0') {
        event.preventDefault();
        (window as any).api?.app?.zoomReset?.();
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

        const name = (await useSystemDialogStore.getState().prompt('Nuevo archivo', 'Ingresá el nombre del nuevo archivo:', 'untitled.txt'))?.trim();
        if (name) {
          await workspace.createItem(name, 'file');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
