import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AgentContinuationClaim,
  AgentContinuationParentBinding,
  AgentContinuationPayload,
  assertAgentContinuationParentBinding,
} from '../agent/runtime-state/continuation-inbox.types';
import {
  AgentContinuationEnqueueResult,
  AgentContinuationStore,
  AgentOperationCancelResult,
} from '../agent/runtime-state/continuation-inbox.store';

interface ContinuationHint {
  binding: AgentContinuationParentBinding;
  payload: AgentContinuationPayload;
  sequence: number;
  createdAt: number;
  expiresAt: number;
  clientIp?: string;
  sourceSocketId?: string;
}

export interface QueuedConversationTurn extends AgentContinuationClaim {
  channel: 'web';
  clientIp?: string;
  sourceSocketId?: string;
}

/**
 * Durable follow-up inbox 的 Chat facade。
 * 数据库是唯一真相；Map 只为当前进程的同步 handoff 检查和临时传输上下文降延迟。
 */
@Injectable()
export class ConversationTurnQueue {
  private static readonly DEFAULT_TTL_MS = 10 * 60 * 1000;
  private readonly hints = new Map<number, ContinuationHint>();

  constructor(@Optional() private readonly store?: AgentContinuationStore) {}

  private ensureStore(): AgentContinuationStore {
    if (!this.store) throw new Error('Agent continuation store is unavailable');
    return this.store;
  }

  async enqueue(input: {
    binding: AgentContinuationParentBinding;
    payload: AgentContinuationPayload;
    clientIp?: string;
    sourceSocketId?: string;
  }): Promise<AgentContinuationEnqueueResult> {
    const binding = assertAgentContinuationParentBinding(input.binding);
    const result = await this.ensureStore().enqueue({ binding, payload: input.payload });
    const now = Date.now();
    this.hints.set(binding.parentAssistantLogId, {
      binding,
      payload: result.payload,
      sequence: result.sequence,
      createdAt: now,
      expiresAt:
        result.expiresAt instanceof Date
          ? result.expiresAt.getTime()
          : now + ConversationTurnQueue.DEFAULT_TTL_MS,
      ...(input.clientIp ? { clientIp: input.clientIp } : {}),
      ...(input.sourceSocketId ? { sourceSocketId: input.sourceSocketId } : {}),
    });
    Logger.log('接续消息已持久化', 'ConversationTurnQueue');
    return result;
  }

  peekHint(
    parentAssistantLogId: number,
    expectedParentTurnId?: string,
  ): ContinuationHint | undefined {
    this.purgeExpiredHints();
    const hint = this.hints.get(parentAssistantLogId);
    if (!hint || (expectedParentTurnId && hint.binding.parentTurnId !== expectedParentTurnId)) {
      return undefined;
    }
    return {
      ...hint,
      binding: { ...hint.binding },
      payload: { ...hint.payload },
    };
  }

  hasPending(parentAssistantLogId: number, expectedParentTurnId?: string): boolean {
    return Boolean(this.peekHint(parentAssistantLogId, expectedParentTurnId));
  }

  async claimForParent(
    bindingInput: AgentContinuationParentBinding,
  ): Promise<QueuedConversationTurn | undefined> {
    const binding = assertAgentContinuationParentBinding(bindingInput);
    const claim = await this.ensureStore().claimForParent({ binding });
    if (!claim) {
      this.hints.delete(binding.parentAssistantLogId);
      return undefined;
    }
    const hint = this.hints.get(binding.parentAssistantLogId);
    this.hints.delete(binding.parentAssistantLogId);
    return {
      ...claim,
      channel: 'web',
      ...(hint?.sequence === claim.sequence && hint.clientIp ? { clientIp: hint.clientIp } : {}),
      ...(hint?.sequence === claim.sequence && hint.sourceSocketId
        ? { sourceSocketId: hint.sourceSocketId }
        : {}),
    };
  }

  async clear(
    bindingInput: AgentContinuationParentBinding,
    reason = 'queue_cancelled',
  ): Promise<boolean> {
    const binding = assertAgentContinuationParentBinding(bindingInput);
    const removed = await this.ensureStore().discardForParent(binding, reason);
    this.hints.delete(binding.parentAssistantLogId);
    if (removed) {
      Logger.log('接续消息已持久删除', 'ConversationTurnQueue');
    }
    return removed;
  }

  async requestCancel(input: {
    parentAssistantLogId: number;
    ownerType: 'user' | 'visitor';
    ownerKey: string;
    expectedTurnId?: string;
    expectedGeneration?: number;
  }): Promise<AgentOperationCancelResult> {
    const result = await this.ensureStore().requestCancel(input);
    this.hints.delete(input.parentAssistantLogId);
    if (result.requested || result.continuationDiscarded) {
      Logger.log('Agent operation 取消已持久化', 'ConversationTurnQueue');
    }
    return result;
  }

  listRecoveryCandidates(now?: Date, limit?: number, afterId?: number) {
    return this.ensureStore().listRecoveryCandidates(now, limit, afterId);
  }

  async claimForRecovery(inboxId: number, now?: Date): Promise<QueuedConversationTurn | undefined> {
    const claim = await this.ensureStore().claimForRecovery(inboxId, now);
    return claim ? { ...claim, channel: 'web' } : undefined;
  }

  discardClaim(claim: AgentContinuationClaim, reason = 'launch_rejected'): Promise<boolean> {
    return this.ensureStore().discardClaim(claim, reason);
  }

  expireDue(now?: Date): Promise<number> {
    return this.ensureStore().expireDue(now);
  }

  private purgeExpiredHints(now = Date.now()): void {
    for (const [assistantLogId, hint] of this.hints.entries()) {
      if (hint.expiresAt <= now) this.hints.delete(assistantLogId);
    }
  }
}
