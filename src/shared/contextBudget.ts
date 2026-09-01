export type ContextBudgetCapability = {
  inputTokens: number;
  responseReserveTokens: number;
  source: 'verified';
};

export type ResolvedContextBudget = ContextBudgetCapability & {
  providerId: string;
  modelId: string;
  known: boolean;
};

// Dynamic model discovery exposes identifiers only, never capability metadata.
const EXACT_CAPABILITIES: Record<string, ContextBudgetCapability> = {
  'minimax:minimax-m3': { inputTokens: 1_000_000, responseReserveTokens: 16_000, source: 'verified' },
};

export const SAFE_INPUT_TOKEN_BUDGET = 12_000;
export const SAFE_RESPONSE_RESERVE_TOKENS = 2_000;

export function normalizeCapabilityId(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveContextBudget(providerId: string, modelId: string): ResolvedContextBudget {
  const provider = normalizeCapabilityId(providerId);
  const model = normalizeCapabilityId(modelId);
  const known = EXACT_CAPABILITIES[`${provider}:${model}`];
  return known
    ? { providerId: provider, modelId: model, known: true, ...known }
    : {
        providerId: provider,
        modelId: model,
        known: false,
        inputTokens: SAFE_INPUT_TOKEN_BUDGET,
        responseReserveTokens: SAFE_RESPONSE_RESERVE_TOKENS,
        source: 'verified',
      };
}

/** Conservative local estimate, deliberately not a tokenizer-accurate count. */
export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  // Four UTF-16 code units per token is optimistic for code and non-ASCII text;
  // add a fixed and proportional margin to keep local budgeting conservative.
  return Math.ceil(text.length / 3) + 64 + Math.ceil(text.length * 0.08);
}

export type ContextBoundReason = 'input_budget' | 'response_reserve';

export type ContextBoundEvent = {
  modelId: string;
  keptItems: number;
  removedItems: number;
  reason: ContextBoundReason;
  omittedExplicitContext: boolean;
  omittedHistory: boolean;
};
