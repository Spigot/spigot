import { describe, expect, it } from 'vitest';
import { GENTLE_SKILLS, getGentleSkillByTrigger } from './gentleSkills';
import { GentleAgentBuilderService } from './gentleAgentBuilder';

describe('GentleSkills', () => {
  it('contains all 9 core Gentle skills and triggers', () => {
    expect(GENTLE_SKILLS['chained-pr']).toBeDefined();
    expect(GENTLE_SKILLS['judgment-day']).toBeDefined();
    expect(GENTLE_SKILLS['sdd']).toBeDefined();
    expect(GENTLE_SKILLS['rdd-defect']).toBeDefined();
    expect(GENTLE_SKILLS['triage']).toBeDefined();
  });

  it('resolves skill by trigger command', () => {
    const sddSkill = getGentleSkillByTrigger('/sdd run');
    expect(sddSkill?.id).toBe('sdd');

    const judgeSkill = getGentleSkillByTrigger('/judge review diff');
    expect(judgeSkill?.id).toBe('judgment-day');

    const chainedPrSkill = getGentleSkillByTrigger('/chained-pr split changes');
    expect(chainedPrSkill?.id).toBe('chained-pr');
  });
});

describe('GentleAgentBuilderService', () => {
  it('builds, registers, and retrieves custom roles', () => {
    const builder = new GentleAgentBuilderService();
    const role = builder.buildRole({
      id: 'custom-security-auditor',
      name: 'Security Auditor',
      description: 'Audits code for OWASP vulnerabilities',
      toolScope: 'readonly',
      systemPrompt: 'Inspect code for vulnerabilities.',
    });

    expect(role.id).toBe('custom-security-auditor');
    expect(role.allowedTools).toContain('read_file');
    expect(role.allowedTools).not.toContain('write_file');

    expect(builder.getCustomRole('custom-security-auditor')).toBeDefined();
    expect(builder.listCustomRoles()).toHaveLength(1);

    builder.removeCustomRole('custom-security-auditor');
    expect(builder.getCustomRole('custom-security-auditor')).toBeUndefined();
  });
});
