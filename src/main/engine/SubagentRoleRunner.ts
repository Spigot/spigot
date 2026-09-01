import { randomUUID } from 'crypto';
import {
  type GentleRoleId,
  type ModelAssignment,
  type ModelConfiguration,
  type ModelEffort,
  getAssignmentEffort,
  resolveRoleAssignment,
} from '../../shared/modelConfiguration';
import {
  type AgentRunOptions,
  TOOLS,
  runAgentLoop,
} from '../agentRunner';
import {
  getRoleDefinition,
  getRolePrompt,
  getToolsForRole,
} from './rolePrompts';
import type { EngineEventListener } from './types';

export type SubagentDispatchOptions = {
  role: GentleRoleId;
  input: string;
  contextText?: string | null;
  history?: unknown[];
  workspaceRoot: string;
  modelConfig?: ModelConfiguration;
  fallbackAssignment?: ModelAssignment;
  providers?: Record<string, { apiKey: string; [key: string]: unknown }>;
  apiKey?: string;
  signal?: AbortSignal;
  turnId?: string;
  sessionId?: string;
  onEvent?: EngineEventListener;
  agentRunner?: (options: AgentRunOptions) => Promise<boolean>;
};

export type SubagentDispatchResult = {
  success: boolean;
  role: GentleRoleId;
  output: string;
  error?: string;
  modelUsed: {
    provider: string;
    model: string;
    effort?: ModelEffort;
  };
};

export const DEFAULT_SUBAGENT_FALLBACK_ASSIGNMENT: ModelAssignment = {
  providerId: 'anthropic',
  modelId: 'claude-sonnet-4-6',
};

export class SubagentRoleRunner {
  private readonly defaultFallback: ModelAssignment;

  constructor(
    private readonly defaultOptions: {
      modelConfig?: ModelConfiguration;
      providers?: Record<string, { apiKey: string; [key: string]: unknown }>;
      defaultFallback?: ModelAssignment;
      agentRunner?: (options: AgentRunOptions) => Promise<boolean>;
    } = {},
  ) {
    this.defaultFallback = defaultOptions.defaultFallback ?? DEFAULT_SUBAGENT_FALLBACK_ASSIGNMENT;
  }

  resolveRoleModel(
    role: GentleRoleId,
    overrideConfig?: ModelConfiguration,
    overrideFallback?: ModelAssignment,
  ): { assignment: ModelAssignment; effort?: ModelEffort } {
    const config = overrideConfig ?? this.defaultOptions.modelConfig;
    const fallback = overrideFallback ?? this.defaultFallback;

    const resolved = config
      ? resolveRoleAssignment(config, role, fallback)
      : fallback;

    const assignment = resolved ?? fallback;
    const effort = getAssignmentEffort(assignment);

    return {
      assignment,
      effort,
    };
  }

  resolveApiKey(
    providerId: string,
    customApiKey?: string,
    providersMap?: Record<string, { apiKey: string; [key: string]: unknown }>,
  ): string | undefined {
    if (customApiKey && customApiKey.trim()) {
      return customApiKey.trim();
    }
    const map = providersMap ?? this.defaultOptions.providers;
    const key = map?.[providerId]?.apiKey;
    return typeof key === 'string' && key.trim() ? key.trim() : undefined;
  }

