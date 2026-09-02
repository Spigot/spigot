import { resolve } from 'path';
import { promises as fs } from 'fs';

export type ActiveWorkspaceState = {
  path: string;
  identity: {
    dev: number;
    ino: number;
  };
};

/**
 * Separates the workspace selected by the user from explorer read/cache state.
 * A directory read is intentionally unable to change this operation boundary.
 */
export class ActiveWorkspace {
  private workspace: ActiveWorkspaceState | null = null;

  async set(path: string) {
    const workspacePath = resolve(path);
    const stats = await fs.lstat(workspacePath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('The active workspace must be a directory and cannot be a symbolic link.');
    }
    this.workspace = {
      path: workspacePath,
      identity: { dev: stats.dev, ino: stats.ino },
    };
  }

  get() {
    return this.workspace;
  }
}
