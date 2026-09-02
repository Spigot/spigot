import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createChatLogger } from '../../shared/chatLogger';

const chatLog = createChatLogger();

export type ChangeOperation = 'create' | 'modify' | 'delete';
export type ChangeSetState = 'open' | 'ready' | 'applying' | 'applied' | 'rolling-back' | 'rolled-back' | 'conflicted' | 'closed';
export type ChangeSetMode = 'orchestrator' | 'build' | 'plan' | 'review';

export type WorkspaceIdentity = Readonly<{
  canonicalPath: string;
  device: number;
  inode: number;
}>;

export type SourceToolCall = Readonly<{
  toolName: string;
  toolCallId: string;
}>;

export type ChangeEntry = Readonly<{
  relativePath: string;
  operation: ChangeOperation;
  before: Readonly<{ exists: boolean; content: string | null; hash: string | null }>;
  after: Readonly<{ content: string | null; hash: string | null }>;
  source: SourceToolCall;
}>;

export type ChangeSet = Readonly<{
  id: string;
  turnId: string;
  conversationId: string;
  workspace: WorkspaceIdentity;
  entries: readonly ChangeEntry[];
  state: ChangeSetState;
  /** Chat mode the turn ran in; lets the renderer resume the agent with the same configuration. */
  mode?: ChangeSetMode;
}>;

export type ChangeSetSummary = Readonly<{
  id: string;
  turnId: string;
  conversationId: string;
  state: ChangeSetState;
  entries: ReadonlyArray<Pick<ChangeEntry, 'relativePath' | 'operation'>>;
}>;

export type Checkpoint = Readonly<{
  id: string;
  createdAt: number;
  acceptedAt: number;
  rolledBackAt?: number;
  changeSet: ChangeSet;
}>;

export type RollbackRecord = Readonly<{
  checkpointId: string;
  changeSetId: string;
  turnId: string;
  conversationId: string;
  createdAt: number;
  acceptedAt: number;
  rolledBackAt?: number;
  state: ChangeSetState;
  entries: ReadonlyArray<Pick<ChangeEntry, 'relativePath' | 'operation'>>;
}>;

export type RollbackPreview = Readonly<RollbackRecord & {
  eligible: boolean;
  conflicts: readonly string[];
}>;

type JournalFile = {
  version: 1;
  checkpoints: Checkpoint[];
};

export type CheckpointJournalOptions = {
  maxCheckpoints?: number;
  maxBytes?: number;
  maxAgeMs?: number;
};

const DEFAULT_JOURNAL_OPTIONS: Required<CheckpointJournalOptions> = {
  maxCheckpoints: 20,
  maxBytes: 8 * 1024 * 1024,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
};

const DEFAULT_MAX_TEXT_BYTES = 1024 * 1024;

export class CheckpointJournal {
  private readonly options: Required<CheckpointJournalOptions>;

  constructor(
    private readonly appDataPath: string,
    options: CheckpointJournalOptions = {},
  ) {
    this.options = { ...DEFAULT_JOURNAL_OPTIONS, ...options };
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    const journalPath = this.journalPath(checkpoint.changeSet.workspace);
    const journal = await this.read(journalPath);
    const now = Date.now();
    const checkpoints = [...journal.checkpoints.filter(item => item.id !== checkpoint.id), checkpoint]
      .filter(item => now - item.createdAt <= this.options.maxAgeMs)
      .sort((a, b) => a.createdAt - b.createdAt);

    while (checkpoints.length > this.options.maxCheckpoints || this.serializedBytes(checkpoints) > this.options.maxBytes) {
      checkpoints.shift();
    }

    if (!checkpoints.some(item => item.id === checkpoint.id)) {
      throw new Error('Checkpoint exceeds the configured durable journal capacity.');
    }

    await this.write(journalPath, { version: 1, checkpoints });
  }

  async load(workspace: WorkspaceIdentity, checkpointId: string): Promise<Checkpoint | null> {
    const journal = await this.read(this.journalPath(workspace));
    return journal.checkpoints.find(checkpoint => checkpoint.id === checkpointId) ?? null;
  }

  async list(workspace: WorkspaceIdentity): Promise<readonly Checkpoint[]> {
    return (await this.read(this.journalPath(workspace))).checkpoints;
  }

  private journalPath(workspace: WorkspaceIdentity): string {
    const workspaceKey = sha256(workspace.canonicalPath);
    return path.join(this.appDataPath, 'agent-checkpoints', workspaceKey, 'journal.json');
  }

