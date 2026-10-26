import { Injectable } from '@nestjs/common';
import type { UnifiedMessage } from '../chatLog/types/message.types';
import type { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import {
  ChatAdmissionResult,
  ChatPreflightResult,
  ChatPreflightService,
} from './chat-preflight.service';
import { ChatInteractionRunner } from './chat-interaction.runner';
import { ChatSubmissionService } from './chat-submission.service';
import { ChatTurnPersistenceService, ChatTurnRecords } from './chat-turn-persistence.service';
import type { StreamEmitter } from './emitters/stream-emitter.interface';
import type { AgentContinuationClaim } from '../agent/runtime-state/continuation-inbox.types';

export interface CommittedInteraction {
  duplicate: boolean;
  preflight?: ChatPreflightResult;
  records: ChatTurnRecords;
}

/** 父回合在排队期间被替换（别的页签重新生成、编辑重发）：接续作废 */
interface ContinuationParentReplaced {
  continuationParentReplaced: true;
}

interface ContinuationPreflightFailure {
  continuationPreflightError: true;
  /** 预检拒绝的原始原因（违规、额度不足、限流……）：能公开的原样告诉用户 */
  reason: unknown;
}

export class ContinuationPreflightTerminatedError extends Error {
  readonly code = 'CONTINUATION_PREFLIGHT_TERMINATED';

  constructor(readonly reason?: unknown) {
    super('Agent continuation preflight terminated');
    this.name = 'ContinuationPreflightTerminatedError';
  }
}

/**
 * 提交调度：会话写锁内做幂等去重、可变预检与轮次落库。只有一种交互模式。
 */
@Injectable()
export class InteractionDispatcher {
  constructor(
    private readonly chatGroups: ChatGroupService,
    private readonly preflight: ChatPreflightService,
    private readonly turns: ChatTurnPersistenceService,
    private readonly chatRunner: ChatInteractionRunner,
    private readonly submissions: ChatSubmissionService,
  ) {}

  async commit(input: {
    admission: ChatAdmissionResult;
    userMessage: UnifiedMessage;
    emitter: StreamEmitter;
    continuationClaim?: AgentContinuationClaim;
  }): Promise<CommittedInteraction | null> {
    const { admission, userMessage, emitter, continuationClaim } = input;
    if (admission.chatChannel !== 'web') {
      const prepared = await this.preflight.prepareExecution(admission, emitter);
      if (!prepared) return null;
      return {
        duplicate: false,
        preflight: prepared,
        records: await this.turns.writeExternalTurn({
          preflight: prepared,
          userMessage,
        }),
      };
    }

    const committed = await this.chatGroups.withConversationWriteLock<
      CommittedInteraction | ContinuationPreflightFailure | ContinuationParentReplaced | null
    >(admission.conversationGid, admission.user, async (group, manager) => {
      const duplicate = await this.turns.findDuplicateTurn(manager, group, admission, async () =>
        this.createLockedFingerprint(admission, group),
      );
      if (duplicate) {
        if (continuationClaim) {
          await this.turns.consumeContinuationInTransaction(manager, continuationClaim, admission);
        }
        return { duplicate: true, records: duplicate };
      }

      const lockedAdmission: ChatAdmissionResult = {
        ...admission,
        chatGroupId: group.id,
        conversationGid: group.gid,
        submissionFingerprint: this.createLockedFingerprint(admission, group),
      };

      // 锁序固定为 conversation -> parent operation -> inbox；其余 operation/inbox
      // 事务不会反向申请 conversation 锁。claim 锁必须覆盖全部可变预检，避免
      // 慢预检跨过 claim lease 后被另一实例换 token 并重复消耗外部配额。
      if (continuationClaim) {
        await this.turns.lockContinuationForAdmissionInTransaction(
          manager,
          continuationClaim,
          lockedAdmission,
        );
        if (
          await this.turns.isContinuationParentReplacedInTransaction(manager, continuationClaim)
        ) {
          await this.turns.discardContinuationAdmissionInTransaction(
            manager,
            continuationClaim,
            'parent_replaced',
          );
          return { continuationParentReplaced: true };
        }
      }

      // 重新生成 / 编辑重发先查能不能替换：被拒时不走可变预检，不消耗限流与访客额度
      await this.turns.assertReplaceableInTransaction(manager, lockedAdmission, group);

      // 可变预检（配置 / 敏感词 / 模型 / 限流 / 余额）在会话锁内执行，与轮次写入同一事实。
      let prepared: ChatPreflightResult | null;
      try {
        prepared = await this.preflight.prepareExecution(lockedAdmission, emitter);
      } catch (error) {
        if (!continuationClaim) throw error;
        await this.turns.discardContinuationAdmissionInTransaction(
          manager,
          continuationClaim,
          'preflight_failed',
        );
        return { continuationPreflightError: true, reason: error };
      }
      if (!prepared) {
        if (continuationClaim) {
          await this.turns.discardContinuationAdmissionInTransaction(
            manager,
            continuationClaim,
            'preflight_rejected',
          );
        }
        return null;
      }
      const lockedPreflight: ChatPreflightResult = {
        ...prepared,
        submissionFingerprint: lockedAdmission.submissionFingerprint,
      };
      const records = await this.chatRunner.run({
        preflight: lockedPreflight,
        userMessage,
        group,
        manager,
      });
      if (continuationClaim) {
        await this.turns.consumeLockedContinuationInTransaction(
          manager,
          continuationClaim,
          lockedPreflight,
        );
      }
      return {
        duplicate: false,
        preflight: lockedPreflight,
        records,
      };
    });
    if ((committed as ContinuationParentReplaced | null)?.continuationParentReplaced) {
      // 事务提交之后再告诉发起的页面：补充要求没有执行（不然排队的文字无声消失）；
      // 作废发生在可变预检之前，不消耗限流与额度
      emitter.emit({
        type: 'agent.error',
        chatId: 'pending',
        timestamp: Date.now(),
        data: {
          code: 'QUEUE_TURN_DISCARDED',
          message: '补充要求没有执行：它要接的那一轮已经被替换，请重新发送',
        },
      });
      return null;
    }
    if ((committed as ContinuationPreflightFailure | null)?.continuationPreflightError) {
      throw new ContinuationPreflightTerminatedError(
        (committed as ContinuationPreflightFailure).reason,
      );
    }
    return committed as CommittedInteraction | null;
  }

  private createLockedFingerprint(admission: ChatAdmissionResult, group: ChatGroupEntity) {
    return this.submissions.createFingerprint({
      operation: admission.operation,
      body: admission.body,
      conversationGid: group.gid,
      strategy: admission.strategy,
    });
  }
}
