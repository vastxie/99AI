import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { basename } from 'path';
import { Readable } from 'stream';
import { FileAssetStatus, FileAssetVisibility } from './fileAsset.entity';
import { FILE_ID_PATTERN } from '@/common/constants/id-pattern.constant';

// 文件名上限按 UTF-8【字节】计量，与 workspace 路径校验同单位。推导依据：
// Runtime（runtime/src/sandbox.py `_relative_components`）与 Service
// （runtime-workspace.client.ts `MAX_RELATIVE_COMPONENT_BYTES`）的路径分量上限
// 均为 255 字节；python-workspace 会把文件名拼成 `calls/<24hex>/<index>-<name>`，
// index 最大为 10（"10-" 前缀 3 字节），故 name 至多 252 字节。此处取 192，与
// python-workspace.ts 的 MAX_ARTIFACT_NAME_BYTES = 192 严格相等，保证通过产物名
// 校验（≤192 字节）的名字绝不会再被二次截断。
const MAX_RUNTIME_FILENAME_BYTES = 192;
// 截断时保留的扩展名上限：'.' + normalizeFileExtension 的 24 字符。
const MAX_PRESERVED_EXTENSION_BYTES = 25;
const SAFE_RUNTIME_PREVIEW_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]);
const SAFE_RUNTIME_PREVIEW_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'pdf']);
const BLOCKED_RUNTIME_PREVIEW_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
]);
const BLOCKED_RUNTIME_PREVIEW_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'svg']);
const SAFE_RUNTIME_PREVIEW_MEDIA_PREFIXES = ['image/', 'audio/', 'video/'];

/** 允许浏览器内联打开的类型：图片 / 音视频 / PDF / 纯文本类；其余一律附件下载 */
const INLINE_SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
]);
const INLINE_SAFE_MIME_PREFIXES = ['image/', 'audio/', 'video/'];
/** 可在同源内执行脚本或加载外部资源的类型：不论存储的 MIME 是什么，都强制下载并禁用一切 */
const SCRIPTABLE_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/xsl',
  'application/xslt+xml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'application/x-shockwave-flash',
  'multipart/related',
  'message/rfc822',
]);
const SCRIPTABLE_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'xht',
  'shtml',
  'mhtml',
  'mht',
  'xml',
  'xsl',
  'xslt',
  'svg',
  'svgz',
  'js',
  'mjs',
  'swf',
]);
const SCRIPTABLE_CSP = "default-src 'none'; sandbox";

export interface FileDeliveryHeaders {
  contentType: string;
  disposition: 'inline' | 'attachment';
  contentSecurityPolicy?: string;
}

/**
 * 文件响应头由服务端按存储的扩展名 / MIME 决定，而不是照搬客户端上传时声明的 Content-Type：
 * - 可执行脚本的类型（HTML / XML / SVG / JS …）一律 application/octet-stream + attachment + 沙箱 CSP，
 *   杜绝「公开上传一个 XML 或 SVG → 同源内联渲染 → 读取 localStorage 里的 token」；
 * - 只有图片 / 音视频 / PDF / 纯文本类允许 inline，其它类型即使请求预览也改为下载；
 * - 内联的文本类附带沙箱 CSP 作为纵深防御。
 */
function resolveFileDeliveryHeaders(input: {
  mime?: string | null;
  name?: string | null;
  ext?: string | null;
  disposition: 'inline' | 'attachment';
}): FileDeliveryHeaders {
  const mime = String(input.mime || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const nameExt = String(input.name || '').includes('.')
    ? String(input.name || '')
        .split('.')
        .pop()
    : '';
  const ext = normalizeFileExtension(input.ext || nameExt || '');
  const scriptable =
    SCRIPTABLE_MIME_TYPES.has(mime) ||
    SCRIPTABLE_EXTENSIONS.has(ext) ||
    mime.endsWith('+xml') ||
    mime.endsWith('/xml');
  if (scriptable) {
    return {
      contentType: 'application/octet-stream',
      disposition: 'attachment',
      contentSecurityPolicy: SCRIPTABLE_CSP,
    };
  }
  const contentType = mime || 'application/octet-stream';
  const inlineSafe =
    INLINE_SAFE_MIME_TYPES.has(mime) ||
    INLINE_SAFE_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
  if (input.disposition === 'inline' && !inlineSafe) {
    return { contentType, disposition: 'attachment' };
  }
  const textLike = mime.startsWith('text/') || mime === 'application/json';
  return {
    contentType,
    disposition: input.disposition,
    ...(textLike && input.disposition === 'inline'
      ? { contentSecurityPolicy: SCRIPTABLE_CSP }
      : {}),
  };
}

function uniqueRuntimeFileIds(fileIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of Array.isArray(fileIds) ? fileIds : []) {
    const fileId = String(value || '').trim();
    if (!FILE_ID_PATTERN.test(fileId)) {
      throw new BadRequestException('Runtime 输入 fileId 格式无效。');
    }
    if (seen.has(fileId)) continue;
    seen.add(fileId);
    result.push(fileId);
  }
  return result;
}

