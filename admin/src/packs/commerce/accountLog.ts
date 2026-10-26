/**
 * 账户明细的变更积分：方向由带符号的数值决定（正数入账、负数支出），符号与颜色一致。
 * 消费类型（10 起）服务端记的是正数，一律按支出；其余类型按记录本身的正负——管理员调整（5）扣减时是负数。
 */
export function signedCreditChange(rechargeType: unknown, credits: unknown): number {
  const value = Number(credits) || 0;
  return Number(rechargeType) >= 10 ? -Math.abs(value) : value;
}

/** 带正负号的显示：+12、-3、0 */
export function formatCreditChange(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '-'}${Math.abs(value)}`;
}

/** 文字颜色的语义：入账、支出、无变化 */
export function creditChangeTone(value: number): 'income' | 'expense' | 'neutral' {
  if (value > 0) return 'income';
  if (value < 0) return 'expense';
  return 'neutral';
}
