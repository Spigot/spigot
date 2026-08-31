import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useAIStore } from './aiStore';

describe('useAIStore - Session and Turn Isolation', () => {
  let mockIpcListeners: {
    chunkCallback?: (payload: any) => void;
    errorCallback?: (payload: any) => void;
    endCallback?: (payload: any) => void;
  };
  let mockStreamChat: any;
  let mockAbortChat: any;
  let mockSetChatHistory: any;

  beforeEach(() => {
    mockIpcListeners = {};
    mockStreamChat = vi.fn().mockResolvedValue(true);
    mockAbortChat = vi.fn();
    mockSetChatHistory = vi.fn().mockResolvedValue(undefined);

    (window as any).api = {
      ai: {
        streamChat: mockStreamChat,
        abortChat: mockAbortChat,
        onChunk: vi.fn((cb: any) => {
          mockIpcListeners.chunkCallback = cb;
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
        getChatHistory: vi.fn().mockResolvedValue([]),
        setChatHistory: mockSetChatHistory,
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

  it('isolates incoming stream chunks to the target conversation when user switches to another conversation', async () => {
    await useAIStore.getState().sendMessage('Task in conv 1', null);
    const turnId = useAIStore.getState().activeStreams['conv-1'].turnId;

    // Send first chunk for conv-1 while active
    mockIpcListeners.chunkCallback?.({
      conversationId: 'conv-1',
      turnId,
      chunk: 'Part 1. ',
    });

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

    // Conv-2 remains completely clean
    expect(useAIStore.getState().incomingStreamText).toBe('');
    expect(useAIStore.getState().isGenerating).toBe(false);
    expect(useAIStore.getState().activeStreams['conv-1'].text).toBe('Part 1. Part 2.');

    // User switches back to Conversation 1
    useAIStore.getState().selectConversation('conv-1');
    expect(useAIStore.getState().incomingStreamText).toBe('Part 1. Part 2.');
    expect(useAIStore.getState().isGenerating).toBe(true);
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
});
