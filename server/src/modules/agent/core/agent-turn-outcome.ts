import { Logger } from '@nestjs/common';
import { findQuestion, formatQuestionText } from '@99agent/contracts';
import type { AgentTurnStatus, UnifiedMessage } from '../../chatLog/types/message.types';
import { toBackendToolCall } from '../../chatLog/tool-result-payload';
import type { AgentLoopResult } from './agent-loop.service';

/**
 * 一次 Agent 循环运行的结果摘要：调用方（ChatTurnRun）据此结算、落库与发终态事件。
 * 与 AgentLoopResult 的区别只是把消息里的文本 / 推理正文与 token 总数提前取出。
 */
export interface AgentTurnOutcome {
  finishReason: AgentLoopResult['finishReason'];
  /** finishReason 表达不了的收尾原因（当前只有工具轮次上限） */
  stopReason?: AgentLoopResult['stopReason'];
  /** 给用户的回复：回答文字（不含过程话术），以提问收尾时接上问题与选项 */
  content: string;
  /**
   * 计费用的生成证据：最后一个有文字的轮次（与展示投影无关，沿用改动前 content 的取值），
   * 中断时是否计费、没有 usage 时的输出 token 估算只看它
   */
  generatedText: string;
  reasoning_content: string;
  totalTokens?: number;
  tokenUsage?: AgentLoopResult['tokenUsage'];
  toolCost?: number;
  errMsg?: string;
  currentMessage: UnifiedMessage;
}

/** 循环开始前的助手消息骨架；turnId 存在时带上 running 状态的 turn */
export function createAssistantTurnMessage(input: {
  model?: string;
  turnId?: string;
  parentTurnId?: string;
  turnStartedAt?: string;
}): UnifiedMessage {
  const message: UnifiedMessage = {
    role: 'assistant',
    content: '',
    rounds: [],
    model: input.model || '',
    timestamp: new Date().toISOString(),
  };
  if (input.turnId) {
    message.turn = {
      id: input.turnId,
      status: 'running',
      ...(input.parentTurnId ? { parentTurnId: input.parentTurnId } : {}),
      startedAt: input.turnStartedAt || new Date().toISOString(),
    };
  }
  return message;
}

/** 按 finishReason 把消息上的 turn 收成终态；已是同一终态则不重复改写 */
export function finalizeAssistantTurnState(message: UnifiedMessage, finishReason: string): void {
  if (!message.turn) return;
  const nextStatus: AgentTurnStatus =
    finishReason === 'abort' ? 'interrupted' : finishReason === 'error' ? 'failed' : 'completed';
  if (message.turn.status === nextStatus && message.turn.completedAt) return;
  const completedAt = new Date().toISOString();
  const startedMs = Date.parse(message.turn.startedAt);
  message.turn = {
    ...message.turn,
    status: nextStatus,
    completedAt,
    ...(Number.isFinite(startedMs) ? { durationMs: Math.max(0, Date.now() - startedMs) } : {}),
  };
}

/** 循环返回后：收终态 turn、汇总 Token 日志，并整理成调用方消费的摘要 */
export function summarizeAgentLoopResult(
  loopResult: AgentLoopResult,
  currentMessage: UnifiedMessage,
): AgentTurnOutcome {
  // 回答文字由适配器按轮次与阶段维护；以提问收尾时接上问题与选项，渠道、搜索与复制都能看到
  const question = findQuestion(currentMessage);
  if (question) {
    currentMessage.content = [currentMessage.content, formatQuestionText(question)]
      .filter(Boolean)
      .join('\n\n');
  }
  const content = () => currentMessage.content || '';
  const reasoning = () => currentMessage.rounds?.[0]?.thinking || '';
  const generatedText =
    [...(currentMessage.rounds || [])].reverse().find(round => round?.text)?.text || '';

  if (!loopResult.success) {
    finalizeAssistantTurnState(currentMessage, 'error');
    const totalTokens = loopResult.tokenUsage?.totalTokens;
    return {
      finishReason: 'error',
      content: content(),
      generatedText,
      reasoning_content: reasoning(),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
      currentMessage,
      errMsg: loopResult.error || 'Agent Loop 执行失败',
      ...(loopResult.tokenUsage ? { tokenUsage: loopResult.tokenUsage } : {}),
      ...(loopResult.toolCost !== undefined ? { toolCost: loopResult.toolCost } : {}),
    };
  }

  finalizeAssistantTurnState(currentMessage, loopResult.finishReason);
  if (loopResult.tokenUsage) {
    const usage = loopResult.tokenUsage;
    const cachePart =
      usage.cacheHitTokens != null || usage.cacheMissTokens != null
        ? ` | 缓存命中: ${usage.cacheHitTokens || 0} | 未命中: ${usage.cacheMissTokens || 0}`
        : '';
    Logger.log(
      `[AgentLoop] Token 统计 | 输入: ${usage.totalInputTokens} | 输出: ${usage.totalOutputTokens} | 总计: ${usage.totalTokens}${cachePart}`,
      'AgentLoopService',
    );
  }
  return {
    finishReason: loopResult.finishReason,
    ...(loopResult.stopReason ? { stopReason: loopResult.stopReason } : {}),
    content: content(),
    generatedText,
    reasoning_content: reasoning(),
    totalTokens: loopResult.tokenUsage?.totalTokens,
    currentMessage,
    tokenUsage: loopResult.tokenUsage,
    toolCost: loopResult.toolCost,
  };
}

/**
 * 落库用的助手消息：补齐 content / model / timestamp / tokens，
 * 并把每个工具调用收成后端投影（去掉模型专用与诊断字段）。
 */
export function toPersistedAssistantMessage(
  message: UnifiedMessage,
  input: { model?: string; tokenUsage?: AgentLoopResult['tokenUsage'] },
): UnifiedMessage {
  // content 只是回答（可以为空）：不再拿第一个有文字的轮次补，过程话术不会被当成回复
  message.model = input.model;
  if (!message.timestamp) {
    message.timestamp = new Date().toISOString();
  }
  if (input.tokenUsage) {
    message.tokens = {
      input: input.tokenUsage.totalInputTokens,
      output: input.tokenUsage.totalOutputTokens,
      total: input.tokenUsage.totalTokens,
    };
  }
  return {
    ...message,
    rounds: Array.isArray(message?.rounds)
      ? message.rounds.map((round: any) => ({
          ...round,
          toolCalls: Array.isArray(round?.toolCalls)
            ? round.toolCalls.map((toolCall: any) => toBackendToolCall(toolCall))
            : [],
        }))
      : [],
  };
}
