import {
  type FileRefEntry,
  type FileRefMapping,
  FileRefMappingStore,
} from '../../fileAsset/file-refs';
import { readPresentedFiles, readQuestion } from '@99agent/contracts';
import {
  type AgentToolAsset,
  type AgentToolResult,
  type AgentToolResultDisplay,
  type AgentToolResultStatus,
  type AgentToolResultTrace,
  normalizeToolResult,
} from '../agent-tool-result.types';
import {
  normalizeToolResultOutputDescriptor,
  normalizeToolResultOutputKind,
  safeDiagnosticText,
  safeModelText,
} from './compaction';
import { MODEL_CONTENT_LIMIT, PREVIEW_CONTENT_LIMIT, normalizeKey } from './constants';
import {
  appendMissingFileRefLines,
  appendModelOutputFileLines,
  buildModelFilesFromFileRefs,
  isFrontendVisibleFileRefEntry,
  mergeModelFileLists,
  mergeToolCallDisplayFiles,
  normalizeFileAssetId,
  normalizeFileVisibility,
  normalizeOutputType,
  normalizeWorkflowProgress,
} from './display-files';
import { capFaithfulText, isFaithfulTextTool, sanitizeFaithfulText } from './faithful-text';
import { buildDisplayPayload, buildToolProjection, sanitizeToolInput } from './projection';
import { isPlainObject, normalizeOutputHint, parseMaybeJson, truncate } from './text.utils';
import {
  AgentToolCallTrace,
  LayeredToolResult,
  OutputHint,
  SafeDiagnostics,
  ToolDisplayFilePayload,
  ToolDisplayPayload,
  ToolModelPayload,
  ToolProjectionDisplay,
  ToolProjectionInternal,
  ToolResultOutputDescriptor,
} from './types';
import {
  isInternalPrivateFileUrl,
  isPrivateFileAssetUrl,
  isPublicFileDownloadUrl,
  safeText,
} from './url-security';

function hasPrivateFileDownload(value: any): boolean {
  if (!isPlainObject(value)) return false;
  const url = String(value.url || value.downloadUrl || value.previewUrl || '');
  const fileId = normalizeFileAssetId(value.fileId || value.id);
  const visibility = normalizeFileVisibility(value.visibility);
  const publicFileUrl = url && isPublicFileDownloadUrl(url);
  const privateFileUrl = url && isInternalPrivateFileUrl(url);
  const privateFileAssetUrl = url && isPrivateFileAssetUrl(url);
  const publicFile = Boolean(publicFileUrl || (visibility === 'public' && !url));
  return Boolean(
    !publicFile &&
    (fileId ||
      visibility === 'private' ||
      visibility === 'temporary' ||
      privateFileUrl ||
      privateFileAssetUrl),
  );
}

