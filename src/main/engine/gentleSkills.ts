export interface GentleSkill {
  id: string;
  name: string;
  trigger: string;
  description: string;
  systemPrompt: string;
  suggestedRoles: readonly string[];
}

export const GENTLE_SKILLS: Record<string, GentleSkill> = {
  'chained-pr': {
    id: 'chained-pr',
    name: 'Chained PRs',
    trigger: '/chained-pr',
    description: 'Split oversized changes (>400 lines) into reviewable, dependency-ordered chained PR slices.',
    systemPrompt: `You are an expert at decomposing large code changes into atomic, focused, chained PRs.
Follow these rules:
1. Identify natural boundaries: contracts/schemas first, then core logic, then UI/consumers, then migrations/tests.
2. Ensure each slice compiles and passes tests independently.
3. Clearly specify the target branch for each PR in the chain.`,
    suggestedRoles: ['sdd-tasks', 'sdd-apply'],
  },
  'judgment-day': {
    id: 'judgment-day',
    name: 'Judgment Day (Dual Review)',
    trigger: '/judge',
    description: 'Run blind dual adversarial review with Judge A, Judge B, and an automated fix loop.',
    systemPrompt: `Execute the Judgment Day dual review workflow:
1. Judge A (jd-judge-a) reviews strictly for specification compliance and correctness.
2. Judge B (jd-judge-b) reviews independently for resilience, edge cases, and performance regressions.
3. Compare findings: deduplicate and accept only confirmed findings.
4. Delegate fixes to jd-fix-agent and re-verify.`,
    suggestedRoles: ['jd-judge-a', 'jd-judge-b', 'jd-fix-agent'],
  },
  'sdd': {
    id: 'sdd',
    name: 'Spec-Driven Development',
    trigger: '/sdd',
    description: 'Orchestrate the end-to-end Spec-Driven Development lifecycle (Init -> Explore -> Spec -> Design -> Tasks -> Apply -> Verify).',
    systemPrompt: `Execute the Gentle AI SDD pipeline:
1. Load or initialize .sdd/state.json.
2. Check the current active phase and invoke the corresponding Gentle subagent role.
3. Validate artifacts before advancing to the next phase.`,
    suggestedRoles: ['sdd-init', 'sdd-explore', 'sdd-spec', 'sdd-design', 'sdd-tasks', 'sdd-apply', 'sdd-verify'],
  },
  'rdd-defect': {
    id: 'rdd-defect',
    name: 'Root Cause Defect Resolution',
    trigger: '/rdd',
    description: 'Investigate bugs from observed symptom down to root cause with reproducible test-first verification.',
    systemPrompt: `Execute the Root Cause Defect (RDD) workflow:
1. Isolate the exact failing symptom.
2. Write a minimal reproduction test that fails on the current codebase.
3. Trace backwards through call hierarchies to uncover the root cause.
4. Apply the minimal fix and ensure the reproduction test passes without regression.`,
    suggestedRoles: ['sdd-research', 'sdd-apply', 'sdd-verify'],
  },
  'triage': {
    id: 'triage',
    name: 'Systemic Issue Triage',
    trigger: '/triage',
    description: 'Triage issues, categorize impact, identify architectural risks, and prioritize fixes.',
    systemPrompt: `Analyze the codebase against reported issues:
1. Classify severity (Blocker, High, Medium, Low).
2. Identify blast radius and affected subsystems.
3. Propose actionable, isolated tasks.`,
    suggestedRoles: ['review-risk', 'sdd-tasks'],
  },
  'work-unit': {
    id: 'work-unit',
    name: 'Work Unit Commits',
    trigger: '/work-unit',
    description: 'Plan commits as atomic, reviewable work units keeping tests and documentation alongside code changes.',
    systemPrompt: `Structure changes into atomic work units:
- Never commit broken intermediate states.
- Every commit must include code + corresponding unit tests.
- Format messages using standard conventional commits without AI attribution.`,
    suggestedRoles: ['sdd-tasks'],
  },
  'branch-pr': {
    id: 'branch-pr',
    name: 'Gentle Branch PR',
    trigger: '/branch-pr',
    description: 'Prepare clean GitHub Pull Requests with issue-first validation and test evidence.',
    systemPrompt: `Prepare the PR description and verification report:
- Link to relevant issues.
- Summarize non-obvious architecture decisions.
- Include verification command results and diff highlights.`,
    suggestedRoles: ['sdd-verify', 'sdd-archive'],
  },
  'cognitive-doc-design': {
    id: 'cognitive-doc-design',
    name: 'Cognitive Doc Design',
    trigger: '/doc-design',
    description: 'Design documentation that minimizes reader cognitive load using hierarchical progressive disclosure.',
    systemPrompt: `Structure documentation with high signal-to-noise ratio:
1. Executive summary / quick-start first.
2. Concepts before syntax.
3. Concise code snippets with before/after comparisons.`,
    suggestedRoles: ['sdd-spec', 'sdd-onboard'],
  },
  'comment-writer': {
    id: 'comment-writer',
    name: 'Collaboration Comment Writer',
    trigger: '/comment',
    description: 'Write direct, actionable, empathetic collaboration comments for PR reviews and issues.',
    systemPrompt: `Write collaboration feedback:
- Validate understanding.
- Explain the technical rationale behind suggestions.
- Provide concrete code examples when requesting changes.`,
    suggestedRoles: ['review-readability', 'review-reliability'],
  },
};

export function getGentleSkillByTrigger(text: string): GentleSkill | undefined {
  const trimmed = text.trim();
  for (const skill of Object.values(GENTLE_SKILLS)) {
    if (trimmed.startsWith(skill.trigger) || trimmed.startsWith(`@${skill.id}`)) {
      return skill;
    }
  }
  return undefined;
}
