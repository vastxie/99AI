import type {
  AgentFinishReason,
  AgentSnapshotMessageWire,
  AgentTurnWireState,
  AgentTurnWireStatus,
} from './envelope';
import type { UsageUpdateEventData } from './agent-events';

/** 回合结算结果：金额由计费实现计算，summary 是实现下发的账户摘要（对内核与协议不透明） */
export interface BillingUpdateEventData {
  charged: number;
  summary: unknown;
}

export interface SnapshotSyncEventData {
  message?: AgentSnapshotMessageWire | string;
  content?: string;
  thinking?: string;
  reason?: 'round_complete' | 'workflow_complete' | 'resync';
  status?: string | number | null;
  turn?: AgentTurnWireState;
  turnStatus?: AgentTurnWireStatus;
  /** Optional reducer checkpoint; absent on older producers. */
  usage?: UsageUpdateEventData;
  /** Required for lossless terminal checkpoints such as length and handoff. */
  finishReason?: AgentFinishReason;
}

export interface PlatformEventDataMap {
  'billing.update': BillingUpdateEventData;
  'snapshot.sync': SnapshotSyncEventData;
}

export type PlatformEventType = keyof PlatformEventDataMap;

export const PLATFORM_EVENT_TYPES = [
  'billing.update',
  'snapshot.sync',
] as const satisfies readonly PlatformEventType[];