export function stripPrivateFileDownloadsForFrontend(value: any): any {
  if (Array.isArray(value)) return value.map(item => stripPrivateFileDownloadsForFrontend(item));
  if (!isPlainObject(value)) {
    if (typeof value === 'string') {
      if (
        isPublicFileDownloadUrl(value) ||
        isInternalPrivateFileUrl(value) ||
        isPrivateFileAssetUrl(value)
      ) {
        return '';
      }
      return value
        .replace(
          /(?:https?:\/\/[^/\s)\]'"<>]+)?\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)(?:[?#][^\s)\]'"<>]*)?/gi,
          '',
        )
        .replace(
          /(["']?(?:fileId|id)["']?\s*:\s*["'])file_[a-zA-Z0-9_-]+(["'])/gi,
          `$1[private-file]$2`,
        )
        .replace(/\bfile_[a-zA-Z0-9_-]+\b/g, '[private-file]');
    }
    return value;
  }

  const result: Record<string, any> = {};
  const privateFile = hasPrivateFileDownload(value);
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (['internal', 'trace', 'diagnostics'].includes(normalizedKey)) continue;
    if (normalizedKey === 'fileid' && normalizeFileAssetId(item)) continue;
    if (
      privateFile &&
      [
        'url',
        'downloadUrl',
        'previewUrl',
        'publicUrl',
        'fileUrl',
        'imageUrl',
        'videoUrl',
        'audioUrl',
        'fileId',
      ].includes(key)
    ) {
      continue;
    }
    if (
      [
        'url',
        'downloadUrl',
        'previewUrl',
        'publicUrl',
        'fileUrl',
        'imageUrl',
        'videoUrl',
        'audioUrl',
      ].includes(key) &&
      typeof item === 'string' &&
      (isInternalPrivateFileUrl(item) || isPrivateFileAssetUrl(item))
    ) {
      continue;
    }
    if (key === 'id' && typeof item === 'string' && normalizeFileAssetId(item)) continue;
    result[key] = stripPrivateFileDownloadsForFrontend(item);
  }
  if (privateFile) {
    result.visibility = result.visibility || 'private';
    result.privateDownloadHidden = true;
  }
  return result;
}

function buildFrontendFileRefPayload(
  entry: FileRefEntry,
  exposePrivateFileDownloads = false,
): ToolDisplayFilePayload {
  const type = normalizeOutputType(entry.type);
  const title = safeText(entry.name || '文件', 160);
  const mime = safeText(entry.mime || '', 128);
  const size = Number(entry.size);
  const fileId = exposePrivateFileDownloads ? normalizeFileAssetId(entry.fileId) : '';

  return {
    type,
    fileRef: entry.fileRef,
    ...(fileId
      ? {
          id: fileId,
          fileId,
          previewUrl: `/api/files/${fileId}/preview`,
          downloadUrl: `/api/files/${fileId}/download`,
        }
      : {}),
    ...(title ? { title } : {}),
    ...(mime ? { mime, mimeType: mime } : {}),
    ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
    ...(entry.role ? { role: safeText(entry.role, 40) } : {}),
    visibility: 'private',
    privateDownloadHidden: !fileId,
  };
}

function findFrontendFileRefEntry(
  item: Record<string, any>,
  index: number,
  entries: FileRefEntry[],
): FileRefEntry | undefined {
  if (!entries.length) return undefined;
  const itemFileId = normalizeFileAssetId(item.fileId || item.id);
  if (itemFileId) {
    const matchedByFileId = entries.find(entry => entry.fileId === itemFileId);
    if (matchedByFileId) return matchedByFileId;
  }

  const existingFileRef = typeof item.fileRef === 'string' ? item.fileRef : '';
  if (existingFileRef) {
    return entries.find(entry => entry.fileRef === existingFileRef);
  }

  const findUniqueEntry = (predicate: (entry: FileRefEntry) => boolean) => {
    const matchedEntries = entries.filter(predicate);
    return matchedEntries.length === 1 ? matchedEntries[0] : undefined;
  };

  const itemName = String(item.title || item.name || item.fileName || item.filename || '').trim();
  const itemRole = String(item.role || '').trim();

  const matched =
    (itemName
      ? findUniqueEntry(entry => Boolean(entry.name) && itemName === entry.name)
      : undefined) ||
    (itemRole
      ? findUniqueEntry(entry => Boolean(entry.role) && itemRole === entry.role)
      : undefined);
  return matched || entries[index];
}

function attachFrontendFileRefs(
  display: any,
  mapping?: FileRefMapping,
  options: { exposePrivateFileDownloads?: boolean } = {},
): any {
  const entries = Array.isArray(mapping?.entries)
    ? mapping.entries.filter(entry => isFrontendVisibleFileRefEntry(entry))
    : [];
  if (!entries.length || !isPlainObject(display)) return display;

  const result: Record<string, any> = { ...display };
  let hasVisibleFileList = false;

  if (Array.isArray(result.files)) {
    hasVisibleFileList = true;
    result.files = result.files.map((item: any, index: number) => {
      if (!isPlainObject(item)) return item;
      const entry = findFrontendFileRefEntry(item, index, entries);
      if (!entry) return item;
      const payload = buildFrontendFileRefPayload(entry, options.exposePrivateFileDownloads);
      return {
        ...payload,
        ...item,
        fileRef: item.fileRef || entry.fileRef,
        title: item.title || item.name || payload.title,
        mime: item.mime || payload.mime,
        mimeType: item.mimeType || payload.mimeType,
        size: Number.isFinite(Number(item.size)) ? Number(item.size) : payload.size,
        visibility: item.visibility || payload.visibility,
        privateDownloadHidden: item.privateDownloadHidden ?? payload.privateDownloadHidden,
      };
    });
  }

  if (!hasVisibleFileList) {
    const files = entries.map(entry =>
      buildFrontendFileRefPayload(entry, options.exposePrivateFileDownloads),
    );
    result.files = files;
  }

  return result;
}

function sanitizeModelFiles(value: unknown): NonNullable<ToolModelPayload['files']> {
  if (!Array.isArray(value)) return [];
  const files: NonNullable<ToolModelPayload['files']> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const fileRef = typeof raw.fileRef === 'string' ? raw.fileRef.trim() : '';
    if (!fileRef || seen.has(fileRef)) continue;
    seen.add(fileRef);
    const type = normalizeOutputType(raw.type);
    files.push({
      fileRef,
      type,
      ...(raw.name ? { name: safeText(raw.name, 160) } : {}),
      ...(raw.mime ? { mime: safeText(raw.mime, 128) } : {}),
      ...(Number.isFinite(Number(raw.size)) ? { size: Number(raw.size) } : {}),
      ...(raw.role ? { role: safeText(raw.role, 80) } : {}),
    });
  }
  return files;
}

