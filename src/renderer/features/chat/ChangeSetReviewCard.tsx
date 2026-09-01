import { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Check, FileCode2, RotateCcw, X } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

export type ChangeSetReview = {
  id: string;
  turnId: string;
  state: 'open' | 'ready' | 'applying' | 'applied' | 'rolling-back' | 'rolled-back' | 'conflicted' | 'closed';
  entries: Array<{ relativePath: string; operation: 'create' | 'modify' | 'delete' }>;
};

export function ChangeSetReviewCard({ review, onStateChange }: { review: ChangeSetReview; onStateChange: (state: ChangeSetReview['state']) => void }) {
  const [selectedPath, setSelectedPath] = useState(review.entries[0]?.relativePath ?? '');
  const [entry, setEntry] = useState<{ before: string | null; after: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rollback, setRollback] = useState<{ checkpointId: string; entries: Array<{ relativePath: string }>; conflicts: string[]; eligible: boolean } | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const { dirtyFiles, refreshWorkspace, theme } = useWorkspaceStore();
  const actionable = review.state === 'ready';

  useEffect(() => {
    if (!selectedPath) return;
    (window as any).api.changes.entry({ changeSetId: review.id, relativePath: selectedPath })
      .then(setEntry)
      .catch((reason: Error) => setError(reason.message));
  }, [review.id, selectedPath]);

  const accept = async () => {
    setError(null);
    try {
      await (window as any).api.changes.accept({ changeSetId: review.id, dirtyPaths: dirtyFiles });
      onStateChange('applied');
      await refreshWorkspace();
    } catch (reason: any) {
      setError(reason?.message || 'The staged changes could not be applied.');
    }
  };

  const reject = async () => {
    setError(null);
    try {
      await (window as any).api.changes.reject(review.id);
      onStateChange('closed');
    } catch (reason: any) {
      setError(reason?.message || 'The staged changes could not be rejected.');
    }
  };

  const previewRollback = async () => {
    setError(null);
    setRollbackLoading(true);
    try {
      const records = await (window as any).api.changes.listRollbacks({ changeSetId: review.id, turnId: review.turnId });
      if (!records.length) throw new Error('This accepted turn no longer has a rollback checkpoint.');
      const preview = await (window as any).api.changes.previewRollback(records[0].checkpointId);
      setRollback(preview);
    } catch (reason: any) {
      setError(reason?.message || 'The rollback preview could not be prepared.');
    } finally {
      setRollbackLoading(false);
    }
  };

  const executeRollback = async () => {
    if (!rollback?.eligible) return;
    setError(null);
    setRollbackLoading(true);
    try {
      await (window as any).api.changes.rollback(rollback.checkpointId);
      onStateChange('rolled-back');
      setRollback(null);
      await refreshWorkspace();
    } catch (reason: any) {
      setError(reason?.message || 'The rollback was not applied. No files were changed.');
    } finally {
      setRollbackLoading(false);
    }
  };

  return (
    <section className="mt-2 rounded border border-editor-border bg-editor-sidebar overflow-hidden" aria-label="Staged agent changes">
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-editor-border">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-editor-text"><FileCode2 className="w-3.5 h-3.5 text-editor-accent" />{review.entries.length} staged file{review.entries.length === 1 ? '' : 's'}</span>
        <span className="text-[10px] uppercase text-editor-textDark">{review.state}</span>
      </div>
      <div className="max-h-24 overflow-auto p-1" role="listbox" aria-label="Changed files">
        {review.entries.map(item => (
          <button key={item.relativePath} type="button" role="option" aria-selected={selectedPath === item.relativePath} onClick={() => setSelectedPath(item.relativePath)} className={`w-full px-2 py-1 text-left font-mono text-[10px] rounded flex justify-between gap-2 ${selectedPath === item.relativePath ? 'bg-editor-active text-editor-text' : 'text-editor-textDark hover:bg-editor-hover'}`}>
            <span className="truncate">{item.relativePath}</span><span className="uppercase shrink-0">{item.operation}</span>
          </button>
        ))}
      </div>
      {entry && <div className="h-48 border-y border-editor-border" data-testid="changeset-diff-preview">
        <DiffEditor height="100%" original={entry.before ?? ''} modified={entry.after ?? ''} theme={theme} options={{ readOnly: true, renderSideBySide: false, minimap: { enabled: false }, automaticLayout: true, fontSize: 11 }} />
      </div>}
       {error && <p className="px-2.5 py-1.5 text-[11px] text-red-400" role="alert">{error}</p>}
       {rollback && <div className="mx-2 mb-2 rounded border border-editor-border bg-editor-bg p-2 text-[11px]" role="dialog" aria-label="Confirm rollback">
         <p className="text-editor-text">Roll back {rollback.entries.length} file{rollback.entries.length === 1 ? '' : 's'} from this accepted turn?</p>
         {rollback.conflicts.length > 0 && <p className="mt-1 text-red-400" role="alert">No files will be changed: {rollback.conflicts.length} file{rollback.conflicts.length === 1 ? '' : 's'} no longer match the accepted version.</p>}
         <div className="mt-2 flex gap-2">
           <button type="button" onClick={executeRollback} disabled={!rollback.eligible || rollbackLoading} className="rounded bg-editor-accent px-2 py-1 text-editor-sidebar disabled:opacity-50">Confirm rollback</button>
           <button type="button" onClick={() => setRollback(null)} className="rounded border border-editor-border px-2 py-1 text-editor-text hover:bg-editor-hover">Cancel</button>
         </div>
       </div>}
       <div className="flex gap-2 p-2">
        <button type="button" disabled={!actionable} onClick={accept} className="flex-1 flex justify-center items-center gap-1 rounded bg-editor-accent px-2 py-1 text-[11px] font-semibold text-editor-sidebar disabled:opacity-50"><Check className="w-3 h-3" />Accept all</button>
         <button type="button" disabled={!actionable} onClick={reject} className="flex-1 flex justify-center items-center gap-1 rounded border border-editor-border px-2 py-1 text-[11px] text-editor-text hover:bg-editor-hover disabled:opacity-50"><X className="w-3 h-3" />Reject all</button>
         {review.state === 'applied' && <button type="button" onClick={previewRollback} disabled={rollbackLoading} className="flex-1 flex justify-center items-center gap-1 rounded border border-editor-border px-2 py-1 text-[11px] text-editor-text hover:bg-editor-hover disabled:opacity-50"><RotateCcw className="w-3 h-3" />Roll back turn</button>}
      </div>
    </section>
  );
}
