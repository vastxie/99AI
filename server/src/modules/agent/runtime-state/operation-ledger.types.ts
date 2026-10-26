import { createHash } from 'node:crypto';
import { OPERATION_ID_PATTERN, TURN_ID_PATTERN } from '@/common/constants/id-pattern.constant';

export type AgentOperationPhase =
  'admitted' | 'running' | 'recovering' | 'completed' | 'failed' | 'interrupted';

export type AgentOperationBillingPhase =
  'none' | 'settle_intent' | 'settled' | 'refund_intent' | 'refunded' | 'unknown';

export type AgentOperationSettlementMode = 'full' | 'tools_only';
export type AgentEffectKind = 'model' | 'tool';
export type AgentEffectState =
  'intent' | 'streaming' | 'replaying' | 'committed' | 'rejected' | 'interrupted' | 'unknown';
export type AgentToolReplayPolicy = 'safe' | 'never';

export interface AgentOperationIdentity {
  operationId: string;
  ownerType: 'user' | 'visitor';
  ownerKey: string;
  groupId: number;
  userLogId: number;
  assistantLogId: number;
  turnId: string;
  modelKeyId: number | null;
}

export interface AgentOperationFence {
  operationId: string;
  generation: number;
  leaseOwner: string;
}

export interface AgentModelEffectIntent {
  roundIndex: number;
  attemptIndex: number;
  messageCount: number;
  toolNames: string[];
  providerPayloadChars: number;
  requestShapeHash: string;
}

export interface AgentModelEffectCheckpoint {
  textTail?: string;
  textChars: number;
  reasoningChars: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  };
}

export interface AgentStoredToolIntent {
  roundIndex: number;
  ordinal: number;
  callId: string;
  toolName: string;
  replayPolicy: AgentToolReplayPolicy;
  replayPayload?: Record<string, unknown>;
  inputShape: Record<string, string>;
}

export interface AgentStoredToolOutcome {
  callId: string;
  toolName: string;
  displayName: string;
  status: 'success' | 'error';
  modelContent: string;
  inputSummary?: string;
  toolCost: number;
}

const TERMINAL_OPERATION_PHASES = new Set<AgentOperationPhase>([
  'completed',
  'failed',
  'interrupted',
]);
const TERMINAL_EFFECT_STATES = new Set<AgentEffectState>([
  'committed',
  'rejected',
  'interrupted',
  'unknown',
]);
const CALL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,191}$/;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,191}$/;
const CREDENTIAL_PATTERN =
  /(?:^|[^\p{L}\p{N}_])(?:api(?:[ _-])?key|auth(?:orization)?|bearer|(?:access|refresh)(?:[ _-])?token|token|(?:client(?:[ _-])?)?secret|secret(?:[ _-])?key|private(?:[ _-])?key|credential|password|passwd|pwd|base(?:[ _-])?url|密码|口令|凭证|密钥|访问令牌|刷新令牌|授权)(?![\p{L}\p{N}_])\s*[:=]/iu;
const TOKEN_SHAPE_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
];

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function boundedNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function containsCredentialShape(value: string): boolean {
  const normalized = value
    .normalize('NFKC')
    .replace(/[∶꞉ː]/gu, ':')
    .replace(/[^\p{L}\p{N}_:=]+/gu, ' ');
  return (
    CREDENTIAL_PATTERN.test(normalized) || TOKEN_SHAPE_PATTERNS.some(pattern => pattern.test(value))
  );
}

