/**
 * ToolProviderRegistry — 统一 工具 Provider 注册中心
 *
 * 所有 工具 Provider（搜索、创意、生产力等）通过 register() 注册，
 * AgentLoopService 通过该注册中心获取和执行 工具 Provider。
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ToolDefinition,
  ToolOutcomeUnknownError,
  ToolProvider,
  ToolResult,
  ToolExecutionContext,
  ToolReplayIntent,
} from '../../tools/tool-provider.interface';
import { createLayeredToolResult } from '../../../chatLog/tool-result-payload';
import { ToolProviderMetadata, ToolProviderInfo } from './tool-provider.types';

@Injectable()
export class ToolProviderRegistry {
  /** provider → metadata 映射 */
  private readonly providers = new Map<ToolProvider, ToolProviderMetadata>();

  /**
   * 注册一个 工具 Provider Provider
   */
  register(provider: ToolProvider, metadata: ToolProviderMetadata): void {
    this.providers.set(provider, metadata);
    Logger.log('工具 Provider 已注册', 'ToolProviderRegistry');
  }

  /**
   * 每轮运行开始前让各 Provider 做准备（附件落盘等）；单个 Provider 失败不影响其他
   */
  async finishTurn(context: ToolExecutionContext): Promise<void> {
    for (const [provider] of this.providers) {
      try {
        await provider.finishTurn?.(context);
      } catch {
        Logger.warn('工具 Provider 回合资源释放失败', 'ToolProviderRegistry');
      }
    }
  }
  async prepareTurn(context: ToolExecutionContext): Promise<void> {
    for (const [provider] of this.providers) {
      if (!provider.prepareTurn) continue;
      try {
        await provider.prepareTurn(context);
      } catch {
        Logger.warn('工具 Provider 回合准备失败', 'ToolProviderRegistry');
      }
    }
  }

  /**
   * 收集各 Provider 贡献的系统提示段落
   */
  async collectSystemPromptSections(context: ToolExecutionContext): Promise<string[]> {
    const sections: string[] = [];
    for (const [provider] of this.providers) {
      if (!provider.describeForSystemPrompt) continue;
      try {
        const section = await provider.describeForSystemPrompt(context);
        if (section && section.trim()) sections.push(section.trim());
      } catch {
        Logger.warn('工具 Provider 提示构建失败', 'ToolProviderRegistry');
      }
    }
    return sections;
  }

  /**
   * 工具费用（积分）；Provider 未声明时为 0
   */
  async getToolCost(toolName: string, args?: unknown): Promise<number> {
    for (const [provider] of this.providers) {
      if (!provider.canHandle(toolName)) continue;
      if (!provider.getToolCost) return 0;
      try {
        const cost = Number(await provider.getToolCost(toolName, args));
        return Number.isFinite(cost) && cost > 0 ? cost : 0;
      } catch {
        Logger.warn('工具费用读取失败', 'ToolProviderRegistry');
        return 0;
      }
    }
    return 0;
  }

  /** 未声明、异常、下线或跨 Provider 的调用一律不可恢复重放。 */
  getReplayIntent(toolName: string, args: unknown): ToolReplayIntent {
    for (const [provider] of this.providers) {
      if (!provider.canHandle(toolName)) continue;
      if (!provider.getReplayIntent) return { policy: 'never' };
      try {
        const intent = provider.getReplayIntent(toolName, args);
        return intent?.policy === 'safe' && intent.payload
          ? { policy: 'safe', payload: intent.payload }
          : { policy: 'never' };
      } catch {
        return { policy: 'never' };
      }
    }
    return { policy: 'never' };
  }

  /**
   * 获取所有已注册的工具定义（给 LLM Function Calling 用）
   */
  async getAllToolDefinitions(context?: ToolExecutionContext): Promise<ToolDefinition[]> {
    const definitions: ToolDefinition[] = [];
    for (const [provider] of this.providers) {
      try {
        const defs = await provider.getToolDefinitions(context);
        definitions.push(...defs);
      } catch {
        Logger.error('工具定义读取失败', 'ToolProviderRegistry');
      }
    }
    return definitions;
  }

  /**
   * 执行指定工具
   */
  async execute(
    toolName: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    for (const [provider] of this.providers) {
      if (provider.canHandle(toolName)) {
        try {
          return await provider.execute(toolName, args, context);
        } catch {
          // 用户停止或运行被中止时结果同样未确认，但不是要排查的错误
          if (context.signal?.aborted)
            Logger.warn('工具执行被中止，结果未确认', 'ToolProviderRegistry');
          else Logger.error('工具执行结果不确定', undefined, 'ToolProviderRegistry');
          throw new ToolOutcomeUnknownError();
        }
      }
    }

    Logger.warn('未找到可处理当前调用的工具', 'ToolProviderRegistry');
    return createLayeredToolResult({
      id: `unknown_${Date.now()}`,
      type: 'unknown',
      name: toolName,
      status: 'error',
      input: args,
      rawOutput: { error: '当前工具不可用，请重新选择工具。' },
      time: Date.now(),
    });
  }

  /**
   * 查找处理指定工具的 工具 Provider 信息
   */
  getToolProviderInfo(toolName: string): ToolProviderInfo | undefined {
    for (const [provider, metadata] of this.providers) {
      if (provider.canHandle(toolName)) {
        const runtimeCategory = provider.getCategory?.(toolName) || metadata.category;
        const outputHint = provider.getOutputHint?.(toolName) || metadata.outputHint;
        const runtime = provider.getRuntime?.(toolName);
        return {
          toolNames: [], // 懒计算，按需填充
          metadata: {
            ...metadata,
            category: runtimeCategory as ToolProviderMetadata['category'],
            ...(outputHint ? { outputHint: outputHint as ToolProviderMetadata['outputHint'] } : {}),
            ...(runtime ? { runtime } : {}),
          },
          provider: provider.constructor.name,
        };
      }
    }
    return undefined;
  }

  /**
   * 列出所有已注册的 工具 Provider
   */
  listToolProviders(): ToolProviderInfo[] {
    const providers: ToolProviderInfo[] = [];
    for (const [provider, metadata] of this.providers) {
      providers.push({
        toolNames: [],
        metadata,
        provider: provider.constructor.name,
      });
    }
    return providers;
  }

  /**
   * 获取工具的显示名称（从 Provider 缓存中查找）
   */
  getDisplayName(toolName: string, args?: unknown): string | undefined {
    for (const [provider] of this.providers) {
      if (provider.canHandle(toolName)) {
        return provider.getDisplayName?.(toolName, args);
      }
    }
    return undefined;
  }
}