function sanitizeModelPayload(value: unknown, faithful = false): ToolModelPayload | undefined {
  if (!isPlainObject(value)) return undefined;
  const output = normalizeToolResultOutputDescriptor(value.output);
  const sanitized = faithful
    ? capFaithfulText(sanitizeFaithfulText(String(value.content || '')), MODEL_CONTENT_LIMIT)
    : safeModelText(value.content || '', MODEL_CONTENT_LIMIT);
  // 原文不去首尾空白（缩进与空行也是内容），只在没有内容时用默认说明
  const content = (faithful ? sanitized : sanitized.trim()) ? sanitized : '工具执行完成';
  const files = sanitizeModelFiles(value.files);
  return {
    content,
    ...(output ? { output } : {}),
    ...(files.length ? { files } : {}),
  };
}

function normalizeFileRefMapping(value: unknown): FileRefMapping | undefined {
  const mapping = value as Partial<FileRefMapping> | undefined;
  if (!Array.isArray(mapping?.entries)) return undefined;
  return new FileRefMappingStore(mapping).snapshot();
}

function sanitizeTraceFileRefs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .map(item => safeText(item, 96))
    .filter(Boolean)
    .slice(0, 20);
  return result.length ? result : undefined;
}

function sanitizeAgentToolCallTrace(value: unknown): AgentToolCallTrace | undefined {
  if (!isPlainObject(value)) return undefined;
  const callId = safeText(value.callId, 160);
  const toolName = safeText(value.toolName, 160);
  if (!callId || !toolName) return undefined;
  const traceOutput = normalizeToolResultOutputKind(value.output?.kind);
  const durationMs = Number(value.durationMs);
  const status = value.status === 'error' ? 'error' : 'success';
  return {
    callId,
    toolName,
    ...(traceOutput ? { output: { kind: traceOutput } } : {}),
    ...(value.inputSummary ? { inputSummary: safeDiagnosticText(value.inputSummary, 500) } : {}),
    ...(value.outputSummary
      ? { outputSummary: safeDiagnosticText(value.outputSummary, 1000) }
      : {}),
    ...(sanitizeTraceFileRefs(value.fileRefs)
      ? { fileRefs: sanitizeTraceFileRefs(value.fileRefs) }
      : {}),
    ...(Number.isFinite(durationMs) && durationMs >= 0 ? { durationMs } : {}),
    status,
    ...(value.errorCode ? { errorCode: safeText(value.errorCode, 120) } : {}),
    ...(value.errorSummary ? { errorSummary: safeDiagnosticText(value.errorSummary, 500) } : {}),
    ...(value.errorMessage ? { errorMessage: safeDiagnosticText(value.errorMessage, 500) } : {}),
  };
}

function sanitizeWarningCodes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const codes = value
    .map(item => safeDiagnosticText(item, 80))
    .filter(Boolean)
    .slice(0, 20);
  return codes.length ? codes : undefined;
}

function sanitizeSafeDiagnostics(value: unknown): SafeDiagnostics | undefined {
  if (!isPlainObject(value)) return undefined;
  const outputCount = Number(value.outputCount);
  const diagnostics: SafeDiagnostics = {
    ...(value.provider ? { provider: safeDiagnosticText(value.provider, 500) } : {}),
    ...(value.runtimeTaskType
      ? { runtimeTaskType: safeDiagnosticText(value.runtimeTaskType, 500) }
      : {}),
    ...(value.runtimeOperation
      ? { runtimeOperation: safeDiagnosticText(value.runtimeOperation, 500) }
      : {}),
    ...(Number.isFinite(outputCount) && outputCount >= 0 ? { outputCount } : {}),
    ...(sanitizeWarningCodes(value.warningCodes)
      ? { warningCodes: sanitizeWarningCodes(value.warningCodes) }
      : {}),
    ...(value.sanitizedErrorCode
      ? { sanitizedErrorCode: safeDiagnosticText(value.sanitizedErrorCode, 500) }
      : {}),
    ...(value.sanitizedErrorMessage
      ? { sanitizedErrorMessage: safeDiagnosticText(value.sanitizedErrorMessage, 500) }
      : {}),
  };
  return Object.keys(diagnostics).length ? diagnostics : undefined;
}

