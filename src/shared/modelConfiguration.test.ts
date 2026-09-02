import { describe, expect, it } from 'vitest';
import {
  createModelConfiguration,
  getAssignmentEffort,
  getModelEffortCapability,
  GENTLE_ROLE_IDS,
  resolveRoleAssignment,
  setModeAssignment,
  setModeEffort,
  setRoleAssignment,
  setRoleEffort,
} from './modelConfiguration';

describe('model configuration', () => {
  it('preserves legacy selected models without mutating them', () => {
    const legacy = { openai: 'gpt-5' };
    const configuration = createModelConfiguration(undefined, legacy);

    expect(configuration.assignments.orchestrator).toEqual({ providerId: 'openai', modelId: 'gpt-5' });
    expect(configuration.roleAssignments['gentle-orchestrator']).toEqual({ providerId: 'openai', modelId: 'gpt-5' });
    expect(legacy).toEqual({ openai: 'gpt-5' });
  });

  it('keeps the closed registry to exactly 21 verified roles', () => {
    expect(GENTLE_ROLE_IDS).toHaveLength(21);
    expect(new Set(GENTLE_ROLE_IDS).size).toBe(21);
    expect(GENTLE_ROLE_IDS).toContain('gentle-orchestrator');
    expect(GENTLE_ROLE_IDS).not.toContain('sdd-orchestrator');
  });

  it('stores 21 independent role assignments', () => {
    const configuration = GENTLE_ROLE_IDS.reduce(
      (current, role, index) => setRoleAssignment(current, role, { providerId: 'openai', modelId: `gpt-5-role-${index}` }),
      createModelConfiguration(undefined),
    );

    expect(Object.keys(configuration.roleAssignments)).toHaveLength(21);
    expect(configuration.roleAssignments['sdd-init']).not.toEqual(configuration.roleAssignments['sdd-apply']);
  });

  it('preserves existing four chat-mode assignments while adding independent role assignments', () => {
    const initial = createModelConfiguration(undefined, { openai: 'gpt-5' });
    const changed = setModeAssignment(initial, 'build', { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });

    expect(changed.assignments.orchestrator).toEqual({ providerId: 'openai', modelId: 'gpt-5' });
    expect(changed.assignments.build).toEqual({ providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
    expect(changed.roleAssignments).toEqual(initial.roleAssignments);
  });

  it('migrates only the legacy orchestrator assignment into the coordinator role', () => {
    const configuration = createModelConfiguration({
      version: 1,
      assignments: {
        orchestrator: { providerId: 'openai', modelId: 'gpt-5' },
        build: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
      },
      settings: { 'openai:gpt-5': { effort: 'high' } },
    });

    expect(configuration.assignments.build).toEqual({ providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
    expect(configuration.roleAssignments).toEqual({
      'gentle-orchestrator': { providerId: 'openai', modelId: 'gpt-5', effort: 'high' },
    });
  });

  it('isolates effort by role even when two roles use the same exact model', () => {
    const assignment = { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' };
    const configured = setRoleEffort(
      setRoleAssignment(
        setRoleAssignment(createModelConfiguration(undefined), 'sdd-design', assignment),
        'sdd-spec', assignment,
      ),
      'sdd-design', 'high',
    );

    expect(getAssignmentEffort(configured.roleAssignments['sdd-design'])).toBe('high');
    expect(getAssignmentEffort(configured.roleAssignments['sdd-spec'])).toBeUndefined();
  });

  it('persists effort independently for each chat mode', () => {
    const configured = setModeEffort(
      setModeAssignment(createModelConfiguration(undefined), 'build', { providerId: 'openai', modelId: 'gpt-5.6-terra' }),
      'build',
      'high',
    );

    expect(getAssignmentEffort(configured.assignments.build)).toBe('high');
    expect(getAssignmentEffort(configured.assignments.orchestrator)).toBeUndefined();
  });

  it('prefers the coordinator role assignment and falls back to the legacy orchestrator assignment', () => {
    const legacy = { providerId: 'openai', modelId: 'gpt-5' };
    const empty = { ...createModelConfiguration(undefined), roleAssignments: {} };
    expect(resolveRoleAssignment(empty, 'gentle-orchestrator', legacy)).toEqual(legacy);

    const configured = setRoleAssignment(empty, 'gentle-orchestrator', { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
    expect(resolveRoleAssignment(configured, 'gentle-orchestrator', legacy)).toEqual({ providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
  });

  it('does not grant effort to unregistered models', () => {
    expect(getModelEffortCapability({ providerId: 'openai', modelId: 'gpt-custom-reasoning' })).toBeUndefined();
  });

  it('registers the documented Terra reasoning effort levels', () => {
    expect(getModelEffortCapability({ providerId: 'openai', modelId: 'gpt-5.6-terra' })).toEqual({
      payload: 'openai',
      levels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    });
    expect(getModelEffortCapability({ providerId: 'openai', modelId: 'gpt-5.6-terra-pro' })).toEqual({
      payload: 'openai',
      levels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    });
  });
});
