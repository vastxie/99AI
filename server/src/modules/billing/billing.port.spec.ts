import { BillingPort, NoopBillingService } from './billing.port';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('BillingPort', () => {
  it('Noop implementation allows every turn and performs no accounting', async () => {
    const billing: BillingPort = new NoopBillingService();
    await expect(
      billing.assertTurnAllowed({ user: { id: 1 }, model: {} }),
    ).resolves.toBeUndefined();
    await expect(
      billing.settleTurn({
        user: { id: 1 },
        userId: 1,
        model: {},
        totalTokens: 10,
        toolCost: 0,
        relatedId: 1,
      }),
    ).resolves.toEqual({ charged: 0 });
    await expect(billing.refundTurn(1, 'x')).resolves.toEqual([]);
    await expect(billing.reconcileRefunds('x')).resolves.toBeUndefined();
    await expect(billing.getSummary(1)).resolves.toBeNull();
    await expect(billing.getSummaries([1, 2])).resolves.toEqual([]);
    await expect(billing.onUserRegistered(1)).resolves.toBeUndefined();
  });
});
