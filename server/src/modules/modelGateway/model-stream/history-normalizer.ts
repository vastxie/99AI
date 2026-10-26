import { createHash } from 'node:crypto';
import { shouldKeepReasoningContentForModel } from '@/common/utils';
import type { ModelStreamMessage, ModelStreamRuntimeConfig } from './model-stream.types';

const MISSING_TOOL_RESULT = '历史工具调用的结果缺失或中断，不能视为成功。';
const ORPHAN_TOOL_RESULT = '历史工具结果缺少可验证的调用关联，已按未知状态忽略。';
const TOOL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

type InternalMessage = ModelStreamMessage & {
  __agent_context?: {
    chatLogId?: number;
    kind?: 'checkpoint';
    checkpoint?: boolean;
    required?: boolean;
    sourceModelIdentity?: string;
  };
};

export interface ModelHistoryNormalizerOptions {
  config: ModelStreamRuntimeConfig;
  supportedMediaTypes?: string[];
  /** 仅限已经按 source identity 处理过的内部 Agent 请求。 */
  reasoningAlreadySanitized?: boolean;
}

export function normalizeModelHistory(
  messages: readonly ModelStreamMessage[],
  options: ModelHistoryNormalizerOptions,
): ModelStreamMessage[] {
  const output: InternalMessage[] = [];
  const usedToolCallIds = new Set<string>();
  const targetIdentity = `${String(options.config.protocol || '').trim()}:${String(
    options.config.model || '',
  ).trim()}`;

  for (let index = 0; index < messages.length; index += 1) {
    const raw = messages[index] as InternalMessage;
    if (!isModelRole(raw?.role)) continue;

    if (raw.role === 'tool') {
      output.push({ role: 'user', content: ORPHAN_TOOL_RESULT });
      continue;
    }

    const normalized = normalizeNonToolMessage(raw, index, options, targetIdentity);
    const calls =
      raw.role === 'assistant' ? normalizeToolCalls(raw.tool_calls, index, usedToolCallIds) : [];
    if (raw.role !== 'assistant' || calls.length === 0) {
      output.push(normalized);
      continue;
    }

    normalized.tool_calls = calls.map(call => call.value);
    applyReasoningPolicy(normalized, raw, options, targetIdentity, true);
    applyProviderStatePolicy(normalized, raw, options, targetIdentity);
    output.push(normalized);

    const results: InternalMessage[] = [];
    let cursor = index + 1;
    while (cursor < messages.length && messages[cursor]?.role === 'tool') {
      results.push(messages[cursor] as InternalMessage);
      cursor += 1;
    }
    const consumed = new Set<number>();
    for (const call of calls) {
      const resultIndex = results.findIndex(
        (result, candidateIndex) =>
          !consumed.has(candidateIndex) && String(result.tool_call_id || '') === call.originalId,
      );
      if (resultIndex >= 0) consumed.add(resultIndex);
      const result = resultIndex >= 0 ? results[resultIndex] : undefined;
      output.push({
        role: 'tool',
        tool_call_id: call.value.id,
        content: result ? normalizeContent(result.content, options) : MISSING_TOOL_RESULT,
        ...copyInternalContext(result || raw),
      });
    }
    const orphanCount = results.length - consumed.size;
    if (orphanCount > 0) {
      output.push({ role: 'user', content: `${ORPHAN_TOOL_RESULT}（${orphanCount} 条）` });
    }
    index = cursor - 1;
  }

  return output;
}

function normalizeNonToolMessage(
  raw: InternalMessage,
  index: number,
  options: ModelHistoryNormalizerOptions,
  targetIdentity: string,
): InternalMessage {
  const normalized: InternalMessage = {
    role: raw.role,
    content: normalizeContent(raw.content, options),
    ...copyInternalContext(raw),
  };
  if (typeof raw.name === 'string' && raw.name.trim()) {
    normalized.name = normalizeIdentifier(raw.name, 'message', index, new Set());
  }
  applyReasoningPolicy(normalized, raw, options, targetIdentity, false);
  return normalized;
}

/**
 * 厂商私有回放状态（不透明）与历史推理同一口径：只有带工具调用的助手消息，且来源身份（协议:模型）与本次请求一致、
 * 或内部 Agent 路径已按来源身份清理过时保留；其余一律去掉。是否真的回放由协议包按状态内容决定
 */
