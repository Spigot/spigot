import { getModelEffortCapability } from '../../../shared/modelConfiguration';
import { createChatLogger } from '../../../shared/chatLogger';
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

const chatLog = createChatLogger();

function isMiniMaxM3(provider: string, model: string): boolean {
  return provider.trim().toLowerCase() === 'minimax' && model.trim().toLowerCase() === 'minimax-m3';
}

function reasoningDetailsDeltas(value: unknown, previous: Map<string, string>): string[] {
  const details = Array.isArray(value) ? value : [value];
  const deltas: string[] = [];

  details.forEach((detail, index) => {
    const text = typeof detail === 'string'
      ? detail
      : detail && typeof detail === 'object'
        ? (typeof (detail as Record<string, unknown>).text === 'string'
          ? (detail as Record<string, string>).text
          : typeof (detail as Record<string, unknown>).content === 'string'
            ? (detail as Record<string, string>).content
            : '')
        : '';
    if (!text) return;

    const record = detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
    const key = String(record.index ?? record.id ?? index);
    const prior = previous.get(key) ?? '';
    previous.set(key, text);
    // MiniMax may repeat the cumulative detail or send only the next delta.
    const delta = text.startsWith(prior) ? text.slice(prior.length) : text;
    if (delta) deltas.push(delta);
  });

  return deltas;
}

export class OpenAIAdapter implements AIProviderAdapter {
  readonly id: string;
  private readonly defaultBaseUrl?: string;

  constructor(id: string = 'openai', defaultBaseUrl?: string) {
    this.id = id;
    this.defaultBaseUrl = defaultBaseUrl;
  }

  resolveUrl(provider: string, overrideUrl?: string): string {
    if (overrideUrl) return overrideUrl;
    if (this.defaultBaseUrl) return this.defaultBaseUrl;

    const prov = provider.toLowerCase().trim();
    switch (prov) {
      case 'deepseek':
        return 'https://api.deepseek.com/chat/completions';
      case 'kimi':
        return 'https://api.moonshot.cn/v1/chat/completions';
      case 'qwen':
        return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      case 'minimax':
        return 'https://api.minimax.io/v1/chat/completions';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1/chat/completions';
      default:
        return 'https://api.openai.com/v1/chat/completions';
    }
  }