function normalizeAllowedExtensions(value?: string[] | Set<string>): Set<string> {
  const source = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [];
  return new Set(source.map(item => normalizeFileExtension(String(item || ''))).filter(Boolean));
}

function normalizeFileExtension(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

/** Truncates to a UTF-8 byte budget without splitting a multi-byte character. */
function truncateUtf8ToBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > maxBytes) break;
    bytes += size;
    result += character;
  }
  return result;
}

/**
 * 超限时优先保留扩展名再截断主体：扩展名参与下游的预览 / 允许类型判断，
 * 丢掉它会让长中文名文件在后续校验里以难懂的方式失败。
 */
function truncateRuntimeFileName(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= MAX_RUNTIME_FILENAME_BYTES) return value;
  const dotIndex = value.lastIndexOf('.');
  const extension =
    dotIndex > 0 &&
    dotIndex < value.length - 1 &&
    Buffer.byteLength(value.slice(dotIndex), 'utf8') <= MAX_PRESERVED_EXTENSION_BYTES
      ? value.slice(dotIndex)
      : '';
  const stem = extension ? value.slice(0, dotIndex) : value;
  const stemBudget = MAX_RUNTIME_FILENAME_BYTES - Buffer.byteLength(extension, 'utf8');
  return `${truncateUtf8ToBytes(stem, stemBudget)}${extension}`;
}

function sanitizeRuntimeFileName(value: string): string {
  const raw = basename(String(value || 'runtime-output.bin')).trim();
  const sanitized = truncateRuntimeFileName(
    raw.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, '_').replace(/\s+/g, ' '),
  );
  if (!sanitized || sanitized === '.' || sanitized === '..') return 'runtime-output.bin';
  return sanitized;
}

function buildPrivateObjectKey(
  partition: string,
  segment: string,
  fileId: string,
  ext: string,
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const safePartition = sanitizeStoragePrefix(partition);
  const safeSegment = sanitizeStoragePathSegment(segment) || 'files';
  return `${safePartition}/${safeSegment}/${year}${month}/${fileId}${ext ? `.${ext}` : ''}`;
}

function buildPublicAvatarObjectKey(fileId: string, ext: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `avatars/${year}${month}/${fileId}${ext ? `.${ext}` : ''}`;
}

function normalizeNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isRuntimePreviewable(mime: string, ext: string): boolean {
  const normalizedMime = String(mime || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const normalizedExt = normalizeFileExtension(ext);

  if (
    BLOCKED_RUNTIME_PREVIEW_MIME_TYPES.has(normalizedMime) ||
    BLOCKED_RUNTIME_PREVIEW_EXTENSIONS.has(normalizedExt)
  ) {
    return false;
  }

  if (SAFE_RUNTIME_PREVIEW_MIME_TYPES.has(normalizedMime)) {
    return true;
  }

  if (SAFE_RUNTIME_PREVIEW_MEDIA_PREFIXES.some(prefix => normalizedMime.startsWith(prefix))) {
    return true;
  }

  return SAFE_RUNTIME_PREVIEW_EXTENSIONS.has(normalizedExt);
}

function sanitizeFileAssetMetadata(value: Record<string, any> | null | undefined) {
  if (!value || typeof value !== 'object') return null;
  return JSON.parse(JSON.stringify(value));
}

function sanitizeMetadataText(value: unknown): string | null {
  const text = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '')
    .slice(0, 48);
  return text || null;
}

