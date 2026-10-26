import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { ChatProcessDto } from './dto/chatProcess.dto';

export const SUBMISSION_FINGERPRINT_VERSION = 1;

export type ChatSubmissionOperation = 'chat' | 'retry' | 'continue';

export interface ChatSubmissionFingerprint {
  version: typeof SUBMISSION_FINGERPRINT_VERSION;
  digest: string;
}

interface FingerprintInput {
  operation: ChatSubmissionOperation;
  body: ChatProcessDto;
  conversationGid?: string;
  strategy?: string;
}

type CanonicalAttachmentIdentity =
  | {
      kind: 'file';
      fileRef: string;
    }
  | {
      kind: 'url';
      urlDigests: Record<string, string>;
    };

interface CanonicalAttachment {
  identity: CanonicalAttachmentIdentity;
  type: string | null;
  role: string | null;
  name: string | null;
  mime: string | null;
  size: number | null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeText(value: unknown, lowercase = false): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  return lowercase ? normalized.toLowerCase() : normalized;
}

function parseAttachmentArray(value: unknown): unknown[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function canonicalAttachment(item: unknown): CanonicalAttachment | null {
  if (typeof item === 'string') {
    const url = item.trim();
    if (!url) return null;
    return {
      identity: {
        kind: 'url',
        urlDigests: { url: sha256(url) },
      },
      type: null,
      role: null,
      name: null,
      mime: null,
      size: null,
    };
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const value = item as Record<string, any>;
  const fileRef = firstText(
    value.fileRef,
    value.fileId,
    value.id,
    value.file?.fileId,
    value.asset?.fileId,
  );
  const urlDigests = ['url', 'previewUrl', 'downloadUrl', 'publicUrl'].reduce<
    Record<string, string>
  >((result, key) => {
    const url = normalizeText(value[key]);
    if (url) result[key] = sha256(url);
    return result;
  }, {});
  if (!fileRef && Object.keys(urlDigests).length === 0) return null;

  const sizeCandidate = Number(value.size ?? value.sizeBytes);
  const size = Number.isFinite(sizeCandidate) && sizeCandidate >= 0 ? sizeCandidate : null;
  return {
    identity: fileRef
      ? { kind: 'file', fileRef }
      : {
          kind: 'url',
          urlDigests,
        },
    type: normalizeText(value.type ?? value.fileType, true),
    role: normalizeText(value.role, true),
    name: firstText(value.name, value.fileName, value.filename, value.title),
    mime: normalizeText(value.mime ?? value.mimeType ?? value.contentType, true),
    size,
  };
}

function canonicalAttachmentArray(value: unknown): CanonicalAttachment[] {
  return parseAttachmentArray(value)
    .map(canonicalAttachment)
    .filter((item): item is CanonicalAttachment => Boolean(item));
}

function canonicalAttachments(body: ChatProcessDto): Record<string, CanonicalAttachment[]> {
  // 三个入口在当前执行链中按字段依次拼接；保留字段、数组顺序和重复次数，
  // 防止“单份附件”和“重复附件”被错误判为同一提交。
  return {
    url: canonicalAttachmentArray(body.url),
    files: canonicalAttachmentArray(body.files),
    attachments: canonicalAttachmentArray(body.attachments),
  };
}

@Injectable()
export class ChatSubmissionService {
  createFingerprint(input: FingerprintInput): ChatSubmissionFingerprint {
    const body = input.body;
    const envelope = stableValue({
      operation: input.operation,
      conversationGid: input.conversationGid || null,
      prompt: body.prompt,
      message: parseJson(body.message),
      model: {
        id: body.modelId ?? null,
        key: body.model ?? null,
        optionKey: body.options?.model ?? null,
      },
      reasoningEffort: body.reasoningEffort ?? null,
      parentTurnId: body.parentTurnId ?? null,
      strategy: input.strategy ?? null,
      channelMessageId: body.channelMessageId ?? null,
      attachments: canonicalAttachments(body),
      // 只在替换旧回合时出现：普通提交的指纹保持不变
      ...(body.replaceFromCid ? { replaceFromCid: body.replaceFromCid } : {}),
      ...(body.replaceFromCid &&
      typeof body.replaceLaterTurns === 'number' &&
      Number.isInteger(body.replaceLaterTurns)
        ? { replaceLaterTurns: body.replaceLaterTurns }
        : {}),
    });
    return {
      version: SUBMISSION_FINGERPRINT_VERSION,
      digest: createHash('sha256').update(JSON.stringify(envelope), 'utf8').digest('hex'),
    };
  }
}
