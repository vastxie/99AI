import type { AgentRuntimeCapabilityResult } from '@99agent/runtime-core';
import { REDACTED_TEXT } from '@/common/constants/redaction.constant';
import { capFaithfulText, sanitizeFaithfulText } from './tool-result-payload/faithful-text';

export type AgentToolModelContent = AgentRuntimeCapabilityResult['modelContent'];
export type AgentToolResultStatus = 'success' | 'error' | 'skipped';

export type AgentToolAssetRole = 'final' | 'intermediate' | 'preview' | 'source';

export interface AgentToolAsset {
  fileId: string;
  role: AgentToolAssetRole;
  displayName: string;
  mimeType?: string;
  size?: number;
}

export interface AgentToolResultDisplay {
  title?: string;
  summary?: string;
  markdown?: string;
  json?: unknown;
}

export interface AgentToolResultTrace {
  code?: string;
  message?: string;
  retryable?: boolean;
  diagnostics?: Record<string, unknown>;
}

export interface AgentToolResultControl {
  terminate?: boolean;
  queueNextTurn?: boolean;
  handoff?: boolean;
  nextPrompt?: string;
}

export interface AgentToolResult {
  status: AgentToolResultStatus;
  /** 唯一默认回灌给模型继续推理的内容。 */
  modelContent?: AgentToolModelContent;
  /** 前端活动面板和工具详情的安全展示投影。 */
  display?: AgentToolResultDisplay;
  /** FileAsset 索引，不包含本地路径或直出私有下载地址。 */
  assets?: AgentToolAsset[];
  /** 脱敏诊断摘要，不包含原始 stdout/stderr、provider payload 或异常栈。 */
  trace?: AgentToolResultTrace;
  /** Agent loop 控制意图。 */
  control?: AgentToolResultControl;
}

export interface NormalizeToolResultOptions {
  status?: AgentToolResultStatus | 'loading';
  modelContent?: unknown;
  display?: AgentToolResultDisplay;
  assets?: unknown;
  trace?: AgentToolResultTrace;
  control?: AgentToolResultControl;
  /**
   * 模型文字的规范化方式（内部参数，不写进结果）：faithful 只用于原语工具的权威正文，
   * 只替换平台私有信息、保留原文格式；其余一律走默认的安全净化
   */
  modelText?: 'faithful';
}

const TOOL_RESULT_STATUSES = new Set<AgentToolResultStatus>(['success', 'error', 'skipped']);

const TOOL_ASSET_ROLES = new Set<AgentToolAssetRole>([
  'final',
  'intermediate',
  'preview',
  'source',
]);

const SENSITIVE_TOOL_RESULT_KEYS = new Set(
  [
    'apiKey',
    'api_key',
    'authorization',
    'baseUrl',
    'headers',
    'log',
    'logs',
    'raw',
    'rawInput',
    'rawOutput',
    'rawPayload',
    'providerPayload',
    'providerResponse',
    'request',
    'response',
    'runtimeLog',
    'stdout',
    'stderr',
    'stack',
    'privatePath',
    'storagePath',
    'localPath',
    'filePath',
    'realPath',
    'absolutePath',
    'downloadUrl',
    'previewUrl',
    'fileUrl',
    'imageUrl',
    'videoUrl',
    'audioUrl',
    'signedUrl',
  ].map(normalizeKey),
);