  private async read(journalPath: string): Promise<JournalFile> {
    try {
      const raw = await fs.readFile(journalPath, 'utf-8');
      const parsed = JSON.parse(raw) as JournalFile;
      const checkpoints = Array.isArray(parsed.checkpoints) ? parsed.checkpoints.map(normalizeCheckpoint) : [];
      if (parsed.version !== 1 || !Array.isArray(parsed.checkpoints) || !checkpoints.every(isCheckpoint)) {
        throw new Error('Checkpoint journal is invalid.');
      }
      return { version: 1, checkpoints };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, checkpoints: [] };
      throw error;
    }
  }

  private async write(journalPath: string, journal: JournalFile): Promise<void> {
    const directory = path.dirname(journalPath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
    const tempPath = `${journalPath}.${randomUUID()}.tmp`;
    const handle = await fs.open(tempPath, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(journal), 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, journalPath);
    await fs.chmod(journalPath, 0o600);
  }

  private serializedBytes(checkpoints: readonly Checkpoint[]): number {
    return Buffer.byteLength(JSON.stringify({ version: 1, checkpoints }), 'utf-8');
  }
}

export class WorkspaceChangeSetService {
  private readonly sets = new Map<string, ChangeSet>();

  constructor(
    private readonly journal: CheckpointJournal,
    private readonly maxTextBytes = DEFAULT_MAX_TEXT_BYTES,
  ) {}

  async beginTurn(input: { turnId: string; conversationId: string; workspacePath: string; mode?: ChangeSetMode }): Promise<ChangeSet> {
    if (!input.turnId || !input.conversationId) throw new Error('Turn and conversation identities are required.');
    const workspace = await validateWorkspace(input.workspacePath);
    const changeSet = freezeChangeSet({
      id: randomUUID(),
      turnId: input.turnId,
      conversationId: input.conversationId,
      workspace,
      entries: [],
      state: 'open',
      ...(input.mode ? { mode: input.mode } : {}),
    });
    this.sets.set(changeSet.id, changeSet);
    return changeSet;
  }

  get(changeSetId: string): ChangeSet {
    return this.require(changeSetId);
  }

  summary(changeSetId: string): ChangeSetSummary {
    const changeSet = this.require(changeSetId);
    return Object.freeze({
      id: changeSet.id,
      turnId: changeSet.turnId,
      conversationId: changeSet.conversationId,
      state: changeSet.state,
      entries: Object.freeze(changeSet.entries.map(({ relativePath, operation }) => Object.freeze({ relativePath, operation }))),
    });
  }

  findByTurn(turnId: string): ChangeSetSummary | null {
    const changeSet = [...this.sets.values()].find(item => item.turnId === turnId);
    return changeSet ? this.summary(changeSet.id) : null;
  }

  async listRollbackRecords(workspacePath: string, query: { changeSetId?: string; turnId?: string; conversationId?: string } = {}): Promise<readonly RollbackPreview[]> {
    const workspace = await validateWorkspace(workspacePath);
    const checkpoints = await this.journal.list(workspace);
    return Object.freeze(await Promise.all(checkpoints
      .filter(checkpoint => checkpoint.changeSet.state === 'applied')
      .filter(checkpoint => !query.changeSetId || checkpoint.changeSet.id === query.changeSetId)
      .filter(checkpoint => !query.turnId || checkpoint.changeSet.turnId === query.turnId)
      .filter(checkpoint => !query.conversationId || checkpoint.changeSet.conversationId === query.conversationId)
      .map(async checkpoint => {
        const conflicts = await this.rollbackConflicts(checkpoint.changeSet);
        return Object.freeze({ ...rollbackRecord(checkpoint), eligible: conflicts.length === 0, conflicts: Object.freeze(conflicts) });
      })));
  }

  async previewRollback(workspacePath: string, checkpointId: string): Promise<RollbackPreview> {
    const workspace = await validateWorkspace(workspacePath);
    const checkpoint = await this.journal.load(workspace, checkpointId);
    if (!checkpoint) throw new Error('Checkpoint was not found for this workspace.');
    const conflicts = checkpoint.changeSet.state === 'applied'
      ? await this.rollbackConflicts(checkpoint.changeSet)
      : checkpoint.changeSet.entries.map(entry => entry.relativePath);
    return Object.freeze({ ...rollbackRecord(checkpoint), eligible: conflicts.length === 0 && checkpoint.changeSet.state === 'applied', conflicts: Object.freeze(conflicts) });
  }

