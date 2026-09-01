import { create } from 'zustand';

type DialogRequest = {
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  destructive?: boolean;
  resolve: (value: boolean | string | null) => void;
};

type SystemDialogState = {
  request: DialogRequest | null;
  alert: (title: string, message: string) => Promise<void>;
  confirm: (title: string, message: string, destructive?: boolean) => Promise<boolean>;
  prompt: (title: string, message: string, defaultValue?: string) => Promise<string | null>;
  resolve: (value: boolean | string | null) => void;
};

export const useSystemDialogStore = create<SystemDialogState>((set, get) => ({
  request: null,
  alert: (title, message) => new Promise<void>(resolve => set({ request: { kind: 'alert', title, message, resolve: () => resolve() } })),
  confirm: (title, message, destructive = false) => new Promise<boolean>(resolve => set({ request: { kind: 'confirm', title, message, destructive, resolve: value => resolve(value === true) } })),
  prompt: (title, message, defaultValue = '') => new Promise<string | null>(resolve => set({ request: { kind: 'prompt', title, message, defaultValue, resolve: value => resolve(typeof value === 'string' ? value : null) } })),
  resolve: value => {
    const request = get().request;
    if (!request) return;
    request.resolve(value);
    set({ request: null });
  },
}));
