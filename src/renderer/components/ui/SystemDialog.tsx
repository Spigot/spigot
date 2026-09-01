import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSystemDialogStore } from './systemDialogStore';

export function SystemDialog() {
  const request = useSystemDialogStore(state => state.request);
  const resolve = useSystemDialogStore(state => state.resolve);
  const [value, setValue] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.defaultValue ?? '');
    const timer = window.setTimeout(() => (request.kind === 'prompt' ? inputRef.current : dialogRef.current)?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        resolve(request.kind === 'alert' ? true : request.kind === 'confirm' ? false : null);
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, resolve]);

  if (!request) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    resolve(request.kind === 'prompt' ? value : true);
  };
  const cancel = () => resolve(request.kind === 'alert' ? true : request.kind === 'confirm' ? false : null);

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" data-testid="system-dialog-backdrop">
    <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="system-dialog-title" tabIndex={-1} className="w-full max-w-sm rounded-lg border border-editor-border bg-editor-bg shadow-2xl" data-testid={`system-dialog-${request.kind}`}>
      <div className="border-b border-editor-border px-4 py-3">
        <h2 id="system-dialog-title" className="text-sm font-semibold text-editor-text">{request.title}</h2>
      </div>
      <div className="space-y-3 px-4 py-4 text-sm text-editor-textDark">
        <p>{request.message}</p>
        {request.kind === 'prompt' && <input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} className="w-full rounded border border-editor-border bg-editor-sidebar px-2 py-1.5 text-editor-text outline-none focus:border-editor-accent" data-testid="system-dialog-input" />}
      </div>
      <div className="flex justify-end gap-2 border-t border-editor-border px-4 py-3">
        {request.kind !== 'alert' && <button type="button" onClick={cancel} className="rounded px-3 py-1.5 text-sm text-editor-textDark hover:bg-editor-hover" data-testid="system-dialog-cancel">Cancelar</button>}
        <button type="submit" className={`rounded px-3 py-1.5 text-sm font-medium ${request.destructive ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-editor-accent text-editor-sidebar hover:opacity-90'}`} data-testid="system-dialog-confirm" autoFocus={request.kind !== 'prompt'}>{request.kind === 'alert' ? 'Aceptar' : request.destructive ? 'Eliminar' : 'Confirmar'}</button>
      </div>
    </form>
  </div>;
}
