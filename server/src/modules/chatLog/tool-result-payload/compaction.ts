import {
  MODEL_CONTENT_LIMIT,
  MODEL_HEAD_LIMIT,
  MODEL_LOG_LINES_LIMIT,
  MODEL_RESULT_ITEM_LIMIT,
  MODEL_SUMMARY_LIMIT,
  MODEL_TAIL_LIMIT,
  SUMMARY_LIMIT,
  TOOL_RESULT_OUTPUT_KINDS,
} from './constants';
import {
  formatFileSize,
  normalizeModelFiles,
  normalizeOutputFileItems,
  pickContent,
} from './display-files';
import {
  basename,
  isPlainObject,
  normalizeWhitespace,
  parseMaybeJson,
  safeJsonStringify,
  stripHtml,
  truncate,
} from './text.utils';
import {
  ToolResultCompactionContext,
  ToolResultOutputDescriptor,
  ToolResultOutputKind,
} from './types';
import {
  hasSensitiveUrlQuery,
  hideUrlsFromModelSummary,
  redactSensitiveText,
  redactSensitiveUrlParams,
  safeText,
  stripFileAssetIdsFromText,
  stripInternalFileDownloadUrlsFromText,
  stripLargeInlinePayloads,
  stripSensitiveModelTextSections,
  stripSensitiveUrlsFromModelText,
} from './url-security';

function normalizeToolResultOutputKind(value: unknown): ToolResultOutputKind | undefined {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return TOOL_RESULT_OUTPUT_KINDS.has(normalized as ToolResultOutputKind)
    ? (normalized as ToolResultOutputKind)
    : undefined;
}

function normalizeToolResultOutputDescriptor(
  value?: ToolResultOutputDescriptor,
): ToolResultOutputDescriptor | undefined {
  const kind = normalizeToolResultOutputKind(value?.kind);
  return kind ? { kind } : undefined;
}

type CompactedModelContent = {
  content: string;
  includePublicFileUrls?: boolean;
  includeFileReferenceLines?: boolean;
};

function contextText(context: ToolResultCompactionContext): string {
  return [context.toolName, context.displayName, context.name, context.type, context.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function contextIncludes(context: ToolResultCompactionContext, patterns: RegExp[]): boolean {
  const text = contextText(context);
  return patterns.some(pattern => pattern.test(text));
}

function getObjectCandidate(rawResult: any): Record<string, any> {
  return isPlainObject(rawResult) ? rawResult : {};
}

function getNestedValue(source: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (!isPlainObject(current)) return undefined;
    return current[key];
  }, source);
}

function firstValue(source: any, paths: string[]): any {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function firstText(source: any, paths: string[], limit = SUMMARY_LIMIT): string {
  const value = firstValue(source, paths);
  return value === undefined ? '' : safeText(value, limit);
}

function asArray(value: any): any[] {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  return parsed ? [parsed] : [];
}

function firstArray(source: any, paths: string[]): any[] {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    const items = asArray(value);
    if (items.length) return items;
  }
  return [];
}

function safeModelText(value: unknown, limit = MODEL_SUMMARY_LIMIT): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : safeJsonStringify(value, MODEL_CONTENT_LIMIT);
  const withoutPrivateFileUrls = stripFileAssetIdsFromText(
    stripInternalFileDownloadUrlsFromText(raw),
  );
  return truncate(
    normalizeWhitespace(
      stripHtml(
        redactSensitiveText(
          stripLargeInlinePayloads(
            stripSensitiveModelTextSections(
              stripSensitiveUrlsFromModelText(withoutPrivateFileUrls),
            ),
          ),
        ),
      ),
    ),
    limit,
  );
}

function safeModelMultilineText(value: unknown, limit = MODEL_SUMMARY_LIMIT): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : safeJsonStringify(value, MODEL_CONTENT_LIMIT);
  const withoutPrivateFileUrls = stripFileAssetIdsFromText(
    stripInternalFileDownloadUrlsFromText(raw),
  );
  const sanitized = stripHtml(
    redactSensitiveText(
      stripLargeInlinePayloads(
        stripSensitiveModelTextSections(stripSensitiveUrlsFromModelText(withoutPrivateFileUrls)),
      ),
    ),
  );
  const normalized = sanitized
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t\f\v ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return truncate(normalized, limit);
}

