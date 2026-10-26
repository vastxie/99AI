import type { AgentKernelEventDataMap } from './agent-events';
import type { AgentEventEnvelope } from './envelope';
import type { PlatformEventDataMap } from './platform-events';

export * from './agent-events';
export * from './agent-event-reducer';
export * from './agent-reply';
export * from './envelope';
export * from './platform-events';
export * from './vertical-manifest';

export type AgentEventDataMap = AgentKernelEventDataMap & PlatformEventDataMap;

export type AgentEventType = keyof AgentEventDataMap;

/** 保持现有线上词表顺序；分入口数组不参与该顺序。 */
export const AGENT_EVENT_TYPES = [
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
  'billing.update',
  'snapshot.sync',
] as const satisfies readonly AgentEventType[];

/** message.phase 只对某一轮生效，信封上的 roundId 必填；其余事件沿用可选 roundId */
type AgentEventRoundRequirement<K extends AgentEventType> = K extends 'message.phase'
  ? { roundId: string }
  : Record<never, never>;

export type AgentEventOf<K extends AgentEventType> = AgentEventEnvelope &
  AgentEventRoundRequirement<K> & {
    type: K;
    data: AgentEventDataMap[K];
  };

export type AgentEvent = {
  [K in AgentEventType]: AgentEventOf<K>;
}[AgentEventType];

export type AgentEventData = AgentEventDataMap[AgentEventType];
