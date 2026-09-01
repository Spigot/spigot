import { emitStreamPart } from './types';
import type {
  AIProviderAdapter,
  ProviderHttpRequest,
  ProviderRequestOptions,
  StreamParseResult,
  StreamTransformContext,
  ToolCall,
  ToolDefinition,
} from './types';

/**
 * Sanitizes JSON Schema for Google Gemini Function Declarations by stripping
 * keywords unsupported by Gemini (like $schema, additionalProperties, default, etc.)
 */
export function sanitizeGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(sanitizeGeminiSchema);
  }

  const {
    $schema,
    additionalProperties,
    default: _def,
    definitions,
    patternProperties,
    ...rest
  } = schema;

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (key === 'properties' && value && typeof value === 'object') {
      const sanitizedProps: Record<string, any> = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, any>)) {
        sanitizedProps[propKey] = sanitizeGeminiSchema(propVal);
      }
      sanitized[key] = sanitizedProps;
    } else if (key === 'items' && value) {
      sanitized[key] = sanitizeGeminiSchema(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export class GeminiAdapter implements AIProviderAdapter {
  readonly id = 'gemini';

  sanitizeTools(tools: ToolDefinition[]): Array<{
    functionDeclarations: Array<{
      name: string;
      description: string;
      parameters: Record<string, any>;
    }>;
  }> {
    return [
      {
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: sanitizeGeminiSchema(t.parameters),
        })),
      },
    ];
  }

  buildRequest(options: ProviderRequestOptions): ProviderHttpRequest {
    const baseUrl =
      options.baseUrl ||
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?key=${options.apiKey}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.extraHeaders || {}),
    };

    const contents: any[] = [];

    for (const m of options.messages) {
      if (m.tool_results && m.tool_results.length > 0) {
        contents.push({
          role: 'user',
          parts: m.tool_results.map(r => ({
            functionResponse: {
              name: r.name,
              response: { result: r.content },
            },
          })),
        });
      } else if (m.tool_calls && m.tool_calls.length > 0) {
        const parts: any[] = [];
        if (m.content) {
          parts.push({ text: m.content });
        }
        for (const tc of m.tool_calls) {
          let argsObj = tc.input;
          if (typeof argsObj === 'string') {
            try {
              argsObj = JSON.parse(argsObj);
            } catch {
              argsObj = {};
            }
          }
          parts.push({
            functionCall: {
              name: tc.name,
              args: argsObj ?? {},
            },
          });
        }
        contents.push({
          role: 'model',
          parts,
        });
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content ?? '' }],
        });
      }
    }

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }],
      },
      contents,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = this.sanitizeTools(options.tools);
    }

    return { url: baseUrl, headers, body };
  }

  async parseStream(
    response: Response,
    context: StreamTransformContext,
  ): Promise<StreamParseResult> {
    if (!response.body) {
      throw new Error('Gemini response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let textContent = '';
    let textPartId: string | undefined;
    const toolCalls: ToolCall[] = [];

    while (true) {
      if (context.signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const cleanLine = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
          if (cleanLine.trim() === '[DONE]') continue;

          const parsed = JSON.parse(cleanLine);
          // Can be array or single object with candidates
          const candidate = Array.isArray(parsed)
            ? parsed[0]?.candidates?.[0]
            : parsed.candidates?.[0];
          const parts = candidate?.content?.parts;

          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part?.text) {
                if (!textPartId) {
                  textPartId = 'text-0';
                  emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'start' });
                }
                textContent += part.text;
                emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'delta', text: part.text });
              }
              if (part?.functionCall) {
                toolCalls.push({
                  id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: part.functionCall.name,
                  input: part.functionCall.args || {},
                });
              }
            }
          }
        } catch {
          // Ignore partial line parses
        }
      }
    }

    if (textPartId) emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'end' });

    return {
      textContent,
      toolCalls,
    };
  }
}
