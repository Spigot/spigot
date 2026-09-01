import { describe, expect, it } from 'vitest';
import { estimateTokens, resolveContextBudget } from './contextBudget';

describe('context budgets', () => {
  it('resolves MiniMax-M3 through a normalized exact capability', () => {
    expect(resolveContextBudget(' MiniMax ', 'MINIMAX-M3 ')).toMatchObject({
      known: true,
      inputTokens: 1_000_000,
      responseReserveTokens: 16_000,
    });
  });

  it('uses a local safe budget for unknown models without provider limit wording', () => {
    const budget = resolveContextBudget('minimax', 'discovered-later');
    expect(budget).toMatchObject({ known: false, inputTokens: 12_000 });
    expect(JSON.stringify(budget)).not.toMatch(/MiniMax.*(?:2K|limit)/i);
  });

  it('uses a conservative local estimate rather than claiming tokenizer accuracy', () => {
    expect(estimateTokens('abcd')).toBeGreaterThan(1);
  });
});
