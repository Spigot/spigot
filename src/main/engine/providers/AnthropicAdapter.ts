import { getModelEffortCapability } from '../../../shared/modelConfiguration';
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

export class AnthropicAdapter implements AIProviderAdapter {
  readonly id = 'anthropic';

  sanitizeTools(tools: ToolDefinition[]): Array<{
    name: string;
    description: string;
    input_schema: Record<string, any>;
  }> {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  buildRequest(options: ProviderRequestOptions): ProviderHttpRequest {
    const url = options.baseUrl || 'https://api.anthropic.com/v1/messages';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      ...(options.extraHeaders || {}),
    };

    const anthropicMessages: any[] = options.messages.map(m => {
      if (m.tool_results && m.tool_results.length > 0) {
        return {
          role: 'user',
          content: m.tool_results.map(r => ({
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        };
      }

      if (m.tool_calls && m.tool_calls.length > 0) {
        const contentParts: any[] = [];
        if (m.content) {
          contentParts.push({ type: 'text', text: m.content });
        }
        for (const tc of m.tool_calls) {
          let inputObj = tc.input;
          if (typeof inputObj === 'string') {
            try {
              inputObj = JSON.parse(inputObj);
            } catch {
              inputObj = {};
            }
          }
          contentParts.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: inputObj ?? {},
          });
        }
        return {
          role: 'assistant',
          content: contentParts,
        };
      }

      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content ?? '',
      };
    });

    let body: Record<string, unknown> = {
      model: options.model,
      system: options.systemPrompt,
      messages: anthropicMessages,
      max_tokens: 4000,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = this.sanitizeTools(options.tools);
    }

    if (options.effort) {
      const capability = getModelEffortCapability({
        providerId: options.provider,
        modelId: options.model,
      });
      if (capability?.payload === 'anthropic' && capability.levels.includes(options.effort)) {
        body.output_config = { effort: options.effort };
      }
    }

    return { url, headers, body };
  }

  async parseStream(
    response: Response,
    context: StreamTransformContext,
  ): Promise<StreamParseResult> {
    if (!response.body) {
      throw new Error('Anthropic response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let textContent = '';
    let reasoningContent = '';
    let reasoningPartId: string | undefined;
    let textPartId: string | undefined;
    const toolCalls: ToolCall[] = [];
    let currentToolCall: { id: string; name: string; inputJson: string } | null = null;

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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr.trim() === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);

          if (parsed.type === 'content_block_start') {
            if (parsed.content_block?.type === 'tool_use') {
              currentToolCall = {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                inputJson: '',
              };
            } else if (parsed.content_block?.type === 'thinking') {
              reasoningPartId = `reasoning-${parsed.index ?? 0}`;
              emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'start' });
            }
          } else if (parsed.type === 'content_block_delta') {
            const delta = parsed.delta;
            if (delta?.type === 'text_delta' || delta?.text) {
              const text = delta.text || '';
              if (!textPartId) {
                textPartId = `text-${parsed.index ?? 0}`;
                emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'start' });
              }
              textContent += text;
              emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'delta', text });
            } else if (delta?.type === 'thinking_delta' || delta?.thinking) {
              const think = delta.thinking || '';
              if (!reasoningPartId) {
                reasoningPartId = `reasoning-${parsed.index ?? 0}`;
                emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'start' });
              }
              reasoningContent += think;
              emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'delta', text: think });
            } else if (delta?.type === 'input_json_delta' || delta?.partial_json) {
              if (currentToolCall) {
                currentToolCall.inputJson += delta.partial_json || '';
              }
            }
          } else if (parsed.type === 'content_block_stop') {
            if (currentToolCall) {
              let parsedInput: Record<string, any> = {};
              try {
                parsedInput = currentToolCall.inputJson ? JSON.parse(currentToolCall.inputJson) : {};
              } catch {
                parsedInput = {};
              }
              toolCalls.push({
                id: currentToolCall.id,
                name: currentToolCall.name,
                input: parsedInput,
              });
              currentToolCall = null;
            } else if (reasoningPartId) {
              emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'end' });
              reasoningPartId = undefined;
            } else if (textPartId) {
              emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'end' });
              textPartId = undefined;
            }
          }
        } catch {
          // Ignore JSON parse errors on stream deltas
        }
      }
    }

    if (reasoningPartId) emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'end' });
    if (textPartId) emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'end' });

    if (currentToolCall) {
      let parsedInput: Record<string, any> = {};
      try {
        parsedInput = currentToolCall.inputJson ? JSON.parse(currentToolCall.inputJson) : {};
      } catch {
        parsedInput = {};
      }
      toolCalls.push({
        id: currentToolCall.id,
        name: currentToolCall.name,
        input: parsedInput,
      });
      currentToolCall = null;
    }

    return {
      textContent,
      reasoningContent: reasoningContent || undefined,
      toolCalls,
    };
  }
}