function applyProviderStatePolicy(
  normalized: InternalMessage,
  raw: InternalMessage,
  options: ModelHistoryNormalizerOptions,
  targetIdentity: string,
): void {
  if (raw.provider_state === undefined) return;
  const sourceIdentity = raw.__agent_context?.sourceModelIdentity;
  if (
    options.reasoningAlreadySanitized === true ||
    (typeof sourceIdentity === 'string' && sourceIdentity === targetIdentity)
  ) {
    normalized.provider_state = raw.provider_state;
  }
}

function applyReasoningPolicy(
  normalized: InternalMessage,
  raw: InternalMessage,
  options: ModelHistoryNormalizerOptions,
  targetIdentity: string,
  hasToolCalls: boolean,
): void {
  if (raw.role !== 'assistant') return;
  const targetNeedsReasoning = shouldKeepReasoningContentForModel(
    options.config.model,
    options.config.additionalParams,
  );
  if (!targetNeedsReasoning || !hasToolCalls) return;

  const sourceIdentity = raw.__agent_context?.sourceModelIdentity;
  const mayPreserve =
    options.reasoningAlreadySanitized === true ||
    (typeof sourceIdentity === 'string' && sourceIdentity === targetIdentity);
  normalized.reasoning_content =
    mayPreserve && typeof raw.reasoning_content === 'string' ? raw.reasoning_content : '';
}

function normalizeToolCalls(
  value: unknown,
  messageIndex: number,
  usedIds: Set<string>,
): Array<{
  originalId: string;
  value: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  };
}> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(call => call && typeof call === 'object' && !Array.isArray(call))
    .slice(0, 128)
    .map((call: any, callIndex) => {
      const originalId = String(call.id || '');
      const rawName = String(call.function?.name || call.name || 'tool');
      return {
        originalId,
        value: {
          id: normalizeIdentifier(originalId, `call_${messageIndex}`, callIndex, usedIds),
          type: 'function' as const,
          function: {
            name: normalizeToolName(rawName),
            arguments: normalizeToolArguments(call.function?.arguments),
          },
        },
      };
    });
}

function normalizeToolName(value: unknown): string {
  const raw = String(value || '').trim();
  if (TOOL_IDENTIFIER_PATTERN.test(raw)) return raw;
  const stem = raw
    .replace(/[^A-Za-z0-9_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 32);
  const digest = createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 12);
  return ['tool', stem, digest].filter(Boolean).join('_').slice(0, 64);
}

function normalizeToolArguments(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? {});
  try {
    const parsed = JSON.parse(serialized || '{}');
    return JSON.stringify(parsed && typeof parsed === 'object' ? parsed : {});
  } catch {
    return '{}';
  }
}

