import { getToolModelContent } from './tool-result-payload';

export const EMPTY_HISTORICAL_USER_CONTENT = '[历史用户消息为空]';
export const INTERRUPTED_HISTORICAL_ASSISTANT_CONTENT =
  '[历史助手消息为空、格式不完整或执行已中断]';
export const INTERRUPTED_HISTORICAL_TOOL_CONTENT =
  '工具调用记录不完整：该调用已中断，结果未知。不要把它视为成功。';
export const FAILED_HISTORICAL_TOOL_CONTENT = '工具执行失败，未记录可用结果。';

export interface HistoricalAssistantRound {
  value: Record<string, any>;
  text: string;
  toolCalls: any[];
  malformed: boolean;
}

export interface HistoricalAssistantMessage {
  rounds: unknown[];
  malformed: boolean;
}

export function normalizeHistoricalAssistantMessage(value: unknown): HistoricalAssistantMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { rounds: [], malformed: true };
  }
  const message = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(message, 'rounds')) {
    return { rounds: [], malformed: false };
  }
  if (!Array.isArray(message.rounds)) {
    return { rounds: [], malformed: true };
  }
  return { rounds: message.rounds, malformed: false };
}

export function normalizeHistoricalAssistantRound(value: unknown): HistoricalAssistantRound {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: {}, text: '', toolCalls: [], malformed: true };
  }
  const round = value as Record<string, any>;
  const hasText = Object.prototype.hasOwnProperty.call(round, 'text');
  const hasToolCalls = Object.prototype.hasOwnProperty.call(round, 'toolCalls');
  // 只调用工具、没有文字的轮次以 text: null 落库，属于正常形态，不能当成异常丢掉它的工具调用
  const malformed =
    (hasText &&
      round.text !== undefined &&
      round.text !== null &&
      typeof round.text !== 'string') ||
    (hasToolCalls && !Array.isArray(round.toolCalls));
  return {
    value: round,
    text: typeof round.text === 'string' ? round.text : '',
    toolCalls: Array.isArray(round.toolCalls) ? round.toolCalls : [],
    malformed,
  };
}

export function getHistoricalToolModelContent(
  toolCall: any,
): ReturnType<typeof getToolModelContent> {
  if (toolCall?.status === 'loading') return INTERRUPTED_HISTORICAL_TOOL_CONTENT;
  const content = getToolModelContent(toolCall);
  if (toolCall?.status === 'error' && content === '工具执行完成') {
    return FAILED_HISTORICAL_TOOL_CONTENT;
  }
  return content;
}