  entry(changeSetId: string, relativePath: string): ChangeEntry {
    const entry = this.require(changeSetId).entries.find(item => item.relativePath === canonicalRelativePath(relativePath));
    if (!entry) throw new Error('Unknown staged file.');
    return entry;
  }

  async overlay(changeSetId: string, relativePath: string): Promise<string | null | undefined> {
    const entry = this.require(changeSetId).entries.find(item => item.relativePath === canonicalRelativePath(relativePath));
    return entry?.after.content;
  }

  async capture(
    changeSetId: string,
    input: {
      relativePath: string;
      proposedContent: string | null;
      source: SourceToolCall;
      handoff: { kind: 'disk' } | { kind: 'editor-buffer'; state: 'dirty' | 'unverified' };
    },
  ): Promise<ChangeSet> {
    const current = this.require(changeSetId);
    if (current.state !== 'open' && current.state !== 'ready') {
      throw new Error('Changes can only be captured while a change-set is open.');
    }
    if (input.handoff.kind !== 'disk') throw new Error('Editor-buffer handoff is not verified for staged changes.');
    if (!input.source.toolName || !input.source.toolCallId) throw new Error('Source tool-call metadata is required.');

    const relativePath = canonicalRelativePath(input.relativePath);
    const targetPath = await resolveTarget(current.workspace, relativePath);
    const existing = current.entries.find(entry => entry.relativePath === relativePath);
    const before = existing?.before ?? await readTextTarget(targetPath, this.maxTextBytes);
    if (input.proposedContent !== null) assertText(input.proposedContent, this.maxTextBytes);
    if (!before.exists && input.proposedContent === null) throw new Error('Cannot stage deletion of a missing file.');

    const entry: ChangeEntry = freezeEntry({
      relativePath,
      operation: input.proposedContent === null ? 'delete' : before.exists ? 'modify' : 'create',
      before,
      after: {
        content: input.proposedContent,
        hash: input.proposedContent === null ? null : sha256(input.proposedContent),
      },
      source: { ...input.source },
    });
    const staged = this.replace(current, {
      entries: existing ? current.entries.map(item => item.relativePath === relativePath ? entry : item) : [...current.entries, entry],
      state: 'ready',
    });
    chatLog('info', { conversationId: staged.conversationId, turnId: staged.turnId }, 'main.changes', 'changeset.staged', { entryCount: staged.entries.length, proposedBytes: input.proposedContent?.length ?? 0 });
    return staged;
  }

  async apply(changeSetId: string): Promise<Checkpoint> {
    const changeSet = this.require(changeSetId);
    if (changeSet.state !== 'ready') throw new Error('Only ready change-sets can be applied.');
    await this.validate(changeSet, 'apply');
    const applying = this.replace(changeSet, { state: 'applying' });
    // Persist the full rollback material before any workspace effect is attempted.
    const checkpoint = Object.freeze({
      id: randomUUID(),
      createdAt: Date.now(),
      acceptedAt: Date.now(),
      changeSet: freezeChangeSet({ ...applying, state: 'applied' }),
    });
    await this.journal.save(checkpoint);
    try {
      await this.writeAll(changeSet, 'apply');
      this.replace(applying, { state: 'applied' });
      return checkpoint;
    } catch (error) {
      this.replace(changeSet, { state: 'conflicted' });
      throw error;
    }
  }

  async rollback(workspacePath: string, checkpointId: string): Promise<ChangeSet> {
    const workspace = await validateWorkspace(workspacePath);
    const checkpoint = await this.journal.load(workspace, checkpointId);
    if (!checkpoint) throw new Error('Checkpoint was not found for this workspace.');
    const changeSet = checkpoint.changeSet;
    if (changeSet.state !== 'applied') throw new Error('Only applied checkpoints can be rolled back.');
    await this.validate(changeSet, 'rollback');
    this.sets.set(changeSet.id, freezeChangeSet({ ...changeSet, state: 'rolling-back' }));
    try {
      await this.writeAll(changeSet, 'rollback');
      const rolledBack = this.replace(changeSet, { state: 'rolled-back' });
      await this.journal.save(Object.freeze({ ...checkpoint, rolledBackAt: Date.now(), changeSet: rolledBack }));
      return rolledBack;
    } catch (error) {
      this.replace(changeSet, { state: 'conflicted' });
      throw error;
    }
  }