function redactAbsoluteHostPaths(value: string): string {
  const pathCuePattern =
    /(?:路径|目录|文件|位于|保存于|located\s*at|filepath|pathname|path)\s*[:：]?\s*$/iu;
  const commonRootPattern =
    /^(?:app|bin|boot|data|dev|etc|home|lib|lib64|media|mnt|opt|private|proc|root|run|sbin|srv|sys|tmp|usr|var|workspace|Users|Volumes)$/iu;
  const withoutWindowsPaths = value
    .replace(/[A-Za-z]:[\\/][^\s,;，。)）\]}"'”’]+/gu, '[path omitted]')
    .replace(/(?:\\\\|\/\/)[^\s,;，。)）\]}"'”’]+/gu, '[path omitted]');

  return withoutWindowsPaths.replace(/\/[^\s,;，。)）\]}"'”’]+/gu, (candidate, offset, source) => {
    const start = Number(offset);
    const previous = start > 0 ? source[start - 1] : '';
    const firstSegment = candidate.slice(1).split('/')[0];
    const hasNestedSegment = candidate.slice(1).includes('/');
    const hasExplicitBoundary = start === 0 || /[\s:=：([{<"'“‘,;，。]/u.test(previous);
    const followsPathCue = pathCuePattern.test(source.slice(Math.max(0, start - 24), start));
    const hasHostRoot = commonRootPattern.test(firstSegment) || /^[.\d]/u.test(firstSegment);
    const isAsciiEmbeddedRelative =
      /[A-Za-z0-9_.]/u.test(previous) && !hasHostRoot && !followsPathCue;

    if (
      isAsciiEmbeddedRelative ||
      (!hasExplicitBoundary && !hasNestedSegment && !followsPathCue && !hasHostRoot)
    ) {
      return candidate;
    }
    return '[path omitted]';
  });
}

/** Durable effect 内容只保留恢复所需的短文本；URL、宿主路径与凭证形态一律移除。 */
export function sanitizeOperationLedgerText(value: unknown, maxChars = 8_192): string {
  const raw = typeof value === 'string' ? value : String(value || '');
  if (!raw) return '';
  if (containsCredentialShape(raw)) return '[sensitive content omitted]';
  const sanitized = raw
    .replace(/data:[^\s)\]}]+/giu, '[data omitted]')
    .replace(/https?:\/\/[^\s)\]}]+/giu, '[URL omitted]')
    .replace(/\0/gu, '')
    .trim();
  const withoutHostPaths = redactAbsoluteHostPaths(sanitized);
  return withoutHostPaths.length <= maxChars
    ? withoutHostPaths
    : `${withoutHostPaths.slice(0, maxChars - 1)}…`;
}

export function isTerminalOperationPhase(phase: AgentOperationPhase): boolean {
  return TERMINAL_OPERATION_PHASES.has(phase);
}

export function isTerminalEffectState(state: AgentEffectState): boolean {
  return TERMINAL_EFFECT_STATES.has(state);
}

export function operationIdFromTurnId(turnId: string): string {
  if (!TURN_ID_PATTERN.test(turnId)) throw new Error('Invalid agent operation turn');
  const operationId = `op_${turnId}`;
  if (!OPERATION_ID_PATTERN.test(operationId)) throw new Error('Invalid agent operation ID');
  return operationId;
}

export function assertAgentOperationIdentity(
  value: AgentOperationIdentity,
): AgentOperationIdentity {
  if (!OPERATION_ID_PATTERN.test(String(value.operationId || ''))) {
    throw new Error('Invalid agent operation ID');
  }
  if (!TURN_ID_PATTERN.test(String(value.turnId || ''))) throw new Error('Invalid agent turn ID');
  if (value.ownerType !== 'user' && value.ownerType !== 'visitor') {
    throw new Error('Invalid agent operation owner');
  }
  const ownerKey = String(value.ownerKey || '').trim();
  if (!ownerKey || ownerKey.length > 128) throw new Error('Invalid agent operation owner');
  const modelKeyId =
    value.modelKeyId === null ? null : positiveSafeInteger(value.modelKeyId, 'model key');
  return {
    operationId: value.operationId,
    ownerType: value.ownerType,
    ownerKey,
    groupId: positiveSafeInteger(value.groupId, 'operation group'),
    userLogId: positiveSafeInteger(value.userLogId, 'operation user log'),
    assistantLogId: positiveSafeInteger(value.assistantLogId, 'operation assistant log'),
    turnId: value.turnId,
    modelKeyId,
  };
}

