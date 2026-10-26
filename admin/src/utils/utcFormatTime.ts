import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 将后端时间（ISO-8601 UTC 等）格式化为北京时间（Asia/Shanghai）。
 */
export function utcToShanghaiTime(utcTime: string, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!utcTime) return '';
  const date = dayjs(utcTime);
  if (!date.isValid()) return '';
  return date.tz('Asia/Shanghai').format(format);
}
