/**
 * Agent Loop 服务
 *
 * 新架构核心：简化为 前置处理 → Agent Loop → 后置处理
 * 不再使用 WorkflowEngine 和多节点编排
 */

import { mimeTypeToFormat, urlToBase64 } from '@/common/utils';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AgentRunTrace,
  AgentRoundTrace,
  ModelMessage,
  UnifiedMessage,
} from '../../chatLog/types/message.types';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { ModelsService } from '../../models/models.service';
import { ToolProviderRegistry } from '../tools/provider-registry/tool-provider.registry';
import { buildKernelSystemPrompt } from '../primitives/system-prompt';
import { ToolExecutionContext } from '../tools/tool-provider.interface';
import { ModelGatewayService } from '../../modelGateway/model-gateway.service';
import {
  DEFAULT_MODEL_PROTOCOL,
  deriveCapabilitiesFromMultimodalTypes,
  ModelGatewayReasoningEffort,
  ModelGatewayRuntimeConfig,
  parseModelGatewayAdditionalParams,
} from '../../modelGateway/model-gateway.types';
import { FileRefMappingStore, type FileRefMapping } from '../../fileAsset/file-refs';
import { AgentContextBuilder } from '../context/agent-context-builder';
import { ModelMessageMapper } from '../context/model-message-mapper';
import type {
  AgentContextQueuedTurnInput,
  AgentContextTextInput,
} from '../context/agent-context.types';
import { AgentLoopLifecycleHarness } from '../harness/agent-loop-lifecycle.harness';
import { AgentTraceHarness } from '../harness/agent-trace.harness';
import { AgentRuntimeCore, sanitizeToolDefinitions } from '@99agent/runtime-core';
import type {
  AgentRuntimeInput,
  AgentRuntimeModelMessage,
  AgentRuntimeResult,
  AgentRuntimeToolDefinition,
} from '@99agent/runtime-core';
import {
  AgentRuntimePlatformAdapter,
  toToolContextMessages,
} from './agent-runtime-platform.adapter';
import { AgentToolExecutor } from './agent-tool-executor.adapter';
import {
  ContextCheckpointCoordinator,
  ContextProjectionSession,
} from '../context/context-checkpoint-coordinator';
import { resolveContextMaxTokens } from '../context/context-budget-manager';
import type { AgentOperationSession } from '../runtime-state/operation-ledger.store';
import { AgentInvocationTelemetryAdapter } from '../harness/agent-invocation-telemetry.adapter';

/**
 * Agent Loop 执行选项
 */
export interface AgentLoopOptions {
  // 模型配置
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  /** Context Pipeline 输入预算；与 provider 输出 maxTokens 分离。 */
  contextMaxTokens?: number;
  modelConfig?: ModelGatewayRuntimeConfig;

  // 用户配置
  userId?: number;
  /** 已鉴权的 ChatGroup ID，禁止从模型或附加参数取值。 */
  conversationId?: number;
  userRole?: string;
  /** 用户对外 uid，随 MCP 调用方身份透传（modules/mcp/mcp-caller-identity.ts） */
  uid?: string;
  visitorId?: string;
  /** 本轮用户上传的附件（含 fileId），由 PrimitiveToolProvider 放入沙箱 in/<回合>/ */
  attachments?: Array<{ fileId?: string; name?: string; mime?: string; size?: number }>;
  /** 已放入沙箱的附件路径，PrimitiveToolProvider 填写后用于系统提示 */
  sandboxInputs?: string[];
  /** 公开运行标识，固定使用助手消息 cid。内部 DB id 仅由 ChatService 保留为控制句柄。 */
  chatId?: string;
  /** 当前助手消息 cid，用于 trace/tool 与具体 message 绑定。 */
  messageId?: string;

  // 中止控制
  abortController?: AbortController;

  // 进度回调
  onProgress?: (data: {
    type:
      | 'start'
      | 'round_start'
      | 'thinking'
      | 'text'
      | 'tool_call'
      | 'tool_result'
      | 'progress'
      | 'round_phase'
      | 'round_complete'
      | 'done';
    data?: any;
  }) => void;

  // 消息上下文（用于流式更新）
  currentMessage?: UnifiedMessage;
  /** 当前 Agent 运行 ID */
  turnId?: string;
  /** 当前运行接续来源 */
  parentTurnId?: string;
  /** 当前运行开始时间 */
  turnStartedAt?: string;

