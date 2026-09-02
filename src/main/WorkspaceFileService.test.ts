import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import { lstat, mkdtemp, mkdir, readdir, rename as renamePath, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ActiveWorkspace } from './ActiveWorkspace';
import { WorkspaceFileService } from './WorkspaceFileService';

const workspaces: string[] = [];

async function createWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), 'spigot-workspace-'));
  workspaces.push(workspace);
  return workspace;
}

async function createWorkspaceService(workspacePath: string) {
  const workspace = new ActiveWorkspace();
  await workspace.set(workspacePath);
  return new WorkspaceFileService(() => workspace.get());
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

describe('WorkspaceFileService', () => {
  it('uses the newly activated recent workspace as its mutation root', async () => {
    const initialWorkspace = await createWorkspace();
    const recentWorkspace = await createWorkspace();
    const initialFile = join(initialWorkspace, 'initial.txt');
    const recentFile = join(recentWorkspace, 'recent.txt');
    await writeFile(initialFile, 'initial');
    await writeFile(recentFile, 'recent');
    const activeWorkspace = new ActiveWorkspace();
    const service = new WorkspaceFileService(() => activeWorkspace.get());

    await activeWorkspace.set(initialWorkspace);
    await activeWorkspace.set(recentWorkspace);

    await expect(service.rename(recentFile, 'renamed.txt')).resolves.toBe(join(recentWorkspace, 'renamed.txt'));
    await expect(service.rename(initialFile, 'renamed.txt')).rejects.toThrow('outside');
  });

  it('rejects create and write requests for a root that is no longer active', async () => {
    const initialWorkspace = await createWorkspace();
    const recentWorkspace = await createWorkspace();
    const initialFile = join(initialWorkspace, 'initial.txt');
    await writeFile(initialFile, 'initial');
    const activeWorkspace = new ActiveWorkspace();
    const service = new WorkspaceFileService(() => activeWorkspace.get());

    await activeWorkspace.set(initialWorkspace);
    await activeWorkspace.set(recentWorkspace);

    await expect(service.writeFile(initialFile, 'stale write')).rejects.toThrow('outside');
    await expect(service.create(join(initialWorkspace, 'stale.txt'), 'file')).rejects.toThrow('outside');
    await expect(fs.readFile(initialFile, 'utf8')).resolves.toBe('initial');
  });

  it('renames files inside the active workspace', async () => {
    const workspace = await createWorkspace();
    const original = join(workspace, 'original.ts');
    await writeFile(original, 'export {};');
    const service = await createWorkspaceService(workspace);

    const renamed = await service.rename(original, 'renamed.ts');

    await expect(writeFile(renamed, 'updated')).resolves.toBeUndefined();
    await expect(service.delete(original)).rejects.toThrow();
  });

  it.runIf(process.platform === 'win32')('allows a case-only rename while rejecting distinct destination collisions', async () => {
    const workspace = await createWorkspace();
    const original = join(workspace, 'Foo.txt');
    await writeFile(original, 'content');
    const service = await createWorkspaceService(workspace);

    await expect(service.rename(original, 'foo.txt')).resolves.toBe(join(workspace, 'foo.txt'));
    expect(await readdir(workspace)).toContain('foo.txt');

    await writeFile(join(workspace, 'other.txt'), 'other');
    await expect(service.rename(join(workspace, 'foo.txt'), 'other.txt')).rejects.toThrow('already exists');
  });

  it('rejects root, traversal, collisions, no-op moves, and descendant moves', async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(join(tmpdir(), 'spigot-outside-'));
    workspaces.push(outside);
    const source = join(workspace, 'source');
    const child = join(source, 'child');
    const destination = join(workspace, 'destination');
    await mkdir(child, { recursive: true });
    await mkdir(destination);
    await writeFile(join(source, 'same.txt'), 'source');
    await writeFile(join(destination, 'same.txt'), 'destination');
    const service = await createWorkspaceService(workspace);

    await expect(service.delete(workspace)).rejects.toThrow('workspace root');
    await expect(service.delete(join(workspace, '..', 'spigot-outside-nope'))).rejects.toThrow('outside');
    await expect(service.rename(join(source, 'same.txt'), 'C:outside.txt')).rejects.toThrow('drive prefixes');
    await expect(service.moveToDirectory(source, child)).rejects.toThrow('descendants');
    await expect(service.moveToDirectory(join(source, 'same.txt'), source)).rejects.toThrow('already in this folder');
    await expect(service.moveToDirectory(join(source, 'same.txt'), destination)).rejects.toThrow('already exists');
  });

  it('deletes folders recursively and moves files only after validation', async () => {
    const workspace = await createWorkspace();
    const nested = join(workspace, 'nested', 'deep');
    const destination = join(workspace, 'destination');
    await mkdir(nested, { recursive: true });
    await mkdir(destination);
    const file = join(nested, 'file.txt');
    await writeFile(file, 'content');
    const service = await createWorkspaceService(workspace);

    const moved = await service.moveToDirectory(file, destination);
    await service.delete(join(workspace, 'nested'));

    await expect(service.delete(moved)).resolves.toBeUndefined();
    await expect(lstat(moved)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(service.delete(join(workspace, 'nested'))).rejects.toThrow();
  });

  it('rejects symbolic-link and junction sources and destination parents', async () => {
    const workspace = await createWorkspace();
    const source = join(workspace, 'source.txt');
    const linkedSource = join(workspace, 'linked-source');
    const realDestination = join(workspace, 'real-destination');
    const linkedDestination = join(workspace, 'linked-destination');
    await writeFile(source, 'source');
    await mkdir(realDestination);
    await symlink(realDestination, linkedSource, process.platform === 'win32' ? 'junction' : 'dir');
    await symlink(realDestination, linkedDestination, process.platform === 'win32' ? 'junction' : 'dir');
    const service = await createWorkspaceService(workspace);

    expect((await lstat(linkedSource)).isSymbolicLink()).toBe(true);
    expect((await lstat(linkedDestination)).isSymbolicLink()).toBe(true);
    await expect(service.delete(linkedSource)).rejects.toThrow('symbolic links and junctions');
    await expect(service.moveToDirectory(source, linkedDestination)).rejects.toThrow('symbolic links and junctions');
    await expect(lstat(source)).resolves.toBeDefined();
  });

  it('rejects links whose canonical target is outside the workspace', async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(join(tmpdir(), 'spigot-outside-'));
    workspaces.push(outside);
    const source = join(workspace, 'source.txt');
    const outsideLink = join(workspace, 'outside-link');
    await writeFile(source, 'source');
    await symlink(outside, outsideLink, process.platform === 'win32' ? 'junction' : 'dir');
    const service = await createWorkspaceService(workspace);

    await expect(service.moveToDirectory(source, outsideLink)).rejects.toThrow('remain inside the workspace');
    await expect(service.delete(outsideLink)).rejects.toThrow('remain inside the workspace');
    await expect(lstat(source)).resolves.toBeDefined();
  });

  it.runIf(process.platform === 'linux')('does not follow a destination-parent symlink swapped after validation', async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(join(tmpdir(), 'spigot-outside-'));
    workspaces.push(outside);
    const source = join(workspace, 'source.txt');
    const destination = join(workspace, 'destination');
    const movedDestination = join(workspace, 'destination-before-swap');
    await writeFile(source, 'source');
    await mkdir(destination);
    const service = await createWorkspaceService(workspace);
    const originalOpen = fs.open;
    let swapped = false;

    const openSpy = vi.spyOn(fs, 'open').mockImplementation(async (path, flags) => {
      if (!swapped && typeof path === 'string' && /^\/proc\/self\/fd\/\d+\/destination$/.test(path)) {
        swapped = true;
        await renamePath(destination, movedDestination);
        await symlink(outside, destination, 'dir');
      }
      return originalOpen(path, flags);
    });

    try {
      await expect(service.moveToDirectory(source, destination)).rejects.toMatchObject({ code: 'ELOOP' });
    } finally {
      openSpy.mockRestore();
    }

    expect(swapped).toBe(true);
    await expect(lstat(source)).resolves.toBeDefined();
    await expect(lstat(join(outside, 'source.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.runIf(process.platform === 'linux')('does not follow a delete-parent symlink swapped after validation', async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(join(tmpdir(), 'spigot-outside-'));
    workspaces.push(outside);
    const directory = join(workspace, 'directory');
    const movedDirectory = join(workspace, 'directory-before-swap');
    const source = join(directory, 'source.txt');
    await mkdir(directory);
    await writeFile(source, 'source');
    const service = await createWorkspaceService(workspace);
    const originalOpen = fs.open;
    let swapped = false;

    const openSpy = vi.spyOn(fs, 'open').mockImplementation(async (path, flags) => {
      if (!swapped && typeof path === 'string' && /^\/proc\/self\/fd\/\d+\/directory$/.test(path)) {
        swapped = true;
        await renamePath(directory, movedDirectory);
        await symlink(outside, directory, 'dir');
      }
      return originalOpen(path, flags);
    });

    try {
      await expect(service.delete(source)).rejects.toMatchObject({ code: 'ELOOP' });
    } finally {
      openSpy.mockRestore();
    }

    expect(swapped).toBe(true);
    await expect(lstat(join(movedDirectory, 'source.txt'))).resolves.toBeDefined();
    await expect(lstat(join(outside, 'source.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.runIf(process.platform === 'linux')('rejects deletion when the selected workspace root is replaced after validation', async () => {
    const workspace = await createWorkspace();
    const movedWorkspace = `${workspace}-before-swap`;
    workspaces.push(movedWorkspace);
    const source = join(workspace, 'source.txt');
    await writeFile(source, 'source');
    const service = await createWorkspaceService(workspace);
    const originalOpen = fs.open;
    let swapped = false;

    const openSpy = vi.spyOn(fs, 'open').mockImplementation(async (path, flags) => {
      if (!swapped && path === workspace) {
        swapped = true;
        await renamePath(workspace, movedWorkspace);
        await mkdir(workspace);
        await writeFile(join(workspace, 'source.txt'), 'replacement');
      }
      return originalOpen(path, flags);
    });

    try {
      await expect(service.delete(source)).rejects.toThrow('active workspace changed');
    } finally {
      openSpy.mockRestore();
    }

    expect(swapped).toBe(true);
    await expect(lstat(join(workspace, 'source.txt'))).resolves.toBeDefined();
    await expect(lstat(join(movedWorkspace, 'source.txt'))).resolves.toBeDefined();
  });

  it('rejects a rename after the selected workspace root is persistently replaced', async () => {
    const workspace = await createWorkspace();
    const movedWorkspace = `${workspace}-before-replacement`;
    workspaces.push(movedWorkspace);
    const source = join(workspace, 'source.txt');
    await writeFile(source, 'source');
    const service = await createWorkspaceService(workspace);

    await renamePath(workspace, movedWorkspace);
    await mkdir(workspace);
    await writeFile(join(workspace, 'source.txt'), 'replacement');

    await expect(service.rename(join(workspace, 'source.txt'), 'renamed.txt')).rejects.toThrow('changed after it was selected');
    await expect(lstat(join(workspace, 'source.txt'))).resolves.toBeDefined();
    await expect(lstat(join(movedWorkspace, 'source.txt'))).resolves.toBeDefined();
  });

  it.runIf(process.platform === 'linux')('does not promise stable final entries for rename', async () => {
    const workspace = await createWorkspace();
    const source = join(workspace, 'source.txt');
    const renamed = join(workspace, 'renamed.txt');
    await writeFile(source, 'original');
    const service = await createWorkspaceService(workspace);
    const originalRename = fs.rename;
    let substituted = false;

    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (oldPath, newPath) => {
      if (!substituted && typeof oldPath === 'string' && /^\/proc\/self\/fd\/\d+\/source\.txt$/.test(oldPath)) {
        substituted = true;
        await rm(source);
        await writeFile(source, 'replacement');
      }
      return originalRename(oldPath, newPath);
    });

    try {
      await service.rename(source, 'renamed.txt');
    } finally {
      renameSpy.mockRestore();
    }

    expect(substituted).toBe(true);
    await expect(fs.readFile(renamed, 'utf8')).resolves.toBe('replacement');
  });
});
