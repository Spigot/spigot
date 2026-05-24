export type EngineMode = 'chat' | 'agent';

export type EngineTurnRequest = {
  turnId: string;
  sessionId: string;
  mode: EngineMode;
  provider: string;
  model: string;
  apiKey: string;
  prompt: string;
  contextText?: string | null;
  history: unknown[];
  image?: string | null;
  workspacePath: string;
  signal: AbortSignal;
};

export type EngineEvent =
  | { type: 'content'; turnId: string; text: string }
  | {
      type: 'tool';
      turnId: string;
      id: string;
      name: string;
      status: 'start' | 'progress' | 'end';
      data?: unknown;
    }
  | { type: 'bridge'; turnId: string; name: string; data: unknown }
  | { type: 'end'; turnId: string; aborted?: boolean }
  | { type: 'error'; turnId: string; message: string };

export type EngineEventListener = (event: EngineEvent) => void;

export function normalizeEngineEvents(events: EngineEvent[]): EngineEvent[] {
  const normalized: EngineEvent[] = [];
  let sawTerminal = false;

  for (const event of events) {
    if (sawTerminal) {
      continue;
    }

    normalized.push(event);
    if (event.type === 'end' || event.type === 'error') {
      sawTerminal = true;
    }
  }

  return normalized;
}

export function mapEngineEventToIpc(event: EngineEvent): {
  channel: 'ai:stream-chunk' | 'ai:stream-error' | 'ai:stream-end' | null;
  payload: unknown;
} {
  switch (event.type) {
    case 'content':
      return { channel: 'ai:stream-chunk', payload: event.text };
    case 'error':
      return { channel: 'ai:stream-error', payload: event.message };
    case 'end':
      return { channel: 'ai:stream-end', payload: Boolean(event.aborted) };
    default:
      return { channel: null, payload: event };
  }
}
