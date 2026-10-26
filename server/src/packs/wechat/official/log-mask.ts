import { MASKED_VALUE, maskSensitiveValue } from '@/common/utils';

/** 日志里的 OpenID / UnionID 只留首尾各 3 位 */
export function maskWechatId(id: unknown): string {
  return maskSensitiveValue(id, 3, 3);
}

/** access_token 等凭据在日志里一律隐藏 */
export function maskToken(token: unknown): string {
  return token ? MASKED_VALUE : '';
}