function sanitizeStoragePrefix(value: string): string {
  const parts = String(value || '')
    .split('/')
    .map(item => sanitizeStoragePathSegment(item))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('/') : 'system';
}

function sanitizeStoragePathSegment(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function hashStorageSegment(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function stableFallbackStorageId(value: string): string {
  return `stor_${createHash('sha256').update(value).digest('hex').slice(0, 18)}`;
}

function isDuplicateKeyError(error: any): boolean {
  return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
}

function detectAvatarImageType(
  buffer: Buffer,
  contentType?: string,
): { mime: string; ext: string } | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const declaredMime = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();

  const detected = detectImageTypeFromMagic(buffer);
  if (!detected) return null;
  if (
    declaredMime &&
    declaredMime !== 'application/octet-stream' &&
    declaredMime !== detected.mime
  ) {
    const equivalent =
      declaredMime === 'image/jpg' && detected.mime === 'image/jpeg'
        ? true
        : declaredMime === 'image/x-png' && detected.mime === 'image/png';
    if (!equivalent) return null;
  }
  return detected;
}

function detectImageTypeFromMagic(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(buffer.subarray(8, 12).toString('ascii'))
  ) {
    return { mime: 'image/avif', ext: 'avif' };
  }
  return null;
}

async function readStreamToBufferLimited(
  stream: Readable,
  maxBytes: number,
  limitMessage = 'Runtime 输入文件大小超出限制。',
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new BadRequestException(limitMessage);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function normalizePage(value: unknown): number {
  return Math.max(1, Math.floor(Number(value) || 1));
}

function normalizePageSize(value: unknown): number {
  return Math.max(1, Math.min(100, Math.floor(Number(value) || 10)));
}

function isFileAssetVisibility(value: unknown): value is FileAssetVisibility {
  return ['private', 'temporary', 'public'].includes(String(value || ''));
}

function isFileAssetStatus(value: unknown): value is FileAssetStatus {
  return ['active', 'deleted', 'expired', 'failed', 'processing', 'inactive'].includes(
    String(value || ''),
  );
}

function normalizeAdminFileIds(value: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const fileId = String(item || '').trim();
    if (!FILE_ID_PATTERN.test(fileId) || seen.has(fileId)) continue;
    seen.add(fileId);
    result.push(fileId);
  }
  return result;
}

function normalizeClearFilters(filters: Record<string, any>): {
  status?: FileAssetStatus;
  visibility?: FileAssetVisibility;
  origin?: string;
  userId?: number;
} {
  const normalized: {
    status?: FileAssetStatus;
    visibility?: FileAssetVisibility;
    origin?: string;
    userId?: number;
  } = {};
  const status = String(filters.status || '').trim();
  if (status) {
    if (!isFileAssetStatus(status)) throw new BadRequestException('无效的文件状态筛选条件');
    normalized.status = status;
  }
  const visibility = String(filters.visibility || '').trim();
  if (visibility) {
    if (!isFileAssetVisibility(visibility)) throw new BadRequestException('无效的可见性筛选条件');
    normalized.visibility = visibility;
  }
  const origin = String(filters.origin || '').trim();
  if (origin) normalized.origin = origin;
  const rawUserId = filters.userId;
  if (rawUserId !== undefined && rawUserId !== null && String(rawUserId).trim() !== '') {
    const userId = Number(rawUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('无效的用户 ID 筛选条件');
    }
    normalized.userId = userId;
  }
  return normalized;
}

export {
  buildPrivateObjectKey,
  buildPublicAvatarObjectKey,
  detectAvatarImageType,
  hashStorageSegment,
  isDuplicateKeyError,
  isFileAssetStatus,
  isFileAssetVisibility,
  isRuntimePreviewable,
  normalizeAdminFileIds,
  normalizeAllowedExtensions,
  normalizeClearFilters,
  normalizeFileExtension,
  normalizeNullableNumber,
  normalizePage,
  normalizePageSize,
  readStreamToBufferLimited,
  resolveFileDeliveryHeaders,
  sanitizeFileAssetMetadata,
  sanitizeMetadataText,
  sanitizeRuntimeFileName,
  sanitizeStoragePathSegment,
  stableFallbackStorageId,
  uniqueRuntimeFileIds,
};
