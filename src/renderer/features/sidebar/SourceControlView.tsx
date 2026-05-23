import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  File,
  GitBranch,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useAIStore } from '../../store/aiStore';
import { useWorkspaceStore } from '../../store/workspaceStore';

type GitFile = {
  status: string;
  filePath: string;
};

type GitCommit = {
  hash: string;
  message: string;
  branch: string;
};

type SourceControlResource = GitFile & {
  indexStatus: string;
  workTreeStatus: string;
  group: 'staged' | 'changes';
};

const getStatusParts = (status: string) => ({
  indexStatus: status.charAt(0) || ' ',
  workTreeStatus: status.charAt(1) || ' ',
});

const getStatusLabel = (status: string) => {
  const normalized = status.trim();

  if (normalized === 'A') return { label: 'A', title: 'Added', className: 'text-emerald-400' };
  if (normalized === 'D') return { label: 'D', title: 'Deleted', className: 'text-red-400' };
  if (normalized === 'R') return { label: 'R', title: 'Renamed', className: 'text-emerald-400' };
  if (normalized === 'C') return { label: 'C', title: 'Copied', className: 'text-emerald-400' };
  if (normalized === 'U') return { label: 'U', title: 'Unmerged', className: 'text-[#f14c4c]' };
  if (normalized === '??') return { label: 'U', title: 'Untracked', className: 'text-emerald-400' };

  return { label: 'M', title: 'Modified', className: 'text-[#e2c08d]' };
};

const normalizePath = (path: string) => path.replace(/\\/g, '/');