  // Token 统计
  tokenUsage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    details: any[];
  };

  // 工具费用累加（积分）
  toolCost?: number;

  // 上下文历史与文件引用
  contextBoundary?: import('../../chat/types/context.types').ContextBoundary;
  contextBackfill?: import('../../chat/types/context.types').ContextBackfillSource;
  fileRefMapping?: FileRefMapping;
  /** ChatService 只收集这些上下文输入；最终注入与 manifest 由 AgentLoop 统一生成。 */
  platformPolicy?: string | AgentContextTextInput;
  queuedTurn?: AgentContextQueuedTurnInput | null;

  // 模型附加参数（已解析的 JSON 对象，会合并到 API 调用参数中）
  additionalParams?: Record<string, any>;
  // 用户在前端选择的受控思考强度；由各协议适配器翻译为 provider 参数。
  reasoningEffort?: ModelGatewayReasoningEffort;

  // 接续队列检查：工具轮次结束后可让当前 cid 完成本轮，并交给下一轮用户消息继续。
  shouldHandoffAfterToolRound?: () => boolean;

  /** Service-owned durable execution fence; never copied into ToolExecutionContext. */
  operationSession?: AgentOperationSession;
}

function buildToolHostOptions(options: AgentLoopOptions): Record<string, unknown> {
  return {
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    ...(options.userId !== undefined ? { userId: options.userId } : {}),
    ...(options.userRole ? { userRole: options.userRole, role: options.userRole } : {}),
    ...(options.visitorId ? { visitorId: options.visitorId } : {}),
    ...(options.attachments ? { attachments: options.attachments } : {}),
    ...(options.messageId ? { messageId: options.messageId } : {}),
    ...(options.turnId ? { turnId: options.turnId } : {}),
  };
}

/** 站点未配置 maxToolCallsPerRequest 时的工具调用轮次上限 */
export const DEFAULT_MAX_TOOL_ROUNDS = 25;
/** 站点未配置 modelFirstResponseTimeoutSec 时，等模型第一个事件的上限（秒）；配置值钳制在 10–600 */
export const DEFAULT_MODEL_FIRST_RESPONSE_TIMEOUT_SEC = 120;
/** 回复开始后连续没有任何事件的上限：只为给「一直挂住」封顶，推理阶段可能几分钟没有可见事件 */
export const MODEL_IDLE_TIMEOUT_MS = 600_000;

/**
 * Agent Loop 执行结果
 */
export interface AgentLoopResult {
  success: boolean;
  message: UnifiedMessage;
  finishReason: 'stop' | 'abort' | 'error' | 'length' | 'handoff';
  /** finishReason 表达不了的收尾原因（工具轮次上限、输出达到上限），供宿主区分提示 */
  stopReason?: AgentRuntimeResult['stopReason'];
  error?: string;
  tokenUsage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    details?: any[];
  };
  toolCost?: number;
}

