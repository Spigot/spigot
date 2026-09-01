import { describe, expect, it, vi } from 'vitest';
import type { ModelConfiguration } from '../../shared/modelConfiguration';
import {
  SubagentRoleRunner,
  dispatchSubagentRole,
  DEFAULT_SUBAGENT_FALLBACK_ASSIGNMENT,
} from './SubagentRoleRunner';
import { executeTool } from '../agentRunner';
import type { EngineEvent } from './types';

describe('SubagentRoleRunner', () => {
  const dummyWorkspace = 'C:/test-workspace';

  describe('Model & Effort Resolution', () => {
    it('resolves model assignment and valid effort from modelConfig', () => {
      const runner = new SubagentRoleRunner();
      const modelConfig: ModelConfiguration = {
        version: 2,
        assignments: {},
        roleAssignments: {
          'sdd-explore': { providerId: 'openai', modelId: 'o3-mini', effort: 'medium' },
          'sdd-apply': { providerId: 'anthropic', modelId: 'claude-opus-4-6', effort: 'max' },
        },
      };

      const exploreModel = runner.resolveRoleModel('sdd-explore', modelConfig);
      expect(exploreModel.assignment).toEqual({
        providerId: 'openai',
        modelId: 'o3-mini',
        effort: 'medium',
      });
      expect(exploreModel.effort).toBe('medium');

      const applyModel = runner.resolveRoleModel('sdd-apply', modelConfig);
      expect(applyModel.assignment).toEqual({
        providerId: 'anthropic',
        modelId: 'claude-opus-4-6',
        effort: 'max',
      });
      expect(applyModel.effort).toBe('max');
    });

    it('falls back to provided fallback assignment when role assignment is absent', () => {
      const runner = new SubagentRoleRunner();
      const modelConfig: ModelConfiguration = {
        version: 2,
        assignments: {},
        roleAssignments: {},
      };

      const fallback = { providerId: 'openai', modelId: 'gpt-4o' };
      const resolved = runner.resolveRoleModel('sdd-spec', modelConfig, fallback);
      expect(resolved.assignment).toEqual(fallback);
      expect(resolved.effort).toBeUndefined();
    });

    it('uses default fallback assignment when no configuration or fallback is provided', () => {
      const runner = new SubagentRoleRunner();
      const resolved = runner.resolveRoleModel('review-risk');
      expect(resolved.assignment).toEqual(DEFAULT_SUBAGENT_FALLBACK_ASSIGNMENT);
    });

    it('sanitizes unsupported effort for models without effort capability', () => {
      const runner = new SubagentRoleRunner();
      const modelConfig: ModelConfiguration = {
        version: 2,
        assignments: {},
        roleAssignments: {
          'jd-judge-a': { providerId: 'openai', modelId: 'gpt-4o', effort: 'high' as any },
        },
      };

      const resolved = runner.resolveRoleModel('jd-judge-a', modelConfig);
      expect(resolved.assignment.providerId).toBe('openai');
      expect(resolved.assignment.modelId).toBe('gpt-4o');
      expect(resolved.effort).toBeUndefined();
    });
  });

  describe('API Key Resolution', () => {
    it('resolves direct apiKey first', () => {
      const runner = new SubagentRoleRunner();
      const key = runner.resolveApiKey('openai', 'direct-key', {
        openai: { apiKey: 'provider-key' },
      });
      expect(key).toBe('direct-key');
    });

    it('resolves from providers map matching providerId', () => {
      const runner = new SubagentRoleRunner();
      const key = runner.resolveApiKey('anthropic', undefined, {
        anthropic: { apiKey: 'anthropic-secret' },
      });
      expect(key).toBe('anthropic-secret');
    });

    it('returns undefined if no matching API key exists', () => {
      const runner = new SubagentRoleRunner();
      const key = runner.resolveApiKey('gemini', undefined, {});
      expect(key).toBeUndefined();
    });
  });

  describe('Subagent Execution & Event Tracing', () => {
    it('returns error when API key is missing for the resolved provider', async () => {
      const events: EngineEvent[] = [];
      const result = await dispatchSubagentRole({
        role: 'sdd-explore',
        input: 'Analyze codebase',
        workspaceRoot: dummyWorkspace,
        providers: {}, // No keys
        onEvent: e => events.push(e),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No API key configured for provider');
      expect(events.some(e => e.type === 'error')).toBe(true);
      expect(events.some(e => e.type === 'end')).toBe(true);
    });

    it('executes subagent with scoped tools, system prompt, and traces events', async () => {
      let receivedRole: string | undefined;
      let receivedCustomTools: any[] | undefined;
      let receivedSystemPrompt: string | undefined;

      const mockRunner = vi.fn(async options => {
        receivedRole = options.role;
        receivedCustomTools = options.customTools;
        receivedSystemPrompt = options.customSystemPrompt;

        options.sendChunk('Subagent exploration completed.');
        options.sendEnd(false);
        return true;
      });

      const events: EngineEvent[] = [];
      const result = await dispatchSubagentRole({
        role: 'sdd-explore',
        input: 'Map the authentication modules',
        workspaceRoot: dummyWorkspace,
        providers: {
          anthropic: { apiKey: 'test-anthropic-key' },
        },
        onEvent: e => events.push(e),
        agentRunner: mockRunner,
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe('sdd-explore');
      expect(result.output).toBe('Subagent exploration completed.');
      expect(receivedRole).toBe('sdd-explore');

      // Scoped tools must be read-only
      const toolNames = receivedCustomTools?.map(t => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('glob_search');
      expect(toolNames).not.toContain('write_file');
      expect(toolNames).not.toContain('edit_file');
      expect(toolNames).not.toContain('run_command');

      // System prompt must match role prompt
      expect(receivedSystemPrompt).toContain('SDD **explore**');

      // Trace events must include tool start/end and content
      expect(events.some(e => e.type === 'tool' && e.status === 'start' && e.name === 'subagent:sdd-explore')).toBe(true);
      expect(events.some(e => e.type === 'content' && e.text === 'Subagent exploration completed.')).toBe(true);
      expect(events.some(e => e.type === 'tool' && e.status === 'end')).toBe(true);
      expect(events.some(e => e.type === 'end')).toBe(true);
    });

    it('handles runner abort signal gracefully', async () => {
      const abortController = new AbortController();
      const mockRunner = vi.fn(async options => {
        abortController.abort();
        options.sendEnd(true);
        return false;
      });

      const events: EngineEvent[] = [];
      const result = await dispatchSubagentRole({
        role: 'review-risk',
        input: 'Audit security permissions',
        workspaceRoot: dummyWorkspace,
        providers: {
          anthropic: { apiKey: 'key' },
        },
        signal: abortController.signal,
        onEvent: e => events.push(e),
        agentRunner: mockRunner,
      });

      expect(result.success).toBe(false);
      expect(events.some(e => e.type === 'end' && e.aborted === true)).toBe(true);
    });
  });

  describe('Role-Scoped Tool Permission Gating in executeTool', () => {
    it('denies write_file and run_command when called in read-only role context', async () => {
      const writeResult = await executeTool(
        'write_file',
        { filePath: 'foo.ts', content: 'test' },
        dummyWorkspace,
        'orchestrator',
        {
          role: 'sdd-explore',
        },
      );
      expect(writeResult).toContain('ERROR ejecutando la herramienta \'write_file\'');
      expect(writeResult).toContain('Acceso denegado: El rol "sdd-explore" no tiene permisos para ejecutar la herramienta "write_file"');

      const cmdResult = await executeTool(
        'run_command',
        { command: 'pnpm test' },
        dummyWorkspace,
        'orchestrator',
        {
          role: 'review-reliability',
        },
      );
      expect(cmdResult).toContain('ERROR ejecutando la herramienta \'run_command\'');
      expect(cmdResult).toContain('Acceso denegado: El rol "review-reliability" no tiene permisos para ejecutar la herramienta "run_command"');
    });

    it('denies run_command in readwrite roles like sdd-spec', async () => {
      const cmdResult = await executeTool(
        'run_command',
        { command: 'pnpm test' },
        dummyWorkspace,
        'orchestrator',
        {
          role: 'sdd-spec',
        },
      );
      expect(cmdResult).toContain('ERROR ejecutando la herramienta \'run_command\'');
      expect(cmdResult).toContain('Acceso denegado: El rol "sdd-spec" no tiene permisos para ejecutar la herramienta "run_command"');
    });
  });

  describe('Coordinator Subagent Delegation via delegate_subagent', () => {
    it('executes delegate_subagent and returns formatted subagent output', async () => {
      const mockRunner = vi.fn(async options => {
        expect(options.role).toBe('sdd-research');
        expect(options.prompt).toBe('Research OAuth token rotation');
        options.sendChunk('Research findings: RFC 6749 compliant.');
        options.sendEnd(false);
        return true;
      });

      const toolOutput = await executeTool(
        'delegate_subagent',
        {
          role: 'sdd-research',
          task: 'Research OAuth token rotation',
        },
        dummyWorkspace,
        'orchestrator',
        {
          role: 'gentle-orchestrator',
          providers: {
            anthropic: { apiKey: 'subagent-key' },
          },
          agentRunner: mockRunner,
        },
      );

      expect(toolOutput).toContain('[Resultado del Subagente sdd-research]');
      expect(toolOutput).toContain('Research findings: RFC 6749 compliant.');
    });

    it('returns error message if delegate_subagent fails', async () => {
      const toolOutput = await executeTool(
        'delegate_subagent',
        {
          role: 'sdd-tasks',
          task: 'Breakdown tasks',
        },
        dummyWorkspace,
        'orchestrator',
        {
          role: 'gentle-orchestrator',
          providers: {}, // missing keys
        },
      );

      expect(toolOutput).toContain('[Error en Subagente sdd-tasks]');
      expect(toolOutput).toContain('No API key configured');
    });

    it('emits subagent tool events with targeted turnId and metadata', async () => {
      const events: any[] = [];
      const onEvent = vi.fn((e: any) => events.push(e));
      const testTurnId = 'turn-subagent-test-123';

      const mockRunner = vi.fn(async options => {
        options.sendChunk('Subagent analysis completed.');
        options.sendEnd(false);
        return true;
      });

      await executeTool(
        'delegate_subagent',
        {
          role: 'sdd-propose',
          task: 'Write change proposal',
        },
        dummyWorkspace,
        'orchestrator',
        {
          role: 'gentle-orchestrator',
          providers: {
            anthropic: { apiKey: 'test-anthropic-key' },
          },
          agentRunner: mockRunner,
          onEvent,
          turnId: testTurnId,
        },
      );

      expect(onEvent).toHaveBeenCalled();
      const toolEvents = events.filter(e => e.type === 'tool');
      expect(toolEvents.length).toBeGreaterThanOrEqual(2);

      const startEvent = toolEvents.find(e => e.status === 'start');
      expect(startEvent).toBeDefined();
      expect(startEvent.turnId).toBe(testTurnId);
      expect(startEvent.name).toBe('subagent:sdd-propose');
      expect(startEvent.data.role).toBe('sdd-propose');

      const endEvent = toolEvents.find(e => e.status === 'end');
      expect(endEvent).toBeDefined();
      expect(endEvent.turnId).toBe(testTurnId);
      expect(endEvent.data.success).toBe(true);
    });
  });
});
