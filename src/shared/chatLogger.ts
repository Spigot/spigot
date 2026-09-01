export type ChatLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ChatLogContext = Readonly<{
  conversationId?: string;
  turnId?: string;
  mode?: string;
  providerModelId?: string;
  startedAt?: number;
}>;

export type ChatLogRecord = Readonly<{
  conversationId: string | null;
  turnId: string | null;
  mode: string | null;
  providerModelId: string | null;
  phase: string;
  eventType: string;
  elapsedMs: number | null;
  metrics: Record<string, number | boolean | null>;
}>;

type ConsoleLike = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

const levels: Record<ChatLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitiveKey = /(?:api[_-]?key|authorization|token|secret|password|prompt|context|content|output|path)/i;
const safeMetricSuffix = /(?:bytes|count|length|present)$/i;

export function resolveChatLogLevel(value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SPIGOT_CHAT_LOG_LEVEL): ChatLogLevel {
  return value?.toLowerCase() === 'debug' ? 'debug' : value?.toLowerCase() === 'warn' ? 'warn' : value?.toLowerCase() === 'error' ? 'error' : 'info';
}

export function safeChatMetrics(metrics: Record<string, unknown> = {}): Record<string, number | boolean | null> {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key,
    sensitiveKey.test(key) && !safeMetricSuffix.test(key) ? null : typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'boolean' ? value : null,
  ]));
}

export function createChatLogger(options: { level?: ChatLogLevel; console?: ConsoleLike; now?: () => number } = {}) {
  const level = options.level ?? resolveChatLogLevel();
  const target = options.console ?? console;
  const now = options.now ?? Date.now;

  return (severity: ChatLogLevel, context: ChatLogContext, phase: string, eventType: string, metrics?: Record<string, unknown>): ChatLogRecord | undefined => {
    if (levels[severity] < levels[level]) return undefined;
    const record: ChatLogRecord = {
      conversationId: context.conversationId ?? null,
      turnId: context.turnId ?? null,
      mode: context.mode ?? null,
      providerModelId: context.providerModelId ?? null,
      phase,
      eventType,
      elapsedMs: context.startedAt === undefined ? null : Math.max(0, now() - context.startedAt),
      metrics: safeChatMetrics(metrics),
    };
    target[severity](`[chat] ${JSON.stringify(record)}`);
    return record;
  };
}
