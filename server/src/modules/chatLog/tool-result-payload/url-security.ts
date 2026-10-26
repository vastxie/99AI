import {
  TOOL_PAYLOAD_HIDDEN_TEXT,
  SENSITIVE_TEXT_KEYS,
  SENSITIVE_TEXT_KEY_PATTERN,
  SUMMARY_LIMIT,
} from './constants';
import {
  escapeRegExp,
  normalizeWhitespace,
  safeJsonStringify,
  stripHtml,
  truncate,
} from './text.utils';

function redactSensitiveUrlParams(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>，。)）]+/gi, url => {
    const hashIndex = url.indexOf('#');
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    const queryIndex = withoutHash.indexOf('?');
    if (queryIndex < 0) return url;

    const base = withoutHash.slice(0, queryIndex);
    const query = withoutHash.slice(queryIndex + 1);
    const redactedQuery = query
      .split('&')
      .map(part => {
        const equalIndex = part.indexOf('=');
        const rawKey = equalIndex >= 0 ? part.slice(0, equalIndex) : part;
        let decodedKey = rawKey;
        try {
          decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        } catch {}
        if (!SENSITIVE_TEXT_KEY_PATTERN.test(decodedKey)) return part;
        return equalIndex >= 0 ? `${rawKey}=${TOOL_PAYLOAD_HIDDEN_TEXT}` : `${rawKey}`;
      })
      .join('&');

    return `${base}?${redactedQuery}${hash}`;
  });
}

function hasSensitiveUrlQuery(value: string): boolean {
  const queryIndex = value.indexOf('?');
  if (queryIndex < 0) return false;

  const hashIndex = value.indexOf('#', queryIndex);
  const query = value.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
  return query.split('&').some(part => {
    const equalIndex = part.indexOf('=');
    const rawKey = equalIndex >= 0 ? part.slice(0, equalIndex) : part;
    let decodedKey = rawKey;
    try {
      decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {}
    return SENSITIVE_TEXT_KEY_PATTERN.test(decodedKey);
  });
}

function isInternalFileUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/^\/?file\//.test(trimmed)) return true;
  if (!/^https?:\/\//i.test(trimmed)) return false;

  try {
    return new URL(trimmed).pathname.startsWith('/file/');
  } catch {
    return false;
  }
}

function isInternalFileDownloadUrl(value: string): boolean {
  return Boolean(normalizeInternalFileDownloadUrl(value));
}

function isInternalPrivateFileUrl(value: string): boolean {
  return Boolean(normalizeInternalFileDownloadUrl(value) || normalizeInternalFilePreviewUrl(value));
}

function isPublicFileDownloadUrl(value: string): boolean {
  return Boolean(normalizePublicFileDownloadUrl(value));
}

function normalizeInternalFileDownloadUrl(value: string): string | undefined {
  const trimmed = value.trim();
  const fileRelativeMatch = trimmed.match(/^\/?api\/files\/(file_[a-zA-Z0-9_-]+)\/download$/);
  if (fileRelativeMatch) return `/api/files/${fileRelativeMatch[1]}/download`;

  if (!/^https?:\/\//i.test(trimmed)) return undefined;

  try {
    const pathname = new URL(trimmed).pathname;
    const fileMatch = pathname.match(/^\/api\/files\/(file_[a-zA-Z0-9_-]+)\/download$/);
    return fileMatch ? `/api/files/${fileMatch[1]}/download` : undefined;
  } catch {
    return undefined;
  }
}

function normalizeInternalFilePreviewUrl(value: string): string | undefined {
  const trimmed = value.trim();
  const fileRelativeMatch = trimmed.match(/^\/?api\/files\/(file_[a-zA-Z0-9_-]+)\/preview$/);
  if (fileRelativeMatch) return `/api/files/${fileRelativeMatch[1]}/preview`;

  if (!/^https?:\/\//i.test(trimmed)) return undefined;

  try {
    const pathname = new URL(trimmed).pathname;
    const fileMatch = pathname.match(/^\/api\/files\/(file_[a-zA-Z0-9_-]+)\/preview$/);
    return fileMatch ? `/api/files/${fileMatch[1]}/preview` : undefined;
  } catch {
    return undefined;
  }
}

function normalizePublicFileDownloadUrl(value: string): string | undefined {
  const trimmed = value.trim();
  const fileRelativeMatch = trimmed.match(
    /^\/?api\/files\/public\/(file_[a-zA-Z0-9_-]+)\/download$/,
  );
  if (fileRelativeMatch) return `/api/files/public/${fileRelativeMatch[1]}/download`;

  if (!/^https?:\/\//i.test(trimmed)) return undefined;

  try {
    const pathname = new URL(trimmed).pathname;
    const fileMatch = pathname.match(/^\/api\/files\/public\/(file_[a-zA-Z0-9_-]+)\/download$/);
    return fileMatch ? `/api/files/public/${fileMatch[1]}/download` : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeFileUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const internalFileUrl = normalizeInternalFileDownloadUrl(trimmed);
  if (internalFileUrl) return internalFileUrl;
  if (normalizeInternalFilePreviewUrl(trimmed)) return undefined;
  const publicFileUrl = normalizePublicFileDownloadUrl(trimmed);
  if (publicFileUrl) return publicFileUrl;

  if (
    /^https?:\/\//i.test(trimmed) &&
    hasSensitiveUrlQuery(trimmed) &&
    !isInternalFileUrl(trimmed)
  ) {
    return undefined;
  }

  return trimmed;
}

function sanitizeFilePreviewUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return normalizeInternalFilePreviewUrl(trimmed);
}

function stripInternalFileDownloadUrlsFromText(value: string): string {
  return value
    .replace(/https?:\/\/[^"'\s<>]+\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)/gi, '')
    .replace(/\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)/gi, '')
    .replace(/\bapi\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)\b/gi, '');
}

function stripFileAssetIdsFromText(value: string): string {
  return value.replace(/\bfile_[a-zA-Z0-9_-]+\b/g, '[private-file]');
}

function hideUrlsFromModelSummary(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>，。)）]+/gi, '[文件链接已隐藏]');
}

function redactSensitiveText(value: string): string {
  let redacted = redactSensitiveUrlParams(value);
  const sensitiveKeyPattern = SENSITIVE_TEXT_KEYS.map(key =>
    escapeRegExp(key).replace(/[-_]/g, '[-_]?'),
  ).join('|');

  redacted = redacted
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${TOOL_PAYLOAD_HIDDEN_TEXT}`)
    .replace(
      new RegExp(`\\b(${sensitiveKeyPattern})\\b\\s*[:=]\\s*([^\\s&"'<>，。;,]+)`, 'gi'),
      (_match, key) => `${key}=${TOOL_PAYLOAD_HIDDEN_TEXT}`,
    )
    .replace(
      new RegExp(`(["']?(${sensitiveKeyPattern})["']?\\s*:\\s*["'])([^"']+)(["'])`, 'gi'),
      (_match, prefix, _key, _value, suffix) => `${prefix}${TOOL_PAYLOAD_HIDDEN_TEXT}${suffix}`,
    );

  return redacted;
}

function stripSensitiveUrlsFromModelText(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>，。)）]+/gi, url =>
    hasSensitiveUrlQuery(url) || isInternalPrivateFileUrl(url) || isPrivateFileAssetUrl(url)
      ? '[文件链接已隐藏]'
      : url,
  );
}

