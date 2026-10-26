import type {
  ModelStreamError,
  ModelStreamErrorCategory,
  ModelStreamUsage,
} from './model-stream.types';

const CONTEXT_OVERFLOW_PATTERN =
  /context[_ .-]?(?:length|window)|maximum context|too many (?:input )?tokens|prompt (?:is )?too long|input (?:is )?too long|token limit exceeded|max(?:imum)?[_ .-]?input[_ .-]?tokens/i;
const RATE_LIMIT_PATTERN =
  /rate[_ .-]?limit|too many requests|requests? per (?:minute|second|day)|quota exceeded|resource exhausted/i;
const AUTH_PATTERN =
  /unauthori[sz]ed|forbidden|invalid[_ .-]?(?:api[_ .-]?)?key|authentication|permission denied|access denied/i;
const TRANSIENT_PATTERN =
  /temporar(?:y|ily)|overloaded|unavailable|server[_ .-]?error|internal[_ .-]?error|bad gateway|gateway timeout|service unavailable/i;
const NETWORK_CODE_PATTERN =
  /^(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|UND_ERR_[A-Z_]+)$/i;

const SAFE_MESSAGES: Record<ModelStreamErrorCategory, string> = {
  context_overflow: '模型上下文超过限制',
  rate_limit: '模型服务请求过于频繁，请稍后再试',
  transient: '模型服务暂时不可用，请稍后再试',
  auth: '模型服务认证失败，请检查模型配置',
  invalid_request: '模型请求无效，请检查模型配置',
  aborted: '模型请求已取消',
  unknown: '模型请求结果无法确认，已停止自动重试',
};

const SAFE_CODES: Record<ModelStreamErrorCategory, string> = {
  context_overflow: 'MODEL_CONTEXT_OVERFLOW',
  rate_limit: 'MODEL_RATE_LIMIT',
  transient: 'MODEL_TRANSIENT_ERROR',
  auth: 'MODEL_AUTH_ERROR',
  invalid_request: 'MODEL_INVALID_REQUEST',
  aborted: 'MODEL_ABORTED',
  unknown: 'MODEL_OUTCOME_UNKNOWN',
};

export interface ProviderErrorClassificationOptions {
  nowMs?: number;
  signal?: AbortSignal;
  /** 已收到供应商明确失败帧时可证明本次没有可用结果。 */
  requestOutcome?: 'rejected' | 'unknown';
  status?: number;
  retryAfter?: unknown;
}

export class ClassifiedProviderError extends Error implements ModelStreamError {
  readonly code: string;
  readonly category: ModelStreamErrorCategory;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestOutcome: 'rejected' | 'unknown';
  readonly status?: number;

  constructor(error: ModelStreamError) {
    super(error.message);
    this.name = error.category === 'aborted' ? 'AbortError' : 'ModelStreamError';
    this.code = error.code;
    this.category = error.category;
    this.retryable = error.retryable;
    this.retryAfterMs = error.retryAfterMs;
    this.requestOutcome = error.requestOutcome;
    this.status = error.status;
  }
}

export function classifyProviderError(
  error: unknown,
  options: ProviderErrorClassificationOptions = {},
): ModelStreamError {
  if (error instanceof ClassifiedProviderError) {
    return toSafeModelStreamError(error);
  }

  const status = normalizeStatus(options.status ?? readNumber(error, ['status', 'statusCode']));
  const code =
    readString(error, ['code', 'type']) || readNestedString(error, 'error', ['code', 'type']);
  const message =
    readString(error, ['message']) ||
    readNestedString(error, 'error', ['message']) ||
    (typeof error === 'string' ? error : '');
  const combined = `${code || ''} ${message}`;
  const aborted =
    Boolean(options.signal?.aborted) ||
    code === 'aborted' ||
    code === 'ABORT_ERR' ||
    code === 'ERR_ABORTED' ||
    readString(error, ['name']) === 'AbortError' ||
    /\babort(?:ed)?\b|中止|取消/i.test(combined);

  let category: ModelStreamErrorCategory;
  if (aborted) category = 'aborted';
  else if (status === 401 || status === 403 || AUTH_PATTERN.test(combined)) category = 'auth';
  else if (CONTEXT_OVERFLOW_PATTERN.test(combined)) category = 'context_overflow';
  else if (status === 429 || RATE_LIMIT_PATTERN.test(combined)) category = 'rate_limit';
  else if (code && NETWORK_CODE_PATTERN.test(code)) category = 'unknown';
  else if (
    status === 408 ||
    status === 409 ||
    (status !== undefined && status >= 500) ||
    TRANSIENT_PATTERN.test(combined)
  )
    category = 'transient';
  else if (status !== undefined && status >= 400 && status < 500) category = 'invalid_request';
  else category = 'unknown';

  const requestOutcome = resolveRequestOutcome(category, status, options.requestOutcome);
  const retryAfterMs = parseRetryAfterMs(
    options.retryAfter ?? readRetryAfter(error),
    options.nowMs ?? Date.now(),
  );
  const retryable =
    requestOutcome === 'rejected' && (category === 'rate_limit' || category === 'transient');

  return {
    code: SAFE_CODES[category],
    message: SAFE_MESSAGES[category],
    category,
    retryable,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    requestOutcome,
    ...(status === undefined ? {} : { status }),
  };
}

