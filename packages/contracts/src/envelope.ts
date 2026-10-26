export type AgentFinishReason = 'stop' | 'abort' | 'error' | 'length' | 'handoff';

export type AgentTurnWireStatus = 'running' | 'completed' | 'interrupted' | 'failed';

/**
 * 回合收尾的具体原因；只在 finishReason 与 turn 状态已经表达不了区别时补充，
 * 消费者按需展示，未识别的值忽略：
 * - max_rounds：工具轮次用完，turn 状态 interrupted；
 * - length：模型单次输出达到上限，turn 状态 completed，回复可能没写完。
 */
export type AgentTurnStopReason = 'max_rounds' | 'length';

export interface AgentTurnWireState {
  id: string;
  status: AgentTurnWireStatus;
  parentTurnId?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  /** 收尾原因：interrupted 缺省表示用户或宿主主动停止；completed 带 length 表示回复可能不完整 */
  stopReason?: AgentTurnStopReason;
}

/**
 * `agent.start` 公开投影中的初始消息。这里只声明消费者实际依赖的线字段，
 * 不引用 Service message 类型或 Chat namespace。
 */
export interface AgentInitialMessageWire {
  content: string;
  cid?: string;
  status?: number;
  model?: string;
  modelName?: string;
  role?: 'user' | 'assistant';
  createdAt?: string;
  startedAt?: string;
  turnId?: string;
  taskId?: string;
  conversationGid?: string;
  message?: string;
  [key: string]: unknown;
}

/** `agent.start` 的双消息边界；真实 producer 总是同时提交 user/assistant。 */
export interface AgentInitialMessagesWire {
  user: AgentInitialMessageWire;
  assistant: AgentInitialMessageWire;
}

/** Snapshot 只共享公开消息骨架；round/token 等业务细节仍由消费端归约。 */
export interface AgentSnapshotMessageWire {
  role: 'user' | 'assistant' | 'system';
  content: string;
  rounds: unknown[];
  model?: string;
  timestamp?: string;
  turn?: AgentTurnWireState;
}

/** 所有公开 Agent Event 共享的线上信封；序号字段语义彼此独立。 */
export interface AgentEventEnvelope {
  seq?: number;
  workflowSeq?: number;
  taskEventSeq?: number;
  chatId: string;
  messageId?: string;
  taskId?: string;
  conversationGid?: string;
  turnId?: string;
  roundId?: string;
  toolCallId?: string;
  timestamp: number;
}
