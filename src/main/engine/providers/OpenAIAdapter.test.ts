import { describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from './OpenAIAdapter';
import type { ProviderRequestOptions, ToolDefinition } from './types';

describe('OpenAIAdapter', () => {
  const adapter = new OpenAIAdapter();

  const sampleTools: ToolDefinition[] = [
    {
      name: 'read_file',
      description: 'Read file content',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
        },
        required: ['filePath'],
      },
    },
  ];

  it('builds standard OpenAI request with tools and system prompt', () => {
    const options: ProviderRequestOptions = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
      prompt: 'Hello',
      systemPrompt: 'You are an assistant',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: sampleTools,
    };

    const req = adapter.buildRequest(options);

    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers['Authorization']).toBe('Bearer test-key');
    expect(req.headers['Content-Type']).toBe('application/json');

    const body = req.body as any;
    expect(body.model).toBe('gpt-4o');
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are an assistant' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].type).toBe('function');
    expect(body.tools[0].function.name).toBe('read_file');
  });

  it('applies reasoning_effort for supported models (e.g. gpt-5)', () => {
    const options: ProviderRequestOptions = {
      provider: 'openai',
      model: 'gpt-5',
      apiKey: 'test-key',
      prompt: 'Think hard',
      systemPrompt: 'System',
      messages: [{ role: 'user', content: 'Think hard' }],
      effort: 'high',
    };

    const req = adapter.buildRequest(options);
    const body = req.body as any;
    expect(body.reasoning_effort).toBe('high');
  });

  it('formats tool calls and tool results into OpenAI format', () => {
    const options: ProviderRequestOptions = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
      prompt: '',
      systemPrompt: 'System',
      messages: [
        { role: 'user', content: 'Read a file' },
        {
          role: 'assistant',
          content: 'Reading...',
          tool_calls: [{ id: 'call_123', name: 'read_file', input: { filePath: 'foo.ts' } }],
        },
        {
          role: 'user',
          tool_results: [{ tool_use_id: 'call_123', name: 'read_file', content: 'file content' }],
        },
      ],
    };

    const req = adapter.buildRequest(options);
    const body = req.body as any;

    expect(body.messages[0]).toEqual({ role: 'system', content: 'System' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Read a file' });
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: 'Reading...',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: JSON.stringify({ filePath: 'foo.ts' }),
          },
        },
      ],
    });

    expect(body.messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_123',
      name: 'read_file',
      content: 'file content',
    });
  });

  it('enables MiniMax reasoning split only for the normalized MiniMax-M3 capability', () => {
    const minimax = adapter.buildRequest({
      provider: ' MiniMax ', model: ' minimax-m3 ', apiKey: 'test-key', prompt: 'Hello', systemPrompt: '', messages: [],
    });
    const otherMiniMax = adapter.buildRequest({
      provider: 'minimax', model: 'MiniMax-M2.7', apiKey: 'test-key', prompt: 'Hello', systemPrompt: '', messages: [],
    });
    const otherProvider = adapter.buildRequest({
      provider: 'openai', model: 'MiniMax-M3', apiKey: 'test-key', prompt: 'Hello', systemPrompt: '', messages: [],
    });

    expect(minimax.body).toMatchObject({ reasoning_split: true });
    expect(minimax.body).not.toHaveProperty('extra_body');
    expect(otherMiniMax.body).not.toHaveProperty('reasoning_split');
    expect(otherProvider.body).not.toHaveProperty('reasoning_split');
  });

  it('parses SSE stream chunks including reasoning and tool calls', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking steps..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Here is "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"the answer."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"read_file","arguments":"{\\"file"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Path\\":\\"test.ts\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(streamData));
        controller.close();
      },
    });

    const response = new Response(responseStream);
    const chunks: string[] = [];
    const result = await adapter.parseStream(response, {
      sendChunk: (chunk: string) => chunks.push(chunk),
    });

    expect(result.reasoningContent).toBe('Thinking steps...');
    expect(result.textContent).toBe('Here is the answer.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      id: 'call_abc',
      name: 'read_file',
      input: { filePath: 'test.ts' },
    });
  });

  it('parses MiniMax content and cumulative reasoning_details without duplicating output', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"reasoning_details":[{"index":0,"text":"Plan"}]}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_details":[{"index":0,"text":"Plan the fix"}]}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Fixed "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"response."},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const parts: Array<{ kind: string; lifecycle: string; text?: string }> = [];
    const diagnostics: unknown[] = [];
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamData));
        controller.close();
      },
    }));

    const result = await adapter.parseStream(response, {
      sendChunk: vi.fn(),
      onPart: part => parts.push(part),
      onDiagnostics: value => diagnostics.push(value),
    });

    expect(result.reasoningContent).toBe('Plan the fix');
    expect(result.textContent).toBe('Fixed response.');
    expect(parts.filter(part => part.kind === 'reasoning' && part.lifecycle === 'delta').map(part => part.text)).toEqual(['Plan', ' the fix']);
    expect(parts.some(part => part.text?.includes('<think>'))).toBe(false);
    expect(diagnostics).toEqual([expect.objectContaining({ receivedFrameCount: 5, recognizedReasoningDeltaCount: 2, recognizedTextDeltaCount: 2, finishMarkerCount: 1, doneMarkerCount: 1 })]);
  });

  it('separates fragmented MiniMax-M3 think tags from content without exposing the tags', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Visible <thi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"nk>plan"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ning</th"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ink> answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const parts: Array<{ kind: string; lifecycle: string; text?: string }> = [];
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamData));
        controller.close();
      },
    }));

    const result = await adapter.parseStream(response, {
      sendChunk: vi.fn(),
      provider: 'minimax',
      model: 'MiniMax-M3',
      onPart: part => parts.push(part),
    });

    expect(result.reasoningContent).toBe('planning');
    expect(result.textContent).toBe('Visible  answer');
    expect(parts.filter(part => part.kind === 'reasoning' && part.lifecycle === 'delta').map(part => part.text).join('')).toBe('planning');
    expect(parts.filter(part => part.kind === 'text' && part.lifecycle === 'delta').map(part => part.text).join('')).toBe('Visible  answer');
    expect(parts.some(part => part.text?.includes('<think>') || part.text?.includes('</think>'))).toBe(false);
  });

  it('accepts tool-only streams and logs metadata without frame contents', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"filePath\\":\\"private.txt\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamData));
        controller.close();
      },
    }));

    const result = await adapter.parseStream(response, { sendChunk: vi.fn() });
    const logText = info.mock.calls.map(call => JSON.stringify(call)).join('\n');
    info.mockRestore();

    expect(result.textContent).toBe('');
    expect(result.reasoningContent).toBeUndefined();
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'read_file', input: { filePath: 'private.txt' } }]);
    expect(logText).toContain('recognizedToolDeltaCount');
    expect(logText).not.toContain('private.txt');
    expect(logText).not.toContain('arguments');
  });
});
