import { utcToShanghaiTime } from '@/utils/utcFormatTime';

/** 列表 / 详情共用的展示格式化：时间到秒、金额带 ¥ 两位小数、空值显示 — */

/** 后端时间（ISO-8601 UTC 等）→ 北京时间到秒；空值显示 fallback（默认 —），非法时间显示空串 */
export function formatDateTime(value?: string | null, fallback = '—') {
  return value ? utcToShanghaiTime(value, 'YYYY-MM-DD HH:mm:ss') : fallback;
}

/** 数字千分位；空值 / 非数字显示 0 */
export function formatNumber(value?: number | string | null) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
}

/** 金额：¥ + 两位小数；空值 / 非数字显示 ¥0.00 */
export function formatMoney(value?: unknown) {
  const num = Number(value || 0);
  return `¥${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
}
