import type { ModelMessage } from '../../chatLog/types/message.types';
import type { FileRefMapping } from '../../fileAsset/file-refs';
import type { AgentContextManifest } from './agent-context-manifest';

export type AgentContextBlockType =
  | 'system_identity'
  | 'platform_policy'
  | 'current_user_request'
  | 'explicit_file_reference'
  | 'queued_turn'
  | 'recent_history'
  | 'previous_tool_result';

export type AgentContextVisibility = 'model_only' | 'trace_summary' | 'public_summary';

export interface AgentContextBlockSource {
  module: string;
  id?: string;
}

export interface AgentContextBlockMetadata {
  modelMessages?: ModelMessage[];
  injectAs?: 'system' | 'user_context' | 'message_sequence' | 'manifest_only';
  label?: string;
  sequence?: number;
}

export interface AgentContextBlock {
  id: string;
  type: AgentContextBlockType;
  priority: number;
  tokenBudget?: number;
  content: string | unknown[];
  visibility: AgentContextVisibility;
  source?: AgentContextBlockSource;
  estimatedTokens?: number;
  included?: boolean;
  truncated?: boolean;
  reason?: string;
  warnings?: string[];
  metadata?: AgentContextBlockMetadata;
}

export interface AgentContextTextInput {
  content?: string | null;
  warning?: string;
  sourceId?: string;
}

export interface AgentContextQueuedTurnInput {
  parentTurnId?: string;
  prompt?: string;
  channel?: string;
  createdAt?: number | string | Date;
}

export interface AgentContextBuilderInput {
  messages?: ModelMessage[];
  platformPolicy?: string | AgentContextTextInput;
  fileRefMapping?: FileRefMapping;
  queuedTurn?: AgentContextQueuedTurnInput | null;
  previousToolResults?: unknown[];
  maxTokens?: number;
  /** 已在运行时按原子组投影时，允许 recent_history 使用完整剩余预算。 */
  recentHistoryTokenBudget?: number;
}

export interface AgentContextBuildResult {
  blocks: AgentContextBlock[];
  manifest: AgentContextManifest;
  estimatedTokens: number;
  warnings: string[];
}

export const AGENT_CONTEXT_BLOCK_ORDER: AgentContextBlockType[] = [
  'system_identity',
  'platform_policy',
  'current_user_request',
  'explicit_file_reference',
  'queued_turn',
  'recent_history',
  'previous_tool_result',
];

export const AGENT_CONTEXT_BLOCK_PRIORITY: Record<AgentContextBlockType, number> =
  AGENT_CONTEXT_BLOCK_ORDER.reduce(
    (acc, type, index) => {
      acc[type] = AGENT_CONTEXT_BLOCK_ORDER.length - index;
      return acc;
    },
    {} as Record<AgentContextBlockType, number>,
  );

export const AGENT_CONTEXT_DEFAULT_TOKEN_BUDGET: Record<AgentContextBlockType, number> = {
  system_identity: 2200,
  platform_policy: 1200,
  current_user_request: 8000,
  explicit_file_reference: 1400,
  queued_turn: 900,
  recent_history: 7000,
  previous_tool_result: 1800,
};
