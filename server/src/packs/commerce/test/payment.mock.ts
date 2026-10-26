import { PaymentProvider } from '../pay/payment.types';

type AnyFunction = (...args: any[]) => any;

function formatMoney(value: any): string | null {
  if (value === undefined || value === null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return amount.toFixed(2);
}

export function createPaymentProviderMock(
  fn: () => AnyFunction,
  overrides: Record<string, any> = {},
) {
  return {
    provider: PaymentProvider.EPAY,
    supports: fn(),
    createPayment: fn(),
    parseNotify: fn(),
    queryOrder: fn(),
    ...overrides,
  };
}

export function createPayServiceMock(fn: () => AnyFunction, overrides: Record<string, any> = {}) {
  return {
    getProvider: fn(),
    processSuccessfulOrder: fn(),
    markOrderFailed: fn(),
    formatMoney,
    getOrderPaymentSnapshotAmount: (): null => null,
    getExpectedAmountForCurrency: (order: any, _goods: any, currency: string) => {
      if (String(currency || 'CNY').toUpperCase() === 'USD') return null;
      return formatMoney(order.total);
    },
    getExpectedUsdAmount: (): null => null,
    ...overrides,
  };
}