function normalizeIdentifier(
  value: unknown,
  prefix: string,
  index: number,
  used: Set<string>,
): string {
  const raw = String(value || '').trim();
  if (TOOL_IDENTIFIER_PATTERN.test(raw) && !used.has(raw)) {
    used.add(raw);
    return raw;
  }
  const safePrefix = String(prefix || 'item')
    .replace(/[^A-Za-z0-9_-]+/gu, '_')
    .slice(0, 24);
  const stem = raw
    .replace(/[^A-Za-z0-9_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 20);
  const digest = createHash('sha256')
    .update(`${raw}\u0000${index}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
  let candidate = [safePrefix || 'item', stem, digest].filter(Boolean).join('_').slice(0, 64);
  let collision = 0;
  while (used.has(candidate)) {
    collision += 1;
    candidate = `${candidate.slice(0, 58)}_${collision}`.slice(0, 64);
  }
  used.add(candidate);
  return candidate;
}

function normalizeContent(
  content: ModelStreamMessage['content'],
  options: ModelHistoryNormalizerOptions,
): ModelStreamMessage['content'] {
  if (typeof content === 'string' || content === null || content === undefined) return content;
  if (!Array.isArray(content)) return String(content);
  const normalized = content.flatMap(part => normalizeContentPart(part, options));
  return normalized.length ? normalized : '';
}

function normalizeContentPart(part: any, options: ModelHistoryNormalizerOptions): unknown[] {
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return [{ type: 'text', text: String(part ?? '') }];
  }
  if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
    return [{ type: 'text', text: String(part.text || '') }];
  }

  const kind = mediaKind(part.type);
  if (!kind) {
    if (typeof part.text === 'string') return [{ type: 'text', text: part.text }];
    return [{ type: 'text', text: '[历史内容包含当前模型无法安全复用的部分。]' }];
  }
  if (!supportsMedia(kind, options)) {
    return [{ type: 'text', text: `[历史${mediaLabel(kind)}未提供给当前模型。]` }];
  }

  if (
    part.type === 'image_file' ||
    part.type === 'document_file' ||
    part.type === 'audio_file' ||
    part.type === 'video_file'
  ) {
    const file = part.file && typeof part.file === 'object' ? part.file : part;
    return [
      {
        type: part.type,
        file: {
          fileRef: String(file.fileRef || ''),
          ...(typeof file.name === 'string' ? { name: file.name } : {}),
          ...(typeof file.mime === 'string' ? { mime: file.mime } : {}),
        },
      },
    ];
  }
  if (part.type === 'image_url') {
    return [
      {
        type: 'image_url',
        image_url: {
          url: String(part.image_url?.url || ''),
          ...(typeof part.image_url?.detail === 'string' ? { detail: part.image_url.detail } : {}),
        },
      },
    ];
  }
  if (part.type === 'input_audio') {
    return [
      {
        type: 'input_audio',
        input_audio: {
          data: String(part.input_audio?.data || ''),
          ...(typeof part.input_audio?.format === 'string'
            ? { format: part.input_audio.format }
            : {}),
          ...(typeof part.input_audio?.mime === 'string' ? { mime: part.input_audio.mime } : {}),
        },
      },
    ];
  }
  if (part.type === 'video_url') {
    return [{ type: 'video_url', video_url: { url: String(part.video_url?.url || '') } }];
  }
  if (part.type === 'document') {
    const document = part.document && typeof part.document === 'object' ? part.document : part;
    return [
      {
        type: 'document',
        document: {
          ...(typeof document.data === 'string' ? { data: document.data } : {}),
          ...(typeof document.dataUrl === 'string' ? { dataUrl: document.dataUrl } : {}),
          ...(typeof document.mime === 'string' ? { mime: document.mime } : {}),
          ...(typeof document.name === 'string' ? { name: document.name } : {}),
        },
      },
    ];
  }
  return [{ type: 'text', text: `[历史${mediaLabel(kind)}未提供给当前模型。]` }];
}

function supportsMedia(
  kind: 'image' | 'document' | 'audio' | 'video',
  options: ModelHistoryNormalizerOptions,
): boolean {
  const capabilities =
    options.config.capabilities && typeof options.config.capabilities === 'object'
      ? (options.config.capabilities as Record<string, unknown>)
      : {};
  const descriptorTypes = new Set(options.supportedMediaTypes || []);
  const descriptorAllows =
    options.supportedMediaTypes === undefined ||
    (kind === 'image'
      ? descriptorTypes.has('image_url')
      : kind === 'document'
        ? descriptorTypes.has('document')
        : kind === 'audio'
          ? descriptorTypes.has('audio_url')
          : descriptorTypes.has('video_url'));
  const flag =
    kind === 'image'
      ? capabilities.vision
      : kind === 'document'
        ? capabilities.documentInput
        : kind === 'audio'
          ? capabilities.audioInput
          : capabilities.videoInput;
  return descriptorAllows && flag !== false;
}

function mediaKind(value: unknown): 'image' | 'document' | 'audio' | 'video' | null {
  if (value === 'image_file' || value === 'image_url' || value === 'image') return 'image';
  if (value === 'document_file' || value === 'document' || value === 'input_file')
    return 'document';
  if (value === 'audio_file' || value === 'input_audio' || value === 'audio_url') return 'audio';
  if (value === 'video_file' || value === 'video_url') return 'video';
  return null;
}

function mediaLabel(kind: 'image' | 'document' | 'audio' | 'video'): string {
  return kind === 'image'
    ? '图片'
    : kind === 'document'
      ? '文档'
      : kind === 'audio'
        ? '音频'
        : '视频';
}

function copyInternalContext(message: InternalMessage): Pick<InternalMessage, '__agent_context'> {
  const context = message.__agent_context;
  if (!context || typeof context !== 'object') return {};
  return {
    __agent_context: {
      ...(Number.isInteger(context.chatLogId) ? { chatLogId: context.chatLogId } : {}),
      ...(context.kind === 'checkpoint' ? { kind: 'checkpoint' as const } : {}),
      ...(context.checkpoint === true ? { checkpoint: true } : {}),
      ...(context.required === true ? { required: true } : {}),
      ...(typeof context.sourceModelIdentity === 'string'
        ? { sourceModelIdentity: context.sourceModelIdentity.slice(0, 384) }
        : {}),
    },
  };
}

function isModelRole(value: unknown): value is ModelStreamMessage['role'] {
  return value === 'system' || value === 'user' || value === 'assistant' || value === 'tool';
}
