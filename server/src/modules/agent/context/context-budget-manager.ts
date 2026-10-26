import type { ModelMessage } from '../../chatLog/types/message.types';
import { AgentRuntimeContextPolicy } from '@99agent/runtime-core';
import {
  AGENT_CONTEXT_BLOCK_ORDER,
  AGENT_CONTEXT_DEFAULT_TOKEN_BUDGET,
  AgentContextBlock,
} from './agent-context.types';

export interface ContextBudgetOptions {
  maxTokens?: number;
  recentMessageWindow?: number;
  previousToolResultWindow?: number;
  recentHistoryTokenBudget?: number;
}

export const DEFAULT_TOTAL_CONTEXT_TOKENS = 64000;
export const MIN_TOTAL_CONTEXT_TOKENS = 16000;
export const CONTEXT_TOKEN_WARNING_RATIO = 0.8;
export const CONTEXT_OUTPUT_RESERVE_RATIO = 0.2;
export const CONTEXT_OUTPUT_RESERVE_MIN_TOKENS = 8192;
export const CONTEXT_OUTPUT_RESERVE_MAX_TOKENS = 32768;
export const RECENT_HISTORY_CONTEXT_RATIO = 0.2;
export const RECENT_HISTORY_MIN_TOKENS = 8000;
export const RECENT_HISTORY_MAX_TOKENS = 32768;
const DEFAULT_PREVIOUS_TOOL_RESULT_WINDOW = 6;
const AVERAGE_CHARS_PER_TOKEN = 4;
const BLOCK_ORDER_INDEX = new Map(
  AGENT_CONTEXT_BLOCK_ORDER.map((type, index) => [type, index] as const),
);

function cloneMessage(message: ModelMessage): ModelMessage {
  return JSON.parse(JSON.stringify(message));
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === undefined || content === null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function estimateContextTokens(value: unknown): number {
  const text = stringifyContent(value);
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / AVERAGE_CHARS_PER_TOKEN));
}

export function resolveContextMaxTokens(maxTokens?: number): number {
  const parsed = Number(maxTokens);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TOTAL_CONTEXT_TOKENS;

  const contextWindow = Math.floor(parsed);
  if (contextWindow <= MIN_TOTAL_CONTEXT_TOKENS) return contextWindow;

  const outputReserveTokens = resolveContextOutputReserveTokens(contextWindow);
  return Math.max(MIN_TOTAL_CONTEXT_TOKENS, contextWindow - outputReserveTokens);
}

