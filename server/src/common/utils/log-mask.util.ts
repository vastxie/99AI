/** 日志里凭据 / 过短敏感值的统一占位符 */
export const MASKED_VALUE = '[已隐藏]';

export function maskSensitiveValue(value: unknown, visibleStart = 4, visibleEnd = 4): string {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value);
  if (raw.length <= visibleStart + visibleEnd) return MASKED_VALUE;
  return `${raw.slice(0, visibleStart)}***${raw.slice(-visibleEnd)}`;
}

export function maskPhone(phone: unknown): string {
  const raw = String(phone || '');
  if (!raw) return '';
  return raw.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

export function maskContact(contact: unknown): string {
  const raw = String(contact || '');
  if (!raw) return '';
  const atIndex = raw.indexOf('@');
  if (atIndex > 0) {
    const name = raw.slice(0, atIndex);
    const domain = raw.slice(atIndex);
    if (name.length <= 2) return `${name[0] || '*'}***${domain}`;
    return `${name[0]}***${name[name.length - 1]}${domain}`;
  }
  if (/^1[3-9]\d{9}$/.test(raw)) return maskPhone(raw);
  return maskSensitiveValue(raw);
}
