/**
 * 任务对外文本的安全收敛：截断、隐藏私有文件地址 / 凭证 / 运行时痕迹。
 * 任务事件、结果卡与任务控制共用。
 */

export const TASK_RESULT_SUMMARY_LIMIT = 220;

export function sanitizeTaskControlText(value: unknown, limit = TASK_RESULT_SUMMARY_LIMIT): string {
  if (value === undefined || value === null) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const normalized = raw
    .replace(
      /(?:https?:\/\/[^/\s)'"<>]+)?\/?api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)(?:[?#][^\s)'"<>]*)?/gi,
      '[private-file-url-hidden]',
    )
    .replace(
      /\b(?:stdout|stderr|rawPayload|providerPayload|providerResponse)\b\s*[:=]\s*\S+/gi,
      '[runtime-detail-hidden]',
    )
    .replace(/\b(?:trace|diagnostics|stack)\b\s*[:=]\s*[\s\S]{0,600}/gi, '[trace-hidden]')
    .replace(/\bat\s+[^\n]+(?:\/|\\)[^\n]+:\d+:\d+/g, '[stack-frame-hidden]')
    .replace(
      /(?:\/Users|\/private|\/var|\/tmp|\/home|\/root|[A-Za-z]:\\)[^\s)'"<>]+/g,
      '[path-hidden]',
    )
    .replace(/\bbaseUrl\s*[:=]\s*\S+/gi, 'baseUrl=[hidden]')
    .replace(
      /\b(api[_-]?key|access[_-]?token|authorization|bearer|secret|password)\s*[:=]\s*\S+/gi,
      (_match, key) => `${key}=[hidden]`,
    )
    .replace(/https?:\/\/[^\s)'"<>]+/gi, match => {
      try {
        return new URL(match).hostname;
      } catch {
        return '[url-hidden]';
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}
