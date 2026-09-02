export const CHAT_MODES = ['orchestrator', 'build', 'plan', 'review'] as const;

export type ChatMode = (typeof CHAT_MODES)[number];
export type ModelEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const GENTLE_ROLE_IDS = [
  'gentle-orchestrator',
  'sdd-init', 'sdd-explore', 'sdd-research', 'sdd-propose', 'sdd-spec', 'sdd-design', 'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive', 'sdd-onboard',
  'jd-judge-a', 'jd-judge-b', 'jd-fix-agent',
  'review-risk', 'review-readability', 'review-reliability', 'review-resilience', 'review-refuter', 'review-validator',
] as const;

export type GentleRoleId = (typeof GENTLE_ROLE_IDS)[number];
export type GentleRoleGroup = 'SDD' | 'Judgment Day' | 'Review';

export const GENTLE_ROLE_GROUPS: ReadonlyArray<{ label: GentleRoleGroup; roles: readonly GentleRoleId[] }> = [
  { label: 'SDD', roles: ['sdd-init', 'sdd-explore', 'sdd-research', 'sdd-propose', 'sdd-spec', 'sdd-design', 'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive', 'sdd-onboard'] },
  { label: 'Judgment Day', roles: ['jd-judge-a', 'jd-judge-b', 'jd-fix-agent'] },
  { label: 'Review', roles: ['review-risk', 'review-readability', 'review-reliability', 'review-resilience', 'review-refuter', 'review-validator'] },
];

export const GENTLE_ROLE_LABELS: Record<GentleRoleId, string> = {
  'gentle-orchestrator': 'Orquestador de Gentle AI',
  'sdd-init': 'SDD: Inicialización',
  'sdd-explore': 'SDD: Exploración',
  'sdd-research': 'SDD: Investigación',
  'sdd-propose': 'SDD: Propuesta',
  'sdd-spec': 'SDD: Especificación',
  'sdd-design': 'SDD: Diseño',
  'sdd-tasks': 'SDD: Tareas',
  'sdd-apply': 'SDD: Aplicación',
  'sdd-verify': 'SDD: Verificación',
  'sdd-archive': 'SDD: Archivado',
  'sdd-onboard': 'SDD: Incorporación',
  'jd-judge-a': 'Judgment Day: Juez A',
  'jd-judge-b': 'Judgment Day: Juez B',
  'jd-fix-agent': 'Judgment Day: Agente de corrección',
  'review-risk': 'Revisión: Riesgo',
  'review-readability': 'Revisión: Legibilidad',
  'review-reliability': 'Revisión: Confiabilidad',
  'review-resilience': 'Revisión: Resiliencia',
  'review-refuter': 'Revisión: Refutación',
  'review-validator': 'Revisión: Validación',
};

export type ModelAssignment = {
  providerId: string;
  modelId: string;
  effort?: ModelEffort;
};

export type ModelConfiguration = {
  version: 2;
  assignments: Partial<Record<ChatMode, ModelAssignment>>;
  roleAssignments: Partial<Record<GentleRoleId, ModelAssignment>>;
};

type EffortCapability = {
  levels: readonly ModelEffort[];
  payload: 'openai' | 'anthropic';
};

const OPENAI_EFFORT_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const OPENAI_TERRA_EFFORT_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const ANTHROPIC_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const;
const ANTHROPIC_OPUS_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

// This registry is intentionally exact. Dynamic provider discovery supplies IDs, not capabilities.
const EFFORT_CAPABILITIES: Record<string, EffortCapability> = {
  'openai:o1': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:o3': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:o3-mini': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:o4-mini': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:gpt-5': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:gpt-5-mini': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:gpt-5-nano': { levels: OPENAI_EFFORT_LEVELS, payload: 'openai' },
  'openai:gpt-5.6-terra': { levels: OPENAI_TERRA_EFFORT_LEVELS, payload: 'openai' },
  'openai:gpt-5.6-terra-pro': { levels: OPENAI_TERRA_EFFORT_LEVELS, payload: 'openai' },
  'anthropic:claude-opus-4-6': { levels: ANTHROPIC_OPUS_EFFORT_LEVELS, payload: 'anthropic' },
  'anthropic:claude-sonnet-4-6': { levels: ANTHROPIC_EFFORT_LEVELS, payload: 'anthropic' },
};

export function getModelEffortCapability(assignment: ModelAssignment | undefined): EffortCapability | undefined {
  if (!assignment) return undefined;
  return EFFORT_CAPABILITIES[`${assignment.providerId}:${assignment.modelId}`];
}

export function getAssignmentEffort(assignment: ModelAssignment | undefined): ModelEffort | undefined {
  const capability = getModelEffortCapability(assignment);
  const effort = assignment?.effort;
  return effort && capability?.levels.includes(effort) ? effort : undefined;
}