function sanitizeInternalProjection(value: unknown): ToolProjectionInternal {
  if (!isPlainObject(value)) return {};
  const fileRefs = normalizeFileRefMapping(value.fileRefs);
  const trace = sanitizeAgentToolCallTrace(value.trace);
  const diagnostics = sanitizeSafeDiagnostics(value.diagnostics);
  return {
    ...(fileRefs ? { fileRefs } : {}),
    ...(trace ? { trace } : {}),
    ...(diagnostics ? { diagnostics } : {}),
  };
}

function hasInternalProjection(value: ToolProjectionInternal): boolean {
  return Boolean(value.fileRefs || value.trace || value.diagnostics);
}

function mapToolStatusToAgentToolStatus(status: unknown): AgentToolResultStatus {
  return status === 'error' ? 'error' : status === 'skipped' ? 'skipped' : 'success';
}

function buildAgentToolDisplayJson(
  display: ToolProjectionDisplay,
): Record<string, unknown> | undefined {
  const json: Record<string, unknown> = {};
  if (display.kind) json.kind = display.kind;
  if (display.statusText) json.statusText = display.statusText;
  if (display.queries) json.queries = display.queries;
  if (display.details) json.details = display.details;
  if (display.results) json.results = display.results;
  if (display.sources) json.sources = display.sources;
  if (display.filePreview) json.filePreview = display.filePreview;
  if (display.fileType) json.fileType = display.fileType;
  if (display.previewContent) json.previewContent = display.previewContent;
  if (display.previewContentType) json.previewContentType = display.previewContentType;
  if (display.outputHint) json.outputHint = display.outputHint;
  if (display.workflowProgress) json.workflowProgress = display.workflowProgress;
  return Object.keys(json).length ? json : undefined;
}

function buildAgentToolDisplay(display: ToolProjectionDisplay): AgentToolResultDisplay {
  const summary = display.summary || display.publicError || display.message || display.content;
  const markdown =
    display.previewContent ||
    (display.content && display.content !== summary ? display.content : '');
  return {
    ...(display.title ? { title: display.title } : {}),
    ...(summary ? { summary: safeText(summary, 500) } : {}),
    ...(markdown ? { markdown: safeText(markdown, PREVIEW_CONTENT_LIMIT) } : {}),
    ...(buildAgentToolDisplayJson(display) ? { json: buildAgentToolDisplayJson(display) } : {}),
  };
}

function buildAgentToolTrace(
  display: ToolProjectionDisplay,
  internal: ToolProjectionInternal,
  status: 'success' | 'error' | 'loading',
): AgentToolResultTrace | undefined {
  const diagnostics = sanitizeSafeDiagnostics(internal.diagnostics);
  if (status !== 'error' && !diagnostics) return undefined;
  return {
    ...(status === 'error' ? { code: 'TOOL_ERROR' } : {}),
    ...(display.publicError || display.error
      ? { message: safeDiagnosticText(display.publicError || display.error, 500) }
      : {}),
    ...(status === 'error' ? { retryable: false } : {}),
    ...(diagnostics ? { diagnostics: { ...diagnostics } as Record<string, unknown> } : {}),
  };
}

function normalizeAgentToolResultForFrontend(
  toolResult: AgentToolResult | undefined,
): AgentToolResult | undefined {
  if (!toolResult) return undefined;
  const publicAssets = toolResult.assets?.filter(
    asset => asset.role === 'final' || asset.role === 'preview',
  );
  const normalized = normalizeToolResult(toolResult, {
    assets: publicAssets || [],
  });
  if (!normalized.trace) return normalized;
  const { diagnostics: _diagnostics, ...publicTrace } = normalized.trace;
  const { trace: _trace, ...rest } = normalized;
  return Object.keys(publicTrace).length
    ? {
        ...rest,
        trace: publicTrace,
      }
    : rest;
}

function inferFrontendFileType(asset: AgentToolAsset): ToolDisplayFilePayload['type'] {
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime.includes('wordprocessingml') ||
    mime.includes('spreadsheetml') ||
    mime.includes('presentationml')
  ) {
    return 'document';
  }
  return 'file';
}

function buildFrontendFilesFromAssets(assets?: AgentToolAsset[]): ToolDisplayFilePayload[] {
  if (!Array.isArray(assets)) return [];
  return assets
    .map((asset): ToolDisplayFilePayload | undefined => {
      const fileId = normalizeFileAssetId(asset.fileId);
      if (!fileId) return undefined;
      return {
        type: inferFrontendFileType(asset),
        id: fileId,
        fileId,
        title: asset.displayName,
        role: asset.role,
        ...(asset.mimeType ? { mime: asset.mimeType, mimeType: asset.mimeType } : {}),
        ...(Number.isFinite(Number(asset.size)) ? { size: Number(asset.size) } : {}),
        visibility: 'private',
        privateDownloadHidden: true,
        privatePreviewHidden: true,
      };
    })
    .filter((item): item is ToolDisplayFilePayload => Boolean(item));
}

