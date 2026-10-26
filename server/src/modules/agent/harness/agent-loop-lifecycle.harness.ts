import { AgentRunTrace, UnifiedMessage } from '../../chatLog/types/message.types';
import type { AgentLoopOptions, AgentLoopResult } from '../core/agent-loop.service';
import { AgentTraceHarness } from './agent-trace.harness';

export class AgentLoopLifecycleHarness {
  constructor(private readonly traceHarness: AgentTraceHarness) {}

  finalizeRun(input: {
    message: UnifiedMessage | undefined;
    options: AgentLoopOptions;
    traceStatus: AgentRunTrace['status'];
    finishReason: AgentLoopResult['finishReason'];
    stopReason?: AgentLoopResult['stopReason'];
    success: boolean;
    doneData?: any;
    error?: string;
    includeCacheMetrics?: boolean;
    includeTokenDetails?: boolean;
  }): AgentLoopResult {
    input.options.onProgress?.({
      type: 'done',
      data: {
        ...(input.doneData ?? {}),
        finishReason: input.finishReason,
      },
    });
    this.traceHarness.finalizeRunTrace(input.message, input.options, input.traceStatus);

    return {
      success: input.success,
      message: input.message!,
      finishReason: input.finishReason,
      ...(input.stopReason ? { stopReason: input.stopReason } : {}),
      ...(input.error ? { error: input.error } : {}),
      tokenUsage: this.buildTokenUsage(input.options, {
        includeCacheMetrics: input.includeCacheMetrics ?? true,
        includeDetails: input.includeTokenDetails ?? true,
      }),
      toolCost: input.options.toolCost,
    };
  }

  buildTokenUsage(
    options: AgentLoopOptions,
    config: { includeCacheMetrics?: boolean; includeDetails?: boolean } = {},
  ): AgentLoopResult['tokenUsage'] {
    if (!options.tokenUsage) return undefined;

    let totalCacheHit = 0;
    let totalCacheMiss = 0;
    if (config.includeCacheMetrics && options.tokenUsage.details) {
      for (const detail of options.tokenUsage.details) {
        if (detail.billable === false) continue;
        totalCacheHit += detail.cacheHitTokens || 0;
        totalCacheMiss += detail.cacheMissTokens || 0;
      }
    }

    return {
      totalInputTokens: options.tokenUsage.totalInputTokens,
      totalOutputTokens: options.tokenUsage.totalOutputTokens,
      totalTokens: options.tokenUsage.totalTokens,
      ...(config.includeDetails === false ? {} : { details: options.tokenUsage.details }),
      ...(config.includeCacheMetrics && (totalCacheHit > 0 || totalCacheMiss > 0)
        ? { cacheHitTokens: totalCacheHit, cacheMissTokens: totalCacheMiss }
        : {}),
    };
  }
}
