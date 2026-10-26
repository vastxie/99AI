/**
 * 统一工具提供者接口
 * 所有工具类型通过此接口注册到 ToolProviderRegistry
 */
import type { FileRefMappingStore } from '../../fileAsset/file-refs';
import type {
  ToolDisplayPayload,
  ToolProjectionModel,
  ToolProjectionInternal,
} from '../../chatLog/tool-result-payload/types';

/**
 * 工具定义（OpenAI Function Calling 格式）
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  id: string;
  type: string; // 'search' | 'tool' | 'error'
  /** API-safe 工具名，用于后续历史重放 */
  toolName?: string;
  /** 前端展示名 */
  displayName?: string;
  name: string;
  status: 'success' | 'error' | 'loading';
  input: unknown;
  output: ToolDisplayPayload;
  /** 面向模型继续推理的工具观察内容，不下发前端 */
  model?: ToolProjectionModel;
  /** 面向前端展示的安全投影 */
  display?: ToolDisplayPayload;
  /** 后端内部投影，只用于持久化、trace 和安全诊断，不下发前端 */
  internal?: ToolProjectionInternal;
  /** 后端生成的输入摘要，替代 raw arguments 下发前端 */
  inputSummary?: string;
  /** 最终产物提示，仅用于前端 loading 占位展示 */
  outputHint?: {
    type: 'image' | 'video' | 'file' | 'audio' | 'document';
    aspectRatio?: string;
  };
  time: number;
  duration?: number;
  estimatedProgress?: {
    percent: number;
    startedAt: number;
    elapsedMs: number;
    estimatedTotalMs: number;
    key: string;
  };
}

/**
 * Provider 已越过工具执行边界，但调用方无法确认最终效果。
 * 只允许宿主 Provider/Registry 构造；固定文案避免将原始异常注入模型、日志或持久层。
 */
export class ToolOutcomeUnknownError extends Error {
  constructor() {
    super('工具执行结果不确定，已停止当前运行以避免重复操作。');
    this.name = 'ToolOutcomeUnknownError';
  }
}

/**
 * 工具执行上下文
 */
export interface AgentToolExecutionInput {
  messages: any[];
  config: Record<string, any>;
  context: {
    options?: Record<string, any>;
    currentMessage?: any;
    onProgress?: (data: any) => void;
    [key: string]: any;
  };
  globalConfig?: Record<string, any>;
  dynamicParams?: Record<string, any>;
}

export interface ToolExecutionContext {
  input: AgentToolExecutionInput;
  /** Platform-only caller cancellation; never serialized into model/tool arguments. */
  signal?: AbortSignal;
  /** Service-owned per-turn allocator; never serialized into model input. */
  fileRefMappingStore?: FileRefMappingStore;
  toolCallId?: string; // 原始工具调用ID (来自模型的 toolCalls[i].id)
}

export type ToolReplayPolicy = 'safe' | 'never';

/** Provider 对当前已验证调用给出的服务端重放声明；模型参数不能覆盖。 */
export interface ToolReplayIntent {
  policy: ToolReplayPolicy;
  /** 仅 safe 工具提供，必须是已规范化、可严格重验的最小参数。 */
  payload?: Record<string, unknown>;
}

/**
 * 工具提供者接口
 */
export interface ToolProvider {
  /**
   * 返回此提供者支持的所有工具定义
   */
  getToolDefinitions(context?: ToolExecutionContext): Promise<ToolDefinition[]>;

  /**
   * 判断此提供者是否能处理指定工具
   */
  canHandle(toolName: string): boolean;

  /**
   * 执行指定工具
   */
  execute(toolName: string, args: unknown, context: ToolExecutionContext): Promise<ToolResult>;

  /** 可选：按具体工具覆盖注册时的分类（如 creative / search） */
  getCategory?(toolName: string): string | undefined;
  /** 可选：按具体工具给出最终产物提示，用于前端生成中占位 */
  getOutputHint?(toolName: string): { type: string; aspectRatio?: string } | undefined;
  /** 可选：按具体工具给出运行时标识（sandbox / mcp 等） */
  getRuntime?(toolName: string): string | undefined;
  /** 可选：按具体工具与参数给出展示名称 */
  getDisplayName?(toolName: string, args?: unknown): string | undefined;
  /** 可选：按具体工具给出积分费用；缺省 0 */
  getToolCost?(toolName: string, args?: unknown): Promise<number> | number;
  /** 缺省 never；恢复仍会再次调用当前 Provider 求交集。 */
  getReplayIntent?(toolName: string, args: unknown): ToolReplayIntent;
  /** 可选：每轮运行开始前的准备（例如把用户附件放进沙箱） */
  prepareTurn?(context: ToolExecutionContext): Promise<void>;
  /** 成功、失败、取消都释放宿主整轮资源。 */
  finishTurn?(context: ToolExecutionContext): Promise<void>;
  /** 可选：贡献一段系统提示（例如工作区布局、可用技能） */
  describeForSystemPrompt?(context: ToolExecutionContext): Promise<string | undefined>;
}