function hasFrontendFileAccessTarget(item: ToolDisplayFilePayload): boolean {
  return Boolean(
    normalizeFileAssetId(item.fileId || item.id) ||
    item.url ||
    item.previewUrl ||
    item.downloadUrl ||
    item.preview?.content,
  );
}

function normalizeFrontendFileText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function findMatchingAssetFile(
  item: ToolDisplayFilePayload,
  assetFiles: ToolDisplayFilePayload[],
  usedAssetIndexes: Set<number>,
  fallbackIndex: number,
): { index: number; file: ToolDisplayFilePayload } | undefined {
  const itemFileId = normalizeFileAssetId(item.fileId || item.id);
  const itemTitle = normalizeFrontendFileText(item.title);
  const itemMime = normalizeFrontendFileText(item.mime || item.mimeType);

  const matchedIndex = assetFiles.findIndex((assetFile, index) => {
    if (usedAssetIndexes.has(index)) return false;
    if (itemFileId && itemFileId === assetFile.fileId) return true;
    if (itemTitle && itemTitle === normalizeFrontendFileText(assetFile.title)) return true;
    if (
      itemMime &&
      itemMime === normalizeFrontendFileText(assetFile.mime || assetFile.mimeType) &&
      item.type === assetFile.type
    ) {
      return true;
    }
    return false;
  });
  if (matchedIndex >= 0) return { index: matchedIndex, file: assetFiles[matchedIndex] };

  const fallbackAsset = assetFiles[fallbackIndex];
  if (!hasFrontendFileAccessTarget(item) && fallbackAsset && !usedAssetIndexes.has(fallbackIndex)) {
    return { index: fallbackIndex, file: fallbackAsset };
  }
  return undefined;
}

function mergeFrontendFilesFromAssets(
  existingFiles: ToolDisplayFilePayload[] | undefined,
  assetFiles: ToolDisplayFilePayload[],
): ToolDisplayFilePayload[] | undefined {
  if (!assetFiles.length) return existingFiles;
  if (!Array.isArray(existingFiles) || !existingFiles.length) return assetFiles;

  const usedAssetIndexes = new Set<number>();
  const mergedFiles = existingFiles.map((item, index) => {
    if (!isPlainObject(item)) return item;
    const matched = findMatchingAssetFile(item, assetFiles, usedAssetIndexes, index);
    if (!matched) return item;

    usedAssetIndexes.add(matched.index);
    if (hasFrontendFileAccessTarget(item)) return item;

    return {
      ...matched.file,
      ...item,
      type: item.type && item.type !== 'file' ? item.type : matched.file.type,
      id: matched.file.id,
      fileId: matched.file.fileId,
      privateDownloadHidden: item.privateDownloadHidden ?? matched.file.privateDownloadHidden,
      privatePreviewHidden: item.privatePreviewHidden ?? matched.file.privatePreviewHidden,
    };
  });

  for (let index = 0; index < assetFiles.length; index += 1) {
    const assetFile = assetFiles[index];
    if (usedAssetIndexes.has(index)) continue;
    const hasSameFile = mergedFiles.some(item =>
      normalizeFileAssetId(item?.fileId || item?.id)
        ? normalizeFileAssetId(item?.fileId || item?.id) === assetFile.fileId
        : normalizeFrontendFileText(item?.title) === normalizeFrontendFileText(assetFile.title),
    );
    if (!hasSameFile) mergedFiles.push(assetFile);
  }

  return mergedFiles;
}

function mergeDisplayJsonIntoFrontendOutput(
  target: ToolDisplayPayload,
  display: AgentToolResultDisplay,
): void {
  if (!isPlainObject(display.json)) return;
  const json = display.json as Record<string, any>;
  if (json.kind && !target.kind) target.kind = normalizeToolResultOutputKind(json.kind);
  if (Array.isArray(json.queries)) target.queries = json.queries;
  if (Array.isArray(json.details)) target.details = json.details;
  if (Array.isArray(json.results)) {
    target.results = json.results;
  }
  if (Array.isArray(json.sources)) {
    target.sources = json.sources;
  }
  if (target.details || target.results || target.sources) {
    const mergedSearchDetails = buildDisplayPayload({
      details: target.details,
      results: target.results,
      sources: target.sources,
    }).details;
    if (mergedSearchDetails) target.details = mergedSearchDetails;
  }
  if (isPlainObject(json.workflowProgress)) {
    target.workflowProgress = normalizeWorkflowProgress(json.workflowProgress);
  }
  if (json.filePreview !== undefined) target.filePreview = json.filePreview;
  if (typeof json.fileType === 'string') target.fileType = safeText(json.fileType, 40);
  if (typeof json.previewContent === 'string') {
    target.previewContent = truncate(json.previewContent, PREVIEW_CONTENT_LIMIT);
  }
  if (typeof json.previewContentType === 'string') {
    target.previewContentType = safeText(json.previewContentType, 40);
  }
  const outputHint = normalizeOutputHint(json.outputHint);
  if (outputHint) target.outputHint = outputHint;
}