export const SourceControlView: React.FC = () => {
  const {
    workspacePath,
    fileBuffers,
    openFile,
    dirtyFiles,
    activeDiffFile,
    setDiffFile,
  } = useWorkspaceStore();

  const [gitFiles, setGitFiles] = useState<GitFile[]>([]);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [gitLog, setGitLog] = useState<GitCommit[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitFeedback, setCommitFeedback] = useState('');
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);
  const [aheadCount, setAheadCount] = useState(0);
  const [isPushing, setIsPushing] = useState(false);
  const isInputOpen = true;
  const [isChangesOpen, setIsChangesOpen] = useState(true);
  const [isStagedOpen, setIsStagedOpen] = useState(true);
  const [sourceControlHeight, setSourceControlHeight] = useState(68);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  const refreshGitStatus = async () => {
    if (!workspacePath) return;
    setIsLoadingGit(true);
    try {
      const [files, branch, log, counts] = await Promise.all([
        (window as any).api.git.getStatus(workspacePath),
        (window as any).api.git.getCurrentBranch(workspacePath),
        (window as any).api.git.getLog(workspacePath),
        (window as any).api.git.getAheadBehind(workspacePath),
      ]);

      setGitFiles(files || []);
      setCurrentBranch(branch || 'main');
      setGitLog(log || []);
      setAheadCount(counts?.ahead || 0);
    } catch (err) {
      console.error('Error fetching git source control state:', err);
    } finally {
      setIsLoadingGit(false);
    }
  };

  useEffect(() => {
    refreshGitStatus();
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath) return;

    const intervalId = window.setInterval(refreshGitStatus, 5000);
    return () => window.clearInterval(intervalId);
  }, [workspacePath]);

  const resources = useMemo(() => {
    if (!workspacePath) return { staged: [] as SourceControlResource[], changes: [] as SourceControlResource[] };

    const normalizedWorkspacePath = normalizePath(workspacePath);
    const gitRelativePaths = new Set(gitFiles.map((file) => normalizePath(file.filePath)));
    const gitResources = gitFiles.map((file) => {
      const { indexStatus, workTreeStatus } = getStatusParts(file.status);
      const isStaged = indexStatus !== ' ' && indexStatus !== '?';

      return {
        ...file,
        indexStatus,
        workTreeStatus,
        group: isStaged ? 'staged' : 'changes',
      } satisfies SourceControlResource;
    });

    const unsavedResources = dirtyFiles
      .map(normalizePath)
      .filter((filePath) => filePath.startsWith(normalizedWorkspacePath))
      .map((filePath) => filePath.slice(normalizedWorkspacePath.length + 1))
      .filter((relativePath) => relativePath && !gitRelativePaths.has(relativePath))
      .map((filePath) => ({
        status: ' M',
        filePath,
        indexStatus: ' ',
        workTreeStatus: 'M',
        group: 'changes' as const,
      }));

    return [...gitResources, ...unsavedResources].reduce(
      (groups, resource) => {
        groups[resource.group].push(resource);
        return groups;
      },
      { staged: [] as SourceControlResource[], changes: [] as SourceControlResource[] }
    );
  }, [dirtyFiles, gitFiles, workspacePath]);

  const allResourceCount = resources.staged.length + resources.changes.length;

  const handleResizeGraphMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      setSourceControlHeight(Math.max(30, Math.min(82, nextHeight)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleGenerateCommitMessage = async () => {
    if (!workspacePath) return;
    setIsGeneratingCommit(true);
    setCommitFeedback('');
    try {
      const diff = await (window as any).api.git.getDiff(workspacePath, '');
      if (!diff || !diff.trim()) {
        setCommitFeedback('Error: There are no saved local changes to commit.');
        return;
      }

      setCommitMessage('');
      await useAIStore.getState().generateCommitMessage(diff, (text) => {
        setCommitMessage(text);
      });
      setCommitFeedback('Commit message generated.');
    } catch (err: any) {
      console.error('Failed generating commit message:', err);
      setCommitFeedback(`Error: ${err.message || 'Failed to generate commit message.'}`);
    } finally {
      setIsGeneratingCommit(false);
    }
  };

  const handleCommit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!workspacePath || !commitMessage.trim()) return;

    setIsCommitting(true);
    setCommitFeedback('');
    try {
      const res = await (window as any).api.git.commit(workspacePath, commitMessage.trim());
      if (res.success) {
        setCommitMessage('');
        setCommitFeedback('Commit completed.');
        await refreshGitStatus();
        window.setTimeout(() => setCommitFeedback(''), 3000);
      } else {
        setCommitFeedback(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setCommitFeedback(`Error: ${err.message || 'Unknown failure'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    if (!workspacePath) return;
    setIsPushing(true);
    setCommitFeedback('');
    try {
      const res = await (window as any).api.git.push(workspacePath);
      if (res.success) {
        setCommitFeedback('Pushed to remote.');
        await refreshGitStatus();
        window.setTimeout(() => setCommitFeedback(''), 3000);
      } else {
        setCommitFeedback(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setCommitFeedback(`Error: ${err.message || 'Unknown failure'}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleStage = async (filePath: string) => {
    if (!workspacePath) return;
    await (window as any).api.git.stage(workspacePath, filePath);
    await refreshGitStatus();
  };

  const handleUnstage = async (filePath: string) => {
    if (!workspacePath) return;
    await (window as any).api.git.unstage(workspacePath, filePath);
    await refreshGitStatus();
  };

  const handleSelectGitFile = async (relativeFilePath: string) => {
    if (!workspacePath) return;
    const absoluteFilePath = `${workspacePath}/${relativeFilePath}`.replace(/\/+/g, '/');

    try {
      const original = await (window as any).api.git.showOriginal(workspacePath, absoluteFilePath);
      const modified = fileBuffers[absoluteFilePath] ?? await (window as any).api.fs.readFile(absoluteFilePath);

      setDiffFile({
        filePath: absoluteFilePath,
        original,
        modified,
      });

      await openFile(absoluteFilePath);
    } catch (err) {
      console.error('Error loading git file diff details:', err);
    }
  };

  const renderResource = (resource: SourceControlResource, action: 'stage' | 'unstage') => {
    const fileName = resource.filePath.split('/').pop() || resource.filePath;
    const relativeDir = resource.filePath.split('/').slice(0, -1).join('/');
    const status = getStatusLabel(resource.status);
    const absolutePath = workspacePath ? `${workspacePath}/${resource.filePath}`.replace(/\/+/g, '/') : resource.filePath;
    const isActive = activeDiffFile?.filePath === absolutePath;

    return (
      <div
        key={`${resource.group}:${resource.filePath}:${resource.status}`}
        className={`spigot-scm-resource-row group ${
          isActive ? 'bg-editor-active' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => handleSelectGitFile(resource.filePath)}
          className="spigot-scm-resource-button"
          title={`${resource.filePath} (${status.title})`}
        >
          <File className="h-3.5 w-3.5 shrink-0 text-editor-textDark" />
          <span className="spigot-scm-resource-label">
            <span className="spigot-scm-resource-name">{fileName}</span>
            {relativeDir && (
              <span className="spigot-scm-resource-description">
                {relativeDir}
              </span>
            )}
          </span>
          <span className={`spigot-scm-resource-status ${status.className}`}>
            {status.label}
          </span>
        </button>

        <button
          type="button"
          onClick={() => action === 'stage' ? handleStage(resource.filePath) : handleUnstage(resource.filePath)}
          className="spigot-scm-resource-action"
          title={action === 'stage' ? 'Stage Changes' : 'Unstage Changes'}
        >
          {action === 'stage' ? <span className="text-[15px] leading-none">+</span> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  const renderGroup = (
    title: string,
    count: number,
    isOpen: boolean,
    setIsOpen: (next: boolean) => void,
    items: SourceControlResource[],
    action: 'stage' | 'unstage'
  ) => (
    <div className="spigot-scm-group">
      <div className="spigot-scm-group-row">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex min-w-0 flex-1 items-center text-left"
        >
          {isOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
          <span className="truncate font-semibold">{title}</span>
          <span className="ml-[6px] text-editor-textDark">{count}</span>
        </button>
      </div>

      {isOpen && items.map((item) => renderResource(item, action))}
    </div>
  );

  return (
    <div className="spigot-scm-view flex h-full flex-col overflow-hidden bg-editor-sidebar text-editor-text">
      <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
        <section
          className="flex min-h-[160px] flex-col overflow-hidden"
          style={{ height: `${sourceControlHeight}%` }}
        >
          <div className="flex h-[35px] shrink-0 items-center gap-2 border-b border-editor-border px-3 text-[12px] tracking-wide text-editor-textDark">
            <GitBranch className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate font-semibold">{currentBranch}</span>
            {aheadCount > 0 && <span className="text-editor-text">?{aheadCount}</span>}
            <button
              type="button"
              onClick={refreshGitStatus}
              disabled={isLoadingGit}
              className="flex h-[22px] w-[22px] items-center justify-center hover:bg-editor-hover disabled:opacity-60"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGit ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              className="flex h-[22px] w-[22px] items-center justify-center hover:bg-editor-hover"
              title="More Actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex h-[36px] items-center px-[11px]">
              <button
                type="button"
                onClick={handleCommit}
                disabled={isCommitting || !commitMessage.trim()}
                className="flex h-[26px] min-w-0 flex-1 items-center justify-center gap-1 rounded-[2px] bg-editor-active px-2 text-[13px] text-white hover:bg-editor-hover disabled:cursor-default disabled:bg-editor-active disabled:text-editor-textDark"
              >
                {isCommitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                <span className="truncate">Commit</span>
              </button>
            </div>

            {isInputOpen && (
              <form onSubmit={handleCommit} className="px-[11px] pb-2">
                <div className="flex rounded-[2px] border border-editor-border bg-editor-bg focus-within:border-editor-accent">
                  <textarea
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        handleCommit(event);
                      }
                    }}
                    placeholder={`Message (${currentBranch})`}
                    rows={3}
                    className="min-h-[62px] flex-1 resize-none bg-transparent px-[7px] py-[5px] text-[13px] leading-[18px] text-editor-text outline-none placeholder:text-editor-textDark"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateCommitMessage}
                    disabled={isGeneratingCommit}
                    className="mt-1 h-[22px] w-[22px] shrink-0 text-editor-text hover:bg-editor-hover disabled:opacity-60"
                    title="Generate Commit Message"
                  >
                    {isGeneratingCommit ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mx-auto h-3.5 w-3.5" />}
                  </button>
                </div>

                {aheadCount > 0 && (
                  <button
                    type="button"
                    onClick={handlePush}
                    disabled={isPushing}
                    className="mt-2 flex h-[26px] w-full items-center justify-center gap-1 rounded-[2px] bg-editor-active text-[13px] text-white hover:bg-editor-hover disabled:bg-editor-active disabled:text-editor-textDark"
                  >
                    {isPushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
                    Sync Changes
                  </button>
                )}

                {commitFeedback && (
                  <div className={`mt-2 border px-2 py-1 text-[12px] ${commitFeedback.startsWith('Error') ? 'border-red-500/40 bg-red-950/30 text-red-400' : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400'}`}>
                    {commitFeedback}
                  </div>
                )}
              </form>
            )}

            {!workspacePath ? (
              <div className="flex h-40 flex-col items-center justify-center text-center text-[12px] text-editor-textDark">
                <GitBranch className="mb-2 h-7 w-7" />
                <span>No source control providers registered.</span>
              </div>
            ) : allResourceCount === 0 ? (
              <div className="px-[22px] py-5 text-[13px] leading-5 text-editor-textDark">
                There are no pending changes.
              </div>
            ) : (
              <>
                {resources.staged.length > 0 && renderGroup('Staged Changes', resources.staged.length, isStagedOpen, setIsStagedOpen, resources.staged, 'unstage')}
                {renderGroup('Changes', resources.changes.length, isChangesOpen, setIsChangesOpen, resources.changes, 'stage')}
              </>
            )}
          </div>
        </section>

        <div
          onMouseDown={handleResizeGraphMouseDown}
          className="h-[5px] shrink-0 cursor-row-resize border-y border-editor-border bg-editor-sidebar hover:bg-editor-hover"
          title="Resize Source Control Graph"
        />

        <section className="flex min-h-[96px] flex-1 flex-col overflow-hidden">
          <div className="spigot-scm-group-row shrink-0 border-b border-editor-border">
            <span className="min-w-0 flex-1 truncate font-semibold">Source Control Graph</span>
            <div className="ml-2 flex items-center gap-1 text-editor-text">
              <button
                type="button"
                className="flex h-[20px] items-center gap-1 px-1 hover:bg-editor-hover"
                title="Auto"
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="text-[12px] normal-case">Auto</span>
              </button>
              <button
                type="button"
                className="flex h-[20px] w-[20px] items-center justify-center hover:bg-editor-hover"
                title="Center Graph"
              >
                <CircleDot className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={refreshGitStatus}
                disabled={isLoadingGit}
                className="flex h-[20px] w-[20px] items-center justify-center hover:bg-editor-hover disabled:opacity-60"
                title="Fetch"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={refreshGitStatus}
                disabled={isLoadingGit}
                className="flex h-[20px] w-[20px] items-center justify-center hover:bg-editor-hover disabled:opacity-60"
                title="Pull"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={handlePush}
                disabled={isPushing}
                className="flex h-[20px] w-[20px] items-center justify-center hover:bg-editor-hover disabled:opacity-60"
                title="Push"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={refreshGitStatus}
                disabled={isLoadingGit}
                className="flex h-[20px] w-[20px] items-center justify-center hover:bg-editor-hover hover:text-editor-text disabled:opacity-60"
                title="Refresh Graph"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGit ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                className="flex h-[20px] w-[20px] items-center justify-center hover:bg-editor-hover hover:text-editor-text"
                title="Graph Actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pb-2">
            {gitLog.length === 0 ? (
              <div className="px-[22px] py-3 text-[12px] text-editor-textDark">No commits found.</div>
            ) : (
              gitLog.map((commit, index) => (
                <div key={commit.hash} className="grid h-[34px] grid-cols-[28px_1fr] items-center px-[14px] text-[12px] hover:bg-editor-hover">
                  <div className="relative flex h-full items-center justify-center">
                    {index < gitLog.length - 1 && <span className="absolute bottom-0 top-1/2 w-px bg-editor-textDark" />}
                    {index > 0 && <span className="absolute bottom-1/2 top-0 w-px bg-editor-textDark" />}
                    <span className="z-10 h-2.5 w-2.5 rounded-full border border-editor-sidebar bg-editor-accent" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-editor-text" title={commit.message}>{commit.message}</div>
                    <div className="truncate font-mono text-[10px] text-editor-textDark">{commit.hash}{commit.branch ? ` ? ${commit.branch}` : ''}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SourceControlView;
