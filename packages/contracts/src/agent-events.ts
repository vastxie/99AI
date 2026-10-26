import type {
  AgentInitialMessagesWire,
  AgentFinishReason,
  AgentTurnWireState,
  AgentTurnWireStatus,
} from './envelope';

export interface AgentLifecycleEventData {
  finishReason?: AgentFinishReason;
  message?: string;
  initialMessages?: AgentInitialMessagesWire;
  /** 计费实现下发的账户摘要，对协议不透明 */
  billing?: unknown;
  cid?: string;
  turn?: AgentTurnWireState;
  turnStatus?: AgentTurnWireStatus;
  /**
   * agent.start 专用：发起这一串回合的提交（chat:start 的 submissionId）。
   * 用户的每个页签都会收到 agent.start，发送方只认带着自己提交号的那条
   */
  submissionId?: string;
}

export interface TurnLifecycleEventData {
  turn?: AgentTurnWireState;
  turnStatus?: AgentTurnWireStatus;
  finishReason?: AgentFinishReason;
  nextAction?: 'none' | 'start_queued_turn';
  message?: string;
  queuedPrompt?: string;
  parentTurnId?: string;
  conversationGid?: string;
}

export interface MessageDeltaEventData {
  delta?: string;
  content?: string;
}

export interface MessagePhaseEventData {
  /**
   * process：这一轮调用了工具，文字是过程话术，不算回答；
   * answer：撤销此前对这一轮的 process 判定（按完整的工具调用校正）。
   */
  phase: 'process' | 'answer';
}

export interface ToolAssetEventData {
  fileId: string;
  role: 'final' | 'intermediate' | 'preview' | 'source';
  displayName: string;
  mimeType?: string;
  size?: number;
}

export interface ToolDisplayEventData {
  title?: string;
  summary?: string;
  markdown?: string;
  json?: unknown;
}

export interface ToolLifecycleEventData {
  name?: string;
  displayName?: string;
  type?: string;
  status?: 'queued' | 'running' | 'success' | 'error' | 'skipped';
  inputSummary?: string;
  outputHint?: unknown;
  progress?: {
    current?: number;
    total?: number;
    percent?: number;
    label?: string;
  };
  display?: ToolDisplayEventData;
  assets?: ToolAssetEventData[];
  output?: unknown;
  durationMs?: number;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };
}

export interface UsageUpdateEventData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentErrorEventData {
  code: string;
  message: string;
  retryable?: boolean;
  /**
   * 发起失败（chat:start 的预检、启动）时带上那次提交的 submissionId：
   * 接续轮的错误也会广播到用户的其它页签，正在等回执的页签只认自己的
   */
  submissionId?: string;
  /**
   * 接续轮（排队的补充要求）推出的错误都带上它要接的父回合（没能开始、预检拒绝、开始后出错）：
   * 恢复的页签不知道提交号，在接续窗口里按父回合认自己的
   */
  parentTurnId?: string;
  turn?: AgentTurnWireState;
  turnStatus?: AgentTurnWireStatus;
}

export interface AgentKernelEventDataMap {
  'agent.start': AgentLifecycleEventData;
  'agent.end': AgentLifecycleEventData;
  'agent.error': AgentErrorEventData;
  'turn.start': TurnLifecycleEventData;
  'turn.end': TurnLifecycleEventData;
  'message.start': MessageDeltaEventData;
  'message.delta': MessageDeltaEventData;
  'message.end': MessageDeltaEventData;
  'message.phase': MessagePhaseEventData;
  'reasoning.delta': MessageDeltaEventData;
  'tool.start': ToolLifecycleEventData;
  'tool.update': ToolLifecycleEventData;
  'tool.end': ToolLifecycleEventData;
  'usage.update': UsageUpdateEventData;
}

export type AgentKernelEventType = keyof AgentKernelEventDataMap;

export const AGENT_KERNEL_EVENT_TYPES = [
  'agent.start',
  'agent.end',
  'agent.error',
  'turn.start',
  'turn.end',
  'message.start',
  'message.delta',
  'message.end',
  'message.phase',
  'reasoning.delta',
  'tool.start',
  'tool.update',
  'tool.end',
  'usage.update',
] as const satisfies readonly AgentKernelEventType[];