  sanitizeTools(tools: ToolDefinition[]): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  buildRequest(options: ProviderRequestOptions): ProviderHttpRequest {
    const url = this.resolveUrl(options.provider, options.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
      ...(options.extraHeaders || {}),
    };

    const openaiMessages: any[] = [];
    if (options.systemPrompt) {
      openaiMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const m of options.messages) {
      if (m.tool_results && m.tool_results.length > 0) {
        for (const r of m.tool_results) {
          openaiMessages.push({
            role: 'tool',
            tool_call_id: r.tool_use_id,
            name: r.name,
            content: r.content,
          });
        }
      } else if (m.role === 'tool') {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: m.tool_call_id || '',
          name: m.name,
          content: m.content || '',
        });
      } else if (m.tool_calls && m.tool_calls.length > 0) {
        openaiMessages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input ?? {}),
            },
          })),
        });
      } else {
        openaiMessages.push({
          role: m.role,
          content: m.content ?? '',
        });
      }
    }

    let body: Record<string, unknown> = {
      model: options.model,
      messages: openaiMessages,
      stream: true,
    };

    if (isMiniMaxM3(options.provider, options.model)) {
      body.reasoning_split = true;
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = this.sanitizeTools(options.tools);
      body.tool_choice = 'auto';
    }

    if (options.effort) {
      const capability = getModelEffortCapability({
        providerId: options.provider,
        modelId: options.model,
      });
      if (capability?.payload === 'openai' && capability.levels.includes(options.effort)) {
        body.reasoning_effort = options.effort;
      }
    }

    return { url, headers, body };
  }

  async parseStream(
    response: Response,
    context: StreamTransformContext,
  ): Promise<StreamParseResult> {
    if (!response.body) {
      throw new Error('OpenAI response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let textContent = '';
    let reasoningContent = '';
    let reasoningPartId: string | undefined;
    let textPartId: string | undefined;
    let reasoningPartIndex = 0;
    let textPartIndex = 0;
    const toolCallsMap = new Map<number | string, { id: string; name: string; arguments: string }>();
    const priorReasoningDetails = new Map<string, string>();
    let thinkContentBuffer = '';
    let insideThinkTag = false;
    const diagnostics = {
      receivedFrameCount: 0,
      invalidJsonCount: 0,
      recognizedTextDeltaCount: 0,
      recognizedReasoningDeltaCount: 0,
      recognizedToolDeltaCount: 0,
      finishMarkerCount: 0,
      doneMarkerCount: 0,
      receivedBytes: 0,
    };

    const emitContentDelta = (kind: 'text' | 'reasoning', content: string): void => {
      if (!content) return;

      if (kind === 'reasoning') {
        if (textPartId) {
          emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'end' });
          textPartId = undefined;
        }
        if (!reasoningPartId) {
          reasoningPartId = `reasoning-${reasoningPartIndex++}`;
          emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'start' });
        }
        reasoningContent += content;
        diagnostics.recognizedReasoningDeltaCount++;
        emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'delta', text: content });
        return;
      }

      if (reasoningPartId) {
        emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'end' });
        reasoningPartId = undefined;
      }
      if (!textPartId) {
        textPartId = `text-${textPartIndex++}`;
        emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'start' });
      }
      textContent += content;
      diagnostics.recognizedTextDeltaCount++;
      emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'delta', text: content });
    };

    const normalizeThinkContent = (content: string, flush = false): void => {
      thinkContentBuffer += content;
      while (thinkContentBuffer) {
        const tag = insideThinkTag ? '</think>' : '<think>';
        const lowerBuffer = thinkContentBuffer.toLowerCase();
        const tagIndex = lowerBuffer.indexOf(tag);
        if (tagIndex >= 0) {
          emitContentDelta(insideThinkTag ? 'reasoning' : 'text', thinkContentBuffer.slice(0, tagIndex));
          thinkContentBuffer = thinkContentBuffer.slice(tagIndex + tag.length);
          insideThinkTag = !insideThinkTag;
          continue;
        }

        if (flush) {
          emitContentDelta(insideThinkTag ? 'reasoning' : 'text', thinkContentBuffer);
          thinkContentBuffer = '';
          return;
        }

        let tagPrefixLength = 0;
        const maxPrefixLength = Math.min(tag.length - 1, thinkContentBuffer.length);
        for (let length = maxPrefixLength; length > 0; length--) {
          if (lowerBuffer.endsWith(tag.slice(0, length))) {
            tagPrefixLength = length;
            break;
          }
        }
        const safeContent = thinkContentBuffer.slice(0, thinkContentBuffer.length - tagPrefixLength);
        emitContentDelta(insideThinkTag ? 'reasoning' : 'text', safeContent);
        thinkContentBuffer = thinkContentBuffer.slice(safeContent.length);
        return;
      }
    };

    while (true) {
      if (context.signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      diagnostics.receivedBytes += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6);
        diagnostics.receivedFrameCount++;
        if (dataStr.trim() === '[DONE]') {
          diagnostics.doneMarkerCount++;
          continue;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          if (choice?.finish_reason) diagnostics.finishMarkerCount++;

          const reasoningDeltas = [delta?.reasoning_content, delta?.reasoning]
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
          if (delta?.reasoning_details !== undefined) {
            reasoningDeltas.push(...reasoningDetailsDeltas(delta.reasoning_details, priorReasoningDetails));
          }
          for (const reasoning of reasoningDeltas) {
            emitContentDelta('reasoning', reasoning);
          }

          if (delta?.content) {
            normalizeThinkContent(delta.content);
          }

          if (delta?.tool_calls) {
            if (reasoningPartId) {
              emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'end' });
              reasoningPartId = undefined;
            }
            if (textPartId) {
              emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'end' });
              textPartId = undefined;
            }

            for (let idx = 0; idx < delta.tool_calls.length; idx++) {
              const tc = delta.tool_calls[idx];
              const mapKey = tc.index ?? idx;
              const existing = toolCallsMap.get(mapKey) || {
                id: '',
                name: '',
                arguments: '',
              };

              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;

              toolCallsMap.set(mapKey, existing);
              diagnostics.recognizedToolDeltaCount++;
            }
          }
        } catch {
          diagnostics.invalidJsonCount++;
        }
      }
    }

    normalizeThinkContent('', true);
    if (reasoningPartId) emitStreamPart(context, { partId: reasoningPartId, kind: 'reasoning', lifecycle: 'end' });
    if (textPartId) emitStreamPart(context, { partId: textPartId, kind: 'text', lifecycle: 'end' });

    const toolCalls: ToolCall[] = [];
    for (const item of toolCallsMap.values()) {
      if (item.name) {
        let input: Record<string, any> = {};
        try {
          input = item.arguments ? JSON.parse(item.arguments) : {};
        } catch {
          input = {};
        }
        toolCalls.push({
          id: item.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: item.name,
          input,
        });
      }
    }

    context.onDiagnostics?.(diagnostics);
    chatLog('info', {}, 'provider.stream', 'sse.parsed', diagnostics);

    return {
      textContent,
      reasoningContent: reasoningContent || undefined,
      toolCalls,
    };
  }
}
