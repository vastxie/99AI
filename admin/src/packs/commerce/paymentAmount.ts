import { formatMoney } from '@/utils/format';

/** 按美元收款的渠道：PayPal、Stripe 官方 */
export const USD_CHANNELS = new Set(['paypal_official', 'stripe_official']);

/** 没有美元价时的默认汇率（与用户端、服务端下单时的估算一致） */
const DEFAULT_CNY_PER_USD = 7.3;

export function formatUsd(value: unknown): string {
  const amount = Number(value);
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

/** 套餐的美元价：有有效的 priceUsd（接口里是 DECIMAL 字符串）就用它，否则按人民币价估算 */
export function usdPriceOf(pkg: { priceUsd?: unknown; price?: unknown }): {
  text: string;
  estimated: boolean;
} {
  const usd = Number(pkg.priceUsd);
  if (Number.isFinite(usd) && usd > 0) return { text: formatUsd(usd), estimated: false };
  const cny = Number.parseFloat(String(pkg.price ?? ''));
  return {
    text: formatUsd(Number.isFinite(cny) ? cny / DEFAULT_CNY_PER_USD : 0),
    estimated: true,
  };
}

/** 下单前按所选渠道显示的套餐价格（美元渠道显示美元，估算的标明） */
export function packagePriceText(
  pkg: { priceUsd?: unknown; price?: unknown },
  channel: string | undefined,
): string {
  if (channel && USD_CHANNELS.has(channel)) {
    const usd = usdPriceOf(pkg);
    return usd.estimated ? `${usd.text}（估算）` : usd.text;
  }
  return formatMoney(pkg.price);
}

/** 下单后的实际支付金额：以渠道返回的金额与币种为准，没有时退回订单的人民币价 */
export function paymentAmountText(
  paymentData: { amount?: unknown; currency?: unknown } | null | undefined,
  fallbackCny: unknown,
): string {
  const amount = Number(paymentData?.amount);
  if (paymentData?.amount !== undefined && paymentData?.amount !== '' && Number.isFinite(amount)) {
    return String(paymentData?.currency).toUpperCase() === 'USD'
      ? formatUsd(amount)
      : formatMoney(amount);
  }
  return formatMoney(fallbackCny);
}
