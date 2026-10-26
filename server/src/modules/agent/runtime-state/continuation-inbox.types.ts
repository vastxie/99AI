import { createHash } from 'node:crypto';
import { OPERATION_ID_PATTERN, TURN_ID_PATTERN } from '@/common/constants/id-pattern.constant';
import { CHAT_GROUP_GID_PATTERN as CONVERSATION_GID_PATTERN } from '@/common/utils/createChatGroupGid';

export type AgentContinuationKind = 'follow_up';
export type AgentContinuationStatus = 'pending' | 'claimed' | 'consumed' | 'discarded' | 'expired';

export interface AgentContinuationPayload {
  prompt: string;
  submissionId: string;
  parentTurnId: string;
  gid: string;
  modelId?: number;
  model?: string;
  modelName?: string;
  reasoningEffort?: string;
}

export interface AgentContinuationParentBinding {
  operationId: string;
  parentAssistantLogId: number;
  parentTurnId: string;
  ownerType: 'user' | 'visitor';
  ownerKey: string;
  groupId: number;
  conversationGid: string;
  generation: number;
}

export interface AgentContinuationClaim extends AgentContinuationParentBinding {
  inboxId: number;
  kind: AgentContinuationKind;
  sequence: number;
  claimToken: string;
  payloadFingerprint: string;
  payload: AgentContinuationPayload;
}

const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,95}$/;
const ALLOWED_PAYLOAD_KEYS = new Set([
  'prompt',
  'submissionId',
  'parentTurnId',
  'gid',
  'modelId',
  'model',
  'modelName',
  'reasoningEffort',
]);
// follow_up 只经 Socket.IO 入队；保持和默认单帧上限同量级，避免恢复扫描
// 因少量异常大 prompt 放大数据库与进程内存占用。
const MAX_CONTINUATION_PAYLOAD_BYTES = 1024 * 1024;

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

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Invalid Agent continuation text field');
  const normalized = value.trim();
  return normalized || undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertAgentContinuationParentBinding(
  value: AgentContinuationParentBinding,
): AgentContinuationParentBinding {
  if (!OPERATION_ID_PATTERN.test(String(value.operationId || ''))) {
    throw new Error('Invalid Agent continuation operation');
  }
  if (!TURN_ID_PATTERN.test(String(value.parentTurnId || ''))) {
    throw new Error('Invalid Agent continuation parent turn');
  }
  if (value.ownerType !== 'user' && value.ownerType !== 'visitor') {
    throw new Error('Invalid Agent continuation owner');
  }
  const ownerKey = String(value.ownerKey || '').trim();
  if (!ownerKey || ownerKey.length > 128) throw new Error('Invalid Agent continuation owner');
  if (!CONVERSATION_GID_PATTERN.test(String(value.conversationGid || ''))) {
    throw new Error('Invalid Agent continuation conversation');
  }
  return {
    operationId: value.operationId,
    parentAssistantLogId: positiveSafeInteger(
      value.parentAssistantLogId,
      'Agent continuation assistant log',
    ),
    parentTurnId: value.parentTurnId,
    ownerType: value.ownerType,
    ownerKey,
    groupId: positiveSafeInteger(value.groupId, 'Agent continuation group'),
    conversationGid: value.conversationGid,
    generation: nonNegativeSafeInteger(value.generation, 'Agent continuation generation'),
  };
}

export function normalizeAgentContinuationPayload(input: unknown): AgentContinuationPayload {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isPlainObject(value)) throw new Error('Invalid Agent continuation payload');
  if (Object.keys(value).some(key => !ALLOWED_PAYLOAD_KEYS.has(key))) {
    throw new Error('Invalid Agent continuation payload field');
  }
  if (typeof value.prompt !== 'string' || !value.prompt.trim()) {
    throw new Error('Invalid Agent continuation prompt');
  }
  if (!SUBMISSION_ID_PATTERN.test(String(value.submissionId || ''))) {
    throw new Error('Invalid Agent continuation submission');
  }
  if (!TURN_ID_PATTERN.test(String(value.parentTurnId || ''))) {
    throw new Error('Invalid Agent continuation parent turn');
  }
  if (!CONVERSATION_GID_PATTERN.test(String(value.gid || ''))) {
    throw new Error('Invalid Agent continuation conversation');
  }
  const modelId =
    value.modelId === undefined || value.modelId === null
      ? undefined
      : positiveSafeInteger(value.modelId, 'Agent continuation model');
  const normalized: AgentContinuationPayload = {
    prompt: value.prompt.trim(),
    submissionId: String(value.submissionId),
    parentTurnId: String(value.parentTurnId),
    gid: String(value.gid),
    ...(modelId === undefined ? {} : { modelId }),
    ...(optionalText(value.model) ? { model: optionalText(value.model) } : {}),
    ...(optionalText(value.modelName) ? { modelName: optionalText(value.modelName) } : {}),
    ...(optionalText(value.reasoningEffort)
      ? { reasoningEffort: optionalText(value.reasoningEffort) }
      : {}),
  };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_CONTINUATION_PAYLOAD_BYTES) {
    throw new Error('Agent continuation payload is too large');
  }
  return normalized;
}

export function serializeAgentContinuationPayload(input: unknown): {
  value: AgentContinuationPayload;
  serialized: string;
  fingerprint: string;
} {
  const value = normalizeAgentContinuationPayload(input);
  const serialized = JSON.stringify(value);
  return {
    value,
    serialized,
    fingerprint: createHash('sha256').update(serialized, 'utf8').digest('hex'),
  };
}

export function assertAgentContinuationClaim(
  input: AgentContinuationClaim,
): AgentContinuationClaim {
  const binding = assertAgentContinuationParentBinding(input);
  const claimToken = String(input.claimToken || '').trim();
  const payloadFingerprint = String(input.payloadFingerprint || '').trim();
  if (!/^[a-f0-9]{64}$/.test(claimToken)) throw new Error('Invalid Agent continuation claim');
  if (!/^[a-f0-9]{64}$/.test(payloadFingerprint)) {
    throw new Error('Invalid Agent continuation fingerprint');
  }
  if (input.kind !== 'follow_up') throw new Error('Invalid Agent continuation kind');
  return {
    ...binding,
    inboxId: positiveSafeInteger(input.inboxId, 'Agent continuation inbox'),
    kind: input.kind,
    sequence: positiveSafeInteger(input.sequence, 'Agent continuation sequence'),
    claimToken,
    payloadFingerprint,
    payload: normalizeAgentContinuationPayload(input.payload),
  };
}
