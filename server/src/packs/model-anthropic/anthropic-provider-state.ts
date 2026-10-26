import { createHash, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ModelGatewayMessage } from '@/modules/modelGateway/model-gateway.types';

/**
 * Anthropic 思考块的回放状态（只在本次运行的内存里）：
 * - 每次回复都产生一份记录：`id`、`digest`（产生它的那次请求里「这条助手消息之前」的前缀摘要）、
 *   `lineage`（那次请求实际回放了哪些记录）、`replayable`；可回放时另带按原顺序记录的全部内容块。
 * - 回放：被任何更晚记录的谱系排除过的记录永久作废；从最新的未作废记录往前找锚点（最多 3 份），
 *   按「锚点谱系 + 锚点」渲染后前缀摘要一致、块能无损重建才回放，其余一律不回放。
 * - 前缀摘要是哈希链：system、tools、之后每条线上消息的规范 JSON 依次进链；消息哈希按「回放 / 不回放」
 *   两种形态各算一次，候选之间只重算链。
 */
export const ANTHROPIC_PROVIDER_STATE_PROTOCOL = 'anthropic_messages';
const STATE_VERSION = 1;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_ANCHOR_CANDIDATES = 3;
const PREFIX_DOMAIN = 'anthropic-prefix-v1';

export type AnthropicCapturedBlock =
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: string };

export interface AnthropicProviderState {
  v: typeof STATE_VERSION;
  protocol: typeof ANTHROPIC_PROVIDER_STATE_PROTOCOL;
  model: string;
  id: string;
  digest: string;
  lineage: string[];
  replayable: boolean;
  blocks?: AnthropicCapturedBlock[];
}

export interface AnthropicWireMessage {
  role: 'user' | 'assistant';
  content: any[];
}

export interface AnthropicReplayPlan {
  messages: AnthropicWireMessage[];
  /** 本次实际回放的记录 id（下一份记录的谱系） */
  replayedIds: string[];
  /** 回放的内容里有没有思考块：只有带了思考块的请求被拒才交给运行时去掉状态重发 */
  carriesThinking: boolean;
  /** 全部线上消息之后的前缀摘要（下一份记录的 digest） */
  digestAfter: string;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const isThinkingBlock = (block: any) =>
  block?.type === 'thinking' || block?.type === 'redacted_thinking';

export function isAnthropicProviderState(
  value: unknown,
  model: string,
): value is AnthropicProviderState {
  const state = value as AnthropicProviderState;
  return (
    Boolean(state) &&
    typeof state === 'object' &&
    state.v === STATE_VERSION &&
    state.protocol === ANTHROPIC_PROVIDER_STATE_PROTOCOL &&
    state.model === model &&
    typeof state.id === 'string' &&
    typeof state.digest === 'string' &&
    Array.isArray(state.lineage) &&
    state.lineage.every(id => typeof id === 'string') &&
    typeof state.replayable === 'boolean'
  );
}

// ---------- 原始 JSON 的无损检查（§21.3 / §21.4） ----------

type JsonToken = string;

/** 十进制数字规范成「符号 数字串 e 指数」；零保留符号；指数用 BigInt 精确运算 */
function canonicalNumber(token: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) throw new Error('invalid number');
  const [, sign, intPart, fracPart = '', expPart = '0'] = match;
  let digits = (intPart + fracPart).replace(/^0+/, '');
  let exponent = BigInt(expPart) - BigInt(fracPart.length);
  if (!digits) return `${sign}0`;
  const trailing = digits.length - digits.replace(/0+$/, '').length;
  digits = digits.slice(0, digits.length - trailing);
  exponent += BigInt(trailing);
  return `${sign}${digits}e${exponent}`;
}

/** 完整词法化：字符串按解码后的文本、数字按十进制值、标点与字面量逐个记录，忽略空白 */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
    } else if ('{}[]:,'.includes(char)) {
      tokens.push(char);
      index += 1;
    } else if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      if (end >= text.length) throw new Error('unterminated string');
      tokens.push(`s:${JSON.parse(text.slice(index, end + 1))}`);
      index = end + 1;
    } else {
      const match = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index));
      if (!match) throw new Error('unexpected token');
      const literal = match[0];
      tokens.push(/^[-\d]/.test(literal) ? `n:${canonicalNumber(literal)}` : literal);
      index += literal.length;
    }
  }
  return tokens;
}

/**
 * 原始工具输入能否被无损重建：原文与 `JSON.stringify(JSON.parse(原文))` 的完整词法序列逐个相同。
 * 同时拦下重复键（解析丢掉一个）、数字精度 / 上下溢 / 负零、整数形式键被提前造成的键序变化
 */
export function isLosslessJson(raw: string): boolean {
  try {
    const left = tokenizeJson(raw);
    const right = tokenizeJson(JSON.stringify(JSON.parse(raw)));
    return left.length === right.length && left.every((token, index) => token === right[index]);
  } catch {
    return false;
  }
}

