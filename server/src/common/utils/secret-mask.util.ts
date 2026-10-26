/**
 * 管理端回显密钥时的脱敏约定：
 * - 列表 / 详情接口只返回 maskSecret() 后的值；
 * - 保存接口收到「仍是脱敏形态」的值时视为「未修改」，保留库里的原值；
 * - 空字符串表示明确清空。
 */
export const SECRET_MASK_TOKEN = '****';

export function maskSecret(value: unknown): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  if (!raw) return '';
  if (raw.length <= 8) return SECRET_MASK_TOKEN.repeat(2);
  return `${raw.slice(0, 3)}${SECRET_MASK_TOKEN}${raw.slice(-4)}`;
}

/** 形如 ***** / abc****wxyz 的值都视为脱敏占位，不能当作新密钥写入 */
export function isMaskedSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.includes(SECRET_MASK_TOKEN);
}