const SENSITIVE_TOOL_RESULT_TEXT_PATTERNS = [
  /(?:api[_\s-]?key|authorization|bearer|token|secret|password)\s*[:=]/i,
  /base[_\s-]?url\s*[:=]/i,
  /(?:provider\s+raw\s+payload|provider[_\s-]?payload|provider[_\s-]?response|raw[_\s-]?(?:payload|response|output))\s*[:=]/i,
  /\bstd(?:out|err)\s*[:=]/i,
  /\bstack(?:\s+trace)?\s*[:=]/i,
  /\btrace\s*[:=]\s*(?!\[?(?:redacted|已脱敏))/i,
  /(?:https?:\/\/[^/\s)\]'"<>]+)?\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)(?:[?#][^\s)\]'"<>]*)?/i,
  /x-amz-(?:signature|credential|security-token)=/i,
  /(?:^|\s)(?:\/Users\/|\/private\/var\/|\/var\/folders\/|[A-Za-z]:\\Users\\)/,
  /\n\s*at\s+.+\(.+:\d+:\d+\)/,
];

const DEFAULT_MODEL_CONTENT = '工具执行完成';
const PUBLIC_TEXT_LIMIT = 4000;
const MODEL_TEXT_LIMIT = 12000;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function stringifySafe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  if (value instanceof Error) return value.message || value.name;
  try {
    return JSON.stringify(sanitizePublicValue(value));
  } catch {
    return String(value);
  }
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(?:https?:\/\/[^/\s)\]'"<>]+)?\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)(?:[?#][^\s)\]'"<>]*)?/gi,
      REDACTED_TEXT,
    )
    .replace(
      /(?:^|\s)(?:\/Users\/|\/private\/var\/|\/var\/folders\/)[^\s)\]'"<>，。]*/g,
      ` ${REDACTED_TEXT}`,
    )
    .replace(/[A-Za-z]:\\Users\\[^\s)\]'"<>，。]*/g, REDACTED_TEXT)
    .replace(/x-amz-(?:signature|credential|security-token)=[^&\s]+/gi, REDACTED_TEXT)
    .replace(
      /\b(?:api[_\s-]?key|authorization|bearer|token|secret|password)\s*[:=]\s*[^\s,;，。)）]+/gi,
      REDACTED_TEXT,
    )
    .replace(/\bbase[_\s-]?url\s*[:=]\s*[^\s,;，。)）]+/gi, REDACTED_TEXT)
    .replace(
      /(?:provider\s+raw\s+payload|provider[_\s-]?payload|provider[_\s-]?response|raw[_\s-]?(?:payload|response|output))\s*[:=][^\n]*/gi,
      REDACTED_TEXT,
    )
    .replace(/\bstd(?:out|err)\s*[:=][^\n]*/gi, REDACTED_TEXT)
    .replace(/\bstack(?:\s+trace)?\s*[:=][\s\S]*/gi, REDACTED_TEXT)
    .replace(/\n\s*at\s+.+\(.+:\d+:\d+\)/g, '')
    .trim();
}

function safePublicText(value: unknown, limit = PUBLIC_TEXT_LIMIT): string | undefined {
  const text = redactSensitiveText(stringifySafe(value)).replace(/\s+/g, ' ').trim();
  return text ? truncate(text, limit) : undefined;
}

function safeModelText(value: unknown): string | undefined {
  const text = redactSensitiveText(stringifySafe(value)).trim();
  return text ? truncate(text, MODEL_TEXT_LIMIT) : undefined;
}

function faithfulModelText(value: unknown, limit = MODEL_TEXT_LIMIT): string | undefined {
  // 只有空白也是原文的一部分：只在真的没有内容时才用默认说明
  const text = capFaithfulText(sanitizeFaithfulText(stringifySafe(value)), limit);
  return text ? text : undefined;
}

function normalizeModelContent(
  value: unknown,
  policy?: NormalizeToolResultOptions['modelText'],
): AgentToolModelContent | undefined {
  const faithful = policy === 'faithful';
  if (!Array.isArray(value)) return faithful ? faithfulModelText(value) : safeModelText(value);
  if (!value.length || value.length > 32) fail('modelContent part count is invalid');
  // 原文的文字部分合计受同一上限约束
  const textParts = value.filter(part => part?.type === 'text').length;
  const partLimit = Math.floor(MODEL_TEXT_LIMIT / Math.max(1, textParts));
  return value.map(part => {
    if (
      part?.type === 'text' &&
      typeof part.text === 'string' &&
      Object.keys(part).every(key => key === 'type' || key === 'text')
    ) {
      return {
        type: 'text',
        text: (faithful ? faithfulModelText(part.text, partLimit) : safeModelText(part.text)) || '',
      };
    }
    if (
      (part?.type === 'image_file' || part?.type === 'audio_file') &&
      Object.keys(part).every(key => key === 'type' || key === 'file') &&
      typeof part.file?.fileRef === 'string' &&
      Object.keys(part.file).every(key => ['fileRef', 'name', 'mime'].includes(key)) &&
      /^(attachment|output_image|output_file|previous_file)_[1-9]\d*$/.test(part.file.fileRef)
    ) {
      return {
        type: part.type,
        file: {
          fileRef: part.file.fileRef,
          ...(typeof part.file.name === 'string'
            ? { name: safePublicText(part.file.name, 255) }
            : {}),
          ...(typeof part.file.mime === 'string'
            ? { mime: safePublicText(part.file.mime, 128) }
            : {}),
        },
      };
    }
    fail('modelContent accepts only text and internal media file references');
  });
}

