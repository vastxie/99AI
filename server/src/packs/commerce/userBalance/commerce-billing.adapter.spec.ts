import { CommerceBillingAdapter } from './commerce-billing.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const tokenModel = { deduct: 1, isTokenBased: true, tokenFeeRatio: 500 };

function createAdapter() {
  const balance = {
    validateBalance: jest.fn().mockResolvedValue(true),
    deductFromBalance: jest.fn().mockResolvedValue(1),
  };
  return { adapter: new CommerceBillingAdapter(balance as any), balance };
}

describe('CommerceBillingAdapter.settleTurn', () => {
  it('settles the full turn and tool cost with overdraft allowed', async () => {
    // 结算在用量产生之后：余额不够也要照实际用量扣，不能抛错后整轮退款免单
    const { adapter, balance } = createAdapter();

    await expect(
      adapter.settleTurn({
        user: { id: 7, role: 'viewer' },
        userId: 7,
        model: tokenModel,
        totalTokens: 12_001,
        toolCost: 3,
        relatedId: 99,
      } as any),
    ).resolves.toEqual({ charged: 28 });

    expect(balance.deductFromBalance).toHaveBeenNthCalledWith(
      1,
      7,
      1,
      25,
      12_001,
      99,
      1,
      'chat-base-v1',
      { allowOverdraft: true },
    );
    expect(balance.deductFromBalance).toHaveBeenNthCalledWith(
      2,
      7,
      2,
      3,
      0,
      99,
      2,
      'chat-tool-v1',
      { allowOverdraft: true },
    );
  });

  it('keeps the pre-turn check at the base fee', async () => {
    const { adapter, balance } = createAdapter();

    await adapter.assertTurnAllowed({ user: { id: 7, role: 'viewer' }, model: tokenModel } as any);

    expect(balance.validateBalance).toHaveBeenCalledWith(
      { user: { id: 7, role: 'viewer' } },
      1,
      1,
      undefined,
    );
  });

  it('does not deduct the turn fee from visitors at settlement', async () => {
    const { adapter, balance } = createAdapter();

    await adapter.settleTurn({
      user: { id: 'visitor-1', role: 'visitor' },
      userId: null,
      model: tokenModel,
      totalTokens: 1_000,
      toolCost: 0,
      relatedId: 99,
    } as any);

    expect(balance.deductFromBalance).not.toHaveBeenCalled();
  });
});
