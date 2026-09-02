import { describe, expect, it, beforeEach, vi } from 'vitest';
import { assistantPartsFromLegacy, useAIStore } from './aiStore';
import { createModelConfiguration, setModeAssignment } from '../../shared/modelConfiguration';

describe('useAIStore - Session and Turn Isolation', () => {
  it('converts legacy assistant strings without rewriting whitespace', () => {
    expect(assistantPartsFromLegacy('  first\n\nsecond  ')).toEqual([
      { partId: 'legacy-text-0', kind: 'text', ordinal: 0, text: '  first\n\nsecond  ' },
    ]);
  });
  let mockIpcListeners: {
    chunkCallback?: (payload: any) => void;
    partCallback?: (payload: any) => void;
    toolCallback?: (payload: any) => void;
    contextBoundedCallback?: (payload: any) => void;
    errorCallback?: (payload: any) => void;
    endCallback?: (payload: any) => void;
  };
  let mockStreamChat: any;
  let mockAbortChat: any;
  let mockSetChatHistory: any;
  let frameCallback: FrameRequestCallback | undefined;

  const flushFrame = () => {
    const callback = frameCallback;
    frameCallback = undefined;
    callback?.(0);
  };

  beforeEach(() => {
    mockIpcListeners = {};
    mockStreamChat = vi.fn().mockResolvedValue(true);
    mockAbortChat = vi.fn();
    mockSetChatHistory = vi.fn().mockResolvedValue(undefined);
    frameCallback = undefined;
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();

    (window as any).api = {
      ai: {
        streamChat: mockStreamChat,
        abortChat: mockAbortChat,
        onChunk: vi.fn((cb: any) => {
          mockIpcListeners.chunkCallback = cb;
          return vi.fn();
        }),
        onPart: vi.fn((cb: any) => {
          mockIpcListeners.partCallback = cb;
          return vi.fn();
        }),
        onTool: vi.fn((cb: any) => {
          mockIpcListeners.toolCallback = cb;
          return vi.fn();
        }),
        onContextBounded: vi.fn((cb: any) => {
          mockIpcListeners.contextBoundedCallback = cb;
          return vi.fn();
        }),
        onError: vi.fn((cb: any) => {
          mockIpcListeners.errorCallback = cb;
          return vi.fn();
        }),
        onEnd: vi.fn((cb: any) => {
          mockIpcListeners.endCallback = cb;
          return vi.fn();
        }),
        fetchModels: vi.fn().mockResolvedValue(['gpt-4o']),
      },
      store: {
        getKeys: vi.fn().mockResolvedValue({ openai: 'test-key' }),
        getSelectedModels: vi.fn().mockResolvedValue({ openai: 'gpt-4o' }),
        getModelConfiguration: vi.fn().mockResolvedValue(undefined),
        setModelConfiguration: vi.fn().mockResolvedValue(undefined),
        getChatHistory: vi.fn().mockResolvedValue([]),
        setChatHistory: mockSetChatHistory,
        setSelectedModel: vi.fn().mockResolvedValue(undefined),
      },
    };

    useAIStore.setState({
      conversations: [
        {
          id: 'conv-1',
          title: 'Conversation 1',
          messages: [],
          timestamp: 1000,
        },
        {
          id: 'conv-2',
          title: 'Conversation 2',
          messages: [],
          timestamp: 2000,
        },
      ],
      activeConversationId: 'conv-1',
      messages: [],
      providers: {
        openai: { key: 'test-key', activeModel: 'gpt-4o', availableModels: ['gpt-4o'] },
      },
      activeProvider: 'openai',
      isGenerating: false,
      incomingStreamText: '',
      error: null,
      activeStreams: {},
      chatModelOverrides: {},
    });
  });

  it('binds outgoing stream request with conversationId and unique turnId', async () => {
    await useAIStore.getState().sendMessage('Hello from conv 1', null);

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    const callArgs = mockStreamChat.mock.calls[0][0];
    expect(callArgs.conversationId).toBe('conv-1');
    expect(callArgs.turnId).toMatch(/^turn-/);
    expect(callArgs.prompt).toBe('Hello from conv 1');

    const state = useAIStore.getState();
    expect(state.isGenerating).toBe(true);
    expect(state.activeStreams['conv-1']).toBeDefined();
    expect(state.activeStreams['conv-1'].turnId).toBe(callArgs.turnId);
  });

  it('emits metadata-only lifecycle diagnostics for an accepted turn', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await useAIStore.getState().sendMessage('Sensitive prompt must not appear in diagnostics', null);

    const records = info.mock.calls
      .map(([message]) => typeof message === 'string' && message.startsWith('[chat] ') ? JSON.parse(message.slice(7)) : null)
      .filter(Boolean);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'turn.accepted', conversationId: 'conv-1', phase: 'renderer.stream' }),
      expect.objectContaining({ eventType: 'provider.dispatch', conversationId: 'conv-1', phase: 'renderer.ipc' }),
    ]));
    expect(JSON.stringify(records)).not.toContain('Sensitive prompt must not appear in diagnostics');
    info.mockRestore();
  });

  it('isolates incoming stream chunks to the target conversation when user switches to another conversation', async () => {
    await useAIStore.getState().sendMessage('Task in conv 1', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    // Send first chunk for conv-1 while active
    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId,
      chunk: 'Part 1. ',
    });
    flushFrame();

    expect(useAIStore.getState().incomingStreamText).toBe('Part 1. ');
    expect(useAIStore.getState().isGenerating).toBe(true);

    // User switches to Conversation 2
    useAIStore.getState().selectConversation('conv-2');

    expect(useAIStore.getState().activeConversationId).toBe('conv-2');
    // In conv-2, incomingStreamText should be empty and isGenerating false because conv-2 is idle
    expect(useAIStore.getState().incomingStreamText).toBe('');
    expect(useAIStore.getState().isGenerating).toBe(false);

    // More chunks arrive for conv-1 in background
    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId,
      chunk: 'Part 2.',
    });
    flushFrame();

    // Conv-2 remains completely clean
    expect(useAIStore.getState().incomingStreamText).toBe('');
    expect(useAIStore.getState().isGenerating).toBe(false);
    expect(useAIStore.getState().activeStreams['conv-1'].text).toBe('Part 1. Part 2.');

    // User switches back to Conversation 1
    useAIStore.getState().selectConversation('conv-1');
    expect(useAIStore.getState().incomingStreamText).toBe('Part 1. Part 2.');
    expect(useAIStore.getState().isGenerating).toBe(true);
  });

  it('uses a valid typed part authoritatively and flushes it on terminal end', async () => {
    await useAIStore.getState().sendMessage('Typed response', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    mockIpcListeners.partCallback?.({
      conversationId: 'conv-1',
      turnId,
      part: { partId: 'text-0', kind: 'text', lifecycle: 'delta', ordinal: 0, conversationId: 'conv-1', turnId, text: 'Typed content' },
    });
    flushFrame();
    await mockIpcListeners.endCallback?.({ conversationId: 'conv-1', turnId, aborted: false });

    const state = useAIStore.getState();
    expect(state.conversations.find(conversation => conversation.id === 'conv-1')?.messages.at(-1)?.content).toBe('Typed content');
    expect(state.activeStreams['conv-1']).toBeUndefined();
    expect(state.isGenerating).toBe(false);
  });

  it('keeps legacy chunks when typed listener exists but no valid typed part arrives', async () => {
    await useAIStore.getState().sendMessage('Legacy fallback', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;
    mockIpcListeners.chunkCallback?.({ conversationId: 'conv-1', turnId, chunk: 'Fallback text' });
    flushFrame();

    expect(useAIStore.getState().incomingStreamText).toBe('Fallback text');
  });

  it('rejects malformed typed events without suppressing later legacy fallback', async () => {
    await useAIStore.getState().sendMessage('Malformed typed event', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;
    mockIpcListeners.partCallback?.({ conversationId: 'conv-1', turnId, part: { kind: 'text', lifecycle: 'delta', ordinal: 0, text: 'bad' } });
    mockIpcListeners.chunkCallback?.({ conversationId: 'conv-1', turnId, chunk: 'Fallback remains visible' });
    flushFrame();

    expect(useAIStore.getState().incomingStreamText).toBe('Fallback remains visible');
  });

  it('appends assistant response to the originating conversation on stream end, even if user is viewing a different conversation', async () => {
    await useAIStore.getState().sendMessage('Generate code in conv 1', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId,
      chunk: 'const x = 42;',
    });

    // Switch to Conversation 2 before response finishes
    useAIStore.getState().selectConversation('conv-2');
    expect(useAIStore.getState().activeConversationId).toBe('conv-2');

    // Stream finishes for conv-1
    await mockIpcListeners.endCallback?.({
      conversationId: 'conv-1',
      turnId,
      aborted: false,
    });

    const state = useAIStore.getState();
    const conv1 = state.conversations.find((c) => c.id === 'conv-1');
    const conv2 = state.conversations.find((c) => c.id === 'conv-2');

    // Conv-1 received the assistant message
    expect(conv1?.messages).toHaveLength(2); // user + assistant
    expect(conv1?.messages[1].role).toBe('assistant');
    expect(conv1?.messages[1].content).toBe('const x = 42;');

    // Conv-2 has NO leaked messages
    expect(conv2?.messages).toHaveLength(0);

    // Active streams for conv-1 is cleared
    expect(state.activeStreams['conv-1']).toBeUndefined();
  });

  it('discards stale chunks from superseded or previous turns', async () => {
    await useAIStore.getState().sendMessage('Query 1', null);
    const oldTurnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    // Simulate turn ending
    await mockIpcListeners.endCallback?.({
      conversationId: 'conv-1',
      turnId: oldTurnId,
      aborted: false,
    });

    // Start a second turn
    await useAIStore.getState().sendMessage('Query 2', null);
    const newTurnId = useAIStore.getState().activeStreams['conv-1'].turnId;
    expect(newTurnId).not.toBe(oldTurnId);

    // Stale late chunk from old turn arrives
    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId: oldTurnId,
      chunk: 'Late stale chunk',
    });

    expect(useAIStore.getState().incomingStreamText).toBe('');

    // Valid chunk from new turn arrives
    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId: newTurnId,
      chunk: 'Fresh new chunk',
    });
    flushFrame();

    expect(useAIStore.getState().incomingStreamText).toBe('Fresh new chunk');
  });

  it('aborts only the targeted conversation stream without disturbing others', async () => {
    await useAIStore.getState().sendMessage('Task', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    useAIStore.getState().abortChat('conv-1');

    expect(mockAbortChat).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      turnId,
    });
  });

  it('creates clean new conversation while one is generating in background', async () => {
    await useAIStore.getState().sendMessage('Background task', null);

    useAIStore.getState().createConversation();

    const state = useAIStore.getState();
    expect(state.activeConversationId).toMatch(/^conv-/);
    expect(state.activeConversationId).not.toBe('conv-1');
    expect(state.messages).toEqual([]);
    expect(state.incomingStreamText).toBe('');
    expect(state.isGenerating).toBe(false);
    expect(state.activeStreams['conv-1'].isGenerating).toBe(true);
  });

  it('selects a model from another provider without changing the active conversation or stream', async () => {
    const activeStream = {
      conversationId: 'conv-1',
      turnId: 'turn-active',
      text: 'Still generating',
      isGenerating: true,
      error: null,
    };
    const activeMessages = [{ id: 'message-1', role: 'user' as const, content: 'Keep this chat', timestamp: 1 }];
    useAIStore.setState({
      messages: activeMessages,
      conversations: [{ id: 'conv-1', title: 'Conversation 1', messages: activeMessages, timestamp: 1000 }],
      activeConversationId: 'conv-1',
      providers: {
        openai: { key: 'openai-key', activeModel: 'gpt-4o', availableModels: ['gpt-4o'] },
        anthropic: { key: 'anthropic-key', activeModel: 'claude-3-5-sonnet', availableModels: ['claude-3-5-sonnet'] },
      },
      activeProvider: 'openai',
      activeStreams: { 'conv-1': activeStream },
      incomingStreamText: activeStream.text,
      isGenerating: true,
    });

    await useAIStore.getState().selectModel('anthropic', 'claude-3-5-sonnet');

    const state = useAIStore.getState();
    expect(state.activeProvider).toBe('anthropic');
    expect(state.providers.anthropic.activeModel).toBe('claude-3-5-sonnet');
    expect(state.activeConversationId).toBe('conv-1');
    expect(state.messages).toBe(activeMessages);
    expect(state.conversations[0].id).toBe('conv-1');
    expect(state.activeStreams['conv-1']).toBe(activeStream);
    expect(state.incomingStreamText).toBe('Still generating');
    expect(state.isGenerating).toBe(true);
    expect((window as any).api.store.setSelectedModel).toHaveBeenCalledWith('anthropic', 'claude-3-5-sonnet');
  });

  it('prefers the coordinator assignment and falls back to the legacy orchestrator assignment', async () => {
    const legacyConfiguration = setModeAssignment(
      createModelConfiguration(undefined, { openai: 'gpt-5' }),
      'orchestrator',
      { providerId: 'openai', modelId: 'gpt-5' },
    );
    useAIStore.setState({
      providers: {
        openai: { key: 'openai-key', activeModel: 'gpt-5', availableModels: ['gpt-5'] },
        anthropic: { key: 'anthropic-key', activeModel: 'claude-sonnet-4-6', availableModels: ['claude-sonnet-4-6'] },
      },
      activeProvider: 'anthropic',
      modelConfiguration: {
        ...legacyConfiguration,
        roleAssignments: { 'gentle-orchestrator': { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' } },
      },
    });

    await useAIStore.getState().sendMessage('Use the orchestrator assignment', null, null, 'orchestrator');

    expect(mockStreamChat).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      mode: 'orchestrator',
    }));

    mockStreamChat.mockClear();
    useAIStore.setState({
      modelConfiguration: { ...legacyConfiguration, roleAssignments: {} },
      activeStreams: {},
      isGenerating: false,
    });
    await useAIStore.getState().sendMessage('Use the fallback assignment', null, null, 'orchestrator');
    expect(mockStreamChat).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', model: 'gpt-5' }));
  });

  it('sends the selected reasoning effort for every compatible mode', async () => {
    useAIStore.setState({
      providers: {
        openai: { key: 'openai-key', activeModel: 'gpt-5.6-terra', availableModels: ['gpt-5.6-terra'] },
      },
      activeProvider: 'openai',
      modelConfiguration: {
        ...createModelConfiguration(undefined),
        assignments: { build: { providerId: 'openai', modelId: 'gpt-5.6-terra', effort: 'high' } },
      },
    });

    await useAIStore.getState().sendMessage('Build this feature', null, null, 'build');

    expect(mockStreamChat).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'build',
      provider: 'openai',
      model: 'gpt-5.6-terra',
      effort: 'high',
    }));
  });

  it('uses chat model overrides without persisting or changing subagent settings', async () => {
    const configured = createModelConfiguration(undefined);
    configured.assignments.build = { providerId: 'openai', modelId: 'gpt-5.6-terra', effort: 'high' };
    configured.roleAssignments['sdd-apply'] = { providerId: 'openai', modelId: 'gpt-5.6-terra' };
    useAIStore.setState({
      providers: {
        openai: { key: 'openai-key', activeModel: 'gpt-5.6-terra', availableModels: ['gpt-5.6-terra'] },
        anthropic: { key: 'anthropic-key', activeModel: 'claude-sonnet-4-6', availableModels: ['claude-sonnet-4-6'] },
      },
      activeProvider: 'openai',
      modelConfiguration: configured,
      chatModelOverrides: {},
    });

    useAIStore.getState().setChatModelOverride('build', { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
    useAIStore.getState().setChatModelOverrideEffort('build', 'high');
    await useAIStore.getState().sendMessage('Build with fallback model', null, null, 'build');

    expect(mockStreamChat).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      effort: 'high',
    }));
    expect(useAIStore.getState().modelConfiguration.assignments.build).toEqual({
      providerId: 'openai', modelId: 'gpt-5.6-terra', effort: 'high',
    });
    expect(useAIStore.getState().modelConfiguration.roleAssignments['sdd-apply']).toEqual({
      providerId: 'openai', modelId: 'gpt-5.6-terra',
    });
    expect((window as any).api.store.setModelConfiguration).not.toHaveBeenCalled();
  });

  it('persists a mode assignment without changing the active conversation or stream', async () => {
    const activeStream = {
      conversationId: 'conv-1',
      turnId: 'turn-active',
      text: 'Still generating',
      isGenerating: true,
      error: null,
    };
    useAIStore.setState({
      activeConversationId: 'conv-1',
      activeStreams: { 'conv-1': activeStream },
      modelConfiguration: createModelConfiguration(undefined, { openai: 'gpt-4o' }),
    });

    await useAIStore.getState().setModeModelAssignment('review', {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });

    expect((window as any).api.store.setModelConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      assignments: expect.objectContaining({
        review: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
      }),
    }));
    expect(useAIStore.getState().activeConversationId).toBe('conv-1');
    expect(useAIStore.getState().activeStreams['conv-1']).toBe(activeStream);
  });

  it('captures incoming tool and subagent events into active stream and attaches them to message on stream end', async () => {
    await useAIStore.getState().sendMessage('Run subagent task', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    // Receive tool start event
    mockIpcListeners.toolCallback?.({
      conversationId: 'conv-1',
      turnId,
      tool: {
        id: 'subagent-sdd-propose-1',
        name: 'subagent:sdd-propose',
        status: 'start',
        data: {
          role: 'sdd-propose',
          roleName: 'SDD: Propuesta',
          model: 'claude-sonnet-4-6',
        },
      },
    });

    let stream = useAIStore.getState().activeStreams['conv-1'];
    expect(stream.tools).toBeDefined();
    expect(stream.tools).toHaveLength(1);
    expect(stream.tools?.[0].id).toBe('subagent-sdd-propose-1');
    expect(stream.tools?.[0].status).toBe('start');

    // Receive subagent completion tool event
    mockIpcListeners.toolCallback?.({
      conversationId: 'conv-1',
      turnId,
      tool: {
        id: 'subagent-sdd-propose-1',
        name: 'subagent:sdd-propose',
        status: 'end',
        data: {
          role: 'sdd-propose',
          success: true,
          output: 'SDD Proposal generated.',
        },
      },
    });

    stream = useAIStore.getState().activeStreams['conv-1'];
    expect(stream.tools).toHaveLength(1);
    expect(stream.tools?.[0].status).toBe('end');
    expect(stream.tools?.[0].data.output).toBe('SDD Proposal generated.');

    // End stream
    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId,
      chunk: 'All tasks completed successfully.',
    });

    await mockIpcListeners.endCallback?.({
      conversationId: 'conv-1',
      turnId,
      aborted: false,
    });

    const conv = useAIStore.getState().conversations.find(c => c.id === 'conv-1');
    const lastMsg = conv?.messages[conv.messages.length - 1];
    expect(lastMsg?.role).toBe('assistant');
    expect(lastMsg?.tools).toBeDefined();
    expect(lastMsg?.tools?.[0].name).toBe('subagent:sdd-propose');
    expect(lastMsg?.tools?.[0].status).toBe('end');
  });

  it('keeps context budget warnings out of reasoning and stores their structured event', async () => {
    await useAIStore.getState().sendMessage('Bound context', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    mockIpcListeners.contextBoundedCallback?.({
      conversationId: 'conv-1', turnId,
      warning: { modelId: 'minimax-m3', keptItems: 2, removedItems: 1, reason: 'input_budget', omittedExplicitContext: true, omittedHistory: false },
    });

    expect(useAIStore.getState().activeStreams['conv-1'].contextWarning).toMatchObject({ modelId: 'minimax-m3', removedItems: 1 });
    expect(useAIStore.getState().incomingStreamText).toBe('');
  });

  it('batches chunks until a frame and flushes the pending text before persistence', async () => {
    await useAIStore.getState().sendMessage('Batch this', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    mockIpcListeners.chunkCallback?.({ conversationId: 'conv-1', turnId, chunk: 'one ' });
    mockIpcListeners.chunkCallback?.({ conversationId: 'conv-1', turnId, chunk: 'two' });

    expect(useAIStore.getState().activeStreams['conv-1'].text).toBe('');
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    await mockIpcListeners.endCallback?.({ conversationId: 'conv-1', turnId, aborted: false });
    const message = useAIStore.getState().conversations.find(c => c.id === 'conv-1')?.messages.at(-1);
    expect(message?.content).toBe('one two');
    expect(message?.id).toBe(`assistant-conv-1-${turnId}`);
  });
});
