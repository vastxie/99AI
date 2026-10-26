import { Logger } from '@nestjs/common';
import type { ModelGatewayMessage } from '@/modules/modelGateway/model-gateway.types';

/**
 * Gemini 思考签名的回放状态（只在本次运行的内存里）：
 * - 按出现顺序记录本次回复的正文 part（原文，签名或「无」）与函数调用 part（第几个、名字、参数、签名或「无」）；
 *   流式时相邻的无签名正文片段合并，带签名的 part 单独保留（不与无签名的合并）。思考摘要 part 不记录、不回放。
 * - 回放：正文拼接与消息正文一致、函数调用按顺序名字与参数一致时，按记录重建 part 并放回签名；
 *   否则按普通方式映射，只给记录里原本带签名的函数调用补文档给出的占位值（gemini-3 系列），
 *   原本就没有签名的调用（正常的并行调用）不补。Gemini 没有前缀绑定，不需要摘要与谱系。
 */
export const GEMINI_PROVIDER_STATE_PROTOCOL = 'gemini_generate_content';
/** Gemini 文档给出的跳过签名校验的占位值：只用于确知丢失签名、又无法回放的调用，不能恢复推理 */
export const GEMINI_SKIP_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';
const STATE_VERSION = 1;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

export type GeminiCapturedPart =
  | { kind: 'text'; text: string; signature?: string }
  | { kind: 'call'; index: number; name: string; args: string; signature?: string };

export interface GeminiProviderState {
  v: typeof STATE_VERSION;
  protocol: typeof GEMINI_PROVIDER_STATE_PROTOCOL;
  model: string;
  replayable: boolean;
  parts?: GeminiCapturedPart[];
  /** 原本带签名的函数调用（按出现顺序的序号）：状态不能回放时只给它们补占位 */
  signedCalls: number[];
}

export function isGeminiProviderState(value: unknown, model: string): value is GeminiProviderState {
  const state = value as GeminiProviderState;
  return (
    Boolean(state) &&
    typeof state === 'object' &&
    state.v === STATE_VERSION &&
    state.protocol === GEMINI_PROVIDER_STATE_PROTOCOL &&
    state.model === model &&
    typeof state.replayable === 'boolean' &&
    Array.isArray(state.signedCalls)
  );
}

/** 只有 gemini-3 系列会校验函数调用签名，占位值只对它们补 */
export function isSignatureValidatingGeminiModel(model: string): boolean {
  return /^gemini-3/.test(
    String(model || '')
      .trim()
      .toLowerCase()
      .replace(/^models\//, ''),
  );
}

export class GeminiProviderStateCollector {
  private readonly parts: GeminiCapturedPart[] = [];
  private calls = 0;
  private supported = true;
  private signed = false;

  constructor(private readonly model: string) {}

  onPart(part: any): void {
    const signature =
      typeof part?.thoughtSignature === 'string' && part.thoughtSignature
        ? part.thoughtSignature
        : undefined;
    if (signature) this.signed = true;
    if (part?.functionCall?.name) {
      this.parts.push({
        kind: 'call',
        index: this.calls,
        name: String(part.functionCall.name),
        args: JSON.stringify(part.functionCall.args || {}),
        ...(signature ? { signature } : {}),
      });
      this.calls += 1;
      return;
    }
    if (part?.thought === true) return; // 思考摘要不记录、不回放
    if (typeof part?.text === 'string') {
      const previous = this.parts.at(-1);
      if (!signature && previous?.kind === 'text' && !previous.signature) {
        previous.text += part.text;
      } else {
        this.parts.push({ kind: 'text', text: part.text, ...(signature ? { signature } : {}) });
      }
      return;
    }
    this.supported = false; // 其他 part（媒体、代码执行等）不能按记录重建
  }

  /** 没有任何签名时不需要状态 */
  finish(): GeminiProviderState | undefined {
    if (!this.signed) return undefined;
    const signedCalls = this.parts
      .filter(
        (part): part is Extract<GeminiCapturedPart, { kind: 'call' }> =>
          part.kind === 'call' && Boolean(part.signature),
      )
      .map(part => part.index);
    const base = {
      v: STATE_VERSION,
      protocol: GEMINI_PROVIDER_STATE_PROTOCOL,
      model: this.model,
      signedCalls,
    } as const;
    if (!this.supported || Buffer.byteLength(JSON.stringify(this.parts)) > MAX_PAYLOAD_BYTES) {
      // 只留「哪些调用带签名」的存根：之后不回放，只按需给这些调用补占位
      Logger.warn(
        '本次回复的思考签名无法完整记录，之后的请求不回放它',
        'GeminiGenerateContentAdapter',
      );
      return { ...base, replayable: false };
    }
    return { ...base, replayable: true, parts: this.parts.map(part => ({ ...part })) };
  }
}

function messageText(message: ModelGatewayMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => String(part.text || ''))
    .join('');
}

function normalizedArgs(value: unknown): string | undefined {
  try {
    return JSON.stringify(JSON.parse(String(value ?? '{}')));
  } catch {
    return undefined;
  }
}

/** 按记录重建助手消息的 part；与消息本身对不上时返回 undefined */
export function rebuildGeminiParts(
  state: GeminiProviderState,
  message: ModelGatewayMessage,
): any[] | undefined {
  if (!state.replayable || !Array.isArray(state.parts)) return undefined;
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const textParts = state.parts.filter(part => part.kind === 'text') as Array<
    Extract<GeminiCapturedPart, { kind: 'text' }>
  >;
  if (textParts.map(part => part.text).join('') !== messageText(message)) return undefined;
  const callParts = state.parts.filter(part => part.kind === 'call') as Array<
    Extract<GeminiCapturedPart, { kind: 'call' }>
  >;
  if (callParts.length !== calls.length) return undefined;
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index] as any;
    if (
      call?.function?.name !== callParts[index].name ||
      normalizedArgs(call?.function?.arguments) !== normalizedArgs(callParts[index].args)
    ) {
      return undefined;
    }
  }
  return state.parts.map(part =>
    part.kind === 'text'
      ? { text: part.text, ...(part.signature ? { thoughtSignature: part.signature } : {}) }
      : {
          functionCall: { name: part.name, args: JSON.parse(part.args) },
          ...(part.signature ? { thoughtSignature: part.signature } : {}),
        },
  );
}
