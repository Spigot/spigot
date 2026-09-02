import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineSessionService } from './EngineSessionService';

function permissionTestAdapter(requests: Array<{ tool: string; input?: unknown }>) {
  return {
    startTurn: vi.fn(async (request, onEvent) => {
      const decisions: Array<'granted' | 'denied' | null> = [];
      for (const target of requests) {
        decisions.push(await request.requestToolPermission?.({ tool: target.tool, input: target.input ?? {} }));
      }
      onEvent({ type: 'content', turnId: request.turnId, text: decisions.join(',') });
      onEvent({ type: 'end', turnId: request.turnId, aborted: false });
      return true;
    }),
    abortTurn: vi.fn(),
  };
}

describe('EngineSessionService tool permission policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function run(adapter: ReturnType<typeof permissionTestAdapter>) {
    const service = new EngineSessionService(adapter as any);
    const events: any[] = [];
    const done = service.startTurn({
      sessionId: 'conv-1',
      turnId: 'turn-1',
      mode: 'build',
      provider: 'openai',
      model: 'gpt-5',
      apiKey: 'k',
      prompt: 'hello',
      contextText: null,
      history: [],
      workspacePath: 'C:/repo',
    }, event => {
      events.push(event);
    });
    return { service, events, done };
  }

  const requestEvents = (events: any[]) => events.filter(event => event.type === 'permission:request');
  const contentText = async (events: any[]) => {
    await vi.waitFor(() => expect(events.some(event => event.type === 'content')).toBe(true));
    return events.find(event => event.type === 'content').text;
  };

  it('prompts for gated tools and records an always-grant for the session', async () => {
    const adapter = permissionTestAdapter([
      { tool: 'run_command', input: { command: 'npm test' } },
      { tool: 'run_command', input: { command: 'npm run build' } },
    ]);
    const { service, events, done } = run(adapter);

    await vi.waitFor(() => expect(requestEvents(events).length).toBe(1));
    expect(requestEvents(events)[0].tool).toBe('run_command');

    expect(service.resolvePermissionRequest(requestEvents(events)[0].id, 'always', 'conv-1')).toBe(true);
    await expect(done).resolves.toBe(true);

    // The second run_command is auto-approved through the recorded session grant.
    expect(await contentText(events)).toBe('granted,granted');
    expect(requestEvents(events)).toHaveLength(1);
    expect(events.filter(event => event.type === 'permission:result').map(event => event.granted)).toEqual([true]);
  });

  it('full grant auto-approves every gated tool without prompting', async () => {
    const adapter = permissionTestAdapter([
      { tool: 'run_command', input: { command: 'npm test' } },
      { tool: 'move_file', input: { sourcePath: 'a.ts', targetPath: 'b.ts' } },
    ]);
    const { service, events, done } = run(adapter);

    await vi.waitFor(() => expect(requestEvents(events).length).toBe(1));
    expect(service.resolvePermissionRequest(requestEvents(events)[0].id, 'full', 'conv-1')).toBe(true);
    await expect(done).resolves.toBe(true);

    expect(await contentText(events)).toBe('granted,granted');
    expect(requestEvents(events)).toHaveLength(1);
  });

  it('denies the call but keeps prompting for later ones', async () => {
    const adapter = permissionTestAdapter([
      { tool: 'run_command', input: { command: 'rm -rf /' } },
      { tool: 'run_command', input: { command: 'npm test' } },
    ]);
    const { service, events, done } = run(adapter);

    await vi.waitFor(() => expect(requestEvents(events).length).toBe(1));
    expect(service.resolvePermissionRequest(requestEvents(events)[0].id, 'deny', 'conv-1')).toBe(true);
    await vi.waitFor(() => expect(requestEvents(events).length).toBe(2));
    expect(service.resolvePermissionRequest(requestEvents(events)[1].id, 'grant', 'conv-1')).toBe(true);
    await expect(done).resolves.toBe(true);

    expect(requestEvents(events)).toHaveLength(2);
    expect(events.filter(event => event.type === 'permission:result').map(event => event.granted)).toEqual([false, true]);
    expect(await contentText(events)).toBe('denied,granted');
  });

  it('never prompts for tools outside the gated set', async () => {
    const adapter = permissionTestAdapter([
      { tool: 'read_file', input: { filePath: 'README.md' } },
      { tool: 'write_file', input: { filePath: 'x.txt', content: 'x' } },
    ]);
    const { events, done } = run(adapter);

    await expect(done).resolves.toBe(true);
    expect(requestEvents(events)).toHaveLength(0);
    expect(await contentText(events)).toBe('granted,granted');
  });
});
