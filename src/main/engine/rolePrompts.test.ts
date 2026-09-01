import { describe, expect, it } from 'vitest';
import { GENTLE_ROLE_IDS, type GentleRoleId } from '../../shared/modelConfiguration';
import {
  BASE_READ_TOOLS,
  COMMAND_TOOLS,
  DELEGATE_SUBAGENT_TOOL,
  DELEGATE_TOOLS,
  GENTLE_ROLE_DEFINITIONS,
  WRITE_TOOLS,
  getRoleAllowedTools,
  getRoleDefinition,
  getRolePrompt,
  getToolsForRole,
  isToolAllowedForRole,
} from './rolePrompts';
import { TOOLS } from '../agentRunner';

describe('rolePrompts - Gentle AI 21 roles registry', () => {
  it('defines all 21 Gentle AI roles in GENTLE_ROLE_DEFINITIONS', () => {
    expect(GENTLE_ROLE_IDS).toHaveLength(21);
    for (const role of GENTLE_ROLE_IDS) {
      expect(GENTLE_ROLE_DEFINITIONS[role]).toBeDefined();
      expect(GENTLE_ROLE_DEFINITIONS[role].id).toBe(role);
      expect(GENTLE_ROLE_DEFINITIONS[role].name).toBeTruthy();
      expect(GENTLE_ROLE_DEFINITIONS[role].description).toBeTruthy();
      expect(GENTLE_ROLE_DEFINITIONS[role].systemPrompt).toBeTruthy();
    }
  });

  it('throws error for unknown role identifier', () => {
    expect(() => getRoleDefinition('unknown-role' as GentleRoleId)).toThrow(/Unknown Gentle AI role/);
  });

  describe('tool scoping per role', () => {
    it('defines standard tool arrays correctly', () => {
      expect(DELEGATE_SUBAGENT_TOOL.name).toBe('delegate_subagent');
      expect(DELEGATE_TOOLS).toContain('delegate_subagent');
    });

    it('scopes coordinator (gentle-orchestrator) with full tools and delegation', () => {
      const coordinatorTools = getRoleAllowedTools('gentle-orchestrator');
      expect(coordinatorTools).toContain('delegate_subagent');
      expect(coordinatorTools).toContain('write_file');
      expect(coordinatorTools).toContain('edit_file');
      expect(coordinatorTools).toContain('run_command');
      expect(coordinatorTools).toContain('read_file');
      expect(isToolAllowedForRole('gentle-orchestrator', 'delegate_subagent')).toBe(true);
      expect(isToolAllowedForRole('gentle-orchestrator', 'run_command')).toBe(true);
    });

    it('scopes SDD explore, research, and onboard as strictly read-only', () => {
      const readOnlyRoles: GentleRoleId[] = ['sdd-explore', 'sdd-research', 'sdd-onboard'];
      for (const role of readOnlyRoles) {
        const tools = getRoleAllowedTools(role);
        expect(tools).toEqual([...BASE_READ_TOOLS]);
        expect(isToolAllowedForRole(role, 'read_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'list_dir')).toBe(true);
        expect(isToolAllowedForRole(role, 'glob_search')).toBe(true);
        expect(isToolAllowedForRole(role, 'grep_search')).toBe(true);
        expect(isToolAllowedForRole(role, 'git_status')).toBe(true);
        expect(isToolAllowedForRole(role, 'git_diff')).toBe(true);
        expect(isToolAllowedForRole(role, 'write_file')).toBe(false);
        expect(isToolAllowedForRole(role, 'edit_file')).toBe(false);
        expect(isToolAllowedForRole(role, 'run_command')).toBe(false);
        expect(isToolAllowedForRole(role, 'delegate_subagent')).toBe(false);
      }
    });

    it('scopes SDD propose, spec, design, tasks, and archive as readwrite (no command execution)', () => {
      const readWriteRoles: GentleRoleId[] = ['sdd-propose', 'sdd-spec', 'sdd-design', 'sdd-tasks', 'sdd-archive'];
      for (const role of readWriteRoles) {
        const tools = getRoleAllowedTools(role);
        expect(tools).toEqual([...BASE_READ_TOOLS, ...WRITE_TOOLS]);
        expect(isToolAllowedForRole(role, 'read_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'write_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'edit_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'run_command')).toBe(false);
        expect(isToolAllowedForRole(role, 'delegate_subagent')).toBe(false);
      }
    });

    it('scopes SDD init, SDD apply, and JD fix agent with full file and command execution permissions', () => {
      const fullRoles: GentleRoleId[] = ['sdd-init', 'sdd-apply', 'jd-fix-agent'];
      for (const role of fullRoles) {
        const tools = getRoleAllowedTools(role);
        expect(tools).toEqual([...BASE_READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS]);
        expect(isToolAllowedForRole(role, 'write_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'edit_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'run_command')).toBe(true);
        expect(isToolAllowedForRole(role, 'delegate_subagent')).toBe(false);
      }
    });

    it('scopes SDD verify with read and command verification tools but disallows file modification', () => {
      const verifyTools = getRoleAllowedTools('sdd-verify');
      expect(verifyTools).toEqual([...BASE_READ_TOOLS, ...COMMAND_TOOLS]);
      expect(isToolAllowedForRole('sdd-verify', 'read_file')).toBe(true);
      expect(isToolAllowedForRole('sdd-verify', 'run_command')).toBe(true);
      expect(isToolAllowedForRole('sdd-verify', 'write_file')).toBe(false);
      expect(isToolAllowedForRole('sdd-verify', 'edit_file')).toBe(false);
    });

    it('scopes Judgment Day judges (jd-judge-a, jd-judge-b) as strictly read-only', () => {
      const judgeRoles: GentleRoleId[] = ['jd-judge-a', 'jd-judge-b'];
      for (const role of judgeRoles) {
        const tools = getRoleAllowedTools(role);
        expect(tools).toEqual([...BASE_READ_TOOLS]);
        expect(isToolAllowedForRole(role, 'read_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'write_file')).toBe(false);
        expect(isToolAllowedForRole(role, 'run_command')).toBe(false);
      }
    });

    it('scopes all 6 Review lenses as strictly read-only', () => {
      const reviewRoles: GentleRoleId[] = [
        'review-risk',
        'review-readability',
        'review-reliability',
        'review-resilience',
        'review-refuter',
        'review-validator',
      ];
      for (const role of reviewRoles) {
        const tools = getRoleAllowedTools(role);
        expect(tools).toEqual([...BASE_READ_TOOLS]);
        expect(isToolAllowedForRole(role, 'read_file')).toBe(true);
        expect(isToolAllowedForRole(role, 'write_file')).toBe(false);
        expect(isToolAllowedForRole(role, 'run_command')).toBe(false);
      }
    });
  });

  describe('getToolsForRole helper', () => {
    it('filters available tools according to role permissions', () => {
      const exploreTools = getToolsForRole('sdd-explore', TOOLS);
      const exploreNames = exploreTools.map(t => t.name);
      expect(exploreNames).toContain('read_file');
      expect(exploreNames).toContain('glob_search');
      expect(exploreNames).not.toContain('write_file');
      expect(exploreNames).not.toContain('edit_file');
      expect(exploreNames).not.toContain('run_command');
      expect(exploreNames).not.toContain('delegate_subagent');

      const applyTools = getToolsForRole('sdd-apply', TOOLS);
      const applyNames = applyTools.map(t => t.name);
      expect(applyNames).toContain('read_file');
      expect(applyNames).toContain('write_file');
      expect(applyNames).toContain('edit_file');
      expect(applyNames).toContain('run_command');
      expect(applyNames).not.toContain('delegate_subagent');
    });
  });

  describe('prompts and contracts', () => {
    it('includes the artifact language contract in every role prompt', () => {
      for (const role of GENTLE_ROLE_IDS) {
        const prompt = getRolePrompt(role);
        expect(prompt).toContain('Artifact Language Contract');
        expect(prompt).toContain('default to English');
      }
    });
  });
});