  closeTurn(turnId: string): void {
    for (const changeSet of this.sets.values()) {
      if (changeSet.turnId === turnId && changeSet.state === 'open') {
        this.replace(changeSet, { state: 'closed' });
      }
    }
  }

  reject(changeSetId: string): ChangeSetSummary {
    const changeSet = this.require(changeSetId);
    if (changeSet.state !== 'open' && changeSet.state !== 'ready' && changeSet.state !== 'closed') {
      throw new Error('Only unapplied change-sets can be rejected.');
    }
    const summary = this.summary(changeSetId);
    this.sets.delete(changeSetId);
    return summary;
  }

  async validateDirtyBuffers(changeSetId: string, dirtyRelativePaths: readonly string[]): Promise<void> {
    const changeSet = this.require(changeSetId);
    const dirty = new Set(dirtyRelativePaths.map(canonicalRelativePath));
    const conflict = changeSet.entries.find(entry => dirty.has(entry.relativePath));
    if (conflict) throw new Error(`Unsaved editor buffer blocks applying ${conflict.relativePath}.`);
  }

  private async validate(changeSet: ChangeSet, direction: 'apply' | 'rollback'): Promise<void> {
    await assertWorkspaceIdentity(changeSet.workspace);
    for (const entry of changeSet.entries) {
      const targetPath = await resolveTarget(changeSet.workspace, entry.relativePath);
      const current = await readTextTarget(targetPath, this.maxTextBytes);
      const expected = direction === 'apply' ? entry.before : {
        exists: entry.operation !== 'delete',
        content: entry.after.content,
        hash: entry.after.hash,
      };
      if (current.exists !== expected.exists || current.hash !== expected.hash) {
        throw new Error(`Change conflict detected for ${entry.relativePath}; no files were changed.`);
      }
    }
  }

  private async rollbackConflicts(changeSet: ChangeSet): Promise<string[]> {
    try {
      await assertWorkspaceIdentity(changeSet.workspace);
    } catch {
      return changeSet.entries.map(entry => entry.relativePath);
    }
    const conflicts: string[] = [];
    for (const entry of changeSet.entries) {
      try {
        const targetPath = await resolveTarget(changeSet.workspace, entry.relativePath);
        const current = await readTextTarget(targetPath, this.maxTextBytes);
        const expected = { exists: entry.operation !== 'delete', hash: entry.after.hash };
        if (current.exists !== expected.exists || current.hash !== expected.hash) conflicts.push(entry.relativePath);
      } catch {
        conflicts.push(entry.relativePath);
      }
    }
    return conflicts;
  }

  private async writeAll(changeSet: ChangeSet, direction: 'apply' | 'rollback'): Promise<void> {
    const completed: ChangeEntry[] = [];
    try {
      for (const entry of changeSet.entries) {
        await this.writeEntry(changeSet.workspace, entry, direction);
        completed.push(entry);
      }
    } catch (error) {
      for (const entry of completed.reverse()) {
        await this.writeEntry(changeSet.workspace, entry, direction === 'apply' ? 'rollback' : 'apply');
      }
      throw error;
    }
  }

