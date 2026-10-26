import { Logger } from '@nestjs/common';
import type { AgentRuntimeToolCall } from '@99agent/runtime-core';
import { PRESENTATION_TOOL_RESULT_TYPE, QUESTION_TOOL_RESULT_TYPE } from '@99agent/contracts';
import { isConversationToolName } from '../conversation/conversation-tool.provider';
import {
  createLayeredToolResult,
  enrichOutputHintWithInput,
  getToolModelContent,
  isFaithfulTextTool,
  isMediaOutputHint,
  sanitizeToolInput,
} from '../../chatLog/tool-result-payload';
import {
  ToolOutcomeUnknownError,
  type ToolExecutionContext,
} from '../tools/tool-provider.interface';
import type { AgentOperationSession } from '../runtime-state/operation-ledger.store';
import {
  buildToolInputShape,
  sanitizeOperationLedgerText,
} from '../runtime-state/operation-ledger.types';

interface AgentRuntimeToolRegistry {
  execute(toolName: string, args: any, context: any): Promise<any>;
  getToolProviderInfo(toolName: string): any;
  getDisplayName(toolName: string, args?: any): string | undefined;
  getReplayIntent?(
    toolName: string,
    args: unknown,
  ): {
    policy: 'safe' | 'never';
    payload?: Record<string, unknown>;
  };
}

export interface AgentToolExecutorDependencies {
  toolProviderRegistry: AgentRuntimeToolRegistry;
  resolveToolCost?: (toolName: string, toolType: string, args?: any) => Promise<number>;
  withToolTrace?: (toolResult: any) => any;
  onStart?: (input: {
    callId: string;
    ordinal: number;
    roundIndex: number;
    functionName: string;
    displayName: string;
    toolType: string;
    inputSummary?: string;
    outputHint?: any;
  }) => void;
  onTerminal?: (input: { callId: string; ordinal: number; roundIndex: number }) => void;
}

export interface AgentToolExecutorInput {
  toolCalls: AgentRuntimeToolCall[];
  toolContext: ToolExecutionContext;
  sanitizedNameMap: Map<string, string>;
  options: { toolCost?: number };
  currentRoundIndex: number;
  signal?: AbortSignal;
  operationSession?: AgentOperationSession;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('Agent runtime aborted');
  error.name = 'AbortError';
  throw error;
}

/** 成果清单与提问是会话控制工具专属的结果类型：其他工具返回这两个类型时按普通工具结果处理 */
const CONVERSATION_RESULT_TYPES = new Set<unknown>([
  PRESENTATION_TOOL_RESULT_TYPE,
  QUESTION_TOOL_RESULT_TYPE,
]);

function resultTypeFor(functionName: string, type: any): any {
  return CONVERSATION_RESULT_TYPES.has(type) && !isConversationToolName(functionName)
    ? 'tool'
    : type;
}