export function effectKeyForModel(roundIndex: number, attemptIndex: number): string {
  return `provider:r${nonNegativeSafeInteger(roundIndex, 'model round')}:a${nonNegativeSafeInteger(
    attemptIndex,
    'model attempt',
  )}`;
}

export function effectKeyForTool(roundIndex: number, ordinal: number): string {
  return `tool:r${nonNegativeSafeInteger(roundIndex, 'tool round')}:o${nonNegativeSafeInteger(
    ordinal,
    'tool ordinal',
  )}`;
}

export function fingerprintModelIntent(input: AgentModelEffectIntent): string {
  const requestShapeHash = String(input.requestShapeHash || '');
  if (!/^[a-f0-9]{64}$/u.test(requestShapeHash)) {
    throw new Error('Invalid model request shape hash');
  }
  const safe = {
    roundIndex: nonNegativeSafeInteger(input.roundIndex, 'model round'),
    attemptIndex: nonNegativeSafeInteger(input.attemptIndex, 'model attempt'),
    messageCount: nonNegativeSafeInteger(input.messageCount, 'model message count'),
    toolNames: input.toolNames
      .map(name => String(name || ''))
      .filter(name => TOOL_NAME_PATTERN.test(name))
      .slice(0, 128),
    providerPayloadChars: nonNegativeSafeInteger(
      input.providerPayloadChars,
      'model provider payload size',
    ),
    requestShapeHash,
  };
  return createHash('sha256').update(JSON.stringify(safe)).digest('hex');
}

