import { AgentEvent } from '@99agent/contracts';
import { StreamEmitter } from './stream-emitter.interface';
import { WorkflowProcessManager } from '../workflowManager.service';
import type { WorkflowPublisherFence } from '../workflowManager.service';

/** 文本增量合并窗口（ms）：窗口内同源 delta 合并为一个事件再出站 */
const DELTA_FLUSH_INTERVAL_MS = 25;
/** 单次合并的最大字符数，超过立即出站，避免单事件过大 */
const DELTA_FLUSH_MAX_CHARS = 2048;

/** 可合并的文本增量事件（delta 必有、未携带全量 content） */
type CoalescableDeltaEvent = Extract<AgentEvent, { type: 'message.delta' | 'reasoning.delta' }> & {
  data: { delta: string };
};

function isCoalescableDelta(event: AgentEvent): event is CoalescableDeltaEvent {
  if (event.type !== 'message.delta' && event.type !== 'reasoning.delta') return false;
  return typeof event.data.delta === 'string' && event.data.content === undefined;
}

function coalesceKey(event: AgentEvent): string {
  return [event.type, event.messageId || '', event.turnId || '', event.roundId || ''].join('|');
}

/**
 * 出站事件包装器：
 * 1. 给每个事件赋工作流内单调 seq 并写入补发缓冲（经 WorkflowProcessManager）；
 * 2. 合并相邻的同源文本增量（message.delta / reasoning.delta），降低包速率。
 *
 * 顺序保证：任何非 delta 事件出站前都会先冲刷待合并的 delta，事件相对顺序不变。
 */
export class SequencedEmitter implements StreamEmitter {
  private pendingDelta: { key: string; event: CoalescableDeltaEvent; delta: string } | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly publisherFence: WorkflowPublisherFence | null;

  constructor(
    private readonly inner: StreamEmitter,
    private readonly chatId: number,
    private readonly workflowManager: WorkflowProcessManager,
  ) {
    this.publisherFence = this.workflowManager.capturePublisherFence(this.chatId);
  }

  emit(event: AgentEvent): void {
    if (!isCoalescableDelta(event)) {
      this.flushPendingDelta();
      this.emitNow(event);
      return;
    }

    const key = coalesceKey(event);
    if (this.pendingDelta && this.pendingDelta.key !== key) {
      this.flushPendingDelta();
    }

    if (this.pendingDelta) {
      this.pendingDelta.event = event;
      this.pendingDelta.delta += event.data.delta;
    } else {
      this.pendingDelta = { key, event, delta: event.data.delta };
    }

    if (this.pendingDelta.delta.length >= DELTA_FLUSH_MAX_CHARS) {
      this.flushPendingDelta();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushPendingDelta(), DELTA_FLUSH_INTERVAL_MS);
      // 不阻塞进程退出
      this.flushTimer.unref?.();
    }
  }

  /** 立即冲刷待合并的增量（工作流收尾时调用，避免残留） */
  flushPendingDelta(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.pendingDelta) return;

    const { event, delta } = this.pendingDelta;
    this.pendingDelta = null;
    this.emitNow({ ...event, data: { ...event.data, delta } });
  }

  private emitNow(event: AgentEvent): void {
    if (!this.publisherFence) return;
    const stamped = this.workflowManager.stampOutboundEvent(
      this.chatId,
      event,
      this.publisherFence,
    );
    if (stamped) this.inner.emit(stamped);
  }
}
