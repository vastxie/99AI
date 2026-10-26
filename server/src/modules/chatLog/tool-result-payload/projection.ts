import {
  compactToolModelContent,
  normalizeSearchItems,
  normalizeToolResultOutputDescriptor,
} from './compaction';
import {
  MODEL_CONTENT_LIMIT,
  SAFE_INPUT_KEYS,
  SENSITIVE_KEY_PATTERN,
  SUMMARY_LIMIT,
} from './constants';
import {
  appendModelOutputFileLines,
  appendOutputFileLines,
  buildModelFileProjection,
  isFrontendVisibleDeliveryFileItem,
  normalizeDetails,
  normalizeOutputFileItems,
  normalizePreviewItem,
  normalizePreviewItems,
  normalizeWorkflowProgress,
  parseMarkdownSearchDetails,
  pickContent,
} from './display-files';
import { isPlainObject, truncate } from './text.utils';
import {
  ToolDisplayPayload,
  ToolModelPayload,
  ToolProjection,
  ToolResultCompactionContext,
} from './types';
import { safeText, sanitizeFileUrl } from './url-security';

export function sanitizeToolInput(input: unknown): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return safeText(input, 160) || undefined;
  if (Array.isArray(input)) {
    const parts = input
      .slice(0, 3)
      .map(item => sanitizeToolInput(item))
      .filter(Boolean);
    return parts.length ? parts.join('、') : undefined;
  }
  if (!isPlainObject(input)) return safeText(input, 160) || undefined;

  const parts: string[] = [];
  for (const key of SAFE_INPUT_KEYS) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${key}: ${safeText(value, 80)}`);
    if (parts.length >= 3) break;
  }

  return parts.length ? parts.join(' · ') : undefined;
}

function normalizeStringList(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  const items: string[] = [];
  for (const item of rawItems) {
    const text = safeText(item, 160);
    if (!text || items.includes(text)) continue;
    items.push(text);
    if (items.length >= 5) break;
  }
  return items;
}

function mergeDetailLists(
  ...lists: Array<ToolDisplayPayload['details']>
): ToolDisplayPayload['details'] {
  const merged: NonNullable<ToolDisplayPayload['details']> = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const detail of list || []) {
      const key = `${detail.url || ''}|${detail.title || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(detail);
      if (merged.length >= 10) return merged;
    }
  }

  return merged.length ? merged : undefined;
}

export function buildModelPayload(
  rawResult: any,
  context: ToolResultCompactionContext = {},
): ToolModelPayload {
  return buildToolProjection(rawResult, context).model;
}

function buildToolProjection(
  rawResult: any,
  context: ToolResultCompactionContext = {},
): Pick<ToolProjection, 'model' | 'internal'> {
  const output = normalizeToolResultOutputDescriptor(context.output);
  const fileProjection = buildModelFileProjection(rawResult, context.fileRefMappingStore);
  const compacted = compactToolModelContent(rawResult, context);
  const contentWithPublicFiles = compacted.includePublicFileUrls
    ? appendOutputFileLines(compacted.content, rawResult)
    : compacted.content;
  const contentWithFileReferences =
    compacted.includeFileReferenceLines === false
      ? contentWithPublicFiles
      : appendModelOutputFileLines(contentWithPublicFiles, rawResult, fileProjection.files);
  const content = truncate(contentWithFileReferences, MODEL_CONTENT_LIMIT);
  return {
    model: {
      content: content || '工具执行完成',
      ...(output ? { output } : {}),
      ...(fileProjection.files.length ? { files: fileProjection.files } : {}),
    },
    internal: {
      ...(fileProjection.fileRefs ? { fileRefs: fileProjection.fileRefs } : {}),
    },
  };
}