// ---------- 捕获 ----------

type OpenBlock =
  | { type: 'thinking'; thinking: string; signature: string; done: boolean }
  | { type: 'redacted_thinking'; data: string; done: boolean }
  | { type: 'text'; text: string; done: boolean }
  | { type: 'tool_use'; id: string; name: string; input: string; hasDelta: boolean; done: boolean }
  | { type: 'unsupported'; done: boolean };

/** 从流事件收集本次回复的内容块；在 message_stop 时产出记录 */
export class AnthropicProviderStateCollector {
  private readonly blocks = new Map<number, OpenBlock>();

  constructor(private readonly context: { model: string; digest: string; lineage: string[] }) {}

  onEvent(event: any): void {
    const index = Number(event?.index ?? 0);
    if (event?.type === 'content_block_start') {
      const block = event.content_block || {};
      if (block.type === 'thinking') {
        this.blocks.set(index, {
          type: 'thinking',
          thinking: String(block.thinking || ''),
          signature: String(block.signature || ''),
          done: false,
        });
      } else if (block.type === 'redacted_thinking') {
        this.blocks.set(index, {
          type: 'redacted_thinking',
          data: String(block.data || ''),
          done: false,
        });
      } else if (block.type === 'text') {
        this.blocks.set(index, { type: 'text', text: String(block.text || ''), done: false });
      } else if (block.type === 'tool_use') {
        this.blocks.set(index, {
          type: 'tool_use',
          id: String(block.id || ''),
          name: String(block.name || ''),
          input: JSON.stringify(block.input ?? {}),
          hasDelta: false,
          done: false,
        });
      } else {
        this.blocks.set(index, { type: 'unsupported', done: false });
      }
      return;
    }
    const open = this.blocks.get(index);
    if (!open) return;
    if (event?.type === 'content_block_delta') {
      const delta = event.delta || {};
      if (open.type === 'thinking' && delta.type === 'thinking_delta')
        open.thinking += String(delta.thinking || '');
      else if (open.type === 'thinking' && delta.type === 'signature_delta')
        open.signature += String(delta.signature || '');
      else if (open.type === 'text' && delta.type === 'text_delta')
        open.text += String(delta.text || '');
      else if (open.type === 'tool_use' && delta.type === 'input_json_delta') {
        if (!open.hasDelta) open.input = '';
        open.hasDelta = true;
        open.input += String(delta.partial_json || '');
      }
      return;
    }
    if (event?.type === 'content_block_stop') open.done = true;
  }

  /** 不可回放时只保留谱系记录（照常参与作废判定），并记一次静态警告 */
  finish(): AnthropicProviderState {
    const state = this.capture();
    if (!state.replayable) {
      Logger.warn('本次回复的思考状态无法完整记录，之后的请求不回放它', 'AnthropicMessagesAdapter');
    }
    return state;
  }

  private capture(): AnthropicProviderState {
    const ordered = [...this.blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
    const base: Omit<AnthropicProviderState, 'replayable' | 'blocks'> = {
      v: STATE_VERSION,
      protocol: ANTHROPIC_PROVIDER_STATE_PROTOCOL,
      model: this.context.model,
      id: randomUUID(),
      digest: this.context.digest,
      lineage: [...this.context.lineage],
    };
    const blocks: AnthropicCapturedBlock[] = [];
    for (const block of ordered) {
      if (!block.done || block.type === 'unsupported') return { ...base, replayable: false };
      if (block.type === 'thinking') {
        if (!block.signature) return { ...base, replayable: false };
        blocks.push({ type: 'thinking', thinking: block.thinking, signature: block.signature });
      } else if (block.type === 'redacted_thinking') {
        if (!block.data) return { ...base, replayable: false };
        blocks.push({ type: 'redacted_thinking', data: block.data });
      } else if (block.type === 'text') {
        if (!block.text) return { ...base, replayable: false };
        blocks.push({ type: 'text', text: block.text });
      } else {
        if (!block.id || !block.name || !isLosslessJson(block.input || '{}')) {
          return { ...base, replayable: false };
        }
        blocks.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input || '{}',
        });
      }
    }
    if (Buffer.byteLength(JSON.stringify(blocks)) > MAX_PAYLOAD_BYTES)
      return { ...base, replayable: false };
    return { ...base, replayable: true, blocks };
  }
}

// ---------- 回放 ----------

function messageText(message: ModelGatewayMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => String(part.text || ''))
    .join('');
}