function applyAgentToolResultToFrontendOutput(
  display: ToolDisplayPayload,
  toolResult: AgentToolResult | undefined,
): ToolDisplayPayload {
  if (!toolResult) return display;
  const result: ToolDisplayPayload = { ...display };
  const publicDisplay = toolResult.display;
  if (publicDisplay) {
    if (publicDisplay.title) result.title = publicDisplay.title;
    if (publicDisplay.summary) {
      result.summary = publicDisplay.summary;
      result.content = publicDisplay.markdown || publicDisplay.summary;
      result.thought = publicDisplay.markdown || publicDisplay.summary;
    } else if (publicDisplay.markdown) {
      result.content = publicDisplay.markdown;
      result.thought = publicDisplay.markdown;
    }
    mergeDisplayJsonIntoFrontendOutput(result, publicDisplay);
  }
  if (toolResult.status === 'error' && toolResult.trace?.message) {
    result.publicError = toolResult.trace.message;
    result.error = toolResult.trace.message;
  }
  const files = buildFrontendFilesFromAssets(toolResult.assets);
  result.files = mergeFrontendFilesFromAssets(result.files, files);
  return result;
}

export function createLayeredToolResult(params: {
  id: string;
  type: string;
  toolName?: string;
  displayName?: string;
  name: string;
  status: 'success' | 'error' | 'loading';
  input?: any;
  rawOutput?: any;
  time?: number;
  duration?: number;
  outputHint?: OutputHint;
  estimatedProgress?: ToolDisplayPayload['estimatedProgress'];
  output?: ToolResultOutputDescriptor;
  toolResult?: AgentToolResult;
  fileRefMappingStore?: FileRefMappingStore;
  /** 原语工具的权威正文按原文规范化（只对原语工具名生效，内部参数，不写进结果） */
  modelText?: 'faithful';
}): LayeredToolResult {
  const faithful = params.modelText === 'faithful' && isFaithfulTextTool(params.toolName);
  const output = normalizeToolResultOutputDescriptor(params.output);
  const projection = buildToolProjection(params.rawOutput, {
    toolName: params.toolName,
    displayName: params.displayName,
    name: params.name,
    status: params.status,
    type: params.type,
    output,
    fileRefMappingStore: params.fileRefMappingStore,
  });
  const display = buildDisplayPayload(params.rawOutput, params.input, params.status);
  if (output?.kind) display.kind = output.kind;
  const outputHint = normalizeOutputHint(params.outputHint);
  if (outputHint) display.outputHint = outputHint;
  if (params.estimatedProgress) display.estimatedProgress = params.estimatedProgress;
  const authoritativeToolResult = params.toolResult;
  const toolResult = normalizeToolResult(authoritativeToolResult || {}, {
    status: authoritativeToolResult?.status || mapToolStatusToAgentToolStatus(params.status),
    modelContent: authoritativeToolResult?.modelContent ?? projection.model.content,
    display: authoritativeToolResult?.display ?? buildAgentToolDisplay(display),
    assets: authoritativeToolResult?.assets,
    trace:
      authoritativeToolResult?.trace ||
      buildAgentToolTrace(display, projection.internal, params.status),
    control: authoritativeToolResult?.control,
    ...(faithful ? { modelText: 'faithful' as const } : {}),
  });
  // 原文结果的 model.content 与权威正文一致，不用按关键词压缩出来的摘要
  const model =
    faithful && typeof toolResult.modelContent === 'string'
      ? { ...projection.model, content: toolResult.modelContent }
      : projection.model;

  return {
    id: params.id,
    type: params.type,
    toolName: params.toolName,
    displayName: params.displayName,
    name: params.name,
    status: params.status,
    input: undefined,
    output: display,
    time: params.time || Date.now(),
    duration: params.duration,
    outputHint,
    inputSummary: display.inputSummary,
    model,
    display,
    internal: projection.internal,
    toolResult,
    ...(toolResult.assets ? { assets: toolResult.assets } : {}),
    ...(toolResult.trace ? { trace: toolResult.trace } : {}),
    ...(toolResult.control ? { control: toolResult.control } : {}),
  };
}

/** 原文结果后面补的文件引用行最多列这么多，其余写「另有 N 个」 */
const MAX_FAITHFUL_FILE_REF_LINES = 20;

