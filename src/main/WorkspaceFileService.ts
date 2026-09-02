import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';
import { constants as fsConstants, promises as fs } from 'fs';
import type { ActiveWorkspaceState } from './ActiveWorkspace';

type ExistingPath = {
  path: string;
  canonicalPath: string;
  workspacePath: string;
  canonicalWorkspacePath: string;
  workspaceStats: Awaited<ReturnType<typeof fs.lstat>>;
  stats: Awaited<ReturnType<typeof fs.lstat>>;
};

type FileSystemIdentity = {
  dev: number | bigint;
  ino: number | bigint;
};

const retryableDeleteErrors = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
const deleteRetryDelays = [50, 150, 300];

function pathsEqual(a: string, b: string) {
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function isInside(parent: string, candidate: string) {
  const pathRelative = relative(parent, candidate);
  return pathRelative !== '' && !pathRelative.startsWith(`..${sep}`) && pathRelative !== '..' && !isAbsolute(pathRelative);
}

function hasSameIdentity(a: FileSystemIdentity, b: FileSystemIdentity) {
  return a.dev === b.dev && a.ino === b.ino;
}

/**
 * Explorer mutations reject symbolic links and Windows junctions that exist while
 * validating source and destination paths. Linux resolves mutation parents from
 * a descriptor for the selected workspace identity. This pins the root and parent
 * directories, but not rename's final source or destination entries: Node exposes
 * only pathname-based rename, so concurrent final-entry substitution remains possible.
 * Windows Node APIs also cannot atomically bind validation and mutation against a
 * concurrent reparse-point replacement.
 */
export class WorkspaceFileService {
  constructor(private readonly getWorkspace: () => ActiveWorkspaceState | null) {}

  async writeFile(filePath: string, content: string) {
    const source = await this.getExistingPath(filePath);
    if (source.stats.isDirectory()) throw new Error('Cannot write to a directory.');
    await this.withStableSourcePath(source, (path) => fs.writeFile(path, content, 'utf8'));
  }

  async create(itemPath: string, type: 'file' | 'directory') {
    if (type !== 'file' && type !== 'directory') throw new Error('Invalid item type.');
    const root = await this.getCanonicalWorkspace();
    const path = resolve(itemPath);
    this.assertLexicallyInsideWorkspace(root.path, path);
    const parent = dirname(path);
    const canonicalParent = await fs.realpath(parent);
    if (!isInside(root.canonicalPath, canonicalParent) && !pathsEqual(root.canonicalPath, canonicalParent)) {
      throw new Error('The item must remain inside the workspace.');
    }
    await this.assertNoSymbolicLinks(root.path, parent);
    await this.assertWorkspaceStillActive(root);
    if (type === 'directory') {
      await fs.mkdir(path);
    } else {
      await fs.writeFile(path, '', 'utf8');
    }
  }

  async rename(itemPath: string, newName: string) {
    if (!newName || newName === '.' || newName === '..' || /[\\/:\0]/.test(newName)) {
      throw new Error('A file or folder name must not contain path separators or drive prefixes.');
    }

    const source = await this.getExistingPath(itemPath);
    const destination = joinPath(dirname(source.path), newName);
    await this.move(source, destination);
    return destination;
  }

  async moveToDirectory(itemPath: string, destinationDirectory: string) {
    const source = await this.getExistingPath(itemPath);
    const destination = await this.getExistingPath(destinationDirectory);
    if (!destination.stats.isDirectory()) {
      throw new Error('Items can only be moved into a directory.');
    }
    if (pathsEqual(source.path, destination.path)) {
      throw new Error('An item cannot be moved onto itself.');
    }
    if (source.stats.isDirectory() && isInside(source.canonicalPath, destination.canonicalPath)) {
      throw new Error('A folder cannot be moved into one of its descendants.');
    }

    const targetPath = joinPath(destination.path, basename(source.path));
    if (pathsEqual(dirname(source.path), destination.path)) {
      throw new Error('The item is already in this folder.');
    }
    await this.move(source, targetPath);
    return targetPath;
  }

  async delete(itemPath: string) {
    const source = await this.getExistingPath(itemPath);

    if (!source.stats.isDirectory()) {
      await this.withStableSourcePath(source, (path) => fs.unlink(path));
      return;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= deleteRetryDelays.length; attempt += 1) {
      try {
        await this.withStableSourcePath(source, (path) => fs.rm(path, { recursive: true, force: false }));
        return;
      } catch (error: any) {
        lastError = error;
        if (!retryableDeleteErrors.has(error?.code) || attempt === deleteRetryDelays.length) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, deleteRetryDelays[attempt]));
      }
    }
    throw lastError;
  }

  private async move(source: ExistingPath, destination: string) {
    const root = await this.getCanonicalWorkspace();
    this.assertLexicallyInsideWorkspace(root.path, destination);
    const destinationParent = dirname(destination);
    const canonicalDestinationParent = await fs.realpath(destinationParent);
    if (!isInside(root.canonicalPath, canonicalDestinationParent) && !pathsEqual(root.canonicalPath, canonicalDestinationParent)) {
      throw new Error('The destination must remain inside the workspace.');
    }
    await this.assertNoSymbolicLinks(root.path, destinationParent);
    const canonicalDestination = joinPath(canonicalDestinationParent, basename(destination));
    try {
      const destinationStats = await fs.lstat(canonicalDestination);
      // Windows resolves case-only spellings to the same entry; permit that rename,
      // but retain collision rejection for every distinct existing entry.
      if (process.platform !== 'win32' || !hasSameIdentity(source.stats, destinationStats)) {
        throw new Error('An item with that name already exists in the destination.');
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await this.withStableMovePaths(source, destination, canonicalDestination, (stableSource, stableDestination) => fs.rename(stableSource, stableDestination));
  }

  private async getExistingPath(itemPath: string): Promise<ExistingPath> {
    const root = await this.getCanonicalWorkspace();
    const path = resolve(itemPath);
    this.assertLexicallyInsideWorkspace(root.path, path);
    const stats = await fs.lstat(path);
    const canonicalPath = await fs.realpath(path);
    if (!isInside(root.canonicalPath, canonicalPath)) {
      throw new Error('The item must remain inside the workspace.');
    }
    await this.assertNoSymbolicLinks(root.path, path);
    return {
      path,
      canonicalPath,
      workspacePath: root.path,
      canonicalWorkspacePath: root.canonicalPath,
      workspaceStats: root.stats,
      stats,
    };
  }

  private async getCanonicalWorkspace() {
    const workspace = this.getWorkspace();
    if (!workspace) throw new Error('No workspace is open.');
    const path = resolve(workspace.path);
    const stats = await fs.lstat(path);
    if (!hasSameIdentity(stats, workspace.identity)) {
      throw new Error('The active workspace changed after it was selected.');
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('The active workspace must be a directory and cannot be a symbolic link.');
    }
    const canonicalPath = await fs.realpath(path);
    const canonicalStats = await fs.lstat(canonicalPath);
    if (!hasSameIdentity(stats, canonicalStats)) {
      throw new Error('The active workspace changed while it was being validated.');
    }
    return { path, canonicalPath, stats };
  }

  private async assertWorkspaceStillActive(root: { path: string; stats: FileSystemIdentity }) {
    const activeWorkspace = this.getWorkspace();
    if (!activeWorkspace || !pathsEqual(resolve(activeWorkspace.path), root.path) || !hasSameIdentity(activeWorkspace.identity, root.stats)) {
      throw new Error('The active workspace changed while the operation was being validated.');
    }
    const currentStats = await fs.lstat(root.path);
    if (!hasSameIdentity(currentStats, root.stats)) {
      throw new Error('The active workspace changed while the operation was being validated.');
    }
  }

  private assertLexicallyInsideWorkspace(workspacePath: string, itemPath: string) {
    if (!isInside(workspacePath, itemPath)) {
      throw new Error('The workspace root and paths outside it cannot be changed.');
    }
  }

  private async assertNoSymbolicLinks(workspacePath: string, itemPath: string) {
    const pathRelative = relative(workspacePath, itemPath);
    let currentPath = workspacePath;
    for (const segment of pathRelative.split(sep)) {
      currentPath = joinPath(currentPath, segment);
      if ((await fs.lstat(currentPath)).isSymbolicLink()) {
        throw new Error('Explorer mutations reject symbolic links and junctions that exist during validation.');
      }
    }
  }

  private async revalidateSourceBeforePathMutation(source: ExistingPath) {
    await this.assertNoSymbolicLinks(source.workspacePath, source.path);
    await this.assertNoSymbolicLinks(source.canonicalWorkspacePath, source.canonicalPath);
    const canonicalPath = await fs.realpath(source.path);
    const mutationPath = await fs.realpath(source.canonicalPath);
    if (
      !pathsEqual(canonicalPath, source.canonicalPath)
      || !pathsEqual(mutationPath, source.canonicalPath)
      || !isInside(source.canonicalWorkspacePath, canonicalPath)
    ) {
      throw new Error('The item changed while it was being validated.');
    }
  }

  private async revalidateDestinationBeforePathMutation(source: ExistingPath, destination: string, canonicalDestination: string) {
    const destinationParent = dirname(destination);
    await this.assertNoSymbolicLinks(source.workspacePath, destinationParent);
    const canonicalDestinationParent = await fs.realpath(destinationParent);
    if (!isInside(source.canonicalWorkspacePath, canonicalDestinationParent) && !pathsEqual(source.canonicalWorkspacePath, canonicalDestinationParent)) {
      throw new Error('The destination must remain inside the workspace.');
    }
    if (!pathsEqual(joinPath(canonicalDestinationParent, basename(destination)), canonicalDestination)) {
      throw new Error('The destination changed while it was being validated.');
    }
    await this.assertNoSymbolicLinks(source.canonicalWorkspacePath, canonicalDestinationParent);
  }

  private async withStableSourcePath<T>(source: ExistingPath, operation: (sourcePath: string) => Promise<T>) {
    await this.assertWorkspaceStillActive({ path: source.workspacePath, stats: source.workspaceStats });
    if (process.platform !== 'linux') {
      // Recheck immediately before the path-based mutation. Windows Node APIs still
      // cannot atomically bind validation and mutation against a concurrent reparse swap.
      await this.revalidateSourceBeforePathMutation(source);
      return operation(source.canonicalPath);
    }

    const workspaceRoot = await this.openLinuxWorkspaceRoot(source);
    try {
      const parent = await this.openLinuxWorkspaceDirectory(workspaceRoot.fd, source.workspacePath, dirname(source.path));
      try {
        // This pins the workspace and parent directory, not the final entry's identity.
        // A concurrent replacement of that entry with another normal entry is still a
        // race inherent to Node's pathname-based unlink/rm APIs.
        return await operation(this.pathFromDirectoryHandle(parent.fd, basename(source.path)));
      } finally {
        await parent.close();
      }
    } finally {
      await workspaceRoot.close();
    }
  }

  private async withStableMovePaths<T>(
    source: ExistingPath,
    destination: string,
    canonicalDestination: string,
    operation: (sourcePath: string, destinationPath: string) => Promise<T>,
  ) {
    if (process.platform !== 'linux') {
      await this.revalidateSourceBeforePathMutation(source);
      await this.revalidateDestinationBeforePathMutation(source, destination, canonicalDestination);
      return operation(source.canonicalPath, canonicalDestination);
    }

    const sourceParentPath = dirname(source.path);
    const destinationParentPath = dirname(destination);
    const workspaceRoot = await this.openLinuxWorkspaceRoot(source);
    try {
      const sourceParent = await this.openLinuxWorkspaceDirectory(workspaceRoot.fd, source.workspacePath, sourceParentPath);
      try {
        const destinationParent = pathsEqual(sourceParentPath, destinationParentPath)
          ? sourceParent
          : await this.openLinuxWorkspaceDirectory(workspaceRoot.fd, source.workspacePath, destinationParentPath);
        try {
          // This pins the workspace and both parent directories, not either final
          // entry. Node's pathname-based rename cannot prevent final-entry swaps.
          return await operation(
            this.pathFromDirectoryHandle(sourceParent.fd, basename(source.path)),
            this.pathFromDirectoryHandle(destinationParent.fd, basename(destination)),
          );
        } finally {
          if (destinationParent !== sourceParent) await destinationParent.close();
        }
      } finally {
        await sourceParent.close();
      }
    } finally {
      await workspaceRoot.close();
    }
  }

  private pathFromDirectoryHandle(fd: number, name: string) {
    // Linux procfs resolves the held directory descriptor, so replacing its pathname
    // cannot redirect the mutation through a newly-created symlink.
    return `/proc/self/fd/${fd}/${name}`;
  }

  private async openLinuxWorkspaceRoot(source: ExistingPath) {
    const currentStats = await fs.lstat(source.workspacePath);
    if (!hasSameIdentity(currentStats, source.workspaceStats)) {
      throw new Error('The active workspace changed while it was being validated.');
    }

    const workspaceRoot = await fs.open(
      source.workspacePath,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    try {
      if (!hasSameIdentity(await workspaceRoot.stat(), source.workspaceStats)) {
        throw new Error('The active workspace changed while it was being validated.');
      }
      return workspaceRoot;
    } catch (error) {
      await workspaceRoot.close();
      throw error;
    }
  }

  private async openLinuxWorkspaceDirectory(workspaceRootFd: number, workspaceRoot: string, directory: string) {
    const directoryRelative = relative(workspaceRoot, directory);
    if (isAbsolute(directoryRelative) || directoryRelative === '..' || directoryRelative.startsWith(`..${sep}`)) {
      throw new Error('The destination must remain inside the workspace.');
    }

    // Duplicating the root descriptor through procfs preserves the same root object;
    // every child is then opened from that descriptor without following links.
    let current = await fs.open(this.pathFromDirectoryHandle(workspaceRootFd, ''), fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try {
      for (const segment of directoryRelative === '' ? [] : directoryRelative.split(sep)) {
        const next = await fs.open(
          this.pathFromDirectoryHandle(current.fd, segment),
          fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
        );
        await current.close();
        current = next;
      }
      return current;
    } catch (error) {
      await current.close();
      throw error;
    }
  }
}

function joinPath(parent: string, child: string) {
  return resolve(parent, child);
}
