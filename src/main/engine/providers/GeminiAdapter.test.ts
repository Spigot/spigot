import { describe, expect, it } from 'vitest';
import { GeminiAdapter, sanitizeGeminiSchema } from './GeminiAdapter';
import type { ProviderRequestOptions, ToolDefinition } from './types';

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter();

  it('sanitizes unsupported JSON schema keys for Gemini', () => {
    const rawSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        dirPath: {
          type: 'string',
          description: 'Directory path',
          default: '.',
        },
      },
      required: ['dirPath'],
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);
    expect(sanitized.$schema).toBeUndefined();
    expect(sanitized.additionalProperties).toBeUndefined();
    expect(sanitized.properties.dirPath.default).toBeUndefined();
    expect(sanitized.properties.dirPath.type).toBe('string');
    expect(sanitized.required).toEqual(['dirPath']);
  });

  it('builds Gemini request with systemInstruction and contents.parts', () => {
    const sampleTools: ToolDefinition[] = [
      {
        name: 'list_dir',
        description: 'List dir',
        parameters: {
          type: 'object',
          properties: {
            dirPath: { type: 'string' },
          },
        },
      },
    ];

    const options: ProviderRequestOptions = {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      apiKey: 'gemini-key',
      prompt: 'List directory',
      systemPrompt: 'System instruction',
      messages: [{ role: 'user', content: 'List directory' }],
      tools: sampleTools,
    };

    const req = adapter.buildRequest(options);

    expect(req.url).toContain('gemini-2.5-pro:streamGenerateContent');
    expect(req.url).toContain('key=gemini-key');

    const body = req.body as any;
    expect(body.systemInstruction.parts[0].text).toBe('System instruction');
    expect(body.contents[0]).toEqual({
      role: 'user',
      parts: [{ text: 'List directory' }],
    });
    expect(body.tools[0].functionDeclarations[0].name).toBe('list_dir');
  });

  it('formats tool calls and functionResponse for Gemini contents', () => {
    const options: ProviderRequestOptions = {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      apiKey: 'key',
      prompt: '',
      systemPrompt: 'System',
      messages: [
        { role: 'user', content: 'Read foo.txt' },
        {
          role: 'assistant',
          content: 'Reading file...',
          tool_calls: [{ id: 'gemini_call', name: 'read_file', input: { filePath: 'foo.txt' } }],
        },
        {
          role: 'user',
          tool_results: [{ tool_use_id: 'gemini_call', name: 'read_file', content: 'file content' }],
        },
      ],
    };

    const req = adapter.buildRequest(options);
    const body = req.body as any;

    expect(body.contents[1]).toEqual({
      role: 'model',
      parts: [
        { text: 'Reading file...' },
        {
          functionCall: {
            name: 'read_file',
            args: { filePath: 'foo.txt' },
          },
        },
      ],
    });

    expect(body.contents[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'read_file',
            response: { result: 'file content' },
          },
        },
      ],
    });
  });

  it('parses Gemini SSE / JSON stream response', async () => {
    const streamData = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Analyzing codebase..."}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"list_dir","args":{"dirPath":"src"}}}]}}]}\n\n',
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

    expect(result.textContent).toBe('Analyzing codebase...');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('list_dir');
    expect(result.toolCalls[0].input).toEqual({ dirPath: 'src' });
  });
});