export function normalizeToolIntent(input: AgentStoredToolIntent): {
  value: AgentStoredToolIntent;
  fingerprint: string;
  serializedPayload: string | null;
} {
  const roundIndex = nonNegativeSafeInteger(input.roundIndex, 'tool round');
  const ordinal = nonNegativeSafeInteger(input.ordinal, 'tool ordinal');
  const callId = String(input.callId || '');
  const toolName = String(input.toolName || '');
  if (!CALL_ID_PATTERN.test(callId)) throw new Error('Invalid durable tool call ID');
  if (!TOOL_NAME_PATTERN.test(toolName)) throw new Error('Invalid durable tool name');
  const replayPolicy: AgentToolReplayPolicy = input.replayPolicy === 'safe' ? 'safe' : 'never';
  const inputShape: Record<string, string> = {};
  for (const key of Object.keys(input.inputShape || {}).sort()) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) throw new Error('Invalid durable tool input shape');
    const kind = String(input.inputShape[key] || '');
    if (!['string', 'number', 'boolean', 'object', 'array', 'null'].includes(kind)) {
      throw new Error('Invalid durable tool input shape');
    }
    inputShape[key] = kind;
  }

  let replayPayload: Record<string, unknown> | undefined;
  let serializedPayload: string | null = null;
  if (replayPolicy === 'safe') {
    if (!isPlainObject(input.replayPayload)) throw new Error('Safe tool replay payload is missing');
    serializedPayload = JSON.stringify(input.replayPayload);
    if (serializedPayload.length > 4_096 || containsCredentialShape(serializedPayload)) {
      throw new Error('Safe tool replay payload is not durable-safe');
    }
    if (/https?:\/\/|data:|[A-Za-z]:[\\/]|(?:^|["'])\/[^"']*/iu.test(serializedPayload)) {
      throw new Error('Safe tool replay payload contains a forbidden location');
    }
    replayPayload = JSON.parse(serializedPayload);
  }
  const value: AgentStoredToolIntent = {
    roundIndex,
    ordinal,
    callId,
    toolName,
    replayPolicy,
    ...(replayPayload ? { replayPayload } : {}),
    inputShape,
  };
  const fingerprintBasis = {
    roundIndex,
    ordinal,
    callId,
    toolName,
    replayPolicy,
    inputShape,
    ...(replayPayload ? { replayPayload } : {}),
  };
  return {
    value,
    fingerprint: createHash('sha256').update(JSON.stringify(fingerprintBasis)).digest('hex'),
    serializedPayload,
  };
}

export function parseModelEffectCheckpoint(value: unknown): AgentModelEffectCheckpoint {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isPlainObject(parsed)) throw new Error('Invalid model effect checkpoint');
  const allowed = new Set(['textTail', 'textChars', 'reasoningChars', 'usage']);
  if (Object.keys(parsed).some(key => !allowed.has(key))) {
    throw new Error('Invalid model effect checkpoint');
  }
  const checkpoint: AgentModelEffectCheckpoint = {
    textChars: nonNegativeSafeInteger(parsed.textChars, 'model text count'),
    reasoningChars: nonNegativeSafeInteger(parsed.reasoningChars, 'model reasoning count'),
  };
  const textTail = sanitizeOperationLedgerText(parsed.textTail, 8_192);
  if (textTail) checkpoint.textTail = textTail;
  if (parsed.usage !== undefined) {
    if (!isPlainObject(parsed.usage)) throw new Error('Invalid model effect usage');
    checkpoint.usage = {
      inputTokens: nonNegativeSafeInteger(parsed.usage.inputTokens, 'model input tokens'),
      outputTokens: nonNegativeSafeInteger(parsed.usage.outputTokens, 'model output tokens'),
      totalTokens: nonNegativeSafeInteger(parsed.usage.totalTokens, 'model total tokens'),
      ...(parsed.usage.cacheHitTokens === undefined
        ? {}
        : {
            cacheHitTokens: nonNegativeSafeInteger(
              parsed.usage.cacheHitTokens,
              'model cache hit tokens',
            ),
          }),
      ...(parsed.usage.cacheMissTokens === undefined
        ? {}
        : {
            cacheMissTokens: nonNegativeSafeInteger(
              parsed.usage.cacheMissTokens,
              'model cache miss tokens',
            ),
          }),
    };
  }
  if (JSON.stringify(checkpoint).length > 12_000) throw new Error('Model checkpoint too large');
  return checkpoint;
}

export function parseStoredToolOutcome(value: unknown): AgentStoredToolOutcome {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isPlainObject(parsed)) throw new Error('Invalid durable tool outcome');
  const allowed = new Set([
    'callId',
    'toolName',
    'displayName',
    'status',
    'modelContent',
    'inputSummary',
    'toolCost',
  ]);
  if (Object.keys(parsed).some(key => !allowed.has(key))) {
    throw new Error('Invalid durable tool outcome');
  }
  const callId = String(parsed.callId || '');
  const toolName = String(parsed.toolName || '');
  if (!CALL_ID_PATTERN.test(callId) || !TOOL_NAME_PATTERN.test(toolName)) {
    throw new Error('Invalid durable tool outcome identity');
  }
  const displayName = sanitizeOperationLedgerText(parsed.displayName, 191) || toolName;
  const modelContent = sanitizeOperationLedgerText(parsed.modelContent, 12_000) || '工具执行完成';
  const inputSummary = sanitizeOperationLedgerText(parsed.inputSummary, 500);
  const toolCost = boundedNumber(parsed.toolCost);
  const outcome: AgentStoredToolOutcome = {
    callId,
    toolName,
    displayName,
    status: parsed.status === 'success' ? 'success' : 'error',
    modelContent,
    ...(inputSummary ? { inputSummary } : {}),
    toolCost,
  };
  if (JSON.stringify(outcome).length > 16_000) throw new Error('Durable tool outcome too large');
  return outcome;
}

export function buildToolInputShape(args: Record<string, unknown>): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const key of Object.keys(args).sort().slice(0, 64)) {
    const value = args[key];
    shape[key] = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  }
  return shape;
}
