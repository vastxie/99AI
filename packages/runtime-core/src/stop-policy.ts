import type {
  AgentRuntimeCapabilityResult,
  AgentRuntimeResult,
  AgentRuntimeToolCall,
} from './contracts';
import { LoopDetector } from './loop-detector';

type Decision = {
  shouldStop: boolean;
  reason: string;
  result?: Omit<AgentRuntimeResult, 'messages'>;
};

/**
 * 各厂商表示「输出达到上限被截断」的结束原因（OpenAI length、Anthropic / Gemini max_tokens、
 * Responses max_output_tokens、部分兼容网关 token_limit），与网关的静默截断识别同一张表
 */
const OUTPUT_LIMIT_FINISH_REASONS = new Set([
  'length',
  'max_tokens',
  'max_output_tokens',
  'token_limit',
]);

function isOutputLimitFinish(finishReason: string | undefined): boolean {
  return OUTPUT_LIMIT_FINISH_REASONS.has(String(finishReason || '').toLowerCase());
}

function result(
  finishReason: AgentRuntimeResult['finishReason'],
  options: Partial<Omit<AgentRuntimeResult, 'messages' | 'finishReason'>> = {},
): Omit<AgentRuntimeResult, 'messages'> {
  return { success: finishReason !== 'error', finishReason, ...options };
}

export class StopPolicy {
  private readonly detector: LoopDetector;

  constructor(maxRounds: number) {
    this.detector = new LoopDetector(maxRounds);
  }

  beginRound(): void {
    this.detector.beginRound();
  }

  decideAfterTurn(input: {
    aborted: boolean;
    malformed: boolean;
    toolCalls: AgentRuntimeToolCall[];
    /** 模型这一轮自己报告的结束原因（厂商原文） */
    finishReason?: string;
  }): Decision {
    if (input.aborted) return { shouldStop: true, reason: 'abort', result: result('abort') };
    if (input.malformed) {
      return {
        shouldStop: true,
        reason: 'malformed',
        result: result('error', {
          success: false,
          error: 'Malformed model tool call',
        }),
      };
    }
    if (input.toolCalls.length === 0) {
      // 输出达到上限：照常收尾，但要让宿主知道回复可能没写完，不能报成正常完成
      if (isOutputLimitFinish(input.finishReason)) {
        return {
          shouldStop: true,
          reason: 'output_limit',
          result: result('length', { stopReason: 'length' }),
        };
      }
      return {
        shouldStop: true,
        reason: 'normal_stop',
        result: result('stop'),
      };
    }
    const loop = this.detector.check(input.toolCalls);
    if (loop.shouldBreak) {
      return {
        shouldStop: true,
        reason: loop.reason || 'abort',
        result: result('abort', {
          includeCacheMetrics: false,
          // 轮次上限是宿主配置的收尾，不是用户或错误中断，宿主要能分开提示
          ...(loop.reason === 'max_rounds' ? { stopReason: 'max_rounds' as const } : {}),
        }),
      };
    }
    return { shouldStop: false, reason: loop.reason || 'continue' };
  }

  decideAfterCapabilities(input: {
    results: AgentRuntimeCapabilityResult[];
    shouldHandoff: boolean;
  }): Decision {
    if (
      input.results.some((resultItem) =>
        Boolean(resultItem.control?.handoff || resultItem.control?.queueNextTurn),
      )
    ) {
      return {
        shouldStop: true,
        reason: 'handoff',
        result: result('handoff', { doneData: { finishReason: 'handoff' } }),
      };
    }
    if (input.shouldHandoff) {
      return {
        shouldStop: true,
        reason: 'queued_turn',
        result: result('handoff', { doneData: { finishReason: 'handoff' } }),
      };
    }
    // 工具要求本轮到此为止（例如已向用户提问）：正常结束，不再调用模型；交接与排队的用户消息优先
    if (input.results.some((resultItem) => Boolean(resultItem.control?.terminate))) {
      return { shouldStop: true, reason: 'terminate', result: result('stop') };
    }
    return { shouldStop: false, reason: 'continue' };
  }
}