export function resolveContextOutputReserveTokens(maxTokens?: number): number {
  const parsed = Number(maxTokens);
  if (!Number.isFinite(parsed) || parsed <= MIN_TOTAL_CONTEXT_TOKENS) return 0;

  return clamp(
    Math.floor(parsed * CONTEXT_OUTPUT_RESERVE_RATIO),
    CONTEXT_OUTPUT_RESERVE_MIN_TOKENS,
    CONTEXT_OUTPUT_RESERVE_MAX_TOKENS,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveRecentHistoryTokenBudget(maxTokens?: number): number {
  const contextBudget = resolveContextMaxTokens(maxTokens);
  return clamp(
    Math.floor(contextBudget * RECENT_HISTORY_CONTEXT_RATIO),
    RECENT_HISTORY_MIN_TOKENS,
    RECENT_HISTORY_MAX_TOKENS,
  );
}

function resolveBlockTokenBudget(block: AgentContextBlock, options: ContextBudgetOptions): number {
  if (block.tokenBudget) return block.tokenBudget;
  if (block.type === 'recent_history') {
    const explicit = Math.floor(Number(options.recentHistoryTokenBudget) || 0);
    return explicit > 0 ? explicit : resolveRecentHistoryTokenBudget(options.maxTokens);
  }
  return AGENT_CONTEXT_DEFAULT_TOKEN_BUDGET[block.type];
}

function truncateTextToBudget(text: string, tokenBudget: number): string {
  if (estimateContextTokens(text) <= tokenBudget) return text;
  const charBudget = Math.max(40, tokenBudget * AVERAGE_CHARS_PER_TOKEN);
  return `${text.slice(0, Math.max(0, charBudget - 18)).trimEnd()}\n[上下文已裁剪]`;
}

function trimMessagesToBudget(messages: ModelMessage[], tokenBudget: number): ModelMessage[] {
  return AgentRuntimeContextPolicy.project({
    messages: messages.map(cloneMessage),
    maxTokens: tokenBudget,
    requireNewestUserTurn: false,
  }).messages as ModelMessage[];
}

function applyRecentMessageWindow(
  block: AgentContextBlock,
  messages: ModelMessage[],
  options: ContextBudgetOptions,
): ModelMessage[] {
  const windowSize =
    block.type === 'previous_tool_result'
      ? options.previousToolResultWindow || DEFAULT_PREVIOUS_TOOL_RESULT_WINDOW
      : block.type === 'recent_history'
        ? options.recentMessageWindow
        : undefined;

  if (!windowSize || messages.length <= windowSize) return messages;

  block.truncated = true;
  block.reason = 'truncated';
  block.warnings?.push(`${block.type} truncated to recent window (${windowSize} messages)`);
  return messages.slice(-windowSize);
}

function summarizeMessages(messages: ModelMessage[]): string {
  return messages
    .map(message => {
      const content =
        typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content
                .map((part: any) => (part?.type === 'text' ? part.text : `[${part?.type}]`))
                .join(' ')
            : '';
      return `${message.role}: ${content}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

export class ContextBudgetManager {
  apply(blocks: AgentContextBlock[], options: ContextBudgetOptions = {}): AgentContextBlock[] {
    const maxTokens = resolveContextMaxTokens(options.maxTokens);
    let remaining = maxTokens;

    return [...blocks]
      .sort(
        (a, b) => (BLOCK_ORDER_INDEX.get(a.type) ?? 999) - (BLOCK_ORDER_INDEX.get(b.type) ?? 999),
      )
      .map(block => {
        const tokenBudget = resolveBlockTokenBudget(block, options);
        const next: AgentContextBlock = {
          ...block,
          warnings: [...(block.warnings || [])],
          metadata: block.metadata
            ? {
                ...block.metadata,
                modelMessages: block.metadata.modelMessages?.map(cloneMessage),
              }
            : undefined,
        };

        const modelMessages = next.metadata?.modelMessages;
        const injectAs = next.metadata?.injectAs;

        if (injectAs === 'manifest_only') {
          next.estimatedTokens = estimateContextTokens(
            modelMessages?.length ? modelMessages : next.content,
          );
          next.included = false;
          next.reason = next.reason || 'manifest_only';
          return next;
        }

        if (next.included === false) {
          next.estimatedTokens = estimateContextTokens(
            modelMessages?.length ? modelMessages : next.content,
          );
          next.reason = next.reason || 'not_injected';
          return next;
        }

        if (modelMessages?.length) {
          const windowedMessages = applyRecentMessageWindow(next, modelMessages, options);
          const beforeBudget = JSON.stringify(windowedMessages);
          const trimmedMessages = trimMessagesToBudget(windowedMessages, tokenBudget);
          next.metadata = { ...next.metadata, modelMessages: trimmedMessages };
          next.content = summarizeMessages(trimmedMessages);
          if (
            trimmedMessages.length < windowedMessages.length ||
            JSON.stringify(trimmedMessages) !== beforeBudget
          ) {
            next.truncated = true;
            next.reason = 'truncated';
            next.warnings?.push(`${next.type} exceeded per-block budget`);
          }
        } else if (typeof next.content === 'string') {
          const trimmed = truncateTextToBudget(next.content, tokenBudget);
          if (trimmed !== next.content) {
            next.content = trimmed;
            next.truncated = true;
            next.reason = 'truncated';
            next.warnings?.push(`${next.type} exceeded per-block budget`);
          }
        }

        next.estimatedTokens = estimateContextTokens(
          next.metadata?.modelMessages?.length ? next.metadata.modelMessages : next.content,
        );

        const isRequired = next.type === 'system_identity' || next.type === 'current_user_request';
        const isExplicitFileReference = next.type === 'explicit_file_reference';
        if (!isRequired && remaining <= 0) {
          next.included = false;
          next.reason = isExplicitFileReference
            ? 'manifest_only_budget_exhausted'
            : 'dropped_budget_exhausted';
          next.warnings?.push(
            isExplicitFileReference
              ? 'explicit_file_reference kept in manifest only because context budget was exhausted'
              : `${next.type} dropped because context budget was exhausted`,
          );
          return next;
        }

        if (!isRequired && next.estimatedTokens > remaining) {
          if (next.metadata?.modelMessages?.length && remaining > 24) {
            const trimmed = trimMessagesToBudget(next.metadata.modelMessages, remaining);
            next.metadata = { ...next.metadata, modelMessages: trimmed };
            next.content = summarizeMessages(trimmed);
            next.estimatedTokens = estimateContextTokens(trimmed);
            next.truncated = true;
            next.reason = 'truncated';
            next.warnings?.push(`${next.type} truncated to fit remaining context budget`);
          } else if (typeof next.content === 'string' && remaining > 24) {
            next.content = truncateTextToBudget(next.content, remaining);
            next.estimatedTokens = estimateContextTokens(next.content);
            next.truncated = true;
            next.reason = 'truncated';
            next.warnings?.push(`${next.type} truncated to fit remaining context budget`);
          } else {
            next.included = false;
            next.reason = isExplicitFileReference
              ? 'manifest_only_budget_exhausted'
              : 'dropped_budget_exhausted';
            next.warnings?.push(
              isExplicitFileReference
                ? 'explicit_file_reference kept in manifest only because remaining context budget is too small'
                : `${next.type} dropped because remaining budget is too small`,
            );
            return next;
          }
        }

        next.included = true;
        next.reason = next.reason || (isRequired ? 'included_required' : 'included_within_budget');
        remaining -= next.included ? next.estimatedTokens || 0 : 0;
        return next;
      });
  }
}
