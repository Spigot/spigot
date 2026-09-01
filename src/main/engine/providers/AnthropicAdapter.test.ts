import { describe, expect, it } from 'vitest';
import { AnthropicAdapter } from './AnthropicAdapter';
import type { ProviderRequestOptions, ToolDefinition } from './types';

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter();

  const sampleTools: ToolDefinition[] = [
    {
      name: 'write_file',
      description: 'Write file content',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['filePath', 'content'],
      },
    },
  ];

  it('builds Anthropic messages request with system prompt separation and input_schema', () => {
    const options: ProviderRequestOptions = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'anthropic-key',
      prompt: 'Write code',
      systemPrompt: 'System directives',
      messages: [{ role: 'user', content: 'Write code' }],
      tools: sampleTools,
    };

    const req = adapter.buildRequest(options);

    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe('anthropic-key');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');

    const body = req.body as any;
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.system).toBe('System directives');
    expect(body.tools[0].input_schema).toEqual(sampleTools[0].parameters);
  });

  it('applies output_config.effort for supported models (e.g. claude-opus-4-6)', () => {
    const options: ProviderRequestOptions = {
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      apiKey: 'anthropic-key',
      prompt: 'Deep reasoning',
      systemPrompt: 'System',
      messages: [{ role: 'user', content: 'Deep reasoning' }],
      effort: 'max',
    };

    const req = adapter.buildRequest(options);
    const body = req.body as any;
    expect(body.output_config).toEqual({ effort: 'max' });
  });

  it('formats tool calls and tool results into Anthropic content blocks', () => {
    const options: ProviderRequestOptions = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'key',
      prompt: '',
      systemPrompt: 'System',
      messages: [
        { role: 'user', content: 'Write file' },
        {
          role: 'assistant',
          content: 'Creating file...',
          tool_calls: [{ id: 'toolu_1', name: 'write_file', input: { filePath: 'test.txt', content: 'abc' } }],
        },
        {
          role: 'user',
          tool_results: [{ tool_use_id: 'toolu_1', name: 'write_file', content: 'Success' }],
        },
      ],
    };

    const req = adapter.buildRequest(options);
    const body = req.body as any;

    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Creating file...' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'write_file',
          input: { filePath: 'test.txt', content: 'abc' },
        },
      ],
    });

    expect(body.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: 'Success',
        },
      ],
    });
  });

  it('parses Anthropic SSE stream events including tool use', async () => {
    const streamData = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I will "}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"write."}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_99","name":"write_file"}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"filePath\\":\\"foo.ts\\""}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":",\\"content\\":\\"code\\"}"}}\n\n',
      'data: {"type":"content_block_stop","index":1}\n\n',
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

    expect(result.textContent).toBe('I will write.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      id: 'toolu_99',
      name: 'write_file',
      input: { filePath: 'foo.ts', content: 'code' },
    });
  });
});