function safeDiagnosticText(value: unknown, limit = 500): string {
  const sanitized = safeModelText(value, limit);
  return truncate(
    normalizeWhitespace(
      sanitized
        .replace(
          /\b(?:api|access|secret|private)\s*[-_ ]?\s*key\b\s*[:=]\s*([^\s&"'<>，。;,]+)/gi,
          '[敏感配置已隐藏]',
        )
        .replace(
          /(^|[^a-zA-Z0-9])(?:raw[-_ ]?logs?|runtime[-_ ]?logs?|stdout|stderr|stack)(?:\s*[:=])?[^。；;,\n]*/gi,
          '$1[运行诊断已隐藏]',
        )
        .replace(
          /(^|[^a-zA-Z0-9])(?:object[-_ ]?key|storage[-_ ]?path)(?:\s*[:=])?[^。；;,\n]*/gi,
          '$1[内部存储路径已隐藏]',
        ),
    ),
    limit,
  );
}

function compactLongText(
  value: unknown,
  headLimit = MODEL_HEAD_LIMIT,
  tailLimit = MODEL_TAIL_LIMIT,
): string {
  const text = safeModelText(value, MODEL_CONTENT_LIMIT);
  if (text.length <= headLimit + tailLimit + 120) return text;
  const omitted = text.length - headLimit - tailLimit;
  return [text.slice(0, headLimit), `...已省略 ${omitted} 字...`, text.slice(-tailLimit)].join(
    '\n',
  );
}

function compactLongMultilineText(
  value: unknown,
  headLimit = MODEL_HEAD_LIMIT,
  tailLimit = MODEL_TAIL_LIMIT,
): string {
  const text = safeModelMultilineText(value, MODEL_CONTENT_LIMIT);
  if (text.length <= headLimit + tailLimit + 120) return text;
  const omitted = text.length - headLimit - tailLimit;
  return [text.slice(0, headLimit), `...已省略 ${omitted} 字...`, text.slice(-tailLimit)].join(
    '\n',
  );
}

function extractHostname(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  if (hasSensitiveUrlQuery(trimmed)) return redactSensitiveUrlParams(trimmed);
  return trimmed;
}

function normalizeSearchItems(rawResult: any): Array<{
  title: string;
  url?: string;
  snippet?: string;
  source?: string;
  domain?: string;
}> {
  const raw = getObjectCandidate(rawResult);
  const items = firstArray(raw, [
    'details',
    'results',
    'items',
    'data.results',
    'data.items',
    'result.results',
    'result.items',
    'output.results',
    'output.items',
  ]);

  return items
    .map(item => {
      if (typeof item === 'string') {
        const url = normalizeExternalUrl(item);
        return url ? { title: basename(url), url, source: extractHostname(url) } : null;
      }
      if (!isPlainObject(item)) return null;
      const rawUrl = item.url || item.link || item.href || item.sourceUrl;
      const url = normalizeExternalUrl(rawUrl);
      const title = safeText(item.title || item.name || item.label || url || '搜索结果', 160);
      if (!title && !url) return null;
      const domain = safeText(item.domain || item.site, 80) || extractHostname(url);
      const source =
        safeText(
          item.sourceName || item.sourceEngine || item.source || item.engine || item.provider,
          80,
        ) || domain;
      const snippet = safeText(
        item.snippet || item.summary || item.description || item.content || item.text,
        260,
      );
      return {
        title: title || url,
        ...(url ? { url } : {}),
        ...(snippet ? { snippet } : {}),
        ...(source ? { source } : {}),
        ...(domain ? { domain } : {}),
      };
    })
    .filter(Boolean) as Array<{
    title: string;
    url?: string;
    snippet?: string;
    source?: string;
    domain?: string;
  }>;
}

function isSearchLike(rawResult: any, context: ToolResultCompactionContext): boolean {
  if (contextIncludes(context, [/搜索|search|web_search|serp|bing|google/])) return true;
  const items = normalizeSearchItems(rawResult);
  return items.length >= 2 && items.some(item => item.url);
}

function buildSearchModelContent(rawResult: any): string {
  const items = normalizeSearchItems(rawResult).slice(0, MODEL_RESULT_ITEM_LIMIT);
  if (!items.length) return compactLongText(pickContent(rawResult));
  const lines = items.map((item, index) => {
    const parts = [
      `${index + 1}. ${item.title}`,
      item.url ? `链接=${item.url}` : '',
      item.source ? `来源=${item.source}` : '',
      item.snippet ? `摘要=${item.snippet}` : '',
    ].filter(Boolean);
    return `- ${parts.join(' | ')}`;
  });
  return [`搜索结果摘要（前 ${items.length} 条）：`, ...lines].join('\n');
}

function extractContentText(rawResult: any): string {
  const raw = getObjectCandidate(rawResult);
  const content = firstValue(raw, [
    'content',
    'text',
    'markdown',
    'body',
    'html',
    'article',
    'result.content',
    'result.text',
    'result.markdown',
    'data.content',
    'data.text',
    'data.markdown',
  ]);
  return typeof content === 'string' ? content : safeJsonStringify(content ?? '');
}

function countLinks(rawResult: any, content: string): number {
  const raw = getObjectCandidate(rawResult);
  const linkItems = firstArray(raw, ['links', 'urls', 'anchors', 'result.links', 'data.links']);
  if (linkItems.length) return linkItems.length;
  return content.match(/https?:\/\/[^\s"'<>，。)）]+/gi)?.length || 0;
}

function isWebReadLike(rawResult: any, context: ToolResultCompactionContext): boolean {
  if (contextIncludes(context, [/网页|阅读|browser|reader|web_reader|url_reader|crawl|fetch/])) {
    return true;
  }
  const raw = getObjectCandidate(rawResult);
  return Boolean(
    firstText(raw, ['title'], 120) &&
    firstText(raw, ['url', 'sourceUrl', 'link', 'href'], 240) &&
    extractContentText(rawResult),
  );
}

function buildWebReadModelContent(
  rawResult: any,
  context: ToolResultCompactionContext = {},
): string {
  const raw = getObjectCandidate(rawResult);
  if (context.status === 'error') {
    const error =
      firstText(raw, ['publicError', 'error', 'message', 'summary', 'content'], 500) ||
      '网页读取失败';
    return ['网页阅读结果：', '状态：error', `错误摘要：${error}`].join('\n');
  }
  const title = firstText(raw, ['title', 'result.title', 'data.title'], 160) || '未命名网页';
  const url = normalizeExternalUrl(
    firstValue(raw, ['url', 'sourceUrl', 'link', 'href', 'result.url', 'data.url']),
  );
  const content = extractContentText(rawResult);
  const paragraphs = content
    .split(/\n{2,}/)
    .map(item => safeModelText(item, 320))
    .filter(Boolean)
    .slice(0, 3);
  const lines = [
    '网页阅读摘要：',
    `标题：${title}`,
    url ? `URL：${url}` : '',
    `链接数量：${countLinks(rawResult, content)}`,
    `正文摘要：${compactLongText(content, 1000, 500) || '无正文'}`,
  ].filter(Boolean);
  if (paragraphs.length) {
    lines.push('关键段落：', ...paragraphs.map(item => `- ${item}`));
  }
  return lines.join('\n');
}

function normalizeRuntimeOutputs(rawResult: any): Array<{
  fileRef?: string;
  name: string;
  type?: string;
  mime?: string;
  size?: number;
  role?: string;
}> {
  const modelFiles = normalizeModelFiles(rawResult);
  if (modelFiles.length) {
    return modelFiles
      .map(item => ({
        fileRef: item.fileRef,
        name: item.name || 'output',
        type: item.type,
        ...(item.mime ? { mime: item.mime } : {}),
        ...(Number.isFinite(Number(item.size)) ? { size: Number(item.size) } : {}),
        ...(item.role ? { role: item.role } : {}),
      }))
      .slice(0, MODEL_RESULT_ITEM_LIMIT);
  }

  const raw = getObjectCandidate(rawResult);
  const candidates = [
    raw.outputs,
    raw.outputFiles,
    raw.files,
    raw.fileAssets,
    raw.attachments,
    raw.result?.outputs,
    raw.result?.files,
  ];
  const files = candidates.flatMap(item => normalizeOutputFileItems(item));
  return files
    .map(item => ({
      name: item.title || 'output',
      ...(item.type ? { type: item.type } : {}),
      ...(item.mime ? { mime: item.mime } : item.mimeType ? { mime: item.mimeType } : {}),
      ...(Number.isFinite(Number(item.size)) ? { size: Number(item.size) } : {}),
      ...(item.role ? { role: item.role } : {}),
    }))
    .slice(0, MODEL_RESULT_ITEM_LIMIT);
}

function pickRuntimePublicLogSummary(rawResult: any): string {
  const raw = getObjectCandidate(rawResult);
  const log = firstValue(raw, [
    'publicLogSummary',
    'public_log_summary',
    'result.publicLogSummary',
    'result.public_log_summary',
  ]);
  if (Array.isArray(log)) return log.join('\n');
  return typeof log === 'string' ? log : '';
}

function compactLogText(value: string): string {
  const lines = stripLargeInlinePayloads(redactSensitiveText(value))
    .split(/\r?\n/)
    .map(item => safeText(item, 260))
    .filter(Boolean);
  if (!lines.length) return '';
  if (lines.length <= MODEL_LOG_LINES_LIMIT * 2) return lines.join('\n');
  return [
    ...lines.slice(0, MODEL_LOG_LINES_LIMIT),
    `...已省略 ${lines.length - MODEL_LOG_LINES_LIMIT * 2} 行日志...`,
    ...lines.slice(-MODEL_LOG_LINES_LIMIT),
  ].join('\n');
}

function isRuntimeLike(rawResult: any, context: ToolResultCompactionContext): boolean {
  if (contextIncludes(context, [/runtime|agent_runtime|worker|sandbox/])) return true;
  const raw = getObjectCandidate(rawResult);
  return Boolean(raw.outputs || raw.outputFiles || raw.runtimeLog || raw.logs);
}

function buildRuntimeModelContent(rawResult: any, context: ToolResultCompactionContext): string {
  const raw = getObjectCandidate(rawResult);
  const outputs = normalizeRuntimeOutputs(rawResult);
  const summary =
    firstText(raw, ['summary', 'result.summary', 'message', 'content'], 700) ||
    'Runtime 已返回结果';
  const error = firstText(raw, ['publicError', 'error', 'result.error'], 360);
  const status = context.status || safeText(raw.status, 40) || (error ? 'error' : 'success');
  const lines = ['Runtime 执行摘要：', `状态：${status}`, `摘要：${summary}`];
  if (outputs.length) {
    lines.push(
      '输出文件：',
      ...outputs.map(item => {
        const parts = [
          item.fileRef ? `fileRef=${item.fileRef}` : '',
          `name=${item.name}`,
          item.type ? `type=${item.type}` : '',
          item.mime ? `mime=${item.mime}` : '',
          formatFileSize(item.size) ? `size=${formatFileSize(item.size)}` : '',
          item.role ? `role=${item.role}` : '',
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      }),
    );
  }
  if (error) lines.push(`错误摘要：${error}`);
  const publicLogSummary = compactLogText(pickRuntimePublicLogSummary(rawResult));
  if (publicLogSummary) lines.push('日志摘要：', publicLogSummary);
  return lines.join('\n');
}

function isFileParseLike(rawResult: any, context: ToolResultCompactionContext): boolean {
  if (
    contextIncludes(context, [
      /文件|解析|file|document|pdf|word|docx|excel|xlsx|spreadsheet|ppt|pptx/,
    ])
  ) {
    return true;
  }
  const raw = getObjectCandidate(rawResult);
  return Boolean(
    firstValue(raw, ['fileName', 'filename', 'fileType', 'mimeType', 'pages', 'rows', 'fileId']),
  );
}

function buildFileParseModelContent(rawResult: any): string {
  const raw = getObjectCandidate(rawResult);
  const files = normalizeModelFiles(rawResult)
    .filter(item => item.fileRef || item.name || item.mime || item.type)
    .slice(0, MODEL_RESULT_ITEM_LIMIT);
  const fileName = firstText(raw, ['fileName', 'filename', 'name', 'title', 'file.name'], 160);
  const fileType = firstText(raw, ['fileType', 'mimeType', 'mime', 'type', 'file.mimeType'], 80);
  const pageCount = firstText(raw, ['pages', 'pageCount', 'totalPages', 'metadata.pages'], 40);
  const rowCount = firstText(raw, ['rows', 'rowCount', 'totalRows', 'metadata.rows'], 40);
  const summarySource = firstValue(raw, [
    'summary',
    'content',
    'message',
    'previewContent',
    'result.summary',
  ]);
  const summary = summarySource
    ? compactLongMultilineText(summarySource, 600, 300)
    : compactLongMultilineText(pickContent(rawResult), 700, 300);
  const lines = [
    '文件解析摘要：',
    fileName ? `文件名：${fileName}` : '',
    fileType ? `类型：${fileType}` : '',
    pageCount ? `页数：${pageCount}` : '',
    rowCount ? `行数：${rowCount}` : '',
    summary ? `核心摘要：${summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (!files.length) return lines;
  return [
    lines,
    '相关文件：',
    ...files.map(item => {
      const parts = [
        `fileRef=${item.fileRef}`,
        item.name ? `name=${item.name}` : '',
        item.mime ? `mime=${item.mime}` : '',
        formatFileSize(item.size) ? `size=${formatFileSize(item.size)}` : '',
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    }),
  ].join('\n');
}

function isMediaType(type?: string): boolean {
  return type === 'image' || type === 'video' || type === 'audio';
}

function compactByDeclaredOutputKind(
  rawResult: any,
  context: ToolResultCompactionContext,
): CompactedModelContent | undefined {
  switch (normalizeToolResultOutputKind(context.output?.kind)) {
    case 'search':
      return {
        content: buildSearchModelContent(rawResult),
        includePublicFileUrls: false,
        includeFileReferenceLines: false,
      };
    case 'web_read':
      return {
        content: buildWebReadModelContent(rawResult, context),
        includePublicFileUrls: false,
        includeFileReferenceLines: false,
      };
    case 'runtime':
      return {
        content: buildRuntimeModelContent(rawResult, context),
        includePublicFileUrls: false,
        includeFileReferenceLines: false,
      };
    case 'file_parse':
      return {
        content: buildFileParseModelContent(rawResult),
        includePublicFileUrls: false,
        includeFileReferenceLines: false,
      };
    case 'media_generate':
      return {
        content: buildMediaGenerationModelContent(rawResult, context),
        includePublicFileUrls: false,
        includeFileReferenceLines: false,
      };
    case 'generic':
      return {
        content: compactLongText(pickContent(rawResult)),
        includePublicFileUrls: true,
        includeFileReferenceLines: true,
      };
    default:
      return undefined;
  }
}

function isMediaGenerationLike(rawResult: any, context: ToolResultCompactionContext): boolean {
  if (normalizeModelFiles(rawResult).some(item => isMediaType(item.type))) return true;
  if (
    contextIncludes(context, [
      /图片生成|生成图片|绘图|画图|文生图|图生图|视频生成|生成视频|音频生成|生成音频|音乐生成|生成音乐/,
      /media[_\s-]?generate|image[_\s-]?generation|video[_\s-]?generation|audio[_\s-]?generation|music[_\s-]?generation/i,
      /generate(?:[_\s-]+(?:image|video|audio|music))?|paint|drawing/i,
    ])
  ) {
    return true;
  }
  return false;
}

function buildMediaGenerationModelContent(
  rawResult: any,
  context: ToolResultCompactionContext,
): string {
  const raw = getObjectCandidate(rawResult);
  const files = normalizeModelFiles(rawResult)
    .filter(item => isMediaType(item.type))
    .slice(0, MODEL_RESULT_ITEM_LIMIT);
  const status = context.status || safeText(raw.status, 40) || 'success';
  const summary = hideUrlsFromModelSummary(
    safeModelText(firstValue(raw, ['summary', 'message', 'content']), 500),
  );
  const lines = ['媒体生成结果：', `状态：${status}`];
  if (summary) lines.push(`摘要：${summary}`);
  if (files.length) {
    lines.push(
      '生成文件：',
      ...files.map(item => {
        const parts = [
          `fileRef=${item.fileRef}`,
          `type=${item.type}`,
          item.name ? `name=${item.name}` : '',
          item.mime ? `mime=${item.mime}` : '',
          formatFileSize(item.size) ? `size=${formatFileSize(item.size)}` : '',
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      }),
    );
  }
  return lines.join('\n');
}

function compactToolModelContent(
  rawResult: any,
  context: ToolResultCompactionContext,
): CompactedModelContent {
  const declared = compactByDeclaredOutputKind(rawResult, context);
  if (declared) return declared;

  if (isSearchLike(rawResult, context)) {
    return {
      content: buildSearchModelContent(rawResult),
      includePublicFileUrls: false,
      includeFileReferenceLines: false,
    };
  }
  if (isWebReadLike(rawResult, context)) {
    return {
      content: buildWebReadModelContent(rawResult, context),
      includePublicFileUrls: false,
      includeFileReferenceLines: false,
    };
  }
  if (isRuntimeLike(rawResult, context)) {
    return {
      content: buildRuntimeModelContent(rawResult, context),
      includePublicFileUrls: false,
      includeFileReferenceLines: false,
    };
  }
  if (isMediaGenerationLike(rawResult, context)) {
    return {
      content: buildMediaGenerationModelContent(rawResult, context),
      includePublicFileUrls: false,
      includeFileReferenceLines: false,
    };
  }
  if (isFileParseLike(rawResult, context)) {
    return {
      content: buildFileParseModelContent(rawResult),
      includePublicFileUrls: false,
      includeFileReferenceLines: false,
    };
  }

  return {
    content: compactLongText(pickContent(rawResult)),
    includePublicFileUrls: true,
    includeFileReferenceLines: true,
  };
}

export {
  compactToolModelContent,
  normalizeSearchItems,
  normalizeToolResultOutputDescriptor,
  normalizeToolResultOutputKind,
  safeDiagnosticText,
  safeModelText,
};