function sanitizePublicValue(value: unknown, depth = 0): unknown {
  if (depth > 16) return '[truncated]';
  if (typeof value === 'string') return safePublicText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (value === undefined) return undefined;
  if (value instanceof Error) return safePublicText(value.message || value.name);
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizePublicValue(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (!isPlainObject(value)) return safePublicText(value);

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_TOOL_RESULT_KEYS.has(normalizeKey(key))) continue;
    const sanitized = sanitizePublicValue(nested, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function normalizeAssets(value: unknown): AgentToolAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const assets = value
    .map(normalizeAsset)
    .filter((asset): asset is AgentToolAsset => Boolean(asset))
    .filter(asset => {
      if (seen.has(asset.fileId)) return false;
      seen.add(asset.fileId);
      return true;
    });
  return assets.length ? assets : undefined;
}

function normalizeAsset(value: unknown): AgentToolAsset | undefined {
  if (!isPlainObject(value)) return undefined;
  const fileId = safePublicText(value.fileId, 128);
  if (!fileId || !/^file_[a-zA-Z0-9_-]+$/.test(fileId)) return undefined;
  const displayName = safePublicText(value.displayName, 160) || '文件';
  const mimeType = safePublicText(value.mimeType, 128);
  const size = Number(value.size);
  return {
    fileId,
    role: TOOL_ASSET_ROLES.has(value.role as AgentToolAssetRole)
      ? (value.role as AgentToolAssetRole)
      : 'intermediate',
    displayName,
    ...(mimeType ? { mimeType } : {}),
    ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
  };
}

function normalizeDisplay(
  value: unknown,
  status: AgentToolResultStatus,
): AgentToolResultDisplay | undefined {
  const input = isPlainObject(value) ? value : {};
  const title = safePublicText(input.title, 160);
  const summary = safePublicText(input.summary, 500) || (status === 'error' ? '工具处理失败' : '');
  const markdown = safePublicText(input.markdown, PUBLIC_TEXT_LIMIT);
  const json = sanitizePublicValue(input.json);
  const display: AgentToolResultDisplay = {
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(markdown && markdown !== summary ? { markdown } : {}),
    ...(json !== undefined ? { json } : {}),
  };
  return Object.keys(display).length ? display : undefined;
}

function normalizeTrace(value: unknown): AgentToolResultTrace | undefined {
  if (!isPlainObject(value)) return undefined;
  const code = safePublicText(value.code, 120);
  const message = safePublicText(value.message, 500);
  const diagnostics = sanitizePublicValue(value.diagnostics);
  const trace: AgentToolResultTrace = {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
    ...(isPlainObject(diagnostics) && Object.keys(diagnostics).length ? { diagnostics } : {}),
  };
  return Object.keys(trace).length ? trace : undefined;
}

function normalizeControl(value: unknown): AgentToolResultControl | undefined {
  if (!isPlainObject(value)) return undefined;
  const nextPrompt = safePublicText(value.nextPrompt, 1000);
  const control: AgentToolResultControl = {
    ...(typeof value.terminate === 'boolean' ? { terminate: value.terminate } : {}),
    ...(typeof value.queueNextTurn === 'boolean' ? { queueNextTurn: value.queueNextTurn } : {}),
    ...(typeof value.handoff === 'boolean' ? { handoff: value.handoff } : {}),
    ...(nextPrompt ? { nextPrompt } : {}),
  };
  return Object.keys(control).length ? control : undefined;
}

function fail(message: string): never {
  throw new Error(`AgentToolResult contract violation: ${message}`);
}

function assertNoSensitivePublicContent(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (SENSITIVE_TOOL_RESULT_TEXT_PATTERNS.some(pattern => pattern.test(value))) {
      fail(`${path} contains sensitive text and is not allowed in public tool result layers`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitivePublicContent(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_TOOL_RESULT_KEYS.has(normalizeKey(key))) {
      fail(`${path}.${key} is not allowed in public tool result layers`);
    }
    assertNoSensitivePublicContent(nested, `${path}.${key}`);
  }
}

export function assertAgentToolResult(value: unknown): asserts value is AgentToolResult {
  if (!isPlainObject(value)) fail('result must be an object');
  if (!TOOL_RESULT_STATUSES.has(value.status as AgentToolResultStatus)) {
    fail('status must be success, error, or skipped');
  }

  if (value.modelContent !== undefined && typeof value.modelContent !== 'string') {
    if (!Array.isArray(value.modelContent))
      fail('modelContent must be text or internal file parts');
    normalizeModelContent(value.modelContent);
  }

  if (value.display !== undefined) {
    if (!isPlainObject(value.display)) fail('display must be an object');
    assertNoSensitivePublicContent(value.display, 'display');
  }

  if (value.assets !== undefined) {
    if (!Array.isArray(value.assets)) fail('assets must be an array');
    value.assets.forEach((asset, index) => {
      if (!isPlainObject(asset)) fail(`assets[${index}] must be an object`);
      if (typeof asset.fileId !== 'string' || !/^file_[a-zA-Z0-9_-]+$/.test(asset.fileId)) {
        fail(`assets[${index}].fileId must be a FileAsset id`);
      }
      if (!TOOL_ASSET_ROLES.has(asset.role as AgentToolAssetRole)) {
        fail(`assets[${index}].role is invalid`);
      }
      if (typeof asset.displayName !== 'string' || !asset.displayName.trim()) {
        fail(`assets[${index}].displayName is required`);
      }
      assertNoSensitivePublicContent(asset, `assets[${index}]`);
    });
  }

  if (value.trace !== undefined) {
    if (!isPlainObject(value.trace)) fail('trace must be an object');
    assertNoSensitivePublicContent(value.trace, 'trace');
  }

  if (value.control !== undefined && !isPlainObject(value.control)) {
    fail('control must be an object');
  }
}

export function isAgentToolResult(value: unknown): value is AgentToolResult {
  try {
    assertAgentToolResult(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeToolResult(
  rawResult: unknown,
  options: NormalizeToolResultOptions = {},
): AgentToolResult {
  if (!isPlainObject(rawResult)) fail('result must be an object');
  const requestedStatus = options.status ?? rawResult.status;
  if (!TOOL_RESULT_STATUSES.has(requestedStatus as AgentToolResultStatus)) fail('invalid status');
  const status = requestedStatus as AgentToolResultStatus;
  const modelContent =
    normalizeModelContent(options.modelContent ?? rawResult.modelContent, options.modelText) ||
    DEFAULT_MODEL_CONTENT;
  const display = normalizeDisplay(options.display ?? rawResult.display, status);
  const assets = normalizeAssets(options.assets ?? rawResult.assets);
  const trace = normalizeTrace(options.trace ?? rawResult.trace);
  const control = normalizeControl(options.control ?? rawResult.control);

  const normalized: AgentToolResult = {
    status,
    ...(modelContent ? { modelContent } : {}),
    ...(display ? { display } : {}),
    ...(assets ? { assets } : {}),
    ...(trace ? { trace } : {}),
    ...(control ? { control } : {}),
  };

  assertAgentToolResult(normalized);
  return normalized;
}