export function createModelConfiguration(
  value: unknown,
  legacySelectedModels: Record<string, string> = {},
): ModelConfiguration {
  const legacyAssignment = Object.entries(legacySelectedModels).find(
    ([providerId, modelId]) => providerId.trim() && typeof modelId === 'string' && modelId.trim(),
  );
  const fallback = legacyAssignment
    ? { providerId: legacyAssignment[0], modelId: legacyAssignment[1] }
    : undefined;
  const rawSource = value && typeof value === 'object'
    ? value as Omit<Partial<ModelConfiguration>, 'version'> & { version?: unknown; settings?: Record<string, { effort?: ModelEffort }> }
    : undefined;
  const source = rawSource?.version === 1 || rawSource?.version === 2 ? rawSource : {};
  const assignments: Partial<Record<ChatMode, ModelAssignment>> = {};

  for (const mode of CHAT_MODES) {
    const candidate = source.assignments?.[mode];
    if (candidate && typeof candidate.providerId === 'string' && candidate.providerId.trim()
      && typeof candidate.modelId === 'string' && candidate.modelId.trim()) {
      assignments[mode] = { providerId: candidate.providerId, modelId: candidate.modelId };
    } else if (!source.version && fallback) {
      assignments[mode] = { ...fallback };
    }
  }

  const roleAssignments: Partial<Record<GentleRoleId, ModelAssignment>> = {};
  for (const role of GENTLE_ROLE_IDS) {
    const candidate = source.roleAssignments?.[role];
    if (candidate && typeof candidate.providerId === 'string' && candidate.providerId.trim()
      && typeof candidate.modelId === 'string' && candidate.modelId.trim()) {
      roleAssignments[role] = {
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        ...(typeof candidate.effort === 'string' ? { effort: candidate.effort as ModelEffort } : {}),
      };
    }
  }

  // Version 1 stored effort by model identity. Retain it only for the existing
  // interactive orchestrator when migrating; no sub-agent mapping is inferred.
  const legacyOrchestrator = assignments.orchestrator;
  if (!roleAssignments['gentle-orchestrator'] && legacyOrchestrator) {
    const legacyEffort = source.settings?.[`${encodeURIComponent(legacyOrchestrator.providerId)}:${encodeURIComponent(legacyOrchestrator.modelId)}`]?.effort;
    roleAssignments['gentle-orchestrator'] = {
      ...legacyOrchestrator,
      ...(typeof legacyEffort === 'string' ? { effort: legacyEffort } : {}),
    };
  }

  return { version: 2, assignments, roleAssignments };
}

export function setModeAssignment(
  configuration: ModelConfiguration,
  mode: ChatMode,
  assignment: ModelAssignment,
): ModelConfiguration {
  return {
    ...configuration,
    assignments: { ...configuration.assignments, [mode]: assignment },
  };
}

export function setModelEffort(
  assignment: ModelAssignment,
  effort: ModelEffort | undefined,
): ModelAssignment {
  if (effort && getModelEffortCapability(assignment)?.levels.includes(effort)) return { ...assignment, effort };
  const { effort: _effort, ...withoutEffort } = assignment;
  return withoutEffort;
}

export function setModeEffort(
  configuration: ModelConfiguration,
  mode: ChatMode,
  effort: ModelEffort | undefined,
): ModelConfiguration {
  const assignment = configuration.assignments[mode];
  if (!assignment) return configuration;
  return {
    ...configuration,
    assignments: { ...configuration.assignments, [mode]: setModelEffort(assignment, effort) },
  };
}

export function setRoleAssignment(
  configuration: ModelConfiguration,
  role: GentleRoleId,
  assignment: ModelAssignment,
): ModelConfiguration {
  const { effort: _effort, ...withoutEffort } = assignment;
  return { ...configuration, roleAssignments: { ...configuration.roleAssignments, [role]: withoutEffort } };
}

export function setRoleEffort(
  configuration: ModelConfiguration,
  role: GentleRoleId,
  effort: ModelEffort | undefined,
): ModelConfiguration {
  const assignment = configuration.roleAssignments[role];
  if (!assignment) return configuration;
  return { ...configuration, roleAssignments: { ...configuration.roleAssignments, [role]: setModelEffort(assignment, effort) } };
}

export function resolveRoleAssignment(
  configuration: ModelConfiguration,
  role: GentleRoleId,
  fallback: ModelAssignment | undefined,
): ModelAssignment | undefined {
  return configuration.roleAssignments[role] ?? fallback;
}

export function resolveModeAssignment(
  configuration: ModelConfiguration,
  mode: ChatMode,
  fallback: ModelAssignment | undefined,
): ModelAssignment | undefined {
  return configuration.assignments[mode] ?? fallback;
}