/**
 * 原语工具的权威正文：只做原文净化。正文（含交付清单与说明）优先，超过上限才从中段删；
 * 正文里没写出的文件引用只用剩下的位置补上，放不下的写「另有 N 个文件引用」，不为它们删正文
 */
function faithfulToolModelContent(
  toolResult: any,
): import('../agent-tool-result.types').AgentToolModelContent {
  const modelContent = toolResult.toolResult.modelContent;
  if (Array.isArray(modelContent)) {
    return normalizeToolResult(
      { status: toolResult.status, modelContent },
      { modelText: 'faithful' },
    ).modelContent!;
  }
  const text = typeof modelContent === 'string' ? sanitizeFaithfulText(modelContent) : '';
  const body = capFaithfulText(text || '工具执行完成', MODEL_CONTENT_LIMIT);
  const files = mergeModelFileLists(
    sanitizeModelFiles(toolResult?.model?.files),
    buildModelFilesFromFileRefs(toolResult?.internal?.fileRefs),
  );
  const missing = files.filter(item => !body.includes(`fileRef=${item.fileRef}`));
  if (!missing.length) return body;
  const [header, ...lines] = appendModelOutputFileLines('', undefined, missing).split('\n');
  const summary = (count: number) => `- 另有 ${count} 个文件引用`;
  const room = MODEL_CONTENT_LIMIT - body.length - 1;
  const kept: string[] = [];
  let used = header.length;
  for (const [index, line] of lines.slice(0, MAX_FAITHFUL_FILE_REF_LINES).entries()) {
    const rest = lines.length - index - 1;
    if (used + line.length + 1 + (rest > 0 ? summary(rest).length + 1 : 0) > room) break;
    kept.push(line);
    used += line.length + 1;
  }
  const omitted = lines.length - kept.length;
  const tail = [header, ...kept, ...(omitted ? [summary(omitted)] : [])].join('\n');
  return tail.length <= room ? `${body}\n${tail}` : body;
}

export function getToolModelContent(
  toolResult: any,
): import('../agent-tool-result.types').AgentToolModelContent {
  // 原语工具（服务端执行的结果）给出的权威正文按原文交给模型
  if (isFaithfulTextTool(toolResult?.toolName) && toolResult?.toolResult?.modelContent) {
    return faithfulToolModelContent(toolResult);
  }
  const modelContent = toolResult?.toolResult?.modelContent || toolResult?.model?.content;
  if (Array.isArray(modelContent))
    return normalizeToolResult({ status: toolResult.status, modelContent }).modelContent!;
  const internalFiles = buildModelFilesFromFileRefs(toolResult?.internal?.fileRefs);
  if (typeof modelContent === 'string' && modelContent.trim()) {
    const storedModelFiles = sanitizeModelFiles(toolResult?.model?.files);
    const sanitizedContent = safeModelText(modelContent, MODEL_CONTENT_LIMIT) || '工具执行完成';
    return appendMissingFileRefLines(
      sanitizedContent,
      mergeModelFileLists(storedModelFiles, internalFiles),
    );
  }
  return appendMissingFileRefLines('工具执行完成', internalFiles);
}

/**
 * 已是前端投影的会话控制结果（成果清单、提问）：没有后端 toolResult，重复投影（快照再次净化）时
 * 沿用它的类型化载荷、资产与控制，结果与第一次一致；载荷按类型重建，不接收任意字段。
 * 其余工具照旧按展示字段白名单重建。
 */
function previouslyProjectedToolResult(toolCall: any): AgentToolResult | undefined {
  if (!isPlainObject(toolCall) || toolCall.toolResult || !isPlainObject(toolCall.display)) {
    return undefined;
  }
  const presentation = readPresentedFiles(toolCall);
  const question = presentation ? undefined : readQuestion(toolCall);
  if (!presentation && !question) return undefined;
  const { title, summary } = toolCall.display as AgentToolResultDisplay;
  return {
    status: 'success',
    display: {
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof summary === 'string' ? { summary } : {}),
      json: presentation ? { presentation } : { question },
    },
    ...(Array.isArray(toolCall.assets) ? { assets: toolCall.assets } : {}),
    ...(isPlainObject(toolCall.control) ? { control: toolCall.control } : {}),
  };
}

