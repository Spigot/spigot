import type { ModelEffort } from '../../../shared/modelConfiguration';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any> | string;
}

export interface ToolResult {
  tool_use_id: string;
  name: string;
  content: string;
}

export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  tool_call_id?: string;
  name?: string;
}

export interface ProviderRequestOptions {
  provider: string;
  model: string;
  apiKey: string;
  prompt: string;
  systemPrompt: string;
  messages: UnifiedMessage[];
  tools?: ToolDefinition[];
  effort?: ModelEffort;
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
  baseUrl?: string;
}

export interface ProviderHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface NormalizedStreamChunk {
  type: 'text' | 'reasoning' | 'tool_call' | 'error' | 'done';
  text?: string;
  reasoning?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface StreamTransformContext {
  /** Deprecated compatibility sink for string-only consumers. */
  sendChunk: (chunk: string) => void;
  /** Identifies provider-specific wire-format normalization for this stream. */
  provider?: string;
  model?: string;
  signal?: AbortSignal;
  onReasoningDelta?: (delta: string) => void;
  onTextDelta?: (delta: string) => void;
  onPart?: (part: ProviderStreamPart) => void;
  onDiagnostics?: (diagnostics: StreamDiagnostics) => void;
}

/** Metadata-only stream telemetry. It must never contain frame or model output text. */
export type StreamDiagnostics = Readonly<{
  receivedFrameCount: number;
  invalidJsonCount: number;
  recognizedTextDeltaCount: number;
  recognizedReasoningDeltaCount: number;
  recognizedToolDeltaCount: number;
  finishMarkerCount: number;
  doneMarkerCount: number;
  receivedBytes: number;
}>;

export type ProviderStreamPart = {
  partId: string;
  kind: 'text' | 'reasoning';
  lifecycle: 'start' | 'delta' | 'end';
  text?: string;
};

/** Emits typed output and only falls back to legacy strings when no typed sink exists. */
export function emitStreamPart(context: StreamTransformContext, part: ProviderStreamPart): void {
  context.onPart?.(part);
  if (part.lifecycle !== 'delta' || !part.text) return;
  if (part.kind === 'reasoning') context.onReasoningDelta?.(part.text);
  else context.onTextDelta?.(part.text);
  if (!context.onPart) context.sendChunk(part.text);
}

export interface StreamParseResult {
  /** Provider-wire assistant text, retained for continuation history when UI text is normalized. */
  originalContent?: string;
  textContent: string;
  reasoningContent?: string;
  toolCalls: ToolCall[];
}

export interface ToolSchemaSanitizer {
  sanitize(tools: ToolDefinition[]): unknown;
}

export interface AIProviderAdapter {
  readonly id: string;
  buildRequest(options: ProviderRequestOptions): ProviderHttpRequest;
  parseStream(
    response: Response,
    context: StreamTransformContext
  ): Promise<StreamParseResult>;
  sanitizeTools?(tools: ToolDefinition[]): unknown;
}
