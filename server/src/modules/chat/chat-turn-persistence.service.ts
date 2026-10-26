import { ChatLogStatus } from '@/common/constants/status.constant';
import { createChatLogCid } from '@/common/utils';
import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DeepPartial, EntityManager, MoreThan, Repository } from 'typeorm';
import {
  OWNER_FRONTEND_MESSAGE_OPTIONS,
  stringifyFrontendMessage,
} from '../chatLog/tool-result-payload';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatLogService } from '../chatLog/chatLog.service';
import type { AgentTurnState, UnifiedMessage } from '../chatLog/types/message.types';
import type { AgentInitialMessageWire, AgentInitialMessagesWire } from '@99agent/contracts';
import { parseUnifiedMessage } from '../chatLog/unified-message.util';
import type { ChatAdmissionResult, ChatPreflightResult } from './chat-preflight.service';
import { ChatUploadContextService } from './chat-upload-context.service';
import { BILLING_PORT, BillingPort } from '../billing/billing.port';
import {
  AgentOperationCancelledError,
  AgentOperationSession,
  AgentOperationStore,
} from '../agent/runtime-state/operation-ledger.store';
import {
  AgentOperationIdentity,
  buildToolInputShape,
  normalizeToolIntent,
  operationIdFromTurnId,
  parseModelEffectCheckpoint,
  parseStoredToolOutcome,
  sanitizeOperationLedgerText,
} from '../agent/runtime-state/operation-ledger.types';
import { ToolProviderRegistry } from '../agent/tools/provider-registry/tool-provider.registry';
import { getToolModelContent, sanitizeToolInput } from '../chatLog/tool-result-payload';
import { ModelsService } from '../models/models.service';
import type { AgentEffectEntity } from '../agent/runtime-state/agent-effect.entity';
import type { AgentOperationEntity } from '../agent/runtime-state/agent-operation.entity';
import type { AgentContinuationClaim } from '../agent/runtime-state/continuation-inbox.types';
import { AgentContinuationStore } from '../agent/runtime-state/continuation-inbox.store';

const CHAT_TURN_SYSTEM_RECOVERY_ORIGIN = 'service-recovery-v1';

