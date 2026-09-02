import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIStore } from './aiStore';

const setModelConfiguration = vi.fn().mockResolvedValue(undefined);

describe('aiStore model selection persistence', () => {
  beforeEach(() => {
    (window as any).api = { store: { setModelConfiguration } };
    useAIStore.setState({
      chatModelOverrides: {},
      messageQueue: [],
      modelConfiguration: { version: 2, assignments: {}, roleAssignments: {} },
    });
    setModelConfiguration.mockClear();
  });

  it('persists the chat model override for the selected mode', async () => {
    await useAIStore.getState().setChatModelOverride('build', { providerId: 'gemini', modelId: 'gemini-2.5-pro' });

    const state = useAIStore.getState();
    expect(state.chatModelOverrides.build).toEqual({ providerId: 'gemini', modelId: 'gemini-2.5-pro' });
    expect(state.modelConfiguration.assignments.build).toEqual({ providerId: 'gemini', modelId: 'gemini-2.5-pro' });
    expect(setModelConfiguration).toHaveBeenCalledTimes(1);
  });

  it('persists the orchestrator selection into the gentle-orchestrator role so it restores after reload', async () => {
    await useAIStore.getState().setChatModelOverride('orchestrator', { providerId: 'minimax', modelId: 'MiniMax-M3' });

    const state = useAIStore.getState();
    expect(state.modelConfiguration.assignments.orchestrator).toEqual({ providerId: 'minimax', modelId: 'MiniMax-M3' });
    expect(state.modelConfiguration.roleAssignments['gentle-orchestrator']).toEqual({ providerId: 'minimax', modelId: 'MiniMax-M3' });
  });

  it('persists effort changes through to the model configuration', async () => {
    useAIStore.setState({
      modelConfiguration: {
        version: 2,
        assignments: { build: { providerId: 'openai', modelId: 'gpt-5' } },
        roleAssignments: {},
      },
      chatModelOverrides: { build: { providerId: 'openai', modelId: 'gpt-5' } },
    });

    await useAIStore.getState().setChatModelOverrideEffort('build', 'high');

    const state = useAIStore.getState();
    expect(state.modelConfiguration.assignments.build).toEqual({ providerId: 'openai', modelId: 'gpt-5', effort: 'high' });
  });
});

describe('aiStore message queue', () => {
  beforeEach(() => {
    useAIStore.setState({ messageQueue: [] });
  });

  it('keeps messages in submission order with stable ids', () => {
    const store = useAIStore.getState();
    store.enqueueMessage({ prompt: 'primero', mode: 'build', contextText: null, contextSource: 'default' });
    store.enqueueMessage({ prompt: 'segundo', mode: 'build', contextText: null, contextSource: 'default' });

    const queue = useAIStore.getState().messageQueue;
    expect(queue.map(item => item.prompt)).toEqual(['primero', 'segundo']);
    expect(new Set(queue.map(item => item.id)).size).toBe(2);
  });

  it('removes a queued message by id', () => {
    const store = useAIStore.getState();
    store.enqueueMessage({ prompt: 'primero', mode: 'build', contextText: null, contextSource: 'default' });
    store.enqueueMessage({ prompt: 'segundo', mode: 'build', contextText: null, contextSource: 'default' });

    const [first] = useAIStore.getState().messageQueue;
    useAIStore.getState().removeQueuedMessage(first.id);

    const queue = useAIStore.getState().messageQueue;
    expect(queue.map(item => item.prompt)).toEqual(['segundo']);
  });
});

describe('aiStore tool permission prompts', () => {
  it('sends the decision to main and clears the pending prompt', async () => {
    const respondPermissionIpc = vi.fn().mockResolvedValue(true);
    (window as any).api = { ai: { respondPermission: respondPermissionIpc } };
    useAIStore.setState({
      pendingPermissions: [
        { id: 'req-1', tool: 'run_command', input: { command: 'npm test' } },
        { id: 'req-2', tool: 'run_command', input: { command: 'npm run build' } },
      ],
    });

    await useAIStore.getState().respondPermission('req-1', 'always');

    expect(respondPermissionIpc).toHaveBeenCalledWith({ requestId: 'req-1', decision: 'always' });
    expect(useAIStore.getState().pendingPermissions.map(item => item.id)).toEqual(['req-2']);
  });
});