  async dispatchSubagent(options: SubagentDispatchOptions): Promise<SubagentDispatchResult> {
    const turnId = options.turnId || randomUUID();
    const roleDef = getRoleDefinition(options.role);
    const subagentToolId = `subagent-${options.role}-${turnId}`;

    const { assignment, effort } = this.resolveRoleModel(
      options.role,
      options.modelConfig,
      options.fallbackAssignment,
    );

    const apiKey = this.resolveApiKey(assignment.providerId, options.apiKey, options.providers);
    if (!apiKey) {
      const errorMsg = `No API key configured for provider "${assignment.providerId}" required by subagent role "${options.role}".`;
      options.onEvent?.({
        type: 'tool',
        turnId,
        id: subagentToolId,
        name: `subagent:${options.role}`,
        status: 'end',
        data: {
          role: options.role,
          roleName: roleDef.name,
          group: roleDef.group,
          provider: assignment.providerId,
          model: assignment.modelId,
          effort,
          success: false,
          error: errorMsg,
        },
      });
      options.onEvent?.({
        type: 'error',
        turnId,
        message: errorMsg,
      });
      options.onEvent?.({
        type: 'end',
        turnId,
        aborted: false,
      });
      return {
        success: false,
        role: options.role,
        output: '',
        error: errorMsg,
        modelUsed: {
          provider: assignment.providerId,
          model: assignment.modelId,
          effort,
        },
      };
    }

    const runner = options.agentRunner ?? this.defaultOptions.agentRunner ?? runAgentLoop;
    const scopedTools = getToolsForRole(options.role, TOOLS);
    const systemPrompt = getRolePrompt(options.role);

    let outputText = '';
    let errorMessage: string | undefined;

    options.onEvent?.({
      type: 'tool',
      turnId,
      id: subagentToolId,
      name: `subagent:${options.role}`,
      status: 'start',
      data: {
        role: options.role,
        roleName: roleDef.name,
        group: roleDef.group,
        provider: assignment.providerId,
        model: assignment.modelId,
        effort,
        input: options.input,
      },
    });

    const runSignal = options.signal ?? new AbortController().signal;

    try {
      const success = await runner({
        role: options.role,
        provider: assignment.providerId,
        model: assignment.modelId,
        apiKey,
        effort,
        prompt: options.input,
        contextText: options.contextText ?? null,
        history: (options.history as any[]) ?? [],
        image: null,
        workspacePath: options.workspaceRoot,
        customTools: scopedTools,
        customSystemPrompt: systemPrompt,
        modelConfig: options.modelConfig,
        providers: options.providers,
        onEvent: options.onEvent,
        turnId,
        sessionId: options.sessionId,
        sendChunk: (chunk: string) => {
          outputText += chunk;
          options.onEvent?.({
            type: 'content',
            turnId,
            text: chunk,
          });
        },
        sendError: (err: string) => {
          errorMessage = err;
          options.onEvent?.({
            type: 'error',
            turnId,
            message: err,
          });
        },
        sendEnd: (aborted?: boolean) => {
          options.onEvent?.({
            type: 'tool',
            turnId,
            id: subagentToolId,
            name: `subagent:${options.role}`,
            status: 'end',
            data: {
              role: options.role,
              roleName: roleDef.name,
              group: roleDef.group,
              provider: assignment.providerId,
              model: assignment.modelId,
              effort,
              success: !errorMessage && !aborted,
              aborted: Boolean(aborted),
              output: outputText,
            },
          });
          options.onEvent?.({
            type: 'end',
            turnId,
            aborted,
          });
        },
        signal: runSignal,
      });

      return {
        success: success && !errorMessage,
        role: options.role,
        output: outputText,
        error: errorMessage,
        modelUsed: {
          provider: assignment.providerId,
          model: assignment.modelId,
          effort,
        },
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || runSignal.aborted;
      const message = isAbort
        ? 'Subagent execution aborted.'
        : (err?.message || 'Error executing subagent turn.');

      options.onEvent?.({
        type: 'tool',
        turnId,
        id: subagentToolId,
        name: `subagent:${options.role}`,
        status: 'end',
        data: {
          role: options.role,
          roleName: roleDef.name,
          group: roleDef.group,
          provider: assignment.providerId,
          model: assignment.modelId,
          effort,
          success: false,
          aborted: isAbort,
          error: message,
        },
      });

      if (isAbort) {
        options.onEvent?.({
          type: 'end',
          turnId,
          aborted: true,
        });
      } else {
        options.onEvent?.({
          type: 'error',
          turnId,
          message,
        });
      }

      return {
        success: false,
        role: options.role,
        output: outputText,
        error: message,
        modelUsed: {
          provider: assignment.providerId,
          model: assignment.modelId,
          effort,
        },
      };
    }
  }
}

export async function dispatchSubagentRole(
  options: SubagentDispatchOptions,
): Promise<SubagentDispatchResult> {
  const runner = new SubagentRoleRunner({
    modelConfig: options.modelConfig,
    providers: options.providers,
    defaultFallback: options.fallbackAssignment,
    agentRunner: options.agentRunner,
  });
  return runner.dispatchSubagent(options);
}
