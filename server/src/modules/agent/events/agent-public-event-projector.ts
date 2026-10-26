import { AgentEvent } from '@99agent/contracts';
import { REDACTED_TEXT } from '@/common/constants/redaction.constant';
import {
  OWNER_FRONTEND_MESSAGE_OPTIONS,
  sanitizeFrontendMessage,
} from '../../chatLog/tool-result-payload';
import { InternalAgentEvent } from './internal-agent-event.types';

const BLOCKED_PUBLIC_KEYS = new Set(
  [
    'apiKey',
    'api_key',
    'authorization',
    'baseUrl',
    'headers',
    'raw',
    'rawInput',
    'rawOutput',
    'rawPayload',
    'providerPayload',
    'providerResponse',
    'request',
    'response',
    'stdout',
    'stderr',
    'stack',
    'trace',
    'traceId',
    'invocation',
    'invocationId',
    'parentInvocationId',
    'operationId',
    'generation',
    'telemetry',
    'contextManifest',
    'contextBlockManifest',
    'diagnostics',
    'privatePath',
    'workingDirectory',
    'storagePath',
    'localPath',
    'filePath',
    'realPath',
    'absolutePath',
  ].map(normalizeKey),
);

const SENSITIVE_TEXT_PATTERN =
  /(^|[\s"'[{,])(api[_-]?key|authorization|bearer|base[_-]?url|token|secret|password|stdout|stderr|stack|private[_-]?path|storage[_-]?path|local[_-]?path|absolute[_-]?path)\s*[:=]/i;

type PrivateFileUrlAction = 'download' | 'preview';

export interface SanitizedPublicEventValue {
  value: unknown;
  remove?: boolean;
  privateDownloadHidden: boolean;
  privatePreviewHidden: boolean;
}

const PRIVATE_FILE_PUBLIC_EVENT_URL_PATTERN =
  /(?:https?:\/\/[^/\s)\]'"<>]+)?\/?api\/files\/[^/\s)\]'"<>?#]+\/(download|preview)(?:[?#][^\s)\]'"<>]*)?/gi;
const PRIVATE_FILE_PUBLIC_EVENT_URL_EXACT_PATTERN =
  /^(?:https?:\/\/[^/\s)\]'"<>]+)?\/?api\/files\/[^/\s)\]'"<>?#]+\/(download|preview)(?:[?#].*)?$/i;
const PRIVATE_FILE_PUBLIC_EVENT_URL_ID_PATTERN =
  /^(?:https?:\/\/[^/\s)\]'"<>]+)?\/?api\/files\/(file_[a-zA-Z0-9_-]+)\/(?:download|preview)(?:[?#].*)?$/i;
