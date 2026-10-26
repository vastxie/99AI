import {
  type FileRefEntry,
  type FileRefKind,
  type FileRefMapping,
  FileRefMappingStore,
  type FileRefType,
} from '../../fileAsset/file-refs';
import {
  BLOCKED_OUTPUT_KEYS,
  DETAIL_LIMIT,
  OUTPUT_HINT_TYPES,
  PREVIEW_CONTENT_LIMIT,
  SAFE_ARTIFACT_ROLES,
  SENSITIVE_KEY_PATTERN,
  VISIBLE_DELIVERY_FILE_ROLES,
  normalizeKey,
} from './constants';
import { isPlainObject, parseMaybeJson, safeJsonStringify, truncate } from './text.utils';
import {
  OutputHintType,
  ToolDisplayFilePayload,
  ToolDisplayPayload,
  ToolModelPayload,
} from './types';
import {
  isInternalFileDownloadUrl,
  redactSensitiveUrlParams,
  safeText,
  sanitizeFilePreviewUrl,
  sanitizeFileUrl,
  stripInternalFileDownloadUrlsFromText,
} from './url-security';

function normalizeFileVisibility(value: unknown): string | undefined {
  const visibility = String(value || '').toLowerCase();
  return ['private', 'temporary', 'public'].includes(visibility) ? visibility : undefined;
}

function normalizeOutputType(value: unknown): OutputHintType {
  const type = String(value || '').toLowerCase();
  return OUTPUT_HINT_TYPES.has(type) ? (type as OutputHintType) : 'file';
}

function normalizeFileRole(value: unknown): string | undefined {
  const role = String(value || '')
    .trim()
    .toLowerCase();
  return SAFE_ARTIFACT_ROLES.has(role) ? role : undefined;
}

function isVisibleDeliveryFileRole(role: unknown): boolean {
  const normalized = String(role || '')
    .trim()
    .toLowerCase();
  return VISIBLE_DELIVERY_FILE_ROLES.has(normalized);
}

function isFrontendVisibleDeliveryFileItem(item: unknown): boolean {
  return isPlainObject(item) && isVisibleDeliveryFileRole(item.role);
}

function isFrontendVisibleFileRefEntry(entry: FileRefEntry): boolean {
  return (
    typeof entry.fileRef === 'string' &&
    entry.fileRef.trim().length > 0 &&
    (isVisibleDeliveryFileRole(entry.role) || /^attachment_[1-9]\d*$/.test(entry.fileRef.trim()))
  );
}

function normalizeFileAssetId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^file_[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}

function normalizeOutputFileRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^(attachment|output_image|output_file|previous_file)_([1-9]\d*)$/.test(trimmed)
    ? trimmed
    : undefined;
}

