import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitFork,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  X,
  Cloud,
  Tag,
} from 'lucide-react';
import { useAIStore } from '../../store/aiStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { FileIcon } from './FileIcon';

type GitRepo = {
  name: string;
  path: string;
  isRoot: boolean;
};

type GitFile = {
  status: string;
  filePath: string;
};

type GitCommit = {
  hash: string;
  message: string;
  branch: string;
  author?: string;
  date?: string;
  parents?: string[];
  tags?: string[];
};

type AheadBehindCounts = {
  ahead: number;
  behind: number;
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

  if (normalized === 'A') return { label: 'A', title: 'Added', className: 'text-[#73c991]' };
  if (normalized === 'D') return { label: 'D', title: 'Deleted', className: 'text-[#f85149]' };
  if (normalized === 'R') return { label: 'R', title: 'Renamed', className: 'text-[#73c991]' };
  if (normalized === 'C') return { label: 'C', title: 'Copied', className: 'text-[#73c991]' };
  if (normalized === 'U') return { label: 'U', title: 'Unmerged', className: 'text-[#f85149]' };
  if (normalized === '??') return { label: 'U', title: 'Untracked', className: 'text-[#73c991]' };

  return { label: 'M', title: 'Modified', className: 'text-[#e2c08d]' };
};

const normalizePath = (path: string) => path.replace(/\\/g, '/');

const isRateLimitError = (message: string) => (
  message.includes('HTTP 429')
  || message.includes('rate_limit_error')
  || message.toLowerCase().includes('usage limit exceeded')
);

const createFallbackCommitMessage = (diff: string) => {
  const changedFiles = diff
    .split('\n')
    .filter((line) => line.startsWith('diff --git '))
    .map((line) => line.match(/^diff --git a\/(.+) b\/(.+)$/)?.[2])
    .filter(Boolean) as string[];

  if (changedFiles.length === 1) {
    const fileName = changedFiles[0].split('/').pop()?.replace(/\.[^.]+$/, '');
    return fileName ? `chore: update ${fileName}` : 'chore: update local changes';
  }

  return 'chore: update local changes';
};