function flattenModelContent(value: unknown): string {
  if (typeof value === 'string') return sanitizeOperationLedgerText(value, 12_000);
  if (!Array.isArray(value)) return '';
  return sanitizeOperationLedgerText(
    value
      .map((part: any) => {
        if (part?.type === 'text') return String(part.text || '');
        if (part?.file?.fileRef) return `[${part.type || 'file'}: ${part.file.fileRef}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n'),
    12_000,
  );
}

function resultFromStoredOutcome(outcome: {
  callId: string;
  toolName: string;
  displayName: string;
  status: 'success' | 'error';
  modelContent: string;
  inputSummary?: string;
}): any {
  const result = createLayeredToolResult({
    id: outcome.callId,
    type: 'tool',
    toolName: outcome.toolName,
    displayName: outcome.displayName,
    name: outcome.displayName,
    status: outcome.status,
    input: {},
    rawOutput:
      outcome.status === 'error'
        ? { error: outcome.modelContent }
        : { content: outcome.modelContent },
    time: Date.now(),
  });
  return outcome.inputSummary ? { ...result, inputSummary: outcome.inputSummary } : result;
}

export class AgentToolExecutor {
  constructor(private readonly dependencies: AgentToolExecutorDependencies) {}

  async executeToolCalls(input: AgentToolExecutorInput): Promise<any[]> {
    const executeOne = async (toolCall: AgentRuntimeToolCall, ordinal: number): Promise<any> => {
      assertNotAborted(input.signal);
      const startedAt = Date.now();
      const sanitizedFunctionName = toolCall.function.name;
      const functionName = input.sanitizedNameMap.get(sanitizedFunctionName);
      if (!functionName) {
        this.dependencies.onTerminal?.({
          callId: toolCall.id,
          ordinal,
          roundIndex: input.currentRoundIndex,
        });
        return createLayeredToolResult({
          id: toolCall.id,
          type: 'error',
          name: sanitizedFunctionName,
          toolName: sanitizedFunctionName,
          status: 'error',
          input: {},
          rawOutput: { error: '本轮未授权该工具，请使用已列出的工具。' },
          time: startedAt,
        });
      }
      const finishDuration = () => Math.max(0, Date.now() - startedAt);

      let args: any;
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
        if (!isPlainObject(args)) throw new Error('Tool arguments must be an object');
      } catch (parseError) {
        assertNotAborted(input.signal);
        Logger.warn('工具参数 JSON 解析失败', 'AgentToolExecutor');
        this.dependencies.onTerminal?.({
          callId: toolCall.id,
          ordinal,
          roundIndex: input.currentRoundIndex,
        });
        return createLayeredToolResult({
          id: toolCall.id || `error_${Date.now()}_${ordinal}`,
          toolName: functionName,
          displayName: functionName,
          name: functionName,
          input: {},
          rawOutput: {
            error: '工具参数解析失败，内容可能被截断',
            content: '工具参数解析失败，可能因输出长度限制被截断。请尝试缩短参数内容后重试。',
          },
          status: 'error',
          type: 'error',
          time: startedAt,
          duration: finishDuration(),
          output: { kind: 'generic' },
        });
      }

      assertNotAborted(input.signal);
      const skillInfo = this.dependencies.toolProviderRegistry.getToolProviderInfo(functionName);
      const toolType = skillInfo?.metadata?.category || 'tool';
      const outputHint = enrichOutputHintWithInput(skillInfo?.metadata?.outputHint, args);
      const preflightOutputHint = isMediaOutputHint(outputHint) ? undefined : outputHint;
      const displayName =
        this.dependencies.toolProviderRegistry.getDisplayName(functionName, args) || functionName;
      const toolCost =
        (await this.dependencies.resolveToolCost?.(functionName, toolType, args)) || 0;
      assertNotAborted(input.signal);

      const replayIntent = this.dependencies.toolProviderRegistry.getReplayIntent?.(
        functionName,
        args,
      ) || { policy: 'never' as const };
      const durableInputShape =
        replayIntent.policy === 'safe' && replayIntent.payload
          ? buildToolInputShape(replayIntent.payload)
          : buildToolInputShape(args);
      const effectDecision = input.operationSession
        ? await input.operationSession.beginToolEffect({
            roundIndex: input.currentRoundIndex,
            ordinal,
            callId: toolCall.id,
            toolName: functionName,
            replayPolicy: replayIntent.policy,
            ...(replayIntent.policy === 'safe' && replayIntent.payload
              ? { replayPayload: replayIntent.payload }
              : {}),
            inputShape: durableInputShape,
          })
        : undefined;
      if (effectDecision?.action === 'reuse' && effectDecision.outcome) {
        this.dependencies.onTerminal?.({
          callId: toolCall.id,
          ordinal,
          roundIndex: input.currentRoundIndex,
        });
        if (effectDecision.outcome.status === 'success' && input.options.toolCost !== undefined) {
          input.options.toolCost += effectDecision.outcome.toolCost;
        }
        return resultFromStoredOutcome(effectDecision.outcome);
      }
      if (effectDecision?.action === 'unknown') {
        this.dependencies.onTerminal?.({
          callId: toolCall.id,
          ordinal,
          roundIndex: input.currentRoundIndex,
        });
        return createLayeredToolResult({
          id: toolCall.id,
          type: 'error',
          toolName: functionName,
          displayName,
          name: displayName,
          status: 'error',
          input: {},
          rawOutput: { error: '工具执行状态不确定，已阻止重复调用。' },
          time: startedAt,
          duration: finishDuration(),
        });
      }

      try {
        assertNotAborted(input.signal);
        this.dependencies.onStart?.({
          callId: toolCall.id,
          ordinal,
          roundIndex: input.currentRoundIndex,
          functionName,
          displayName,
          toolType,
          inputSummary: sanitizeToolInput(args),
          ...(preflightOutputHint ? { outputHint: preflightOutputHint } : {}),
        });
        assertNotAborted(input.signal);
      } catch {
        if (input.operationSession && effectDecision) {
          try {
            await input.operationSession.markToolEffectInterrupted(effectDecision.effectKey);
          } catch {
            Logger.error('工具未派发状态持久化失败', undefined, 'AgentToolExecutor');
          }
        }
        assertNotAborted(input.signal);
        Logger.error('工具执行准备失败', undefined, 'AgentToolExecutor');
        return createLayeredToolResult({
          id: toolCall.id || `error_${Date.now()}_${ordinal}`,
          toolName: functionName,
          displayName,
          name: displayName,
          input: args,
          rawOutput: { error: '工具执行准备失败，请稍后重试。' },
          status: 'error',
          type: 'error',
          time: startedAt,
          duration: finishDuration(),
          outputHint,
          output: { kind: 'generic' },
        });
      }

      try {
        const existingOptions = input.toolContext.input?.context?.options || {};
        const result = await this.dependencies.toolProviderRegistry.execute(functionName, args, {
          ...input.toolContext,
          signal: input.signal,
          input: {
            ...input.toolContext.input,
            context: {
              ...input.toolContext.input?.context,
              options: existingOptions,
            },
          },
          toolCallId: toolCall.id,
        });
        const layeredResult = createLayeredToolResult({
          id: toolCall.id || `call_${Date.now()}_${ordinal}`,
          type: resultTypeFor(functionName, result.type),
          toolName: functionName,
          displayName: result.displayName || result.name || displayName,
          name: result.displayName || result.name || displayName,
          status: result.status === 'success' ? 'success' : 'error',
          input: args,
          rawOutput: result.output,
          time: result.time || startedAt,
          duration: result.duration ?? finishDuration(),
          outputHint: enrichOutputHintWithInput(result.outputHint || outputHint, args),
          output: result.model?.output || result.display || result.output,
          toolResult: result.toolResult,
          // 原语工具的权威正文保持原文（只对原语工具名生效）
          ...(isFaithfulTextTool(functionName) ? { modelText: 'faithful' as const } : {}),
        });

        const finalResult = {
          ...layeredResult,
          model: result.model || layeredResult.model,
          display: result.display || layeredResult.display,
          output: result.display || layeredResult.output,
          toolResult: layeredResult.toolResult,
          ...(layeredResult.assets ? { assets: layeredResult.assets } : {}),
          ...(layeredResult.trace ? { trace: layeredResult.trace } : {}),
          ...(layeredResult.control ? { control: layeredResult.control } : {}),
          internal: isPlainObject(result.internal)
            ? { ...layeredResult.internal, ...result.internal }
            : layeredResult.internal,
          outputHint: enrichOutputHintWithInput(
            result.outputHint || layeredResult.outputHint,
            args,
          ),
        };
        if (input.operationSession && effectDecision) {
          await input.operationSession.commitToolEffect(effectDecision.effectKey, {
            callId: toolCall.id,
            toolName: functionName,
            displayName: result.displayName || result.name || displayName,
            status: result.status === 'success' ? 'success' : 'error',
            modelContent: flattenModelContent(getToolModelContent(finalResult)),
            inputSummary: sanitizeToolInput(args),
            toolCost: result.status === 'success' ? toolCost : 0,
          });
        }
        assertNotAborted(input.signal);
        if (result.status === 'success' && input.options.toolCost !== undefined && toolCost > 0) {
          input.options.toolCost += toolCost;
          Logger.log(
            `工具费用累加: ${functionName} +${toolCost} 积分 (总计: ${input.options.toolCost})`,
            'AgentToolExecutor',
          );
        }
        return finalResult;
      } catch (error) {
        if (input.operationSession && effectDecision) {
          try {
            await input.operationSession.markToolEffectUnknown(effectDecision.effectKey);
          } catch {
            Logger.error('工具不确定状态持久化失败', undefined, 'AgentToolExecutor');
          }
          throw new ToolOutcomeUnknownError();
        }
        if (error instanceof ToolOutcomeUnknownError) throw error;
        assertNotAborted(input.signal);
        Logger.error('工具执行失败', undefined, 'AgentToolExecutor');
        return createLayeredToolResult({
          id: toolCall.id || `error_${Date.now()}_${ordinal}`,
          toolName: functionName,
          displayName,
          name: displayName,
          input: args,
          rawOutput: { error: '工具执行失败，请稍后重试。' },
          status: 'error',
          type: 'error',
          time: startedAt,
          duration: finishDuration(),
          outputHint,
          output: { kind: 'generic' },
        });
      }
    };
    const results: any[] = [];
    // 工具可能依赖前一个调用的副作用；默认顺序执行，不根据模型自报字段开启并行。
    for (const [ordinal, toolCall] of input.toolCalls.entries()) {
      results.push(await executeOne(toolCall, ordinal));
    }

    assertNotAborted(input.signal);
    return results.map(result => {
      assertNotAborted(input.signal);
      return this.dependencies.withToolTrace?.(result) || result;
    });
  }
}