function extractFileAssetIdFromUrl(value?: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  const relativeMatch = trimmed.match(
    /^\/?api\/files\/(file_[a-zA-Z0-9_-]+)\/(?:download|preview)(?:[?#].*)?$/i,
  );
  if (relativeMatch) return relativeMatch[1];
  try {
    const pathname = new URL(trimmed).pathname;
    const match = pathname.match(/^\/api\/files\/(file_[a-zA-Z0-9_-]+)\/(?:download|preview)$/i);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

function normalizeOutputFileItems(value: any): ToolDisplayFilePayload[] {
  const parsed = parseMaybeJson(value);
  const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const files: ToolDisplayFilePayload[] = [];

  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const fileId =
      normalizeFileAssetId(item.fileId || item.id) ||
      extractFileAssetIdFromUrl(item.previewUrl) ||
      extractFileAssetIdFromUrl(item.downloadUrl) ||
      extractFileAssetIdFromUrl(item.url);
    const fileRef = normalizeOutputFileRef(item.fileRef);
    const url = sanitizeFileUrl(item.url);
    const previewUrl = sanitizeFilePreviewUrl(item.previewUrl);
    const downloadUrl = sanitizeFileUrl(item.downloadUrl || item.url);
    if (!fileId && !fileRef && !url && !previewUrl && !downloadUrl) continue;
    const title = safeText(
      item.title || item.name || item.filename || item.fileName || '文件',
      160,
    );
    const visibility = normalizeFileVisibility(item.visibility);
    const role = normalizeFileRole(item.role);
    const mime = safeText(item.mime || item.mimeType || '', 128);
    const size = Number(item.size);

    files.push({
      type: normalizeOutputType(item.type || item.fileType),
      ...(fileRef ? { fileRef } : {}),
      ...(fileId ? { id: fileId, fileId } : {}),
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
      ...(previewUrl ? { previewUrl } : {}),
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(typeof item.fileType === 'string' ? { fileType: safeText(item.fileType, 40) } : {}),
      ...(mime ? { mime, mimeType: mime } : {}),
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(visibility ? { visibility } : {}),
      ...(item.privateDownloadHidden === true ? { privateDownloadHidden: true } : {}),
      ...(role ? { role } : {}),
      ...(typeof item.origin === 'string' ? { origin: safeText(item.origin, 96) } : {}),
    });
  }

  return files;
}

function getDisplayFileKey(item: ToolDisplayFilePayload): string {
  return [
    item.fileRef,
    item.fileId,
    item.id,
    item.url,
    item.previewUrl,
    item.downloadUrl,
    item.title,
  ]
    .filter(Boolean)
    .join('|');
}

function collectToolCallDisplayFiles(toolResult: any): ToolDisplayFilePayload[] {
  const files: ToolDisplayFilePayload[] = [];
  const sources = [toolResult?.display, toolResult?.output];

  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    files.push(
      ...normalizeOutputFileItems(source.fileAssets),
      ...normalizeOutputFileItems(source.files),
      ...normalizeOutputFileItems(source.attachments),
    );
  }

  return files;
}

function mergeToolCallDisplayFiles(display: ToolDisplayPayload, toolResult: any): void {
  const collectedFiles = collectToolCallDisplayFiles(toolResult);
  if (!collectedFiles.length) return;

  const mergedFiles: ToolDisplayFilePayload[] = [];
  const seenFileKeys = new Set<string>();
  const pushFile = (item: ToolDisplayFilePayload) => {
    if (!isFrontendVisibleDeliveryFileItem(item)) return;
    const key = getDisplayFileKey(item);
    if (key && seenFileKeys.has(key)) return;
    if (key) seenFileKeys.add(key);
    mergedFiles.push(item);
  };

  for (const item of normalizeOutputFileItems(display.files)) {
    pushFile(item);
  }
  for (const item of collectedFiles) {
    pushFile(item);
  }

  if (mergedFiles.length) {
    display.files = mergedFiles;
  }
}

function normalizePreviewItem(item: any): any | null {
  if (!isPlainObject(item)) return null;
  const previewContent =
    typeof item.previewContent === 'string'
      ? truncate(item.previewContent, PREVIEW_CONTENT_LIMIT)
      : '';
  if (!previewContent.trim()) return null;

  return {
    title: safeText(item.title || item.name || item.fileName || item.filename || '预览内容', 160),
    fileType: safeText(item.fileType || 'text', 40),
    previewContent,
    previewContentType: safeText(item.previewContentType || item.fileType || 'text', 40),
    ...(sanitizeFileUrl(item.downloadUrl)
      ? { downloadUrl: sanitizeFileUrl(item.downloadUrl) }
      : {}),
  };
}

function normalizePreviewItems(value: any): any[] {
  const parsed = parseMaybeJson(value);
  const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return items.map(normalizePreviewItem).filter(Boolean);
}

function normalizeDetails(value: any): ToolDisplayPayload['details'] {
  if (!Array.isArray(value)) return undefined;

  const details = value
    .map(item => {
      if (!isPlainObject(item)) return null;
      const rawUrl =
        typeof (item.url || item.link || item.href || item.sourceUrl) === 'string'
          ? item.url || item.link || item.href || item.sourceUrl
          : undefined;
      const url = rawUrl ? redactSensitiveUrlParams(rawUrl) : undefined;
      const snippet = safeText(
        item.snippet || item.content || item.description || item.summary || item.text,
        220,
      );
      let domain = safeText(item.domain || item.site || '', 80);
      if (!domain && url) {
        try {
          domain = new URL(url).hostname;
        } catch {}
      }
      const title = safeText(item.title || item.name || item.label || domain || url, 160);
      if (!title) return null;
      const source = safeText(
        item.sourceName || item.sourceEngine || item.source || item.provider || item.engine,
        80,
      );
      return {
        title,
        ...(item.subtitle ? { subtitle: safeText(item.subtitle, 120) } : {}),
        ...(url ? { url } : {}),
        ...(snippet ? { snippet, content: snippet } : {}),
        ...(domain ? { domain } : {}),
        ...(source ? { sourceName: source, source } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, DETAIL_LIMIT) as ToolDisplayPayload['details'];

  return details?.length ? details : undefined;
}

function parseMarkdownSearchDetails(content: string): ToolDisplayPayload['details'] {
  if (!content) return undefined;
  const blocks = content.split(/\n\s*\n/).slice(0, DETAIL_LIMIT);
  const details: NonNullable<ToolDisplayPayload['details']> = [];

  for (const block of blocks) {
    const titleMatch = block.match(/\*\*(.+?)\*\*/);
    const urlMatch = block.match(/(?:链接|来源|URL|url)[:：]\s*(https?:\/\/\S+)/i);
    // 只有「标题 + 链接」同时出现才算一条搜索结果：任何工具输出里的加粗文本（bash 输出、
    // 模型正文等）都可能匹配到 **…**，之前会被伪造成一条标题为「搜索结果」的条目
    if (!titleMatch || !urlMatch) continue;
    const title = safeText(titleMatch[1] || urlMatch[1], 160);
    if (!title) continue;
    const url = urlMatch?.[1]?.replace(/[),.，。]+$/, '');
    const safeUrl = url ? redactSensitiveUrlParams(url) : undefined;
    const snippet = safeText(block.replace(/\*\*/g, ''), 220);
    details.push({
      title,
      ...(safeUrl ? { url: safeUrl } : {}),
      ...(snippet ? { snippet, content: snippet } : {}),
    });
  }

  return details.length ? details : undefined;
}

function pickContent(rawResult: any): string {
  if (typeof rawResult === 'string') return stripInternalFileDownloadUrlsFromText(rawResult);
  if (!isPlainObject(rawResult)) return safeJsonStringify(rawResult);

  const candidate =
    rawResult.content ??
    rawResult.result?.content ??
    rawResult.finalContent ??
    rawResult.displayContent ??
    rawResult.userContent ??
    rawResult.markdown ??
    rawResult.message ??
    rawResult.summary;

  if (typeof candidate === 'string') return stripInternalFileDownloadUrlsFromText(candidate);
  return safeJsonStringify(stripBlockedKeys(rawResult));
}

function stripBlockedKeys(value: any): any {
  if (Array.isArray(value)) return value.map(stripBlockedKeys);
  if (!isPlainObject(value)) return value;

  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key) || BLOCKED_OUTPUT_KEYS.has(normalizeKey(key))) continue;
    result[key] = stripBlockedKeys(item);
  }
  return result;
}

function appendOutputFileLines(content: string, rawResult: any): string {
  if (!isPlainObject(rawResult)) return content;
  const lines: string[] = [];
  const normalizedFiles = [
    ...normalizeOutputFileItems(rawResult.files),
    ...normalizeOutputFileItems(rawResult.fileAssets),
    ...normalizeOutputFileItems(rawResult.attachments),
  ];
  const labels: Record<string, string> = {
    image: '图片地址',
    video: '视频地址',
    audio: '音频地址',
    file: '文件地址',
    document: '文件地址',
  };
  const groupedUrls = new Map<string, string[]>();
  for (const item of normalizedFiles) {
    const url = item.url || item.downloadUrl;
    if (!url || isInternalFileDownloadUrl(String(url))) continue;
    const label = labels[item.type] || '文件地址';
    const urls = groupedUrls.get(label) || [];
    urls.push(url);
    groupedUrls.set(label, urls);
  }
  for (const [label, urls] of groupedUrls.entries()) {
    lines.push(`${label}：${urls.join('、')}`);
  }

  return [content, ...lines].filter(Boolean).join('\n');
}

function formatFileSize(size: unknown): string | undefined {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function normalizeWorkflowProgress(value: unknown): ToolDisplayPayload['workflowProgress'] {
  if (!isPlainObject(value)) return undefined;
  const kind = safeText(value.kind || value.type, 40);
  if (!kind) return undefined;
  const current = Number(value.current);
  const total = Number(value.total);
  return {
    kind,
    ...(value.stage ? { stage: safeText(value.stage, 40) } : {}),
    ...(value.label ? { label: safeText(value.label, 120) } : {}),
    ...(Number.isFinite(current) && current >= 0 ? { current } : {}),
    ...(Number.isFinite(total) && total >= 0 ? { total } : {}),
  };
}

type ModelFileProjection = {
  files: NonNullable<ToolModelPayload['files']>;
  fileRefs?: FileRefMapping;
};

function resolveModelFileRefKind(item: ToolDisplayFilePayload): FileRefKind {
  return item.type === 'image' ? 'output_image' : 'output_file';
}

function normalizeFileRefType(item: ToolDisplayFilePayload): FileRefType {
  if (item.type === 'image' || item.type === 'video' || item.type === 'audio') return item.type;
  if (item.type === 'document') return 'document';
  const mime = String(item.mime || item.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.includes('wordprocessingml') ||
    mime.includes('spreadsheetml') ||
    mime.includes('presentationml') ||
    mime.startsWith('text/')
  ) {
    return 'document';
  }
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) return 'archive';
  return 'file';
}

function buildModelFileProjection(
  rawResult: any,
  sharedStore?: FileRefMappingStore,
): ModelFileProjection {
  if (!isPlainObject(rawResult)) return { files: [] };

  const sourceItems = [
    ...normalizeOutputFileItems(rawResult.fileAssets),
    ...normalizeOutputFileItems(rawResult.files),
    ...normalizeOutputFileItems(rawResult.attachments),
  ];

  const store = sharedStore || new FileRefMappingStore();
  const files: NonNullable<ToolModelPayload['files']> = [];
  const entries: FileRefEntry[] = [];
  const seenFileRefs = new Set<string>();

  for (const item of sourceItems) {
    const fileId = normalizeFileAssetId(item.fileId || item.id);
    if (!fileId) continue;

    try {
      const mime = item.mime || item.mimeType;
      const name = item.title || '文件';
      const type = normalizeFileRefType(item);
      const entry = store.registerFile(fileId, {
        refKind: resolveModelFileRefKind(item),
        origin: item.origin || 'tool_output',
        name,
        mime,
        type,
        size: Number.isFinite(Number(item.size)) ? Number(item.size) : undefined,
        role: item.role,
      });
      if (seenFileRefs.has(entry.fileRef)) continue;
      seenFileRefs.add(entry.fileRef);
      entries.push(entry);
      files.push({
        fileRef: entry.fileRef,
        type: item.type,
        ...(name ? { name } : {}),
        ...(mime ? { mime } : {}),
        ...(Number.isFinite(Number(item.size)) ? { size: Number(item.size) } : {}),
        ...(item.role ? { role: item.role } : {}),
      });
    } catch {
      continue;
    }
  }

  return {
    files,
    ...(files.length
      ? {
          fileRefs: {
            entries,
            counters: store.snapshot().counters,
          },
        }
      : {}),
  };
}

function normalizeModelFiles(rawResult: any): NonNullable<ToolModelPayload['files']> {
  return buildModelFileProjection(rawResult).files;
}

function appendModelOutputFileLines(
  content: string,
  rawResult: any,
  files = normalizeModelFiles(rawResult),
): string {
  if (!files.length) return content;

  const lines = files.map(item => {
    const parts = [
      `fileRef=${item.fileRef}`,
      item.name ? `name=${item.name}` : '',
      item.mime ? `mime=${item.mime}` : '',
      formatFileSize(item.size) ? `size=${formatFileSize(item.size)}` : '',
      item.role ? `role=${item.role}` : '',
    ].filter(Boolean);
    return `- ${parts.join(' | ')}`;
  });

  return [content, '输出文件：', ...lines].filter(Boolean).join('\n');
}

function normalizeInternalFileRefType(
  entry: Pick<FileRefEntry, 'fileRef' | 'type'>,
): NonNullable<ToolModelPayload['files']>[number]['type'] {
  const type = String(entry.type || '').toLowerCase();
  if (['image', 'video', 'audio', 'document', 'file'].includes(type)) {
    return type as NonNullable<ToolModelPayload['files']>[number]['type'];
  }
  if (entry.fileRef?.startsWith('output_image_')) return 'image';
  return 'file';
}

function buildModelFilesFromFileRefs(
  mapping?: FileRefMapping,
): NonNullable<ToolModelPayload['files']> {
  if (!Array.isArray(mapping?.entries)) return [];

  const files: NonNullable<ToolModelPayload['files']> = [];
  const seenFileRefs = new Set<string>();
  for (const entry of mapping.entries) {
    if (!entry?.fileRef || seenFileRefs.has(entry.fileRef)) continue;
    seenFileRefs.add(entry.fileRef);

    files.push({
      fileRef: entry.fileRef,
      type: normalizeInternalFileRefType(entry),
      ...(entry.name ? { name: safeText(entry.name, 160) } : {}),
      ...(entry.mime ? { mime: safeText(entry.mime, 128) } : {}),
      ...(Number.isFinite(Number(entry.size)) ? { size: Number(entry.size) } : {}),
      ...(entry.role ? { role: safeText(entry.role, 80) } : {}),
    });
  }

  return files;
}

function appendMissingFileRefLines(
  content: string,
  files: NonNullable<ToolModelPayload['files']>,
): string {
  const missingFiles = files.filter(item => !content.includes(`fileRef=${item.fileRef}`));
  return missingFiles.length
    ? appendModelOutputFileLines(content, undefined, missingFiles)
    : content;
}

function mergeModelFileLists(
  ...fileLists: Array<NonNullable<ToolModelPayload['files']>>
): NonNullable<ToolModelPayload['files']> {
  const result: NonNullable<ToolModelPayload['files']> = [];
  const seenFileRefs = new Set<string>();
  for (const files of fileLists) {
    for (const file of files) {
      if (!file.fileRef || seenFileRefs.has(file.fileRef)) continue;
      seenFileRefs.add(file.fileRef);
      result.push(file);
    }
  }
  return result;
}

export {
  appendMissingFileRefLines,
  appendModelOutputFileLines,
  appendOutputFileLines,
  buildModelFileProjection,
  buildModelFilesFromFileRefs,
  formatFileSize,
  isFrontendVisibleDeliveryFileItem,
  isFrontendVisibleFileRefEntry,
  mergeModelFileLists,
  mergeToolCallDisplayFiles,
  normalizeDetails,
  normalizeFileAssetId,
  normalizeFileVisibility,
  normalizeModelFiles,
  normalizeOutputFileItems,
  normalizeOutputType,
  normalizePreviewItem,
  normalizePreviewItems,
  normalizeWorkflowProgress,
  parseMarkdownSearchDetails,
  pickContent,
};
