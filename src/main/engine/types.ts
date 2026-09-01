import type { ModelConfiguration } from '../../shared/modelConfiguration';
import type { ContextBoundEvent } from '../../shared/contextBudget';
import type { WorkspaceChangeSetService } from '../changes/WorkspaceChangeSetService';

export type EngineMode = 'orchestrator' | 'build' | 'plan' | 'review';
export type EngineModelEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Ordered, lossless assistant output. Text is never encoded as control markup. */
export type AssistantPart = {
  partId: string;
  kind: 'text' | 'reasoning';
  lifecycle: 'start' | 'delta' | 'end';
  ordinal: number;
  conversationId: string;
  turnId: string;
  text?: string;
};

export type EngineTurnRequest = {
  turnId: string;
  sessionId: string;
  mode: EngineMode;
  provider: string;
  model: string;
  apiKey: string;
  effort?: EngineModelEffort;
  prompt: string;
  contextText?: string | null;
  history: unknown[];
  image?: string | null;
  contextSource?: 'default' | 'explicit';
  workspacePath: string;
  signal: AbortSignal;
  fileHistory?: Array<{ path: string; action: 'snapshot' | 'restore' }>;
  modelConfig?: ModelConfiguration;
  providers?: Record<string, { apiKey: string; [key: string]: unknown }>;
  requestToolPermission?: (input: {
    tool: string;
    input: unknown;
  }) => Promise<string | null>;
  changeSetService?: WorkspaceChangeSetService;
  changeSetId?: string;
};

export type EngineEvent =
  | { type: 'content'; turnId: string; text: string }
  | { type: 'part'; turnId: string; part: AssistantPart }
  | {
      type: 'tool';
      turnId: string;
      id: string;
      name: string;
      status: 'start' | 'progress' | 'end';
      data?: unknown;
    }
  | {
      type: 'permission:request';
      turnId: string;
      id: string;
      tool: string;
      input: unknown;
    }
  | {
      type: 'permission:result';
      turnId: string;
      id: string;
      granted: boolean;
    }
  | {
      type: 'history:file';
      turnId: string;
      path: string;
      action: 'snapshot' | 'restore';
    }
  | { type: 'bridge'; turnId: string; name: string; data: unknown }
  | { type: 'context:bounded'; turnId: string; data: ContextBoundEvent }
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
  channel: 'ai:stream-chunk' | 'ai:stream-part' | 'ai:stream-error' | 'ai:stream-end' | 'ai:stream-tool' | 'ai:context-bounded' | null;
  payload: unknown;
} {
  switch (event.type) {
    case 'content':
      return { channel: 'ai:stream-chunk', payload: event.text };
    case 'part':
      return { channel: 'ai:stream-part', payload: event.part };
    case 'tool':
      return {
        channel: 'ai:stream-tool',
        payload: {
          id: event.id,
          name: event.name,
          status: event.status,
          data: event.data,
        },
      };
    case 'error':
      return { channel: 'ai:stream-error', payload: event.message };
    case 'end':
      return { channel: 'ai:stream-end', payload: Boolean(event.aborted) };
    case 'context:bounded':
      return { channel: 'ai:context-bounded', payload: event.data };
    default:
      return { channel: null, payload: event };
  }
}