function createAgentTurnId(): string {
  return `turn_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

/**
 * 仅落库存储的 Platform 内部终态来源；前端消息投影会移除根级 internal。
 * 主动 abort 不经过这些恢复入口，因此不会获得该退款资格标记。
 */
function markSystemRefundRecovery(message: UnifiedMessage & Record<string, any>): void {
  const currentInternal =
    message.internal && typeof message.internal === 'object' && !Array.isArray(message.internal)
      ? message.internal
      : {};
  message.internal = {
    ...currentInternal,
    chatTurnTerminalOrigin: CHAT_TURN_SYSTEM_RECOVERY_ORIGIN,
  };
}

function interruptedMessageOf(assistant: ChatLogEntity): UnifiedMessage {
  const message =
    parseUnifiedMessage(assistant.message) ||
    ({
      role: 'assistant',
      content: '',
      rounds: [],
    } as UnifiedMessage);
  if (message.turn) {
    message.turn = {
      ...message.turn,
      status: 'interrupted',
      completedAt: new Date().toISOString(),
    };
  }
  markSystemRefundRecovery(message);
  return message;
}

function durableModelContent(value: unknown): string {
  if (typeof value === 'string') return sanitizeOperationLedgerText(value, 12_000);
  if (!Array.isArray(value)) return '工具执行完成';
  return (
    sanitizeOperationLedgerText(
      value
        .map((part: any) => {
          if (part?.type === 'text') return String(part.text || '');
          if (part?.file?.fileRef) return `[${part.type || 'file'}: ${part.file.fileRef}]`;
          return '';
        })
        .filter(Boolean)
        .join('\n'),
      12_000,
    ) || '工具执行完成'
  );
}

export interface ChatTurnRecords {
  chatGroupId: number;
  conversationGid: string;
  userLogId: number;
  assistantLogId: number;
  userCid: string;
  assistantCid: string;
  turnId: string;
  turnStartedAt: string;
  initialTurn: AgentTurnState;
  initialAssistantMessage: UnifiedMessage;
  initialMessages: AgentInitialMessagesWire;
  operation: AgentOperationIdentity;
}

export interface WriteTurnInput {
  preflight: ChatPreflightResult;
  userMessage: UnifiedMessage;
  group: ChatGroupEntity;
  manager: EntityManager;
}

/**
 * 轮次落库：用户消息 + 助手占位消息成对写入；提交幂等去重；孤儿轮次恢复与未启动补偿。
 */
/** 对话记录写入值：userId 等为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type ChatLogWriteValues = Omit<
  Partial<ChatLogEntity>,
  | 'userId'
  | 'visitorId'
  | 'channelMessageId'
  | 'submissionId'
  | 'submissionFingerprintVersion'
  | 'submissionFingerprint'
> & {
  userId?: number | null;
  visitorId?: string | null;
  channelMessageId?: string | null;
  submissionId?: string | null;
  submissionFingerprintVersion?: number | null;
  submissionFingerprint?: string | null;
};

/** 请求里要替换的起点与用户确认的后续轮数；只认整数轮数（null / 字符串不算确认过） */
function replaceRequestOf(
  body: { replaceFromCid?: unknown; replaceLaterTurns?: unknown } | null | undefined,
): { cid: string; expectedLaterTurns?: number } | null {
  const cid = String(body?.replaceFromCid || '').trim();
  if (!cid) return null;
  const laterTurns = body?.replaceLaterTurns;
  return typeof laterTurns === 'number' && Number.isInteger(laterTurns)
    ? { cid, expectedLaterTurns: laterTurns }
    : { cid };
}

@Injectable()
export class ChatTurnPersistenceService {
  private durableRecoveryInFlight?: Promise<number>;

  constructor(
    @InjectRepository(ChatLogEntity)
    private readonly chatLogRepository: Repository<ChatLogEntity>,
    private readonly chatLogService: ChatLogService,
    private readonly uploadContext: ChatUploadContextService,
    @Optional() @Inject(BILLING_PORT) private readonly billing?: BillingPort,
    private readonly operations?: AgentOperationStore,
    @Optional() private readonly toolProviderRegistry?: ToolProviderRegistry,
    @Optional() private readonly modelsService?: ModelsService,
    @Optional() private readonly continuations?: AgentContinuationStore,
  ) {}

  private ensureOperationStore(): AgentOperationStore {
    if (!this.operations) throw new Error('Agent operation store is unavailable');
    return this.operations;
  }

  private continuationAdmissionInput(admission: ChatAdmissionResult) {
    const ownerType = admission.user?.role === 'visitor' ? ('visitor' as const) : ('user' as const);
    const ownerKey = String(
      ownerType === 'visitor' ? admission.visitorId || '' : admission.chatUserId || '',
    );
    return {
      ownerType,
      ownerKey,
      groupId: admission.chatGroupId,
      conversationGid: admission.conversationGid,
      payload: {
        prompt: admission.prompt,
        submissionId: String(admission.submissionId || ''),
        parentTurnId: String(admission.parentTurnId || ''),
        gid: admission.conversationGid,
        ...(admission.body.modelId === undefined ? {} : { modelId: admission.body.modelId }),
        ...(admission.body.model ? { model: admission.body.model } : {}),
        ...(admission.body.modelName ? { modelName: admission.body.modelName } : {}),
        ...(admission.body.reasoningEffort
          ? { reasoningEffort: admission.body.reasoningEffort }
          : {}),
      },
    };
  }

  async lockContinuationForAdmissionInTransaction(
    manager: EntityManager,
    claim: AgentContinuationClaim,
    admission: ChatAdmissionResult,
  ): Promise<void> {
    if (!this.continuations) throw new Error('Agent continuation store is unavailable');
    await this.continuations.lockForAdmissionInTransaction(
      manager,
      claim,
      this.continuationAdmissionInput(admission),
    );
  }

  /**
   * 接续轮的父回合已经不在（被重新生成 / 编辑重发替换掉）：排着的补充要求属于旧的那条分支，
   * 不再接在新回合后面跑。在会话写锁内判断，替换与接续谁先拿到锁都一致
   */
  async isContinuationParentReplacedInTransaction(
    manager: EntityManager,
    claim: AgentContinuationClaim,
  ): Promise<boolean> {
    const parent = await manager.getRepository(ChatLogEntity).findOne({
      where: { id: claim.parentAssistantLogId },
      select: { id: true, isDelete: true },
    });
    return !parent || Boolean(parent.isDelete);
  }

  async consumeContinuationInTransaction(
    manager: EntityManager,
    claim: AgentContinuationClaim,
    admission: ChatAdmissionResult,
  ): Promise<void> {
    if (!this.continuations) throw new Error('Agent continuation store is unavailable');
    await this.continuations.consumeForAdmissionInTransaction(
      manager,
      claim,
      this.continuationAdmissionInput(admission),
    );
  }

  async consumeLockedContinuationInTransaction(
    manager: EntityManager,
    claim: AgentContinuationClaim,
    admission: ChatAdmissionResult,
  ): Promise<void> {
    if (!this.continuations) throw new Error('Agent continuation store is unavailable');
    await this.continuations.consumeLockedForAdmissionInTransaction(
      manager,
      claim,
      this.continuationAdmissionInput(admission),
    );
  }

  async discardContinuationAdmissionInTransaction(
    manager: EntityManager,
    claim: AgentContinuationClaim,
    reason: string,
  ): Promise<boolean> {
    if (!this.continuations) throw new Error('Agent continuation store is unavailable');
    const discarded = await this.continuations.discardAdmissionInTransaction(
      manager,
      claim,
      reason,
    );
    if (!discarded) throw new Error('Agent continuation admission discard fence rejected');
    return true;
  }

  private operationIdentityOf(input: {
    preflight: ChatPreflightResult;
    groupId: number;
    userLogId: number;
    assistantLogId: number;
    turnId: string;
  }): AgentOperationIdentity {
    const ownerType = input.preflight.user?.role === 'visitor' ? 'visitor' : 'user';
    const ownerKey =
      ownerType === 'visitor'
        ? String(input.preflight.visitorId || '')
        : String(input.preflight.chatUserId || '');
    const modelKeyId = Number(input.preflight.keyId);
    return {
      operationId: operationIdFromTurnId(input.turnId),
      ownerType,
      ownerKey,
      groupId: input.groupId,
      userLogId: input.userLogId,
      assistantLogId: input.assistantLogId,
      turnId: input.turnId,
      modelKeyId: Number.isSafeInteger(modelKeyId) && modelKeyId > 0 ? modelKeyId : null,
    };
  }

  async recoverOrphanedTurns(): Promise<{ chatLogs: number }> {
    let durableRecovered = 0;
    if (this.operations) {
      durableRecovered = await this.recoverDurableOperations();
    }
    const recoveredLogs = await this.chatLogRepository.manager.transaction(async manager => {
      const chatLogs = manager.getRepository(ChatLogEntity);
      const pendingLogs = await chatLogs.find({
        where: { status: ChatLogStatus.GENERATING },
      });
      let recovered = 0;
      for (const assistant of pendingLogs) {
        // 新 turn 的 assistant 与 durable operation 在同一事务创建。必须在本次
        // legacy 更新事务内重新确认关联，不能使用事务外快照，否则会误停并发 admission。
        if (
          this.operations &&
          (await this.operations.loadIdentityByAssistantInTransaction(manager, assistant.id))
        ) {
          continue;
        }
        const result = await chatLogs.update(
          { id: assistant.id, status: ChatLogStatus.GENERATING },
          {
            status: ChatLogStatus.STOPPED,
            content: assistant.content || '上次执行因服务重启而中断',
            message: JSON.stringify(interruptedMessageOf(assistant)),
          },
        );
        recovered += Number(result.affected || 0);
      }
      if (recovered) {
        Logger.log(`启动恢复完成: chatLogs=${recovered}`, 'ChatTurnPersistenceService');
      }
      return recovered;
    });
    await this.billing?.reconcileRefunds('服务重启终态退款收敛');
    return { chatLogs: recoveredLogs + durableRecovered };
  }

  /**
   * 周期性重扫只处理租约已到期的 durable operation；并发调用共享同一轮扫描。
   * 这样滚动部署不会抢占仍由其他实例持有的租约，崩溃遗留也不会因启动时尚未到期而永久悬空。
   */
  async recoverDurableOperations(): Promise<number> {
    if (!this.operations) return 0;
    if (this.durableRecoveryInFlight) return this.durableRecoveryInFlight;
    const run = this.runDurableRecovery();
    this.durableRecoveryInFlight = run;
    try {
      return await run;
    } finally {
      if (this.durableRecoveryInFlight === run) this.durableRecoveryInFlight = undefined;
    }
  }

  private async runDurableRecovery(): Promise<number> {
    let recovered = 0;
    let afterId = 0;
    for (;;) {
      const recoverable = await this.ensureOperationStore().findRecoverable(
        new Date(),
        100,
        afterId,
      );
      if (!recoverable.length) break;
      for (const operation of recoverable) {
        afterId = Math.max(afterId, operation.id);
        try {
          const session = await this.ensureOperationStore().claim(
            this.ensureOperationStore().identityFrom(operation),
            { recovery: true },
          );
          try {
            await this.recoverDurableOperation(operation, session);
            recovered += 1;
          } finally {
            session.close();
          }
        } catch (error) {
          Logger.error(
            'Durable Agent operation 恢复失败',
            error instanceof Error ? error.stack : undefined,
            'ChatTurnPersistenceService',
          );
        }
      }
      if (recoverable.length < 100) break;
    }
    return recovered;
  }

  private async recoverDurableOperation(
    operation: AgentOperationEntity,
    session: AgentOperationSession,
  ): Promise<void> {
    const assistant = await this.chatLogRepository.findOne({
      where: { id: operation.assistantLogId },
    });
    if (!assistant) throw new Error('Durable Agent operation assistant is missing');
    const effects = await this.ensureOperationStore().listEffects(operation.operationId);
    const recoveryLines: string[] = [];
    let cancelled = Boolean(operation.cancelRequestedAt) || (await session.isCancelRequested());

    for (const effect of effects) {
      if (!cancelled) cancelled = await session.isCancelRequested();
      if (effect.kind === 'model') {
        this.materializeModelRecovery(effect, recoveryLines);
        if (
          effect.state === 'intent' ||
          effect.state === 'streaming' ||
          effect.state === 'replaying'
        ) {
          await this.ensureOperationStore().settleEffectForRecovery(
            session.fence,
            effect.effectKey,
            'unknown',
          );
        }
        continue;
      }
      if (cancelled && effect.state !== 'committed') {
        await this.ensureOperationStore().settleEffectForRecovery(
          session.fence,
          effect.effectKey,
          effect.state === 'replaying' ? 'unknown' : 'interrupted',
        );
        recoveryLines.push(`工具 ${effect.toolName || 'unknown'} 已因取消停止，未自动重试。`);
        continue;
      }
      try {
        await this.recoverToolEffect(effect, session, assistant, recoveryLines);
      } catch (error) {
        if (!(error instanceof AgentOperationCancelledError)) throw error;
        cancelled = true;
        await this.ensureOperationStore().settleEffectForRecovery(
          session.fence,
          effect.effectKey,
          'interrupted',
        );
        recoveryLines.push(`工具 ${effect.toolName || 'unknown'} 已因取消停止，未自动重试。`);
      }
    }

    if (!cancelled) cancelled = await session.isCancelRequested();
    await this.recoverDurableBilling(operation, session);
    const message = interruptedMessageOf(assistant);
    const existingContent = sanitizeOperationLedgerText(
      assistant.content || message.content,
      12_000,
    );
    const recoverySummary = cancelled
      ? recoveryLines.length
        ? `执行已取消；以下为取消前已确认的持久结果：\n${recoveryLines.join('\n')}`
        : '执行已取消，未产生可确认的结果。'
      : recoveryLines.length
        ? `执行因服务中断，以下为已确认的持久结果：\n${recoveryLines.join('\n')}`
        : '执行因服务中断，未产生可确认的结果。';
    const content = [existingContent, recoverySummary].filter(Boolean).join('\n\n');
    message.content = content;
    message.rounds = [
      ...(Array.isArray(message.rounds) ? message.rounds : []),
      {
        text: recoverySummary,
        thinking: null,
        toolCalls: [],
        completed: true,
      },
    ];
    await session.terminalize({
      assistantLogId: assistant.id,
      phase: 'interrupted',
      terminalReason: cancelled ? 'user_cancelled_recovery' : 'startup_recovery',
      chatLogPatch: {
        status: ChatLogStatus.STOPPED,
        content,
        message: JSON.stringify(message),
      },
    });
  }

  private materializeModelRecovery(effect: AgentEffectEntity, lines: string[]): void {
    let partial = '';
    try {
      if (effect.checkpoint) {
        partial = parseModelEffectCheckpoint(effect.checkpoint).textTail || '';
      }
    } catch {
      partial = '';
    }
    const label = `模型请求 R${effect.roundIndex + 1}/A${effect.attemptIndex + 1}`;
    if (effect.state === 'committed') {
      lines.push(
        partial
          ? `${label} 已确认完成；已恢复的末尾片段：${partial}`
          : `${label} 已确认完成，但没有可恢复的文本片段。`,
      );
    } else if (effect.state === 'rejected') {
      lines.push(`${label} 已被供应商明确拒绝。`);
    } else {
      lines.push(
        partial
          ? `${label} 结果未知，未自动重试；已恢复的末尾片段：${partial}`
          : `${label} 结果未知，未自动重试。`,
      );
    }
  }

  private async recoverToolEffect(
    effect: AgentEffectEntity,
    session: AgentOperationSession,
    assistant: ChatLogEntity,
    lines: string[],
  ): Promise<void> {
    if (effect.state === 'committed' && effect.outcome) {
      try {
        const outcome = parseStoredToolOutcome(effect.outcome);
        lines.push(`工具 ${outcome.displayName}：${outcome.modelContent}`);
      } catch {
        lines.push(`工具 ${effect.toolName || 'unknown'} 的持久结果无法安全读取。`);
      }
      return;
    }

    if (effect.state !== 'intent') {
      if (effect.state === 'replaying') {
        await this.ensureOperationStore().settleEffectForRecovery(
          session.fence,
          effect.effectKey,
          'unknown',
        );
      }
      lines.push(`工具 ${effect.toolName || 'unknown'} 的执行结果未知，未再次重试。`);
      return;
    }

    const registry = this.toolProviderRegistry;
    let replayPayload: Record<string, unknown> | undefined;
    if (effect.replayPolicy === 'safe' && effect.intentPayload && registry && effect.toolName) {
      try {
        const storedPayload = JSON.parse(effect.intentPayload);
        const current = registry.getReplayIntent(effect.toolName, storedPayload);
        const normalized = normalizeToolIntent({
          roundIndex: effect.roundIndex,
          ordinal: effect.ordinal,
          callId: effect.callId || '',
          toolName: effect.toolName,
          replayPolicy: current.policy,
          replayPayload: current.payload,
          inputShape: buildToolInputShape(storedPayload),
        });
        if (
          current.policy === 'safe' &&
          normalized.fingerprint === effect.intentFingerprint &&
          normalized.serializedPayload === effect.intentPayload
        ) {
          replayPayload = normalized.value.replayPayload;
        }
      } catch {
        replayPayload = undefined;
      }
    }

    if (!replayPayload || !registry || !effect.toolName || !effect.callId) {
      const outcome = {
        callId: effect.callId || `interrupted:${effect.id}`,
        toolName: effect.toolName || 'unknown',
        displayName: effect.toolName || 'unknown',
        status: 'error' as const,
        modelContent: '工具执行已中断，安全策略禁止自动重试。',
        toolCost: 0,
      };
      await this.ensureOperationStore().settleEffectForRecovery(
        session.fence,
        effect.effectKey,
        'interrupted',
        outcome,
      );
      lines.push(`工具 ${outcome.displayName} 已中断，未自动重试。`);
      return;
    }

    const claimed = await this.ensureOperationStore().claimToolReplay(
      session.fence,
      effect.effectKey,
    );
    if (!claimed) {
      lines.push(`工具 ${effect.toolName} 的执行结果未知，未再次重试。`);
      return;
    }
    try {
      const ownerOptions =
        session.identity.ownerType === 'visitor'
          ? {
              userRole: 'visitor',
              role: 'visitor',
              visitorId: session.identity.ownerKey,
            }
          : {
              userId: Number(session.identity.ownerKey),
              userRole: 'user',
              role: 'user',
            };
      const result = await registry.execute(effect.toolName, replayPayload, {
        input: {
          messages: [],
          config: {},
          context: {
            options: {
              ...ownerOptions,
              messageId: assistant.cid,
              turnId: session.identity.turnId,
            },
          },
        },
        toolCallId: effect.callId,
      });
      const toolCost =
        result.status === 'success'
          ? await registry.getToolCost(effect.toolName, replayPayload)
          : 0;
      const outcome = {
        callId: effect.callId,
        toolName: effect.toolName,
        displayName: result.displayName || result.name || effect.toolName,
        status: result.status === 'success' ? ('success' as const) : ('error' as const),
        modelContent: durableModelContent(getToolModelContent(result)),
        inputSummary: sanitizeToolInput(replayPayload),
        toolCost,
      };
      await session.commitToolEffect(effect.effectKey, outcome);
      lines.push(`工具 ${outcome.displayName}：${outcome.modelContent}`);
    } catch {
      await this.ensureOperationStore().settleEffectForRecovery(
        session.fence,
        effect.effectKey,
        'unknown',
      );
      lines.push(`工具 ${effect.toolName} 的重放结果未知，未再次重试。`);
    }
  }

  private async recoverDurableBilling(
    operation: AgentOperationEntity,
    session: AgentOperationSession,
  ): Promise<void> {
    let phase = operation.billingPhase;
    if (phase === 'settle_intent') {
      if (operation.ownerType === 'visitor') {
        await session.markBillingUnknown();
        return;
      }
      const userId = Number(operation.ownerKey);
      const model = operation.modelKeyId
        ? await this.modelsService?.findByIdIncludingDisabled(operation.modelKeyId)
        : null;
      if (Number.isSafeInteger(userId) && userId > 0 && model && this.billing) {
        const settlement = await this.billing.settleTurn({
          user: { id: userId, role: 'user' },
          userId,
          model,
          totalTokens: operation.settlementTotalTokens,
          toolCost: Number(operation.settlementToolCost) || 0,
          relatedId: operation.assistantLogId,
          ...(operation.settlementMode === 'tools_only' ? { toolsOnly: true } : {}),
        });
        await session.completeSettlement(settlement.charged);
        phase = 'settled';
      }
    }
    if (
      operation.ownerType !== 'visitor' &&
      ['settle_intent', 'settled', 'refund_intent'].includes(phase)
    ) {
      await session.beginRefund();
      await this.billing?.refundTurn(operation.assistantLogId, 'Durable Agent 恢复退款');
      await session.completeRefund();
    }
  }

  async recoverOrphanedTurn(
    assistantChatLogId: number,
    failureSummary = '执行进程已中断，请重试',
  ): Promise<{ chatLogs: number }> {
    if (this.operations) {
      const operation = await this.operations.findByAssistantLogId(assistantChatLogId);
      if (operation) {
        return this.recoverSingleDurableOperation(operation);
      }
    }
    const fallback = await this.chatLogRepository.manager.transaction(async manager => {
      const chatLogs = manager.getRepository(ChatLogEntity);
      const assistant = await chatLogs.findOne({
        where: { id: assistantChatLogId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assistant || assistant.status !== ChatLogStatus.GENERATING) {
        return { chatLogs: 0, durableIdentity: null };
      }
      const durableIdentity = this.operations
        ? await this.operations.loadIdentityByAssistantInTransaction(manager, assistant.id)
        : null;
      if (durableIdentity) return { chatLogs: 0, durableIdentity };
      const chatResult = await chatLogs.update(
        { id: assistant.id, status: ChatLogStatus.GENERATING },
        {
          status: ChatLogStatus.STOPPED,
          content: assistant.content || failureSummary,
          message: JSON.stringify(interruptedMessageOf(assistant)),
        },
      );
      return { chatLogs: Number(chatResult.affected || 0), durableIdentity: null };
    });
    if (fallback.durableIdentity && this.operations) {
      const operation = await this.operations.findByAssistantLogId(assistantChatLogId);
      if (!operation || operation.operationId !== fallback.durableIdentity.operationId) {
        throw new Error('Durable Agent operation changed during recovery');
      }
      return this.recoverSingleDurableOperation(operation);
    }
    await this.billing?.reconcileRefunds('执行中断终态退款收敛');
    return { chatLogs: fallback.chatLogs };
  }

  private async recoverSingleDurableOperation(
    operation: AgentOperationEntity,
  ): Promise<{ chatLogs: number }> {
    if (['completed', 'failed', 'interrupted'].includes(operation.phase)) {
      return { chatLogs: 0 };
    }
    const store = this.ensureOperationStore();
    const session = await store.claim(store.identityFrom(operation), { recovery: true });
    try {
      await this.recoverDurableOperation(operation, session);
      return { chatLogs: 1 };
    } finally {
      session.close();
    }
  }

  async findDuplicateTurn(
    manager: EntityManager,
    group: ChatGroupEntity,
    preflight: ChatAdmissionResult,
    resolveFingerprint?: () => Promise<NonNullable<ChatAdmissionResult['submissionFingerprint']>>,
  ): Promise<ChatTurnRecords | null> {
    if (!preflight.submissionId) return null;
    const chatLogs = manager.getRepository(ChatLogEntity);
    const inputLog = await chatLogs.findOne({
      where: {
        groupId: group.id,
        submissionId: preflight.submissionId,
        direction: 'in',
      },
    });
    if (!inputLog) return null;

    const fingerprint = resolveFingerprint
      ? await resolveFingerprint()
      : preflight.submissionFingerprint;
    if (!fingerprint) {
      throw new HttpException(
        {
          code: 'SUBMISSION_RECORD_INCOMPLETE',
          message: '提交摘要缺失，请创建新的提交',
        },
        HttpStatus.CONFLICT,
      );
    }
    const fingerprintMatches =
      inputLog.submissionFingerprintVersion === fingerprint.version &&
      inputLog.submissionFingerprint === fingerprint.digest;
    if (!fingerprintMatches) {
      throw new HttpException(
        {
          code: 'SUBMISSION_CONFLICT',
          message: 'submissionId 已用于另一项请求',
        },
        HttpStatus.CONFLICT,
      );
    }
    if (inputLog.isDelete) {
      throw new HttpException(
        {
          code: 'SUBMISSION_RECORD_INCOMPLETE',
          message: '原提交记录已删除，请创建新的提交',
        },
        HttpStatus.CONFLICT,
      );
    }

    const assistantLog = await chatLogs.findOne({
      where: {
        groupId: group.id,
        id: MoreThan(inputLog.id),
      },
      order: { id: 'ASC' },
    });
    if (!assistantLog || assistantLog.direction !== 'out' || assistantLog.isDelete) {
      throw new HttpException(
        {
          code: 'SUBMISSION_RECORD_INCOMPLETE',
          message: '原提交记录不完整，请创建新的提交',
        },
        HttpStatus.CONFLICT,
      );
    }

    const operation = await this.ensureOperationStore().loadIdentityByAssistantInTransaction(
      manager,
      assistantLog.id,
    );
    if (!operation) {
      throw new HttpException(
        {
          code: 'SUBMISSION_RECORD_INCOMPLETE',
          message: '原提交记录缺少 operation 状态',
        },
        HttpStatus.CONFLICT,
      );
    }
    return this.restoreTurnRecords({ group, inputLog, assistantLog, operation });
  }

  /**
   * 重新生成 / 编辑重发的前置检查：调度器在会话写锁内、可变预检之前调用，
   * 被拒的替换不消耗限流与访客额度（写入时 replaceFromCidInTransaction 在同一事务里再检查一次）。
   */
  async assertReplaceableInTransaction(
    manager: EntityManager,
    admission: Pick<ChatAdmissionResult, 'body' | 'user'>,
    group: { id: number },
  ): Promise<void> {
    const replacement = replaceRequestOf(admission.body);
    if (!replacement) return;
    await this.chatLogService.assertReplaceableInTransaction(manager, {
      user: admission.user,
      groupId: group.id,
      ...replacement,
    });
  }

  async writeTurnInTransaction(input: WriteTurnInput): Promise<ChatTurnRecords> {
    const { preflight, userMessage, group, manager } = input;
    const chatLogs = manager.getRepository(ChatLogEntity);
    this.uploadContext.enrichUserUploadFileRefMappings(userMessage);

    // 重新生成 / 编辑重发：新一轮已通过预检，在写入它的同一事务里替换原来的回合；
    // 事务回滚（写入失败）时原来的问答保留，不会出现「旧的删了、新的没发出去」
    const replacement = replaceRequestOf(preflight.body);
    if (replacement) {
      await this.chatLogService.replaceFromCidInTransaction(manager, {
        user: preflight.user,
        groupId: group.id,
        ...replacement,
      });
    }

    const turnStartedAt = new Date().toISOString();
    const turnId = createAgentTurnId();
    const initialTurn: AgentTurnState = {
      id: turnId,
      status: 'running',
      ...(preflight.parentTurnId ? { parentTurnId: preflight.parentTurnId } : {}),
      startedAt: turnStartedAt,
    };
    const initialAssistantMessage: UnifiedMessage = {
      role: 'assistant',
      content: '',
      rounds: [],
      model: preflight.useModel,
      timestamp: turnStartedAt,
      turn: initialTurn,
    };

    const userLog = await this.saveWithUniqueCid(chatLogs, {
      curIp: '',
      userId: preflight.chatUserId,
      visitorId: preflight.visitorId,
      type: 1,
      content: preflight.prompt,
      message: JSON.stringify(userMessage),
      totalTokens: 0,
      model: preflight.useModel,
      modelName: '我',
      channel: preflight.chatChannel,
      channelMessageId: preflight.body.channelMessageId || null,
      direction: 'in',
      groupId: group.id,
      submissionId: preflight.submissionId,
      submissionFingerprintVersion: preflight.submissionFingerprint?.version ?? null,
      submissionFingerprint: preflight.submissionFingerprint?.digest ?? null,
    });
    const assistantLog = await this.saveWithUniqueCid(chatLogs, {
      curIp: '',
      userId: preflight.chatUserId,
      visitorId: preflight.visitorId,
      type: 1,
      content: '',
      message: JSON.stringify(initialAssistantMessage),
      model: preflight.useModel,
      modelName: preflight.useModeName,
      status: ChatLogStatus.GENERATING,
      channel: preflight.chatChannel,
      channelMessageId: null,
      direction: 'out',
      groupId: group.id,
      submissionId: null,
      submissionFingerprintVersion: null,
      submissionFingerprint: null,
    });

    const operation = await this.ensureOperationStore().admitInTransaction(
      manager,
      this.operationIdentityOf({
        preflight,
        groupId: group.id,
        userLogId: userLog.id,
        assistantLogId: assistantLog.id,
        turnId,
      }),
    );

    return this.buildTurnRecords({
      group,
      userLog,
      assistantLog,
      turnId,
      turnStartedAt,
      initialTurn,
      initialAssistantMessage,
      prompt: preflight.prompt,
      useModel: preflight.useModel,
      useModeName: preflight.useModeName,
      userMessage,
      operation,
    });
  }

  async writeExternalTurn(input: {
    preflight: ChatPreflightResult;
    userMessage: UnifiedMessage;
  }): Promise<ChatTurnRecords> {
    const { preflight, userMessage } = input;
    this.uploadContext.enrichUserUploadFileRefMappings(userMessage);
    const turnStartedAt = new Date().toISOString();
    const turnId = createAgentTurnId();
    const initialTurn: AgentTurnState = {
      id: turnId,
      status: 'running',
      ...(preflight.parentTurnId ? { parentTurnId: preflight.parentTurnId } : {}),
      startedAt: turnStartedAt,
    };
    const initialAssistantMessage: UnifiedMessage = {
      role: 'assistant',
      content: '',
      rounds: [],
      model: preflight.useModel,
      timestamp: turnStartedAt,
      turn: initialTurn,
    };
    const external = await this.chatLogService.saveExternalTurnChatLogs<AgentOperationIdentity>({
      owner: preflight.user,
      channel: preflight.chatChannel,
      userLog: {
        curIp: '',
        userId: preflight.chatUserId,
        visitorId: preflight.visitorId,
        type: 1,
        content: preflight.prompt,
        message: JSON.stringify(userMessage),
        totalTokens: 0,
        model: preflight.useModel,
        modelName: '我',
        channel: preflight.chatChannel,
        channelMessageId: preflight.body.channelMessageId || null,
        direction: 'in',
        groupId: preflight.chatGroupId,
      },
      assistantLog: {
        curIp: '',
        userId: preflight.chatUserId,
        visitorId: preflight.visitorId,
        type: 1,
        content: '',
        message: JSON.stringify(initialAssistantMessage),
        model: preflight.useModel,
        modelName: preflight.useModeName,
        status: ChatLogStatus.GENERATING,
        channel: preflight.chatChannel,
        direction: 'out',
        groupId: preflight.chatGroupId,
      },
      afterSave: ({ group, manager, userLog, assistantLog }) =>
        this.ensureOperationStore().admitInTransaction(
          manager,
          this.operationIdentityOf({
            preflight,
            groupId: group.id,
            userLogId: userLog.id,
            assistantLogId: assistantLog.id,
            turnId,
          }),
        ),
    });
    if (!external.extension) throw new Error('Agent operation admission failed');
    const group = {
      id: external.groupId,
      gid: external.gid,
    } as ChatGroupEntity;
    return this.buildTurnRecords({
      group,
      userLog: external.userLog,
      assistantLog: external.assistantLog,
      turnId,
      turnStartedAt,
      initialTurn,
      initialAssistantMessage,
      prompt: preflight.prompt,
      useModel: preflight.useModel,
      useModeName: preflight.useModeName,
      userMessage,
      operation: external.extension,
    });
  }

  private async saveWithUniqueCid(
    repository: Repository<ChatLogEntity>,
    values: ChatLogWriteValues,
  ): Promise<ChatLogEntity> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        // 可空列写 null：实体属性未标 | null，在仓库边界收口
        return await repository.save(
          repository.create({ ...values, cid: createChatLogCid() } as DeepPartial<ChatLogEntity>),
        );
      } catch (error) {
        if ((error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) && attempt < 7) continue;
        throw error;
      }
    }
    throw new HttpException('消息ID生成失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private restoreTurnRecords(input: {
    group: ChatGroupEntity;
    inputLog: ChatLogEntity;
    assistantLog: ChatLogEntity;
    operation: AgentOperationIdentity;
  }): ChatTurnRecords {
    const userMessage =
      parseUnifiedMessage(input.inputLog.message) ||
      ({
        role: 'user',
        content: input.inputLog.content || '',
        rounds: [],
      } as UnifiedMessage);
    const assistantMessage =
      parseUnifiedMessage(input.assistantLog.message) ||
      ({
        role: 'assistant',
        content: input.assistantLog.content || '',
        rounds: [],
      } as UnifiedMessage);
    const turn = assistantMessage.turn;
    if (!turn?.id) {
      throw new HttpException(
        {
          code: 'SUBMISSION_RECORD_INCOMPLETE',
          message: '原提交记录缺少 turn 定位信息',
        },
        HttpStatus.CONFLICT,
      );
    }
    return this.buildTurnRecords({
      group: input.group,
      userLog: input.inputLog,
      assistantLog: input.assistantLog,
      turnId: turn.id,
      turnStartedAt: turn.startedAt || new Date(input.assistantLog.createdAt).toISOString(),
      initialTurn: turn,
      initialAssistantMessage: assistantMessage,
      prompt: input.inputLog.content || '',
      useModel: input.inputLog.model || input.assistantLog.model || '',
      useModeName: input.assistantLog.modelName || 'AI',
      userMessage,
      operation: input.operation,
    });
  }

  private buildTurnRecords(input: {
    group: ChatGroupEntity;
    userLog: ChatLogEntity;
    assistantLog: ChatLogEntity;
    turnId: string;
    turnStartedAt: string;
    initialTurn: AgentTurnState;
    initialAssistantMessage: UnifiedMessage;
    prompt: string;
    useModel: string;
    useModeName: string;
    userMessage: UnifiedMessage;
    operation: AgentOperationIdentity;
  }): ChatTurnRecords {
    const userCreatedAt =
      input.userLog.createdAt instanceof Date
        ? input.userLog.createdAt.toISOString()
        : input.userMessage.timestamp || input.turnStartedAt;
    const assistantCreatedAt =
      input.assistantLog.createdAt instanceof Date
        ? input.assistantLog.createdAt.toISOString()
        : input.turnStartedAt;
    const assistantProjection: AgentInitialMessageWire = {
      cid: input.assistantLog.cid,
      turnId: input.turnId,
      content: '',
      model: input.useModel,
      modelName: input.useModeName,
      role: 'assistant',
      createdAt: assistantCreatedAt,
      startedAt: input.turnStartedAt,
      message: stringifyFrontendMessage(
        input.initialAssistantMessage,
        OWNER_FRONTEND_MESSAGE_OPTIONS,
      ),
      status: input.assistantLog.status,
      error: false,
      loading: input.assistantLog.status === ChatLogStatus.GENERATING,
    };
    return {
      chatGroupId: input.group.id,
      conversationGid: input.group.gid,
      userLogId: input.userLog.id,
      assistantLogId: input.assistantLog.id,
      userCid: input.userLog.cid,
      assistantCid: input.assistantLog.cid,
      turnId: input.turnId,
      turnStartedAt: input.turnStartedAt,
      initialTurn: input.initialTurn,
      initialAssistantMessage: input.initialAssistantMessage,
      initialMessages: {
        user: {
          cid: input.userLog.cid,
          content: input.prompt,
          model: input.useModel,
          modelName: '我',
          role: 'user',
          createdAt: userCreatedAt,
          startedAt: userCreatedAt,
          message: stringifyFrontendMessage(input.userMessage, OWNER_FRONTEND_MESSAGE_OPTIONS),
          status: input.userLog.status,
        },
        assistant: assistantProjection,
      },
      operation: input.operation,
    };
  }
}