export function toFrontendToolCall(
  toolResult: any,
  options: { exposePrivateFileDownloads?: boolean } = {},
): any {
  const status =
    toolResult?.status === 'error'
      ? 'error'
      : toolResult?.status === 'loading'
        ? 'loading'
        : 'success';
  const display = buildDisplayPayload(toolResult?.display ?? toolResult?.output, undefined, status);
  mergeToolCallDisplayFiles(display, toolResult);
  const outputHint = normalizeOutputHint(
    toolResult?.outputHint || toolResult?.display?.outputHint || toolResult?.output?.outputHint,
  );
  if (outputHint) display.outputHint = outputHint;
  const estimatedProgress =
    toolResult?.estimatedProgress ||
    toolResult?.display?.estimatedProgress ||
    toolResult?.output?.estimatedProgress;
  if (estimatedProgress) display.estimatedProgress = estimatedProgress;
  const fileRefs = toolResult?.internal?.fileRefs;
  const normalizedToolResult = normalizeAgentToolResultForFrontend(
    toolResult?.toolResult ?? previouslyProjectedToolResult(toolResult),
  );
  const safeDisplayBase =
    options.exposePrivateFileDownloads === true
      ? display
      : stripPrivateFileDownloadsForFrontend(display);
  const safeDisplay = applyAgentToolResultToFrontendOutput(
    attachFrontendFileRefs(safeDisplayBase, fileRefs, options),
    normalizedToolResult,
  );
  const inputSummary =
    sanitizeToolInput(
      toolResult?.inputSummary ||
        toolResult?.display?.inputSummary ||
        toolResult?.output?.inputSummary ||
        toolResult?.input,
    ) || safeDisplay.inputSummary;
  if (inputSummary) safeDisplay.inputSummary = inputSummary;

  return {
    id: toolResult?.id || `tool_${Date.now()}`,
    toolName: toolResult?.toolName,
    displayName: toolResult?.displayName || toolResult?.name,
    name: toolResult?.displayName || toolResult?.name || '工具',
    status,
    duration: toolResult?.duration,
    type: toolResult?.type || 'tool',
    ...(outputHint ? { outputHint } : {}),
    ...(inputSummary ? { inputSummary } : {}),
    arguments: {},
    output: safeDisplay,
    display: status === 'loading' ? safeDisplay : normalizedToolResult?.display || safeDisplay,
    ...(normalizedToolResult?.assets ? { assets: normalizedToolResult.assets } : {}),
    ...(normalizedToolResult?.trace ? { trace: normalizedToolResult.trace } : {}),
    ...(normalizedToolResult?.control ? { control: normalizedToolResult.control } : {}),
  };
}

export function toBackendToolCall(toolResult: any): any {
  const frontendToolCall = toFrontendToolCall(toolResult);
  // 原语工具的权威正文按原文落库；其余工具照旧净化
  const faithful =
    isFaithfulTextTool(toolResult?.toolName) && Boolean(toolResult?.toolResult?.modelContent);
  const model = sanitizeModelPayload(toolResult?.model, faithful);
  const internal = sanitizeInternalProjection(toolResult?.internal);
  const backendToolResult = toolResult?.toolResult
    ? normalizeToolResult(toolResult.toolResult, faithful ? { modelText: 'faithful' } : {})
    : undefined;

  return {
    ...frontendToolCall,
    ...(model ? { model } : {}),
    ...(backendToolResult ? { toolResult: backendToolResult } : {}),
    ...(hasInternalProjection(internal) ? { internal } : {}),
  };
}

export function sanitizeFrontendMessage(
  message: any,
  options: { exposePrivateFileDownloads?: boolean } = {},
): any {
  const parsed = typeof message === 'string' ? parseMaybeJson(message) : message;
  if (!isPlainObject(parsed)) return parsed;
  const cloned = { ...parsed };
  delete cloned.trace;
  delete cloned.internal;
  delete cloned.diagnostics;
  if (Array.isArray(cloned.rounds)) {
    cloned.rounds = cloned.rounds.map((round: any) => {
      const {
        trace: _trace,
        internal: _internal,
        diagnostics: _diagnostics,
        ...safeRound
      } = isPlainObject(round) ? round : {};
      return {
        ...safeRound,
        toolCalls: Array.isArray(round?.toolCalls)
          ? round.toolCalls.map((toolCall: any) => toFrontendToolCall(toolCall, options))
          : [],
      };
    });
  }
  return options.exposePrivateFileDownloads === true
    ? cloned
    : stripPrivateFileDownloadsForFrontend(cloned);
}

export function stringifyFrontendMessage(
  message: any,
  options: { exposePrivateFileDownloads?: boolean } = {},
): string {
  return JSON.stringify(sanitizeFrontendMessage(message, options));
}

/**
 * 属主投影选项：消息归属用户本人可见私有文件下载地址。
 * 仅用于发给属主的快照 / 落库消息；对外公开事件一律走默认投影。
 */

export const OWNER_FRONTEND_MESSAGE_OPTIONS = { exposePrivateFileDownloads: true } as const;