const PUBLIC_EVENT_PRIVATE_URL_KEYS = new Set(
  [
    'url',
    'href',
    'link',
    'downloadUrl',
    'previewUrl',
    'publicUrl',
    'fileUrl',
    'imageUrl',
    'videoUrl',
    'audioUrl',
  ].map(normalizeKey),
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizePublicText(value: string): string {
  if (SENSITIVE_TEXT_PATTERN.test(value)) return REDACTED_TEXT;
  return value.replace(/https?:\/\/[^\s"'<>，。)）]+/gi, url =>
    /[?&](token|api[_-]?key|signature|credential|secret)=/i.test(url) ? '[链接已脱敏]' : url,
  );
}

function getExactPrivateFileUrlAction(value: string): PrivateFileUrlAction | null {
  const match = value.trim().match(PRIVATE_FILE_PUBLIC_EVENT_URL_EXACT_PATTERN);
  const action = match?.[1]?.toLowerCase();
  return action === 'download' || action === 'preview' ? action : null;
}

function extractPrivateFileIdFromExactUrl(value: string): string | null {
  const match = value.trim().match(PRIVATE_FILE_PUBLIC_EVENT_URL_ID_PATTERN);
  return match ? match[1] : null;
}

function hiddenFlagsFromAction(action: PrivateFileUrlAction): {
  privateDownloadHidden: boolean;
  privatePreviewHidden: boolean;
} {
  return {
    privateDownloadHidden: action === 'download',
    privatePreviewHidden: action === 'preview',
  };
}

function stripPrivateFileUrlsFromPublicText(value: string): SanitizedPublicEventValue {
  let privateDownloadHidden = false;
  let privatePreviewHidden = false;
  const stripped = value.replace(PRIVATE_FILE_PUBLIC_EVENT_URL_PATTERN, (_match, action) => {
    if (String(action).toLowerCase() === 'download') privateDownloadHidden = true;
    if (String(action).toLowerCase() === 'preview') privatePreviewHidden = true;
    return '[private-file-url-hidden]';
  });
  return {
    value: stripped,
    privateDownloadHidden,
    privatePreviewHidden,
  };
}

export function stripPrivateFileUrlsFromPublicEventData(
  value: unknown,
  key?: string,
): SanitizedPublicEventValue {
  if (Array.isArray(value)) {
    let privateDownloadHidden = false;
    let privatePreviewHidden = false;
    const sanitized: unknown[] = [];
    for (const item of value) {
      const child = stripPrivateFileUrlsFromPublicEventData(item);
      privateDownloadHidden = privateDownloadHidden || child.privateDownloadHidden;
      privatePreviewHidden = privatePreviewHidden || child.privatePreviewHidden;
      if (!child.remove) sanitized.push(child.value);
    }
    return { value: sanitized, privateDownloadHidden, privatePreviewHidden };
  }

  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') {
      return {
        value,
        privateDownloadHidden: false,
        privatePreviewHidden: false,
      };
    }

    const exactAction = getExactPrivateFileUrlAction(value);
    if (exactAction && key && PUBLIC_EVENT_PRIVATE_URL_KEYS.has(normalizeKey(key))) {
      return {
        value: undefined,
        remove: true,
        ...hiddenFlagsFromAction(exactAction),
      };
    }
    return stripPrivateFileUrlsFromPublicText(value);
  }

  let privateDownloadHidden = false;
  let privatePreviewHidden = false;
  let derivedFileId: string | null = null;
  const result: Record<string, unknown> = {};

  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    const child = stripPrivateFileUrlsFromPublicEventData(childValue, childKey);
    privateDownloadHidden = privateDownloadHidden || child.privateDownloadHidden;
    privatePreviewHidden = privatePreviewHidden || child.privatePreviewHidden;
    if (!child.remove) {
      result[childKey] = child.value;
    } else if (!derivedFileId && typeof childValue === 'string') {
      derivedFileId = extractPrivateFileIdFromExactUrl(childValue);
    }
  }

  // 边界契约：隐藏私有访问地址，但保留文件公开身份（fileId 由文件 API 在访问时鉴权）。
  // 否则前端在流式期间既无 URL 又无 fileId，无法对私有图片/视频做鉴权水合，只能刷新后从落库消息恢复。
  if (derivedFileId && !result.fileId) {
    result.fileId = derivedFileId;
  }

  if (privateDownloadHidden) result.privateDownloadHidden = true;
  if (privatePreviewHidden) result.privatePreviewHidden = true;
  return { value: result, privateDownloadHidden, privatePreviewHidden };
}

function sanitizePublicEventSensitiveData<T = unknown>(value: T): T {
  if (typeof value === 'string') return sanitizePublicText(value) as T;
  if (Array.isArray(value)) return value.map(item => sanitizePublicEventSensitiveData(item)) as T;
  if (!isPlainObject(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKED_PUBLIC_KEYS.has(normalizeKey(key))) continue;
    sanitized[key] = sanitizePublicEventSensitiveData(nested);
  }
  return sanitized as T;
}

export function sanitizePublicEventData<T = unknown>(value: T): T {
  const privateFileSafe = stripPrivateFileUrlsFromPublicEventData(value);
  return sanitizePublicEventSensitiveData(privateFileSafe.value) as T;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isFrontendMessageLike(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Boolean(value.role || value.rounds || value.turn || value.task || value.liveToolCalls);
}

const CANONICAL_SNAPSHOT_MESSAGE_KEYS = new Set([
  'role',
  'content',
  'rounds',
  'model',
  'timestamp',
  'turn',
  'privateDownloadHidden',
  'privatePreviewHidden',
]);
const CANONICAL_SNAPSHOT_ROUND_KEYS = new Set([
  'text',
  'thinking',
  'toolCalls',
  'completed',
  'phase',
  'privateDownloadHidden',
  'privatePreviewHidden',
]);
const CANONICAL_SNAPSHOT_TOOL_CALL_KEYS = new Set([
  'id',
  'name',
  'toolName',
  'displayName',
  'status',
  'arguments',
  'inputSummary',
  'type',
  'outputHint',
  'progress',
  'display',
  'assets',
  'output',
  'duration',
  'error',
  'privateDownloadHidden',
  'privatePreviewHidden',
]);

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

/**
 * contracts reference reducer 已产出的 canonical snapshot message 只需递归净化，
 * 不能再次走 backend -> frontend tool-call 映射，否则 primitive output 会被改形。
 */
function isCanonicalSnapshotMessage(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, CANONICAL_SNAPSHOT_MESSAGE_KEYS)) return false;
  if (!Array.isArray(value.rounds)) return false;

  return value.rounds.every(round => {
    if (!isPlainObject(round) || !hasOnlyKeys(round, CANONICAL_SNAPSHOT_ROUND_KEYS)) return false;
    if (!Array.isArray(round.toolCalls)) return false;
    return round.toolCalls.every(toolCall => {
      if (!isPlainObject(toolCall) || !hasOnlyKeys(toolCall, CANONICAL_SNAPSHOT_TOOL_CALL_KEYS)) {
        return false;
      }
      return (
        typeof toolCall.id === 'string' &&
        typeof toolCall.name === 'string' &&
        isPlainObject(toolCall.arguments) &&
        Object.keys(toolCall.arguments).length === 0
      );
    });
  });
}