  private async writeEntry(workspace: WorkspaceIdentity, entry: ChangeEntry, direction: 'apply' | 'rollback'): Promise<void> {
    const targetPath = await resolveTarget(workspace, entry.relativePath);
    const desired = direction === 'apply'
      ? { exists: entry.operation !== 'delete', content: entry.after.content }
      : { exists: entry.before.exists, content: entry.before.content };
    if (!desired.exists) {
      await fs.unlink(targetPath);
      return;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await assertNoSymlinkPath(workspace.canonicalPath, targetPath);
    const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
    const handle = await fs.open(tempPath, 'w', 0o600);
    try {
      await handle.writeFile(desired.content ?? '', 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, targetPath);
  }

  private require(changeSetId: string): ChangeSet {
    const changeSet = this.sets.get(changeSetId);
    if (!changeSet) throw new Error('Unknown change-set.');
    return changeSet;
  }

  private replace(current: ChangeSet, update: Partial<ChangeSet>): ChangeSet {
    const next = freezeChangeSet({ ...current, ...update });
    this.sets.set(next.id, next);
    return next;
  }
}

async function validateWorkspace(workspacePath: string): Promise<WorkspaceIdentity> {
  if (!workspacePath) throw new Error('A workspace path is required.');
  const canonicalPath = await fs.realpath(workspacePath);
  const stat = await fs.stat(canonicalPath);
  if (!stat.isDirectory()) throw new Error('Workspace path must resolve to a directory.');
  return Object.freeze({ canonicalPath, device: stat.dev, inode: stat.ino });
}

async function assertWorkspaceIdentity(workspace: WorkspaceIdentity): Promise<void> {
  const current = await validateWorkspace(workspace.canonicalPath);
  if (current.device !== workspace.device || current.inode !== workspace.inode) {
    throw new Error('Workspace identity changed; refusing to modify files.');
  }
}

function canonicalRelativePath(candidate: string): string {
  if (!candidate || path.isAbsolute(candidate)) throw new Error('Staged paths must be relative to the workspace.');
  const normalized = path.posix.normalize(candidate.replaceAll('\\', '/'));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Staged path escapes the workspace.');
  }
  return normalized;
}

async function resolveTarget(workspace: WorkspaceIdentity, relativePath: string): Promise<string> {
  await assertWorkspaceIdentity(workspace);
  const targetPath = path.resolve(workspace.canonicalPath, relativePath);
  const relative = path.relative(workspace.canonicalPath, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Staged path escapes the workspace.');
  await assertNoSymlinkPath(workspace.canonicalPath, targetPath);
  return targetPath;
}

async function assertNoSymlinkPath(workspacePath: string, targetPath: string): Promise<void> {
  const relative = path.relative(workspacePath, targetPath);
  let current = workspacePath;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symlink paths are not allowed in staged changes.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

async function readTextTarget(targetPath: string, maxBytes: number): Promise<{ exists: boolean; content: string | null; hash: string | null }> {
  try {
    const bytes = await fs.readFile(targetPath);
    if (bytes.byteLength > maxBytes) throw new Error('File exceeds the staged text-file size limit.');
    const content = bytes.toString('utf-8');
    if (content.includes('\0') || !Buffer.from(content, 'utf-8').equals(bytes)) throw new Error('Binary files cannot be staged.');
    return Object.freeze({ exists: true, content, hash: sha256(content) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze({ exists: false, content: null, hash: null });
    throw error;
  }
}

function assertText(content: string, maxBytes: number): void {
  if (content.includes('\0') || Buffer.byteLength(content, 'utf-8') > maxBytes) {
    throw new Error('Only bounded text-file content can be staged.');
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function freezeEntry(entry: ChangeEntry): ChangeEntry {
  return Object.freeze({
    ...entry,
    before: Object.freeze({ ...entry.before }),
    after: Object.freeze({ ...entry.after }),
    source: Object.freeze({ ...entry.source }),
  });
}

function freezeChangeSet(changeSet: ChangeSet): ChangeSet {
  return Object.freeze({
    ...changeSet,
    workspace: Object.freeze({ ...changeSet.workspace }),
    entries: Object.freeze(changeSet.entries.map(freezeEntry)),
  });
}

function isCheckpoint(value: unknown): value is Checkpoint {
  const checkpoint = value as Checkpoint;
  return Boolean(checkpoint && typeof checkpoint.id === 'string' && typeof checkpoint.createdAt === 'number' && typeof checkpoint.acceptedAt === 'number'
    && checkpoint.changeSet && Array.isArray(checkpoint.changeSet.entries)
    && checkpoint.changeSet.entries.every(entry => typeof entry.before?.content !== 'string' || !entry.before.content.includes('\0')));
}

function normalizeCheckpoint(value: Checkpoint): Checkpoint {
  // Journals written before acceptedAt was introduced retain their original acceptance time.
  return typeof value?.acceptedAt === 'number' ? value : { ...value, acceptedAt: value.createdAt };
}

function rollbackRecord(checkpoint: Checkpoint): RollbackRecord {
  return Object.freeze({
    checkpointId: checkpoint.id,
    changeSetId: checkpoint.changeSet.id,
    turnId: checkpoint.changeSet.turnId,
    conversationId: checkpoint.changeSet.conversationId,
    createdAt: checkpoint.createdAt,
    acceptedAt: checkpoint.acceptedAt,
    rolledBackAt: checkpoint.rolledBackAt,
    state: checkpoint.changeSet.state,
    entries: Object.freeze(checkpoint.changeSet.entries.map(({ relativePath, operation }) => Object.freeze({ relativePath, operation }))),
  });
}
