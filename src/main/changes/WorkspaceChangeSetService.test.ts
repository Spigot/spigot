import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { CheckpointJournal, WorkspaceChangeSetService } from './WorkspaceChangeSetService';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spigot-changes-'));
  const workspace = path.join(root, 'workspace');
  const appData = path.join(root, 'app-data');
  await fs.mkdir(workspace);
  return {
    root,
    workspace,
    appData,
    service: () => new WorkspaceChangeSetService(new CheckpointJournal(appData)),
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

async function begin(service: WorkspaceChangeSetService, workspacePath: string, suffix = '1') {
  return service.beginTurn({ turnId: `turn-${suffix}`, conversationId: `conversation-${suffix}`, workspacePath });
}

describe('WorkspaceChangeSetService', () => {
  it('captures canonical workspace identity and rejects traversal and symlink escapes', async () => {
    const test = await fixture();
    try {
      const service = test.service();
      const changeSet = await begin(service, test.workspace);
      expect(changeSet.workspace.canonicalPath).toBe(await fs.realpath(test.workspace));
      expect(Object.isFrozen(changeSet.entries)).toBe(true);

      await expect(service.capture(changeSet.id, {
        relativePath: '../outside.txt', proposedContent: 'no', source: { toolName: 'write_file', toolCallId: '1' }, handoff: { kind: 'disk' },
      })).rejects.toThrow(/escapes/);

      const outside = path.join(test.root, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(test.workspace, 'linked'), 'junction');
      await expect(service.capture(changeSet.id, {
        relativePath: 'linked/escape.txt', proposedContent: 'no', source: { toolName: 'write_file', toolCallId: '2' }, handoff: { kind: 'disk' },
      })).rejects.toThrow(/Symlink/);
    } finally {
      await test.dispose();
    }
  });

  it('captures immutable create, modify, and delete entries from disk', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'modify.txt'), 'before');
      await fs.writeFile(path.join(test.workspace, 'delete.txt'), 'remove');
      const service = test.service();
      let changeSet = await begin(service, test.workspace);
      changeSet = await service.capture(changeSet.id, { relativePath: 'create.txt', proposedContent: 'created', source: { toolName: 'write_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'modify.txt', proposedContent: 'after', source: { toolName: 'edit_file', toolCallId: '2' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'delete.txt', proposedContent: null, source: { toolName: 'edit_file', toolCallId: '3' }, handoff: { kind: 'disk' } });

      expect(changeSet.entries.map(entry => entry.operation)).toEqual(['create', 'modify', 'delete']);
      expect(changeSet.entries[1]?.before).toEqual(expect.objectContaining({ exists: true, content: 'before' }));
      expect(changeSet.entries[0]?.after.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.isFrozen(changeSet.entries[0])).toBe(true);
    } finally {
      await test.dispose();
    }
  });

  it('rejects dirty editor buffers, binary files, and oversized text before staging', async () => {
    const test = await fixture();
    try {
      const service = new WorkspaceChangeSetService(new CheckpointJournal(test.appData), 4);
      const changeSet = await begin(service, test.workspace);
      await expect(service.capture(changeSet.id, {
        relativePath: 'dirty.txt', proposedContent: 'ok', source: { toolName: 'write_file', toolCallId: '1' }, handoff: { kind: 'editor-buffer', state: 'dirty' },
      })).rejects.toThrow(/Editor-buffer/);
      await fs.writeFile(path.join(test.workspace, 'binary.bin'), Buffer.from([0, 1]));
      await expect(service.capture(changeSet.id, {
        relativePath: 'binary.bin', proposedContent: 'ok', source: { toolName: 'write_file', toolCallId: '2' }, handoff: { kind: 'disk' },
      })).rejects.toThrow(/Binary/);
      await expect(service.capture(changeSet.id, {
        relativePath: 'large.txt', proposedContent: 'large', source: { toolName: 'write_file', toolCallId: '3' }, handoff: { kind: 'disk' },
      })).rejects.toThrow(/bounded/);
    } finally {
      await test.dispose();
    }
  });

  it('keeps a virtual overlay coherent across repeated edits and rejects without writing', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'file.txt'), 'before');
      const service = test.service();
      let changeSet = await begin(service, test.workspace);
      changeSet = await service.capture(changeSet.id, { relativePath: 'file.txt', proposedContent: 'first', source: { toolName: 'edit_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'file.txt', proposedContent: 'second', source: { toolName: 'edit_file', toolCallId: '2' }, handoff: { kind: 'disk' } });

      expect(changeSet.entries).toHaveLength(1);
      expect(await service.overlay(changeSet.id, 'file.txt')).toBe('second');
      expect(await fs.readFile(path.join(test.workspace, 'file.txt'), 'utf8')).toBe('before');
      service.reject(changeSet.id);
      expect(await fs.readFile(path.join(test.workspace, 'file.txt'), 'utf8')).toBe('before');
    } finally {
      await test.dispose();
    }
  });

  it('blocks acceptance when a captured target has an unsaved editor buffer', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'dirty.txt'), 'before');
      const service = test.service();
      const changeSet = await begin(service, test.workspace);
      await service.capture(changeSet.id, { relativePath: 'dirty.txt', proposedContent: 'after', source: { toolName: 'edit_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      await expect(service.validateDirtyBuffers(changeSet.id, ['dirty.txt'])).rejects.toThrow(/Unsaved editor buffer/);
      await expect(fs.readFile(path.join(test.workspace, 'dirty.txt'), 'utf8')).resolves.toBe('before');
    } finally {
      await test.dispose();
    }
  });

  it('detects conflicts before apply and leaves every target unchanged', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'a.txt'), 'one');
      await fs.writeFile(path.join(test.workspace, 'b.txt'), 'two');
      const service = test.service();
      let changeSet = await begin(service, test.workspace);
      changeSet = await service.capture(changeSet.id, { relativePath: 'a.txt', proposedContent: 'A', source: { toolName: 'edit_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'b.txt', proposedContent: 'B', source: { toolName: 'edit_file', toolCallId: '2' }, handoff: { kind: 'disk' } });
      await fs.writeFile(path.join(test.workspace, 'b.txt'), 'external');

      await expect(service.apply(changeSet.id)).rejects.toThrow(/conflict/i);
      await expect(fs.readFile(path.join(test.workspace, 'a.txt'), 'utf-8')).resolves.toBe('one');
      await expect(fs.readFile(path.join(test.workspace, 'b.txt'), 'utf-8')).resolves.toBe('external');
    } finally {
      await test.dispose();
    }
  });

  it('applies a multi-file change-set and rolls it back only when after hashes still match', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'modify.txt'), 'before');
      await fs.writeFile(path.join(test.workspace, 'delete.txt'), 'remove');
      const service = test.service();
      let changeSet = await begin(service, test.workspace);
      changeSet = await service.capture(changeSet.id, { relativePath: 'create.txt', proposedContent: 'created', source: { toolName: 'write_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'modify.txt', proposedContent: 'after', source: { toolName: 'edit_file', toolCallId: '2' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'delete.txt', proposedContent: null, source: { toolName: 'edit_file', toolCallId: '3' }, handoff: { kind: 'disk' } });
      const checkpoint = await service.apply(changeSet.id);

      await expect(fs.readFile(path.join(test.workspace, 'create.txt'), 'utf-8')).resolves.toBe('created');
      await expect(fs.readFile(path.join(test.workspace, 'modify.txt'), 'utf-8')).resolves.toBe('after');
      await expect(fs.access(path.join(test.workspace, 'delete.txt'))).rejects.toThrow();
      await service.rollback(test.workspace, checkpoint.id);
      await expect(fs.access(path.join(test.workspace, 'create.txt'))).rejects.toThrow();
      await expect(fs.readFile(path.join(test.workspace, 'modify.txt'), 'utf-8')).resolves.toBe('before');
      await expect(fs.readFile(path.join(test.workspace, 'delete.txt'), 'utf-8')).resolves.toBe('remove');

      const second = await service.apply(changeSet.id).catch(() => null);
      expect(second).toBeNull();
    } finally {
      await test.dispose();
    }
  });

  it('fails rollback closed when an applied file changed externally', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'file.txt'), 'before');
      const service = test.service();
      let changeSet = await begin(service, test.workspace);
      changeSet = await service.capture(changeSet.id, { relativePath: 'file.txt', proposedContent: 'after', source: { toolName: 'edit_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      const checkpoint = await service.apply(changeSet.id);
      await fs.writeFile(path.join(test.workspace, 'file.txt'), 'external');

      await expect(service.rollback(test.workspace, checkpoint.id)).rejects.toThrow(/conflict/i);
      await expect(fs.readFile(path.join(test.workspace, 'file.txt'), 'utf-8')).resolves.toBe('external');
    } finally {
      await test.dispose();
    }
  });

  it('previews and rolls back an accepted create, modify, and delete turn after a service restart', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'modify.txt'), 'before');
      await fs.writeFile(path.join(test.workspace, 'delete.txt'), 'remove');
      const firstService = test.service();
      let changeSet = await begin(firstService, test.workspace, 'durable');
      changeSet = await firstService.capture(changeSet.id, { relativePath: 'create.txt', proposedContent: 'created', source: { toolName: 'write_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      changeSet = await firstService.capture(changeSet.id, { relativePath: 'modify.txt', proposedContent: 'after', source: { toolName: 'edit_file', toolCallId: '2' }, handoff: { kind: 'disk' } });
      changeSet = await firstService.capture(changeSet.id, { relativePath: 'delete.txt', proposedContent: null, source: { toolName: 'edit_file', toolCallId: '3' }, handoff: { kind: 'disk' } });
      const checkpoint = await firstService.apply(changeSet.id);

      const restarted = test.service();
      const records = await restarted.listRollbackRecords(test.workspace, { changeSetId: changeSet.id, turnId: changeSet.turnId, conversationId: changeSet.conversationId });
      expect(records).toEqual([expect.objectContaining({ checkpointId: checkpoint.id, state: 'applied', acceptedAt: expect.any(Number), entries: expect.arrayContaining([expect.objectContaining({ relativePath: 'create.txt', operation: 'create' })]) })]);
      expect(await restarted.previewRollback(test.workspace, checkpoint.id)).toEqual(expect.objectContaining({ eligible: true, conflicts: [] }));

      await restarted.rollback(test.workspace, checkpoint.id);
      await expect(fs.access(path.join(test.workspace, 'create.txt'))).rejects.toThrow();
      await expect(fs.readFile(path.join(test.workspace, 'modify.txt'), 'utf8')).resolves.toBe('before');
      await expect(fs.readFile(path.join(test.workspace, 'delete.txt'), 'utf8')).resolves.toBe('remove');
      expect(await restarted.listRollbackRecords(test.workspace, { turnId: changeSet.turnId })).toEqual([]);
    } finally {
      await test.dispose();
    }
  });

  it('reports every rollback conflict and leaves the full turn untouched', async () => {
    const test = await fixture();
    try {
      await fs.writeFile(path.join(test.workspace, 'first.txt'), 'before-first');
      await fs.writeFile(path.join(test.workspace, 'second.txt'), 'before-second');
      const service = test.service();
      let changeSet = await begin(service, test.workspace, 'conflict-preview');
      changeSet = await service.capture(changeSet.id, { relativePath: 'first.txt', proposedContent: 'after-first', source: { toolName: 'edit_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      changeSet = await service.capture(changeSet.id, { relativePath: 'second.txt', proposedContent: 'after-second', source: { toolName: 'edit_file', toolCallId: '2' }, handoff: { kind: 'disk' } });
      const checkpoint = await service.apply(changeSet.id);
      await fs.writeFile(path.join(test.workspace, 'second.txt'), 'external');

      await expect(service.previewRollback(test.workspace, checkpoint.id)).resolves.toEqual(expect.objectContaining({ eligible: false, conflicts: ['second.txt'] }));
      await expect(service.rollback(test.workspace, checkpoint.id)).rejects.toThrow(/conflict/i);
      await expect(fs.readFile(path.join(test.workspace, 'first.txt'), 'utf8')).resolves.toBe('after-first');
      await expect(fs.readFile(path.join(test.workspace, 'second.txt'), 'utf8')).resolves.toBe('external');
    } finally {
      await test.dispose();
    }
  });

  it('recovers checkpoints after restart and prunes journal retention without touching Git metadata', async () => {
    const test = await fixture();
    try {
      const gitDirectory = path.join(test.workspace, '.git');
      await fs.mkdir(gitDirectory);
      const indexPath = path.join(gitDirectory, 'index');
      await fs.writeFile(indexPath, 'staging-must-not-change');
      const indexHash = createHash('sha256').update(await fs.readFile(indexPath)).digest('hex');
      const journal = new CheckpointJournal(test.appData, { maxCheckpoints: 1, maxBytes: 1024 * 1024, maxAgeMs: 60_000 });
      const service = new WorkspaceChangeSetService(journal);

      let first = await begin(service, test.workspace, 'first');
      first = await service.capture(first.id, { relativePath: 'first.txt', proposedContent: 'first', source: { toolName: 'write_file', toolCallId: '1' }, handoff: { kind: 'disk' } });
      const firstCheckpoint = await service.apply(first.id);
      let second = await begin(service, test.workspace, 'second');
      second = await service.capture(second.id, { relativePath: 'second.txt', proposedContent: 'second', source: { toolName: 'write_file', toolCallId: '2' }, handoff: { kind: 'disk' } });
      const secondCheckpoint = await service.apply(second.id);

      const restartedJournal = new CheckpointJournal(test.appData, { maxCheckpoints: 1, maxBytes: 1024 * 1024, maxAgeMs: 60_000 });
      const restartedService = new WorkspaceChangeSetService(restartedJournal);
      const workspace = (await begin(restartedService, test.workspace, 'restart')).workspace;
      expect(await restartedJournal.load(workspace, firstCheckpoint.id)).toBeNull();
      expect((await restartedJournal.load(workspace, secondCheckpoint.id))?.changeSet.entries[0]?.relativePath).toBe('second.txt');
      await restartedService.rollback(test.workspace, secondCheckpoint.id);
      expect(createHash('sha256').update(await fs.readFile(indexPath)).digest('hex')).toBe(indexHash);
    } finally {
      await test.dispose();
    }
  });
});