function sanitizeMaybeFrontendMessage(value: unknown): unknown {
  const parsed = parseMaybeJson(value);
  if (!isFrontendMessageLike(parsed)) return value;
  const safeMessage = isCanonicalSnapshotMessage(parsed)
    ? sanitizePublicEventData(parsed)
    : sanitizePublicEventData(sanitizeFrontendMessage(parsed, OWNER_FRONTEND_MESSAGE_OPTIONS));
  return JSON.stringify(safeMessage);
}

function sanitizeAgentEventMessageFields(value: unknown): unknown {
  if (!isPlainObject(value)) return value;

  const cloned: Record<string, unknown> = { ...value };
  if (cloned.message !== undefined) {
    cloned.message = sanitizeMaybeFrontendMessage(cloned.message);
  }

  if (isPlainObject(cloned.initialMessages)) {
    const initialMessages = { ...(cloned.initialMessages as Record<string, any>) };
    for (const key of ['user', 'assistant']) {
      if (initialMessages[key]?.message !== undefined) {
        initialMessages[key] = {
          ...initialMessages[key],
          message: sanitizeMaybeFrontendMessage(initialMessages[key].message),
        };
      }
    }
    cloned.initialMessages = initialMessages;
  }

  return cloned;
}

function restoreSanitizedFrontendMessageFields(
  sanitizedValue: unknown,
  sourceValue: unknown,
): unknown {
  if (!isPlainObject(sanitizedValue) || !isPlainObject(sourceValue)) return sanitizedValue;

  const restored: Record<string, unknown> = { ...sanitizedValue };
  if (
    sourceValue.message !== undefined &&
    isFrontendMessageLike(parseMaybeJson(sourceValue.message))
  ) {
    restored.message = sourceValue.message;
  }

  if (isPlainObject(sourceValue.initialMessages) && isPlainObject(restored.initialMessages)) {
    const restoredInitialMessages = { ...(restored.initialMessages as Record<string, any>) };
    const sourceInitialMessages = sourceValue.initialMessages as Record<string, any>;
    for (const key of ['user', 'assistant']) {
      if (
        sourceInitialMessages[key]?.message !== undefined &&
        isFrontendMessageLike(parseMaybeJson(sourceInitialMessages[key].message)) &&
        restoredInitialMessages[key]
      ) {
        restoredInitialMessages[key] = {
          ...restoredInitialMessages[key],
          message: sourceInitialMessages[key].message,
        };
      }
    }
    restored.initialMessages = restoredInitialMessages;
  }

  return restored;
}

export function sanitizeAgentEventForFrontend<T extends AgentEvent>(event: T): T {
  const dataWithSafeMessages = sanitizeAgentEventMessageFields(event.data || {});
  const sanitizedData = sanitizePublicEventData(dataWithSafeMessages);
  return {
    ...event,
    data: restoreSanitizedFrontendMessageFields(sanitizedData, dataWithSafeMessages) as T['data'],
  };
}

export function projectInternalAgentEventToPublic(event: InternalAgentEvent): AgentEvent {
  // 内部事件 data 为动态结构，类型契约在此生产者边界一次性收敛为公开协议
  return sanitizeAgentEventForFrontend({
    type: event.type,
    chatId: String(event.chatId),
    ...(event.messageId === undefined ? {} : { messageId: String(event.messageId) }),
    ...(event.taskId ? { taskId: event.taskId } : {}),
    ...(event.conversationGid ? { conversationGid: event.conversationGid } : {}),
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.roundId === undefined ? {} : { roundId: String(event.roundId) }),
    ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
    timestamp: event.timestamp,
    data: (event.data || {}) as Record<string, unknown>,
  } as AgentEvent);
}