export function buildDisplayPayload(
  rawResult: any,
  input?: any,
  status?: 'success' | 'error' | 'loading',
): ToolDisplayPayload {
  const rawObject = isPlainObject(rawResult) ? rawResult : {};
  const inputSummary = sanitizeToolInput(input);
  const publicError =
    status === 'error'
      ? safeText(
          rawObject.publicError ||
            rawObject.error ||
            rawObject.message ||
            rawResult ||
            '工具处理失败',
          160,
        )
      : undefined;
  const rawContent = pickContent(rawResult);
  const summary =
    publicError ||
    safeText(
      rawObject.summary ||
        rawObject.publicError ||
        rawObject.statusText ||
        rawObject.thought ||
        rawObject.title ||
        rawObject.message ||
        rawContent,
      SUMMARY_LIMIT,
    );

  const display: ToolDisplayPayload = {
    ...(inputSummary ? { inputSummary } : {}),
    ...(summary ? { summary, content: summary, thought: summary } : {}),
    ...(publicError ? { publicError, error: publicError } : {}),
  };

  const rawJson = isPlainObject(rawObject.json) ? rawObject.json : {};
  const queries = normalizeStringList(rawObject.queries || rawJson.queries || rawObject.query);
  const details = mergeDetailLists(
    normalizeDetails(rawObject.details) || normalizeDetails(rawJson.details),
    normalizeDetails(rawObject.results),
    normalizeDetails(rawJson.results),
    normalizeDetails(rawObject.sources),
    normalizeDetails(rawJson.sources),
    normalizeDetails(normalizeSearchItems(rawResult)),
    parseMarkdownSearchDetails(rawContent),
  );
  if (queries.length) display.queries = queries;
  if (details?.length) display.details = details;
  if (Array.isArray(rawObject.results)) display.results = rawObject.results;
  else if (Array.isArray(rawJson.results)) display.results = rawJson.results;
  if (Array.isArray(rawObject.sources)) display.sources = rawObject.sources;
  else if (Array.isArray(rawJson.sources)) display.sources = rawJson.sources;
  const workflowProgress = normalizeWorkflowProgress(
    rawObject.workflowProgress || rawObject.presentationProgress,
  );
  if (workflowProgress) display.workflowProgress = workflowProgress;

  const previewItems = normalizePreviewItems(rawObject.filePreview);
  const directPreview = normalizePreviewItem(rawObject);
  const allPreviewItems = previewItems.length ? previewItems : directPreview ? [directPreview] : [];
  if (allPreviewItems.length) {
    const directDownloadUrl = sanitizeFileUrl(rawObject.downloadUrl);
    if (directDownloadUrl) {
      allPreviewItems[0].downloadUrl = allPreviewItems[0].downloadUrl || directDownloadUrl;
    }
    display.filePreview = allPreviewItems.length === 1 ? allPreviewItems[0] : allPreviewItems;
    const first = allPreviewItems[0];
    display.title = first.title;
    display.fileType = first.fileType;
    display.previewContent = first.previewContent;
    display.previewContentType = first.previewContentType;
    if (first.downloadUrl) display.downloadUrl = first.downloadUrl;
  } else {
    if (typeof rawObject.title === 'string') display.title = safeText(rawObject.title, 160);
    if (typeof rawObject.fileType === 'string') display.fileType = safeText(rawObject.fileType, 40);
    const downloadUrl = sanitizeFileUrl(rawObject.downloadUrl);
    if (downloadUrl) display.downloadUrl = downloadUrl;
  }

  const files: NonNullable<ToolDisplayPayload['files']> = [];
  const seenOutputFileKeys = new Set<string>();
  const pushFile = (item: NonNullable<ToolDisplayPayload['files']>[number]) => {
    if (!isFrontendVisibleDeliveryFileItem(item)) return;
    const key =
      item.fileId || item.id || item.url || item.previewUrl || item.downloadUrl || item.title;
    if (key && seenOutputFileKeys.has(key)) return;
    if (key) seenOutputFileKeys.add(key);
    files.push(item);
  };

  for (const item of normalizeOutputFileItems(rawObject.fileAssets)) {
    pushFile(item);
  }
  for (const item of normalizeOutputFileItems(rawObject.files)) {
    pushFile(item);
  }
  for (const item of normalizeOutputFileItems(rawObject.attachments)) {
    pushFile(item);
  }

  for (const item of allPreviewItems) {
    pushFile({
      type: 'document',
      title: item.title,
      role: 'preview',
      fileType: item.fileType,
      downloadUrl: item.downloadUrl,
      preview: {
        contentType: item.previewContentType,
        content: item.previewContent,
      },
    });
  }
  if (files.length) {
    display.files = files;
  }

  return display;
}

export { buildToolProjection };