export function toClassifiedProviderError(
  error: unknown,
  options: ProviderErrorClassificationOptions = {},
): ClassifiedProviderError {
  return error instanceof ClassifiedProviderError
    ? error
    : new ClassifiedProviderError(classifyProviderError(error, options));
}

/** 请求带了回放状态而被厂商拒绝（尚未开始返回）：唯一保留下来的协议包错误码，运行时据此去掉状态重发一次 */
export const MODEL_PROVIDER_STATE_REJECTED = 'provider_state_rejected';

export function toSafeModelStreamError(error: ModelStreamError): ModelStreamError {
  const category = isModelStreamErrorCategory(error.category) ? error.category : 'unknown';
  const status = normalizeStatus(error.status);
  const requestOutcome = error.requestOutcome === 'rejected' ? 'rejected' : 'unknown';
  const retryAfterMs = normalizeRetryAfterMs(error.retryAfterMs);
  const keepsCode =
    error.code === MODEL_PROVIDER_STATE_REJECTED &&
    category === 'invalid_request' &&
    requestOutcome === 'rejected';
  return {
    code: keepsCode ? MODEL_PROVIDER_STATE_REJECTED : SAFE_CODES[category],
    message: SAFE_MESSAGES[category],
    category,
    retryable:
      requestOutcome === 'rejected' &&
      Boolean(error.retryable) &&
      (category === 'rate_limit' || category === 'transient'),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    requestOutcome,
    ...(status === undefined ? {} : { status }),
  };
}

export function classifySilentProviderCompletion(input: {
  finishReason?: string;
  usage?: ModelStreamUsage;
  outputObserved: boolean;
  estimatedInputTokens: number;
  contextWindowTokens?: number;
}): ModelStreamError | null {
  if (input.outputObserved) return null;
  const finishReason = String(input.finishReason || '').trim();
  const explicitOverflow = CONTEXT_OVERFLOW_PATTERN.test(finishReason);
  const lengthStop = /^(?:length|max_tokens|max_output_tokens|token_limit)$/i.test(finishReason);
  if (!explicitOverflow && !lengthStop) return null;

  const contextWindowTokens = Math.max(0, Math.floor(Number(input.contextWindowTokens) || 0));
  const observedInputTokens = Math.max(0, Math.floor(Number(input.usage?.inputTokens) || 0));
  const nearFullContext =
    explicitOverflow ||
    (contextWindowTokens > 0 &&
      Math.max(observedInputTokens, input.estimatedInputTokens) >= contextWindowTokens * 0.9);
  if (!nearFullContext) return null;

  return toSafeModelStreamError({
    code: SAFE_CODES.context_overflow,
    message: SAFE_MESSAGES.context_overflow,
    category: 'context_overflow',
    retryable: false,
    requestOutcome: input.usage ? 'unknown' : 'rejected',
  });
}

export function estimateProviderInputTokens(value: unknown): number {
  try {
    return Math.max(1, Math.ceil(JSON.stringify(value).length / 4));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function parseRetryAfterMs(value: unknown, nowMs = Date.now()): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeRetryAfterMs(value * 1_000);
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/^\d+(?:\.\d+)?$/u.test(normalized)) {
    return normalizeRetryAfterMs(Number(normalized) * 1_000);
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return undefined;
  return normalizeRetryAfterMs(Math.max(0, timestamp - nowMs));
}

function resolveRequestOutcome(
  category: ModelStreamErrorCategory,
  status: number | undefined,
  explicit: 'rejected' | 'unknown' | undefined,
): 'rejected' | 'unknown' {
  if (category === 'aborted') return 'unknown';
  if (explicit) return explicit;
  if (status === 408) return 'unknown';
  if (category === 'context_overflow') return 'rejected';
  return status !== undefined ? 'rejected' : 'unknown';
}

function isModelStreamErrorCategory(value: unknown): value is ModelStreamErrorCategory {
  return [
    'context_overflow',
    'rate_limit',
    'transient',
    'auth',
    'invalid_request',
    'aborted',
    'unknown',
  ].includes(String(value));
}

function normalizeStatus(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : undefined;
}

function normalizeRetryAfterMs(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(parsed));
}

function readString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 8_192);
  }
  return undefined;
}

function readNumber(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) {
    const candidate = Number((value as Record<string, unknown>)[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

function readNestedString(value: unknown, key: string, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return readString((value as Record<string, unknown>)[key], keys);
}

function readRetryAfter(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, any>;
  for (const headers of [record.headers, record.response?.headers]) {
    if (headers?.get instanceof Function) {
      const value = headers.get('retry-after');
      if (value !== null && value !== undefined) return value;
    }
    if (headers && typeof headers === 'object') {
      const value = headers['retry-after'] ?? headers['Retry-After'];
      if (value !== undefined) return value;
    }
  }
  return record.retryAfter ?? record.retry_after;
}