export const SourceControlView: React.FC = () => {
  const {
    workspacePath,
    fileBuffers,
    openFile,
    dirtyFiles,
    activeDiffFile,
    setDiffFile,
  } = useWorkspaceStore();

  const [repositories, setRepositories] = useState<GitRepo[]>([]);
  const [gitFiles, setGitFiles] = useState<GitFile[]>([]);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [gitLog, setGitLog] = useState<GitCommit[]>([]);
  const [commitMessages, setCommitMessages] = useState<Record<string, string>>({});
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);
  const [commitFeedback, setCommitFeedback] = useState('');
  const [aheadCount, setAheadCount] = useState(0);

  const [isChangesSectionOpen, setIsChangesSectionOpen] = useState(true);
  const [isGraphOpen, setIsGraphOpen] = useState(true);
  const [openRepos, setOpenRepos] = useState<Record<string, boolean>>({});
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [commitFilesMap, setCommitFilesMap] = useState<Record<string, Array<{ status: string; filePath: string }>>>({});
  const [isLoadingCommitFiles, setIsLoadingCommitFiles] = useState(false);

  const [sourceControlHeight, setSourceControlHeight] = useState(55);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  const refreshGitStatus = async (): Promise<AheadBehindCounts> => {
    if (!workspacePath) return { ahead: 0, behind: 0 };
    setIsLoadingGit(true);
    try {
      const [repos, files, branch, log, counts] = await Promise.all([
        (window as any).api.git.getRepositories?.(workspacePath) || [{ name: workspacePath.split(/[/\\]/).pop() || 'root', path: workspacePath, isRoot: true }],
        (window as any).api.git.getStatus(workspacePath),
        (window as any).api.git.getCurrentBranch(workspacePath),
        (window as any).api.git.getLog(workspacePath),
        (window as any).api.git.getAheadBehind(workspacePath),
      ]);

      setRepositories(repos || []);
      setGitFiles(files || []);
      setCurrentBranch(branch || 'main');
      setGitLog(log || []);
      setAheadCount(counts?.ahead || 0);

      // Default all repositories to open
      if (repos && Object.keys(openRepos).length === 0) {
        const initialOpen: Record<string, boolean> = {};
        repos.forEach((r: GitRepo) => { initialOpen[r.path] = true; });
        setOpenRepos(initialOpen);
      }

      return counts || { ahead: 0, behind: 0 };
    } catch (err) {
      console.error('Error fetching git source control state:', err);
      return { ahead: 0, behind: 0 };
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
    const gitResources = gitFiles
      .filter((file) => file.status.trim() !== '!!')
      .map((file) => {
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

  const handleResizeGraphMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const offset = moveEvent.clientY - containerRect.top;
      const totalHeight = containerRect.height;
      if (totalHeight <= 0) return;

      const percentage = Math.min(80, Math.max(20, (offset / totalHeight) * 100));
      setSourceControlHeight(percentage);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleGenerateCommitMessage = async (repoPath: string) => {
    if (!workspacePath) return;
    setIsGeneratingCommit(true);
    setCommitFeedback('');
    let diff = '';
    try {
      diff = await (window as any).api.git.getDiff(repoPath, '');
      if (!diff || !diff.trim()) {
        setCommitFeedback('Error: No hay cambios guardados para generar mensaje.');
        return;
      }

      setCommitMessages(prev => ({ ...prev, [repoPath]: '' }));
      await useAIStore.getState().generateCommitMessage(diff, (text) => {
        setCommitMessages(prev => ({ ...prev, [repoPath]: text }));
      });
      setCommitFeedback('Mensaje generado.');
    } catch (err: any) {
      console.error('Failed generating commit message:', err);
      const errorMessage = err.message || 'Error al generar mensaje.';
      if (isRateLimitError(errorMessage)) {
        setCommitMessages(prev => ({ ...prev, [repoPath]: createFallbackCommitMessage(diff) }));
        setCommitFeedback('Límite de IA alcanzado. Mensaje básico creado.');
        return;
      }

      setCommitFeedback(`Error: ${errorMessage}`);
    } finally {
      setIsGeneratingCommit(false);
    }
  };

  const handleCommit = async (repoPath: string, event?: React.FormEvent) => {
    event?.preventDefault();
    const msg = commitMessages[repoPath] || '';
    if (!workspacePath || !msg.trim()) return;

    setIsCommitting(true);
    setCommitFeedback('');
    try {
      const res = await (window as any).api.git.commit(repoPath, msg.trim());
      if (res.success) {
        setCommitMessages(prev => ({ ...prev, [repoPath]: '' }));
        const counts = await refreshGitStatus();
        setCommitFeedback(
          counts.ahead > 0
            ? `Commit completado (${counts.ahead} listos para Sync).`
            : 'Commit completado.'
        );
        window.setTimeout(() => setCommitFeedback(''), 4000);
      } else {
        setCommitFeedback(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setCommitFeedback(`Error: ${err.message || 'Error'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async (repoPath: string) => {
    if (!workspacePath) return;
    setIsPushing(true);
    setCommitFeedback('');
    try {
      const res = await (window as any).api.git.push(repoPath);
      if (res.success) {
        setCommitFeedback('Sincronizado con remoto.');
        await refreshGitStatus();
        window.setTimeout(() => setCommitFeedback(''), 3000);
      } else {
        setCommitFeedback(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setCommitFeedback(`Error: ${err.message || 'Error'}`);
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

  const handleToggleCommitDetails = async (hash: string) => {
    if (selectedCommitHash === hash) {
      setSelectedCommitHash(null);
      return;
    }
    setSelectedCommitHash(hash);
    if (!commitFilesMap[hash] && workspacePath) {
      setIsLoadingCommitFiles(true);
      try {
        const files = await (window as any).api.git.getCommitFiles?.(workspacePath, hash);
        if (files) {
          setCommitFilesMap(prev => ({ ...prev, [hash]: files }));
        }
      } catch (e) {
        console.error('Failed loading commit files:', e);
      } finally {
        setIsLoadingCommitFiles(false);
      }
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
          isActive ? 'bg-editor-active text-white' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => handleSelectGitFile(resource.filePath)}
          className="spigot-scm-resource-button"
          title={`${resource.filePath} (${status.title})`}
        >
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <FileIcon name={fileName} isDirectory={false} />
          </div>
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
          title={action === 'stage' ? 'Preparar cambio (Stage)' : 'Despreparar cambio (Unstage)'}
        >
          {action === 'stage' ? <Plus className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="spigot-scm-view flex h-full flex-col overflow-hidden bg-editor-sidebar text-editor-text select-none text-[13px]">
      <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
        {/* Top Changes & Repositories Section */}
        <section
          className="flex min-h-[160px] flex-col overflow-hidden"
          style={{ height: `${sourceControlHeight}%` }}
        >
          {/* Main Section Header */}
          <div 
            onClick={() => setIsChangesSectionOpen(!isChangesSectionOpen)}
            className="flex h-[28px] shrink-0 items-center justify-between border-b border-editor-border px-3 text-[11px] font-bold text-editor-text uppercase tracking-wider hover:bg-editor-hover cursor-pointer select-none"
          >
            <div className="flex items-center gap-1">
              {isChangesSectionOpen ? <ChevronDown className="h-3.5 w-3.5 text-editor-textDark" /> : <ChevronRight className="h-3.5 w-3.5 text-editor-textDark" />}
              <span>Changes</span>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={refreshGitStatus}
                disabled={isLoadingGit}
                className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded transition-colors"
                title="Actualizar estado de Git"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingGit ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded transition-colors"
                title="Más acciones"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Repositories list */}
          {isChangesSectionOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-3">
              {repositories.map((repo) => {
                const isOpen = openRepos[repo.path] !== false;
                const repoMessage = commitMessages[repo.path] || '';
                const isRootRepo = repo.isRoot;

                return (
                  <div key={repo.path} className="flex flex-col gap-1.5">
                    {/* Repository Header Bar (VS Code Style) */}
                    <div 
                      onClick={() => setOpenRepos(prev => ({ ...prev, [repo.path]: !isOpen }))}
                      className="flex h-[24px] items-center justify-between px-1 hover:bg-editor-hover rounded-[3px] cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-editor-textDark shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-editor-textDark shrink-0" />}
                        <Layers className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                        <span className="font-semibold text-[12px] text-editor-text truncate">{repo.name}</span>
                        <div className="flex items-center gap-1 text-[11px] text-editor-textDark ml-1">
                          <GitBranch className="h-3 w-3 text-[#e2c08d] shrink-0" />
                          <span className="font-mono text-[11px]">{currentBranch}</span>
                        </div>
                      </div>

                      {/* Repo action icons toolbar (VS Code Style) */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => refreshGitStatus()}
                          className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
                          title="Actualizar"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleCommit(repo.path, e)}
                          disabled={!repoMessage.trim()}
                          className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded disabled:opacity-40"
                          title="Commit"
                        >
                          <Check className="h-3 w-3 text-emerald-400" />
                        </button>
                        <button
                          type="button"
                          className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
                          title="Crear rama"
                        >
                          <GitFork className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePush(repo.path)}
                          disabled={isPushing}
                          className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded flex items-center gap-0.5"
                          title={aheadCount > 0 ? `Sincronizar (${aheadCount} pendientes)` : "Sincronizar cambios"}
                        >
                          <ArrowUp className="h-3 w-3 text-sky-400" />
                          {aheadCount > 0 && <span className="text-[9.5px] font-mono text-sky-300">{aheadCount}</span>}
                        </button>
                        <button
                          type="button"
                          className="p-1 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
                          title="Más acciones"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Commit Box & Split Button */}
                    {isOpen && (
                      <div className="flex flex-col gap-1.5 pl-2">
                        {/* Textarea */}
                        <div className="flex rounded-[3px] border border-editor-border bg-editor-bg focus-within:border-editor-accent transition-all p-1">
                          <textarea
                            value={repoMessage}
                            onChange={(e) => setCommitMessages(prev => ({ ...prev, [repo.path]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                handleCommit(repo.path, e);
                              }
                            }}
                            placeholder={`Message (Ctrl+Enter to commit on "${currentBranch}")...`}
                            rows={2}
                            className="min-h-[42px] flex-1 resize-none bg-transparent px-1.5 py-0.5 text-[12px] leading-relaxed text-editor-text outline-none placeholder:text-editor-textDark font-sans"
                          />
                          <button
                            type="button"
                            onClick={() => handleGenerateCommitMessage(repo.path)}
                            disabled={isGeneratingCommit}
                            className="h-6 w-6 self-end text-editor-textDark hover:text-editor-accent hover:bg-editor-hover rounded flex items-center justify-center disabled:opacity-60 transition-colors"
                            title="Generar mensaje con IA (✨)"
                          >
                            {isGeneratingCommit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {/* Split Commit Button (VS Code Style) */}
                        <div className="flex items-center rounded-[3px] overflow-hidden border border-[#007acc]/60 bg-[#007acc] text-white">
                          <button
                            type="button"
                            onClick={(e) => handleCommit(repo.path, e)}
                            disabled={isCommitting || !repoMessage.trim()}
                            className="flex h-[24px] min-w-0 flex-1 items-center justify-center gap-1.5 px-3 text-[12px] font-medium hover:bg-[#0098ff] transition-colors disabled:cursor-default disabled:bg-editor-active disabled:text-editor-textDark"
                          >
                            {isCommitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span>Commit</span>
                          </button>
                          <div className="w-[1px] h-full bg-white/20" />
                          <button
                            type="button"
                            onClick={() => handlePush(repo.path)}
                            disabled={isPushing}
                            className="h-[24px] px-2 hover:bg-[#0098ff] transition-colors flex items-center justify-center disabled:opacity-50"
                            title="Commit & Sync"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>

                        {/* List of changed files under root repo */}
                        {isRootRepo && allResourceCount > 0 && (
                          <div className="flex flex-col gap-0.5 mt-1">
                            {resources.staged.map((item) => renderResource(item, 'unstage'))}
                            {resources.changes.map((item) => renderResource(item, 'stage'))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {commitFeedback && (
                <div className={`mt-1 border rounded-[4px] px-2 py-1 text-[11px] ${commitFeedback.startsWith('Error') ? 'border-red-500/40 bg-red-950/30 text-red-400' : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400'}`}>
                  {commitFeedback}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section divider */}
        <div
          onMouseDown={handleResizeGraphMouseDown}
          className="flex h-[5px] cursor-row-resize items-center justify-center bg-editor-sidebar hover:bg-editor-accent/20 transition-colors"
          title="Arrastrar para ajustar altura"
        >
          <div className="h-[1px] w-8 bg-editor-border" />
        </div>

        {/* VS Code Native Git Graph Section */}
        <section className="flex min-h-[110px] flex-1 flex-col overflow-hidden bg-editor-sidebar border-t border-editor-border">
          {/* Graph Header Bar (VS Code Style) */}
          <div 
            onClick={() => setIsGraphOpen(!isGraphOpen)}
            className="flex h-[28px] shrink-0 items-center justify-between border-b border-editor-border px-3 text-[11px] font-bold text-editor-text uppercase tracking-wider hover:bg-editor-hover cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isGraphOpen ? <ChevronDown className="h-3.5 w-3.5 text-editor-textDark shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-editor-textDark shrink-0" />}
              <span className="truncate">Graph</span>
              <div className="flex items-center gap-1 text-editor-textDark font-normal lowercase tracking-normal">
                <Layers className="h-3 w-3 text-sky-400 shrink-0" />
                <span className="truncate">{repositories[0]?.name || 'workspace'}</span>
                <GitBranch className="h-3 w-3 text-[#e2c08d] shrink-0 ml-1" />
                <span className="truncate font-mono">{currentBranch}</span>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex items-center gap-1 text-editor-textDark" onClick={(e) => e.stopPropagation()}>
              <button title="Focus HEAD" className="p-0.5 hover:text-white hover:bg-editor-active rounded">
                <Target className="h-3 w-3" />
              </button>
              <button title="Pull changes" onClick={() => refreshGitStatus()} className="p-0.5 hover:text-white hover:bg-editor-active rounded">
                <ArrowDown className="h-3 w-3" />
              </button>
              <button title="Push changes" onClick={() => workspacePath && handlePush(workspacePath)} className="p-0.5 hover:text-white hover:bg-editor-active rounded">
                <ArrowUp className="h-3 w-3" />
              </button>
              <button title="Refresh log" onClick={() => refreshGitStatus()} className="p-0.5 hover:text-white hover:bg-editor-active rounded">
                <RefreshCw className="h-3 w-3" />
              </button>
              <button title="More actions" className="p-0.5 hover:text-white hover:bg-editor-active rounded">
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Graph Commits List */}
          {isGraphOpen && (
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 custom-scrollbar">
              {gitLog.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-editor-textDark italic">
                  No hay historial de commits.
                </div>
              ) : (
                <div className="flex flex-col">
                  {gitLog.map((commit, idx) => {
                    const isHead = idx === 0;
                    const isSelected = selectedCommitHash === commit.hash;
                    const commitFiles = commitFilesMap[commit.hash] || [];

                    return (
                      <div key={commit.hash} className="flex flex-col">
                        {/* Native VS Code Graph Row */}
                        <div
                          onClick={() => handleToggleCommitDetails(commit.hash)}
                          className={`h-[22px] min-h-[22px] flex items-center px-1.5 rounded-[2px] cursor-pointer transition-colors group ${
                            isSelected ? 'bg-editor-active text-white' : 'hover:bg-editor-hover text-editor-text'
                          }`}
                        >
                          {/* Continuous Single Blue Line Graph Track */}
                          <div className="relative w-4 h-full flex items-center justify-center shrink-0 mr-1.5">
                            {/* Vertical Line */}
                            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-[#388bfd]/60" />
                            
                            {/* Commit Node */}
                            {isHead ? (
                              /* Double circle for HEAD */
                              <div className="relative z-10 w-3 h-3 rounded-full border-2 border-[#388bfd] bg-editor-sidebar flex items-center justify-center shadow-[0_0_4px_rgba(56,139,253,0.5)]">
                                <div className="w-1 h-1 rounded-full bg-[#388bfd]" />
                              </div>
                            ) : (
                              /* Solid circle for older commits */
                              <div className="relative z-10 w-2 h-2 rounded-full bg-[#388bfd] border border-editor-sidebar" />
                            )}
                          </div>

                          {/* Commit Message */}
                          <span className="truncate text-[12px] font-normal text-editor-text flex-1 min-w-0 pr-1">
                            {commit.message}
                          </span>

                          {/* Branch Badge Pill & Cloud on the right (like VS Code) */}
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            {commit.branch && (
                              <span className="bg-[#388bfd]/15 text-[#58a6ff] border border-[#388bfd]/30 text-[9.5px] px-1.5 py-0 rounded-full font-mono font-medium flex items-center gap-0.5">
                                <GitBranch className="w-2.5 h-2.5" />
                                <span>{commit.branch}</span>
                              </span>
                            )}
                            {commit.tags?.map((t) => (
                              <span
                                key={t}
                                className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9.5px] px-1.5 py-0 rounded-full font-mono font-medium flex items-center gap-0.5"
                              >
                                <Tag className="w-2 h-2" />
                                <span>{t}</span>
                              </span>
                            ))}
                            {isHead && (
                              <Cloud className="w-3 h-3 text-[#58a6ff] opacity-80" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Commit Details & Changed Files Drawer */}
                        {isSelected && (
                          <div className="ml-6 my-1 p-2 rounded-[4px] bg-editor-bg border border-editor-border flex flex-col gap-2 animate-slide-down">
                            <div className="flex flex-col gap-0.5 border-b border-editor-border/60 pb-1.5 text-[11px]">
                              <div className="flex items-center justify-between text-editor-textDark">
                                <span className="text-editor-text font-medium">{commit.author || 'Autor'}</span>
                                <span>{commit.date || 'Reciente'}</span>
                              </div>
                              <p className="text-editor-text text-[12px] whitespace-pre-wrap font-sans mt-0.5">
                                {commit.message}
                              </p>
                              <span className="font-mono text-[9.5px] text-editor-textDark">
                                commit {commit.hash}
                              </span>
                            </div>

                            {/* Changed Files in Commit */}
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-editor-textDark uppercase tracking-wider mb-0.5">
                                Archivos en este commit:
                              </span>
                              {isLoadingCommitFiles && commitFiles.length === 0 ? (
                                <div className="flex items-center gap-1.5 py-1 text-editor-textDark text-[11px]">
                                  <Loader2 className="w-3 h-3 animate-spin text-editor-accent" />
                                  <span>Cargando archivos...</span>
                                </div>
                              ) : commitFiles.length === 0 ? (
                                <span className="text-editor-textDark text-[10.5px] italic">
                                  Sin cambios detallados.
                                </span>
                              ) : (
                                commitFiles.map((file, fIdx) => {
                                  const fName = file.filePath.split('/').pop() || file.filePath;
                                  const status = getStatusLabel(file.status);
                                  return (
                                    <div
                                      key={fIdx}
                                      onClick={() => handleSelectGitFile(file.filePath)}
                                      className="h-[22px] flex items-center justify-between px-1.5 rounded hover:bg-editor-hover cursor-pointer text-[12px]"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <FileIcon name={fName} isDirectory={false} />
                                        <span className="truncate text-editor-text">{file.filePath}</span>
                                      </div>
                                      <span className={`font-mono text-[11px] font-bold ${status.className}`}>
                                        {status.label}
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SourceControlView;
