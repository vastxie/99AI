/**
 * 统一消息结构类型定义
 * 端到端统一：流式输出(SSE) → 存储 → 前端渲染 使用同一套JSON结构
 *
 * 新架构：使用 rounds 结构存储多轮工具调用
 */

import type { AgentTurnStopReason } from '@99agent/contracts';
import type {
  AgentToolCallTrace,
  ToolProjectionDisplay,
  ToolProjectionInternal,
  ToolProjectionModel,
} from '../tool-result-payload';

/**
 * 内容部分类型（多模态）
 */
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'image'; url: string }
  | { type: 'file'; url: string; name: string }
  | { type: 'audio'; url: string }
  | { type: 'video'; url: string };

/**
 * 工具调用记录
 */
export interface ToolCall {
  id: string;
  /** API-safe 工具名，用于重建 LLM tool_calls.function.name */
  toolName?: string;
  /** 前端展示名，通常为中文或带业务语义的动态名称 */
  displayName?: string;
  name: string;
  arguments?: Record<string, any>;
  inputSummary?: string;
  status: 'loading' | 'success' | 'error';
  duration?: number;
  type?: string;
  display?: ToolProjectionDisplay;
  model?: ToolProjectionModel;
  internal?: ToolProjectionInternal;
  output?: {
    thought?: string;
    details?: any;
    error?: string;
    publicError?: string;
    inputSummary?: string;
    content?: string;
    summary?: string;
    message?: string;
    title?: string;
    fileType?: string;
    previewContent?: string;
    previewContentType?: string;
    downloadUrl?: string;
    filePreview?: any;
    files?: any[];
  };
}

export interface AgentRoundTrace {
  roundIndex: number;
  startedAt: string;
  endedAt?: string;
  status: 'success' | 'error' | 'skipped';
  thinkingMs?: number;
  modelInputSummary?: string;
  modelOutputSummary?: string;
  toolCalls: AgentToolCallTrace[];
}

export interface AgentRunTrace {
  traceId: string;
  /** 当前助手消息 cid。 */
  cid?: string;
  /** 当前助手消息 cid，供新协议明确绑定 trace 与 message。 */
  messageId?: string;
  /** 当前 Agent turn ID。 */
  turnId?: string;
  userUid?: string;
  model?: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'success' | 'error' | 'aborted';
  rounds: AgentRoundTrace[];
  contextManifest?: {
    blocks: Array<{
      id: string;
      type: string;
      source?: { module: string; id?: string };
      estimatedTokens: number;
      included: boolean;
      truncated: boolean;
      reason?: string;
      warnings?: string[];
    }>;
    totalEstimatedTokens: number;
    truncated: boolean;
    warnings: string[];
  };
  summary?: {
    roundCount: number;
    toolCallCount: number;
    totalDurationMs: number;
    totalTokens?: number;
    toolCost?: number;
  };
}

export type AgentTurnStatus = 'running' | 'completed' | 'interrupted' | 'failed';

export interface AgentTurnState {
  id: string;
  status: AgentTurnStatus;
  parentTurnId?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  /** status 为 interrupted 时说明是谁收的尾：缺省表示用户或宿主主动停止 */
  stopReason?: AgentTurnStopReason;
}

/**
 * Token 使用量
 */
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/**
 * 用户插话记录（Agent 运行中的补充输入）
 */
export interface UserInterjection {
  content: string;
  timestamp: string;
}

/**
 * 单轮对话结构
 */
export interface Round {
  text: string | null;
  thinking: string | null;
  /** 调用了普通工具的轮次标为 process，文字是过程话术，不算回答（见 contracts agent-reply） */
  phase?: 'process';
  /** thinking 流从开始到正文/工具输出前的累计耗时，单位 ms */
  thinkingDuration?: number;
  toolCalls: ToolCall[];
  completed?: boolean;
  /**
   * 扩展字段：存储消息各部分（文本、图片、文件等）
   * 用于前端渲染和后端构建上下文
   */
  parts?: MessagePart[];
  /** 用户插话列表（round 运行期间的补充输入） */
  interjections?: UserInterjection[];
  /** 服务端轻量运行追踪摘要，前端投影默认剥离 */
  trace?: AgentRoundTrace;
}

/**
 * 统一消息结构
 */
export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  rounds: Round[];
  model?: string;
  tokens?: TokenUsage;
  timestamp?: string;
  /** 当前助手消息对应的一次 Agent 运行 */
  turn?: AgentTurnState;
  /** 服务端轻量运行追踪摘要，前端投影默认剥离 */
  trace?: AgentRunTrace;
}

/**
 * 从存储的消息构建传给模型的消息数组
 */
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}
