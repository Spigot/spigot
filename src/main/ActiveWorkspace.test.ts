import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rename, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { ActiveWorkspace } from './ActiveWorkspace';

const workspaces: string[] = [];

async function createWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), 'spigot-active-workspace-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

describe('ActiveWorkspace', () => {
  it('keeps the selected workspace independent from explorer directory reads', async () => {
    const selectedWorkspace = await createWorkspace();
    const workspace = new ActiveWorkspace();
    await workspace.set(selectedWorkspace);

    // Explorer reads are cache data, not an authority to change the operation root.
    const explorerCache = new Map<string, unknown>();
    explorerCache.set('/outside/directory', []);

    expect(explorerCache.get('/outside/directory')).toEqual([]);
    expect(workspace.get()?.path).toBe(resolve(selectedWorkspace));
  });

  it('retains the selected root identity after its pathname is replaced', async () => {
    const selectedWorkspace = await createWorkspace();
    const replacementPath = `${selectedWorkspace}-replacement`;
    workspaces.push(replacementPath);
    const workspace = new ActiveWorkspace();
    await workspace.set(selectedWorkspace);
    const selected = workspace.get();

    await rename(selectedWorkspace, replacementPath);
    await mkdir(selectedWorkspace);

    expect(workspace.get()).toEqual(selected);
  });
});