/** 按记录重建这条助手消息的线上内容；与消息本身对不上时返回 undefined（不可回放） */
function rebuildContent(
  state: AnthropicProviderState,
  message: ModelGatewayMessage,
): any[] | undefined {
  if (!state.replayable || !Array.isArray(state.blocks)) return undefined;
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const text = state.blocks
    .filter(
      (block): block is Extract<AnthropicCapturedBlock, { type: 'text' }> => block.type === 'text',
    )
    .map(block => block.text)
    .join('');
  if (text !== messageText(message)) return undefined;
  const toolBlocks = state.blocks.filter(
    (block): block is Extract<AnthropicCapturedBlock, { type: 'tool_use' }> =>
      block.type === 'tool_use',
  );
  if (toolBlocks.length !== calls.length) return undefined;
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index] as any;
    const block = toolBlocks[index];
    let normalized: string;
    try {
      normalized = JSON.stringify(JSON.parse(String(call?.function?.arguments ?? '{}')));
    } catch {
      return undefined;
    }
    if (
      call?.id !== block.id ||
      call?.function?.name !== block.name ||
      normalized !== JSON.stringify(JSON.parse(block.input))
    ) {
      return undefined;
    }
  }
  return state.blocks.map(block => {
    if (block.type === 'thinking')
      return { type: 'thinking', thinking: block.thinking, signature: block.signature };
    if (block.type === 'redacted_thinking') return { type: 'redacted_thinking', data: block.data };
    if (block.type === 'text') return { type: 'text', text: block.text };
    return { type: 'tool_use', id: block.id, name: block.name, input: JSON.parse(block.input) };
  });
}

export function planAnthropicReplay(input: {
  model: string;
  system: unknown;
  tools: unknown;
  messages: AnthropicWireMessage[];
  /** 与 messages 对齐：助手消息对应的平台消息（可能带 provider_state） */
  sources: Array<ModelGatewayMessage | undefined>;
}): AnthropicReplayPlan {
  const { messages, sources } = input;
  const plainHashes = messages.map(message => sha256(JSON.stringify(message)));
  const stateful: Array<{
    wireIndex: number;
    state: AnthropicProviderState;
    content?: any[];
    replayHash?: string;
  }> = [];
  messages.forEach((message, wireIndex) => {
    const source = sources[wireIndex];
    if (message.role !== 'assistant' || !source) return;
    const state = (source as any).provider_state;
    if (!isAnthropicProviderState(state, input.model)) return;
    const content = rebuildContent(state, source);
    stateful.push({
      wireIndex,
      state,
      ...(content
        ? { content, replayHash: sha256(JSON.stringify({ role: 'assistant', content })) }
        : {}),
    });
  });

  const start = sha256(
    `${PREFIX_DOMAIN}\n${sha256(JSON.stringify(input.system ?? null))}\n${sha256(JSON.stringify(input.tools ?? null))}`,
  );
  const chain = (until: number, replayed: Set<string>, hashes: (wireIndex: number) => string) => {
    let digest = start;
    for (let index = 0; index < until; index += 1) digest = sha256(`${digest}\n${hashes(index)}`);
    return digest;
  };
  const byWireIndex = new Map(stateful.map(entry => [entry.wireIndex, entry]));
  const hashFor = (replayed: Set<string>) => (wireIndex: number) => {
    const entry = byWireIndex.get(wireIndex);
    return entry && replayed.has(entry.state.id) && entry.replayHash
      ? entry.replayHash
      : plainHashes[wireIndex];
  };

  // 单调作废：被任何更晚记录的谱系排除过的记录永不再用
  const superseded = new Set<string>();
  stateful.forEach((entry, position) => {
    for (const later of stateful.slice(position + 1)) {
      if (!later.state.lineage.includes(entry.state.id)) {
        superseded.add(entry.state.id);
        break;
      }
    }
  });

  let chosen = new Set<string>();
  let tries = 0;
  for (
    let position = stateful.length - 1;
    position >= 0 && tries < MAX_ANCHOR_CANDIDATES;
    position -= 1
  ) {
    const anchor = stateful[position];
    if (superseded.has(anchor.state.id) || !anchor.replayHash) continue;
    tries += 1;
    // 锚点的摘要覆盖了谱系成员当时被回放的形态：谱系里的记录已不在历史里或不能重建时按普通消息进链，
    // 摘要仍然相等就说明这次发出的前缀与当时逐字相同（例如那条消息本来就没有思考块）。
    // 实际回放的只有其中仍在、能重建的记录（见下面的 replayed）
    const eligible = new Set([...anchor.state.lineage, anchor.state.id]);
    if (chain(anchor.wireIndex, eligible, hashFor(eligible)) === anchor.state.digest) {
      chosen = eligible;
      break;
    }
  }

  const replayed = stateful.filter(entry => chosen.has(entry.state.id) && entry.content);
  const replayedAt = new Map(replayed.map(entry => [entry.wireIndex, entry]));
  const finalMessages = messages.map((message, wireIndex) => {
    const entry = replayedAt.get(wireIndex);
    return entry ? { role: 'assistant' as const, content: entry.content! } : message;
  });
  return {
    messages: finalMessages,
    replayedIds: replayed.map(entry => entry.state.id),
    carriesThinking: replayed.some(entry => Boolean(entry.content?.some(isThinkingBlock))),
    digestAfter: chain(finalMessages.length, chosen, hashFor(chosen)),
  };
}
