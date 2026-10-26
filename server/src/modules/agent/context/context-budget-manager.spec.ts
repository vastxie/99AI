import {
  DEFAULT_TOTAL_CONTEXT_TOKENS,
  resolveContextMaxTokens,
  resolveContextOutputReserveTokens,
  resolveRecentHistoryTokenBudget,
} from './context-budget-manager';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('ContextBudgetManager token budgets', () => {
  it('keeps the fallback budget stable when model context is unknown', () => {
    expect(resolveContextMaxTokens()).toBe(DEFAULT_TOTAL_CONTEXT_TOKENS);
    expect(resolveRecentHistoryTokenBudget()).toBe(12800);
  });

  it('reserves output space and gives recent history a capped 20% budget', () => {
    expect(resolveContextOutputReserveTokens(64000)).toBe(12800);
    expect(resolveContextMaxTokens(64000)).toBe(51200);
    expect(resolveRecentHistoryTokenBudget(64000)).toBe(10240);
    expect(resolveContextMaxTokens(128000)).toBe(102400);
    expect(resolveRecentHistoryTokenBudget(128000)).toBe(20480);
    expect(resolveRecentHistoryTokenBudget(1000000)).toBe(32768);
  });

  it('keeps a minimum recent history target for small explicit budgets', () => {
    expect(resolveContextMaxTokens(900)).toBe(900);
    expect(resolveRecentHistoryTokenBudget(900)).toBe(8000);
  });
});