function stripSensitiveModelTextSections(value: string): string {
  return value
    .replace(
      /(^|\n)\s*(?:raw[-_ ]?logs?|runtime[-_ ]?logs?|logs?|stdout|stderr|stack)\s*[:=][^\n]*(?=\n|$)/gi,
      '$1[运行日志已隐藏]',
    )
    .replace(
      /\b(?:object[-_ ]?key|storage[-_ ]?path)\b\s*[:=]\s*([^\s&"'<>，。;,]+)/gi,
      '[内部存储路径已隐藏]',
    );
}

function safeText(value: unknown, limit = SUMMARY_LIMIT): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : safeJsonStringify(value);
  const withoutPrivateFileUrls = stripFileAssetIdsFromText(
    stripInternalFileDownloadUrlsFromText(raw),
  );
  return truncate(
    normalizeWhitespace(
      stripHtml(redactSensitiveText(stripLargeInlinePayloads(withoutPrivateFileUrls))),
    ),
    limit,
  );
}

function isPrivateFileAssetUrl(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (/^\/?api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)(?:[?#].*)?$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return /^\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * 从站内文件访问 URL 中提取文件资产 ID。
 * 文件项的公开身份是 fileId（访问时由文件 API 鉴权），URL 仅是访问形态；
 * 投影时始终补全显式 fileId，避免下游脱敏隐藏 URL 后文件身份一并丢失。
 */

function stripLargeInlinePayloads(value: string): string {
  return value
    .replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]{120,}/gi, '[内联文件内容已隐藏]')
    .replace(/\b[A-Za-z0-9+/]{1200,}={0,2}\b/g, '[长文本已隐藏]');
}

export {
  hasSensitiveUrlQuery,
  hideUrlsFromModelSummary,
  isInternalFileDownloadUrl,
  isInternalPrivateFileUrl,
  isPrivateFileAssetUrl,
  isPublicFileDownloadUrl,
  redactSensitiveText,
  redactSensitiveUrlParams,
  safeText,
  sanitizeFilePreviewUrl,
  sanitizeFileUrl,
  stripFileAssetIdsFromText,
  stripInternalFileDownloadUrlsFromText,
  stripLargeInlinePayloads,
  stripSensitiveModelTextSections,
  stripSensitiveUrlsFromModelText,
};