@Injectable()
export class AgentLoopService {
  private readonly traceHarness = new AgentTraceHarness();
  private readonly contextBuilder = new AgentContextBuilder();
  private readonly modelMessageMapper = new ModelMessageMapper();
  private readonly lifecycleHarness = new AgentLoopLifecycleHarness(this.traceHarness);
  private readonly invocationTelemetry = new AgentInvocationTelemetryAdapter();

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly toolProviderRegistry: ToolProviderRegistry,
    private readonly modelsService?: ModelsService,
    private readonly modelGatewayService?: ModelGatewayService,
    @Optional()
    private readonly contextCheckpointCoordinator?: ContextCheckpointCoordinator,
  ) {}

  private async resolveModelRuntimeConfig(
    options: AgentLoopOptions,
  ): Promise<ModelGatewayRuntimeConfig> {
    if (options.modelConfig) {
      return {
        ...options.modelConfig,
        protocol: options.modelConfig.protocol || DEFAULT_MODEL_PROTOCOL,
        additionalParams: options.modelConfig.additionalParams || options.additionalParams,
        reasoningEffort: options.reasoningEffort || options.modelConfig.reasoningEffort,
      };
    }

    const explicitModel = String(options.model || '').trim();
    const explicitApiKey = String(options.apiKey || '').trim();
    const explicitBaseUrl = String(options.baseUrl || '').trim();

    if (explicitModel && explicitApiKey && explicitBaseUrl) {
      return {
        protocol: DEFAULT_MODEL_PROTOCOL,
        apiKey: explicitApiKey,
        baseUrl: explicitBaseUrl,
        model: explicitModel,
        additionalParams: options.additionalParams,
        reasoningEffort: options.reasoningEffort,
        capabilities: deriveCapabilitiesFromMultimodalTypes(undefined),
      };
    }

    let modelInfo =
      explicitModel && this.modelsService
        ? await this.modelsService.getCurrentModelKeyInfo(explicitModel)
        : null;

    if (!modelInfo && this.modelsService) {
      modelInfo = await this.modelsService.getDefaultModelKeyInfo();
    }

    const additionalParams =
      options.additionalParams || parseModelGatewayAdditionalParams(modelInfo?.additionalParams);

    return {
      protocol:
        (modelInfo?.protocol as ModelGatewayRuntimeConfig['protocol']) || DEFAULT_MODEL_PROTOCOL,
      apiKey: explicitApiKey || String(modelInfo?.key || '').trim(),
      baseUrl: explicitBaseUrl || String(modelInfo?.baseUrl || '').trim(),
      model: modelInfo?.model || explicitModel,
      endpointPath: modelInfo?.endpointPath || undefined,
      capabilities:
        modelInfo?.capabilities ||
        deriveCapabilitiesFromMultimodalTypes(modelInfo?.multimodalTypes),
      additionalParams,
      reasoningEffort: options.reasoningEffort,
    };
  }

  private ensureModelGateway(): ModelGatewayService {
    if (!this.modelGatewayService) {
      throw new Error('ModelGatewayService 未初始化');
    }
    return this.modelGatewayService;
  }

  private ensureRunTrace(options: AgentLoopOptions, model?: string): AgentRunTrace {
    return this.traceHarness.ensureRunTrace(options, model);
  }

  private createRoundTrace(
    roundIndex: number,
    messages: ModelMessage[],
    tools: any[],
  ): AgentRoundTrace {
    return this.traceHarness.createRoundTrace(roundIndex, messages, tools);
  }

  private finalizeRunTrace(
    message: UnifiedMessage | undefined,
    options: AgentLoopOptions,
    status: AgentRunTrace['status'],
  ): void {
    this.traceHarness.finalizeRunTrace(message, options, status);
  }

  private withToolTrace(toolResult: any): any {
    return this.traceHarness.withToolTrace(toolResult);
  }
  /**
   * 执行 Agent Loop
   *
   * 流程：前置处理 → Agent Loop → 后置处理
   */
  async execute(
    messages: ModelMessage[],
    options: AgentLoopOptions = {},
  ): Promise<AgentLoopResult> {
    Logger.debug(`[AgentLoop] execute 调用 | messages: ${messages.length}条`, 'AgentLoopService');

    // 初始化 currentMessage
    if (!options.currentMessage) {
      options.currentMessage = {
        role: 'assistant',
        content: '',
        rounds: [],
        model: options.model,
        timestamp: new Date().toISOString(),
      };
    }

    // 初始化工具费用累加器
    if (options.toolCost === undefined) {
      options.toolCost = 0;
    }
    this.ensureRunTrace(options, options.model);

    let toolContext: ToolExecutionContext | undefined;
    try {
      // 1. 前置处理：解析模型配置
      const modelConfig = await this.resolveModelRuntimeConfig(options);
      options.modelConfig = modelConfig;

      // 2. 获取工具定义
      toolContext = {
        input: {
          messages: toToolContextMessages(messages as AgentRuntimeModelMessage[]) as ModelMessage[],
          config: {},
          context: {
            options: buildToolHostOptions(options),
          },
        } as any,
        fileRefMappingStore: new FileRefMappingStore(options.fileRefMapping),
      };
      // 各 Provider 的回合准备（附件放进沙箱等）先于工具定义
      await this.toolProviderRegistry.prepareTurn(toolContext);
      const rawTools = await this.toolProviderRegistry.getAllToolDefinitions(toolContext);

      // 清洗工具名称
      const { sanitized: availableTools, nameMap: sanitizedNameMap } =
        sanitizeToolDefinitions(rawTools);

      // 3. 执行 Agent Loop
      const loopResult = await this.runAgentLoop(
        messages,
        availableTools,
        toolContext,
        sanitizedNameMap,
        options,
      );

      // 4. 后置处理
      return loopResult;
    } catch (error) {
      Logger.error(`Agent Loop 执行失败: ${error.message}`, 'AgentLoopService');
      this.finalizeRunTrace(options.currentMessage, options, 'error');
      return {
        success: false,
        message: options.currentMessage!,
        finishReason: 'error',
        error: error.message,
        tokenUsage: options.tokenUsage
          ? {
              totalInputTokens: options.tokenUsage.totalInputTokens,
              totalOutputTokens: options.tokenUsage.totalOutputTokens,
              totalTokens: options.tokenUsage.totalTokens,
            }
          : undefined,
        toolCost: options.toolCost,
      };
    } finally {
      if (toolContext) await this.toolProviderRegistry.finishTurn(toolContext);
    }
  }

  /**
   * 核心循环：Agent Loop
   */
  private async runAgentLoop(
    messages: ModelMessage[],
    tools: any[],
    toolContext: ToolExecutionContext,
    sanitizedNameMap: Map<string, string>,
    options: AgentLoopOptions,
  ): Promise<AgentLoopResult> {
    // 获取模型配置
    const agentConfig = (await this.globalConfigService.getConfigs([
      'maxToolCallsPerRequest',
      'modelFirstResponseTimeoutSec',
    ])) as Record<string, unknown> | undefined;

    const modelConfig = await this.resolveModelRuntimeConfig(options);
    const { apiKey: userApiKey, baseUrl: userBaseUrl, model } = modelConfig;
    const runTrace = this.ensureRunTrace(options, model);

    if (!userApiKey || !userBaseUrl) {
      const message: UnifiedMessage = {
        role: 'assistant',
        content: '系统尚未配置 AI 模型的 API 密钥或接口地址，请管理员在后台完成模型配置',
        rounds: [],
        model: '',
        timestamp: new Date().toISOString(),
        trace: runTrace,
      };
      this.finalizeRunTrace(message, options, 'error');
      return {
        success: false,
        message,
        finishReason: 'error',
        error: 'Missing API key or base URL configuration',
      };
    }

    // 添加 system prompt：内核基础提示 + 各 Provider 贡献的段落（沙箱布局、技能、MCP）
    if (messages[0]?.role !== 'system') {
      messages.unshift({
        role: 'system',
        content: await this.buildSystemPrompt(toolContext),
      });
    }

    const contextWindowTokens =
      options.contextMaxTokens ||
      modelConfig.capabilities?.maxInputTokens ||
      (modelConfig as any).maxModelTokens;
    const checkpointSession = this.createContextProjectionSession(
      modelConfig,
      contextWindowTokens,
      options,
    );
    if (checkpointSession) {
      messages = await checkpointSession.prepareInitial(messages);
    }

    const contextResult = this.contextBuilder.build({
      messages,
      platformPolicy: options.platformPolicy,
      fileRefMapping: options.fileRefMapping,
      queuedTurn: options.queuedTurn,
      maxTokens: contextWindowTokens,
      recentHistoryTokenBudget: resolveContextMaxTokens(contextWindowTokens),
    });
    messages = this.modelMessageMapper.toModelMessages(contextResult);
    toolContext.input.messages = messages;
    if (runTrace) {
      (runTrace as any).contextManifest = contextResult.manifest;
    }
    if (contextResult.warnings.length > 0) {
      Logger.debug(
        `[AgentLoop] Context Pipeline warnings: ${contextResult.warnings.join('; ')}`,
        'AgentLoopService',
      );
    }

    const configuredMaxRounds = Number(agentConfig?.maxToolCallsPerRequest);
    const firstResponseSec = Math.floor(Number(agentConfig?.modelFirstResponseTimeoutSec));
    const maxRounds =
      Number.isInteger(configuredMaxRounds) && configuredMaxRounds >= 1
        ? Math.min(configuredMaxRounds, 50)
        : DEFAULT_MAX_TOOL_ROUNDS;
    let platformAdapter!: AgentRuntimePlatformAdapter;
    const toolExecutor = this.createToolExecutor({
      onStart: start => platformAdapter.startExternal(start),
      onTerminal: terminal => platformAdapter.registerExternalTerminal(terminal),
    });
    platformAdapter = new AgentRuntimePlatformAdapter({
      model,
      modelConfig,
      options,
      currentMessage: options.currentMessage!,
      toolContext,
      sanitizedNameMap,
      modelGateway: this.ensureModelGateway(),
      toolExecutor,
      prepareMedia: runtimeMessages => this.convertMediaUrlsToBase64(runtimeMessages),
      createRoundTrace: (roundIndex, runtimeMessages, runtimeTools) =>
        this.createRoundTrace(roundIndex, runtimeMessages, runtimeTools),
      summarizeModelOutput: content => this.traceHarness.summarizeModelOutput(content),
      contextProjection: checkpointSession,
      operationSession: options.operationSession,
      telemetry: this.invocationTelemetry,
      maxRounds,
    });
    const runtimeCore = new AgentRuntimeCore(platformAdapter.ports);
    const runtimeInput: AgentRuntimeInput = {
      model,
      messages: messages as AgentRuntimeModelMessage[],
      tools: tools as AgentRuntimeToolDefinition[],
      maxRounds,
      maxTokens: options.maxTokens,
      contextWindowTokens,
      firstEventTimeoutMs:
        (firstResponseSec > 0
          ? Math.min(Math.max(firstResponseSec, 10), 600)
          : DEFAULT_MODEL_FIRST_RESPONSE_TIMEOUT_SEC) * 1000,
      idleTimeoutMs: MODEL_IDLE_TIMEOUT_MS,
      signal: options.abortController?.signal,
      invocation: this.createRootInvocation(options, runTrace.traceId),
    };
    const runtimeResult: AgentRuntimeResult = await runtimeCore.run(runtimeInput);
    toolContext.input.messages = toToolContextMessages(runtimeResult.messages) as ModelMessage[];

    const terminalStatus =
      runtimeResult.finishReason === 'error'
        ? 'error'
        : runtimeResult.finishReason === 'abort'
          ? 'aborted'
          : 'success';

    return this.lifecycleHarness.finalizeRun({
      message: options.currentMessage,
      options,
      traceStatus: terminalStatus,
      finishReason: runtimeResult.finishReason,
      ...(runtimeResult.stopReason ? { stopReason: runtimeResult.stopReason } : {}),
      success: runtimeResult.success,
      doneData: runtimeResult.doneData,
      error: runtimeResult.error,
      includeCacheMetrics: runtimeResult.includeCacheMetrics,
      includeTokenDetails: runtimeResult.includeTokenDetails,
    });
  }

  private createRootInvocation(
    options: AgentLoopOptions,
    traceId: string,
  ): NonNullable<AgentRuntimeInput['invocation']> {
    const operationId =
      options.operationSession?.identity?.operationId ||
      `ephemeral:${String(options.turnId || options.messageId || 'turn')}`;
    const turnId = String(
      options.operationSession?.identity?.turnId || options.turnId || 'ephemeral:turn',
    );
    const generation = options.operationSession?.fence?.generation ?? 0;
    return {
      operationId,
      turnId,
      generation,
      invocationId: `${operationId}:g${generation}:run`,
      traceId,
      signal: options.abortController?.signal,
    };
  }

  private createContextProjectionSession(
    modelConfig: ModelGatewayRuntimeConfig,
    contextWindowTokens: number | undefined,
    options: AgentLoopOptions,
  ): ContextProjectionSession | undefined {
    if (!this.contextCheckpointCoordinator) return undefined;
    const owner =
      options.userRole === 'visitor' && options.visitorId
        ? { ownerType: 'visitor' as const, ownerKey: String(options.visitorId) }
        : Number.isInteger(Number(options.userId)) && Number(options.userId) > 0
          ? { ownerType: 'user' as const, ownerKey: String(options.userId) }
          : undefined;
    return this.contextCheckpointCoordinator.createSession({
      modelConfig,
      contextWindowTokens,
      contextBoundary: options.contextBoundary,
      contextBackfill: options.contextBackfill,
      owner,
      signal: options.abortController?.signal,
      onCompactionUsage: usage => {
        if (!options.tokenUsage) return;
        const inputTokens = Math.max(0, Number(usage.inputTokens) || 0);
        const outputTokens = Math.max(0, Number(usage.outputTokens) || 0);
        const totalTokens = Math.max(inputTokens + outputTokens, Number(usage.totalTokens) || 0);
        options.tokenUsage.totalInputTokens += inputTokens;
        options.tokenUsage.totalOutputTokens += outputTokens;
        options.tokenUsage.totalTokens += totalTokens;
        options.tokenUsage.details.push({
          nodeId: 'context-compaction',
          nodeType: 'context-compaction',
          inputTokens,
          outputTokens,
          totalTokens,
          cacheHitTokens: Math.max(0, Number(usage.cacheHitTokens) || 0),
          cacheMissTokens: Math.max(0, Number(usage.cacheMissTokens) || 0),
          description: 'Context checkpoint compaction',
          timestamp: new Date().toISOString(),
        });
      },
    });
  }

  private createToolExecutor(
    callbacks: Pick<
      ConstructorParameters<typeof AgentToolExecutor>[0],
      'onStart' | 'onTerminal'
    > = {},
  ): AgentToolExecutor {
    return new AgentToolExecutor({
      toolProviderRegistry: this.toolProviderRegistry,
      resolveToolCost: (toolName, toolType, args) => this.getToolCost(toolName, toolType, args),
      withToolTrace: result => this.withToolTrace(result),
      ...callbacks,
    });
  }

  /**
   * 将消息中的多媒体 URL 转为 base64（图片/视频用 dataUri，音频用 base64+format）
   * 只处理 http/https 开头的 URL，已经是 data: 或 base64 的跳过
   */
  private async convertMediaUrlsToBase64(messages: ModelMessage[]): Promise<ModelMessage[]> {
    const tasks: Promise<void>[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') continue;

      const parts: any[] = Array.isArray(msg.content) ? msg.content : [];
      for (const part of parts) {
        // 图片
        if (part.type === 'image_url' && part.image_url?.url?.startsWith('http')) {
          const idx = parts.indexOf(part);
          tasks.push(
            urlToBase64(part.image_url.url, 30000)
              .then(({ dataUri }) => {
                parts[idx] = { ...part, image_url: { url: dataUri } };
              })
              .catch(error => {
                Logger.warn(
                  `图片 URL 转 base64 失败: ${error?.message || '未知错误'}`,
                  'AgentLoopService',
                );
                throw error;
              }),
          );
        }
        // 视频
        if (part.type === 'video_url' && part.video_url?.url?.startsWith('http')) {
          const idx = parts.indexOf(part);
          tasks.push(
            urlToBase64(part.video_url.url, 30000)
              .then(({ dataUri }) => {
                parts[idx] = { ...part, video_url: { url: dataUri } };
              })
              .catch(error => {
                Logger.warn(
                  `视频 URL 转 base64 失败: ${error?.message || '未知错误'}`,
                  'AgentLoopService',
                );
                throw error;
              }),
          );
        }
        // 音频
        if (part.type === 'input_audio' && part.input_audio?.data?.startsWith('http')) {
          const idx = parts.indexOf(part);
          tasks.push(
            urlToBase64(part.input_audio.data, 30000)
              .then(({ base64, mimeType }) => {
                parts[idx] = {
                  ...part,
                  input_audio: { data: base64, format: mimeTypeToFormat(mimeType) },
                };
              })
              .catch(error => {
                Logger.warn(
                  `音频 URL 转 base64 失败: ${error?.message || '未知错误'}`,
                  'AgentLoopService',
                );
                throw error;
              }),
          );
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    return messages;
  }

  /**
   * 系统提示：内核基础提示 + 各 Provider 贡献的段落（沙箱布局、技能、MCP）
   */
  private async buildSystemPrompt(toolContext: ToolExecutionContext): Promise<string> {
    const sections = await this.toolProviderRegistry.collectSystemPromptSections(toolContext);
    return buildKernelSystemPrompt({ sections });
  }

  /**
   * 工具费用（积分）：由 Provider 声明，缺省 0
   */
  private async getToolCost(toolName: string, _toolType: string, args?: any): Promise<number> {
    return this.toolProviderRegistry.getToolCost(toolName, args);
  }
}
