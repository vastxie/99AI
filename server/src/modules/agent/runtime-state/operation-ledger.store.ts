import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ChatLogEntity } from '../../chatLog/chatLog.entity';
import { AgentEffectEntity } from './agent-effect.entity';
import { AgentOperationEntity } from './agent-operation.entity';
import {
  AgentEffectState,
  AgentModelEffectCheckpoint,
  AgentModelEffectIntent,
  AgentOperationFence,
  AgentOperationIdentity,
  AgentOperationPhase,
  AgentOperationSettlementMode,
  AgentStoredToolIntent,
  AgentStoredToolOutcome,
  assertAgentOperationIdentity,
  effectKeyForModel,
  effectKeyForTool,
  fingerprintModelIntent,
  isTerminalEffectState,
  isTerminalOperationPhase,
  normalizeToolIntent,
  parseModelEffectCheckpoint,
  parseStoredToolOutcome,
} from './operation-ledger.types';

const DEFAULT_LEASE_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECOVERY_BATCH_SIZE = 100;

export interface AgentOperationRepositoryPort {
  admitInTransaction(
    manager: EntityManager,
    identity: AgentOperationIdentity,
  ): Promise<AgentOperationIdentity>;
  claim(
    identity: AgentOperationIdentity,
    input?: { recovery?: boolean; abortController?: AbortController },
  ): Promise<AgentOperationSession>;
  findRecoverable(now?: Date, limit?: number, afterId?: number): Promise<AgentOperationEntity[]>;
  listEffects(operationId: string): Promise<AgentEffectEntity[]>;
}

export interface AgentToolEffectDecision {
  action: 'execute' | 'reuse' | 'unknown';
  effectKey: string;
  outcome?: AgentStoredToolOutcome;
}

export interface AgentModelEffectDecision {
  action: 'execute' | 'unknown';
  effectKey: string;
}

/** Durable cancel 在 effect intent 边界使用的固定 abort 信号。 */
export class AgentOperationCancelledError extends Error {
  readonly code = 'aborted';

  constructor() {
    super('Agent operation cancelled');
    this.name = 'AbortError';
  }
}

function numericCost(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function addSeconds(now: Date, milliseconds: number): Date {
  return new Date(now.getTime() + milliseconds);
}

function sameIdentity(entity: AgentOperationEntity, identity: AgentOperationIdentity): boolean {
  return (
    entity.operationId === identity.operationId &&
    entity.ownerType === identity.ownerType &&
    entity.ownerKey === identity.ownerKey &&
    entity.groupId === identity.groupId &&
    entity.userLogId === identity.userLogId &&
    entity.assistantLogId === identity.assistantLogId &&
    entity.turnId === identity.turnId &&
    entity.modelKeyId === identity.modelKeyId
  );
}

function identityOf(entity: AgentOperationEntity): AgentOperationIdentity {
  return {
    operationId: entity.operationId,
    ownerType: entity.ownerType,
    ownerKey: entity.ownerKey,
    groupId: entity.groupId,
    userLogId: entity.userLogId,
    assistantLogId: entity.assistantLogId,
    turnId: entity.turnId,
    modelKeyId: entity.modelKeyId,
  };
}

@Injectable()
export class AgentOperationStore implements AgentOperationRepositoryPort {
  private readonly leaseOwner = `runtime_${process.pid}_${randomBytes(8).toString('hex')}`;

  constructor(
    @InjectRepository(AgentOperationEntity)
    private readonly operations: Repository<AgentOperationEntity>,
    @InjectRepository(AgentEffectEntity)
    private readonly effects: Repository<AgentEffectEntity>,
  ) {}

  async admitInTransaction(
    manager: EntityManager,
    rawIdentity: AgentOperationIdentity,
  ): Promise<AgentOperationIdentity> {
    const identity = assertAgentOperationIdentity(rawIdentity);
    const repository = manager.getRepository(AgentOperationEntity);
    const existing = await repository.findOne({ where: { operationId: identity.operationId } });
    if (existing) {
      if (!sameIdentity(existing, identity)) throw new Error('Agent operation identity mismatch');
      return identityOf(existing);
    }
    try {
      const now = new Date();
      const saved = await repository.save(
        repository.create({
          ...identity,
          phase: 'admitted',
          generation: 0,
          // Admission 与首次 claim 分属两个事务；先用当前实例的短租约保留
          // 这段交接窗口，避免其他实例的恢复扫描把刚提交的正常请求抢走。
          leaseOwner: this.leaseOwner,
          leaseExpiresAt: addSeconds(now, DEFAULT_LEASE_MS),
          heartbeatAt: now,
          cancelRequestedAt: null,
          cancelRequestedGeneration: null,
          retryNotBefore: null,
          usageInputTokens: 0,
          usageOutputTokens: 0,
          usageTotalTokens: 0,
          toolCost: '0',
          billingPhase: 'none',
          settlementMode: null,
          settlementTotalTokens: 0,
          settlementToolCost: '0',
          chargedAmount: 0,
          terminalReason: null,
        }),
      );
      return identityOf(saved);
    } catch (error) {
      if ((error as any)?.code !== 'ER_DUP_ENTRY' && (error as any)?.errno !== 1062) throw error;
      const duplicate = await repository.findOne({ where: { operationId: identity.operationId } });
      if (!duplicate || !sameIdentity(duplicate, identity)) {
        throw new Error('Agent operation identity conflict');
      }
      return identityOf(duplicate);
    }
  }

  async loadIdentityByAssistantInTransaction(
    manager: EntityManager,
    assistantLogId: number,
  ): Promise<AgentOperationIdentity | null> {
    const normalizedId = Math.floor(Number(assistantLogId) || 0);
    if (normalizedId <= 0) throw new Error('Invalid agent operation assistant log');
    const entity = await manager
      .getRepository(AgentOperationEntity)
      .findOne({ where: { assistantLogId: normalizedId } });
    return entity ? identityOf(entity) : null;
  }

  async claim(
    rawIdentity: AgentOperationIdentity,
    input: { recovery?: boolean; abortController?: AbortController } = {},
  ): Promise<AgentOperationSession> {
    const identity = assertAgentOperationIdentity(rawIdentity);
    const now = new Date();
    const operation = await this.operations.manager.transaction(async manager => {
      const repository = manager.getRepository(AgentOperationEntity);
      const current = await repository.findOne({
        where: { operationId: identity.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || !sameIdentity(current, identity)) {
        throw new Error('Agent operation claim identity mismatch');
      }
      if (isTerminalOperationPhase(current.phase)) throw new Error('Agent operation is terminal');
      if (current.cancelRequestedAt && !input.recovery) {
        throw new AgentOperationCancelledError();
      }
      if (current.retryNotBefore && current.retryNotBefore > now) {
        throw new Error('Agent operation retry is not ready');
      }
      const ownsAdmissionReservation =
        !input.recovery &&
        current.phase === 'admitted' &&
        current.generation === 0 &&
        current.leaseOwner === this.leaseOwner;
      if (
        current.leaseOwner &&
        current.leaseExpiresAt &&
        current.leaseExpiresAt > now &&
        !ownsAdmissionReservation
      ) {
        throw new Error('Agent operation lease is active');
      }
      current.generation = Math.max(0, Number(current.generation) || 0) + 1;
      current.phase = input.recovery ? 'recovering' : 'running';
      current.leaseOwner = this.leaseOwner;
      current.heartbeatAt = now;
      current.leaseExpiresAt = addSeconds(now, DEFAULT_LEASE_MS);
      return repository.save(current);
    });
    const session = new AgentOperationSession(
      this,
      identityOf(operation),
      {
        operationId: operation.operationId,
        generation: operation.generation,
        leaseOwner: operation.leaseOwner!,
      },
      input.abortController,
      Boolean(input.recovery),
    );
    session.startHeartbeat();
    return session;
  }

  async findRecoverable(
    now = new Date(),
    limit = RECOVERY_BATCH_SIZE,
    afterId = 0,
  ): Promise<AgentOperationEntity[]> {
    const phase = In<AgentOperationPhase>(['admitted', 'running', 'recovering']);
    return this.operations.find({
      where: [
        { id: MoreThan(afterId), phase, leaseExpiresAt: IsNull(), retryNotBefore: IsNull() },
        {
          id: MoreThan(afterId),
          phase,
          leaseExpiresAt: IsNull(),
          retryNotBefore: LessThanOrEqual(now),
        },
        {
          id: MoreThan(afterId),
          phase,
          leaseExpiresAt: LessThanOrEqual(now),
          retryNotBefore: IsNull(),
        },
        {
          id: MoreThan(afterId),
          phase,
          leaseExpiresAt: LessThanOrEqual(now),
          retryNotBefore: LessThanOrEqual(now),
        },
      ],
      order: { id: 'ASC' },
      take: Math.max(1, Math.min(RECOVERY_BATCH_SIZE, Math.floor(limit) || RECOVERY_BATCH_SIZE)),
    });
  }

  async listEffects(operationId: string): Promise<AgentEffectEntity[]> {
    return this.effects.find({
      where: { operationId },
      order: { roundIndex: 'ASC', ordinal: 'ASC', attemptIndex: 'ASC', id: 'ASC' },
    });
  }

  async findByAssistantLogId(assistantLogId: number): Promise<AgentOperationEntity | null> {
    const normalizedId = Math.floor(Number(assistantLogId) || 0);
    if (normalizedId <= 0) throw new Error('Invalid agent operation assistant log');
    return this.operations.findOne({ where: { assistantLogId: normalizedId } });
  }

  identityFrom(entity: AgentOperationEntity): AgentOperationIdentity {
    return assertAgentOperationIdentity(identityOf(entity));
  }

  async heartbeat(fence: AgentOperationFence, allowCancelled = false): Promise<boolean> {
    const now = new Date();
    const result = await this.operations.update(
      {
        operationId: fence.operationId,
        generation: fence.generation,
        leaseOwner: fence.leaseOwner,
        phase: In(['running', 'recovering']),
        ...(allowCancelled ? {} : { cancelRequestedAt: IsNull() }),
      },
      { heartbeatAt: now, leaseExpiresAt: addSeconds(now, DEFAULT_LEASE_MS) },
    );
    return Number(result.affected || 0) === 1;
  }

  async isCancelRequested(fence: AgentOperationFence): Promise<boolean> {
    const operation = await this.operations.findOne({
      where: {
        operationId: fence.operationId,
        generation: fence.generation,
        leaseOwner: fence.leaseOwner,
        phase: In(['running', 'recovering']),
      },
    });
    if (!operation?.leaseExpiresAt || operation.leaseExpiresAt <= new Date()) {
      throw new Error('Agent operation generation fence rejected');
    }
    return Boolean(operation.cancelRequestedAt);
  }

  async setRetryNotBefore(fence: AgentOperationFence, value: Date): Promise<void> {
    const notBefore = new Date(value);
    if (!Number.isFinite(notBefore.getTime()))
      throw new Error('Invalid agent operation retry gate');
    await this.withFence(fence, async input => {
      if (input.operation.cancelRequestedAt) throw new AgentOperationCancelledError();
      input.operation.retryNotBefore = notBefore;
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
    });
  }

  async clearRetryNotBefore(fence: AgentOperationFence): Promise<void> {
    await this.withFence(fence, async input => {
      if (input.operation.cancelRequestedAt) throw new AgentOperationCancelledError();
      input.operation.retryNotBefore = null;
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
    });
  }

  private async withFence<T>(
    fence: AgentOperationFence,
    callback: (input: {
      manager: EntityManager;
      operation: AgentOperationEntity;
      operationRepository: Repository<AgentOperationEntity>;
      effectRepository: Repository<AgentEffectEntity>;
      now: Date;
    }) => Promise<T>,
  ): Promise<T> {
    return this.operations.manager.transaction(async manager => {
      const operationRepository = manager.getRepository(AgentOperationEntity);
      const effectRepository = manager.getRepository(AgentEffectEntity);
      const operation = await operationRepository.findOne({
        where: { operationId: fence.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (
        !operation ||
        operation.generation !== fence.generation ||
        operation.leaseOwner !== fence.leaseOwner ||
        isTerminalOperationPhase(operation.phase) ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        throw new Error('Agent operation generation fence rejected');
      }
      return callback({ manager, operation, operationRepository, effectRepository, now });
    });
  }

  private touch(operation: AgentOperationEntity, now: Date): void {
    operation.heartbeatAt = now;
    operation.leaseExpiresAt = addSeconds(now, DEFAULT_LEASE_MS);
  }

  async beginModelEffect(
    fence: AgentOperationFence,
    intent: AgentModelEffectIntent,
  ): Promise<AgentModelEffectDecision> {
    const effectKey = effectKeyForModel(intent.roundIndex, intent.attemptIndex);
    const fingerprint = fingerprintModelIntent(intent);
    return this.withFence(fence, async input => {
      if (input.operation.cancelRequestedAt) throw new AgentOperationCancelledError();
      const existing = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        if (existing.kind !== 'model' || existing.intentFingerprint !== fingerprint) {
          throw new Error('Agent model effect identity conflict');
        }
        return { action: 'unknown', effectKey };
      }
      const effect = await input.effectRepository.save(
        input.effectRepository.create({
          operationId: fence.operationId,
          effectKey,
          kind: 'model',
          roundIndex: intent.roundIndex,
          ordinal: 0,
          attemptIndex: intent.attemptIndex,
          callId: null,
          toolName: null,
          intentFingerprint: fingerprint,
          intentPayload: null,
          replayPolicy: 'never',
          state: 'intent',
          claimedGeneration: fence.generation,
          recoveryAttempts: 0,
          checkpoint: null,
          outcome: null,
          terminalAt: null,
        }),
      );
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
      return { action: 'execute', effectKey: effect.effectKey };
    });
  }

  async checkpointModelEffect(
    fence: AgentOperationFence,
    effectKey: string,
    checkpointInput: AgentModelEffectCheckpoint,
  ): Promise<void> {
    const checkpoint = JSON.stringify(parseModelEffectCheckpoint(checkpointInput));
    await this.withFence(fence, async input => {
      const effect = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !effect ||
        effect.kind !== 'model' ||
        effect.claimedGeneration !== fence.generation ||
        (effect.state !== 'intent' && effect.state !== 'streaming')
      ) {
        throw new Error('Agent model checkpoint transition rejected');
      }
      effect.state = 'streaming';
      effect.checkpoint = checkpoint;
      await input.effectRepository.save(effect);
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
    });
  }

  async finishModelEffect(
    fence: AgentOperationFence,
    effectKey: string,
    state: Extract<AgentEffectState, 'committed' | 'rejected' | 'unknown'>,
    checkpointInput: AgentModelEffectCheckpoint,
  ): Promise<void> {
    const checkpoint = parseModelEffectCheckpoint(checkpointInput);
    await this.withFence(fence, async input => {
      const effect = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!effect || effect.kind !== 'model') throw new Error('Agent model effect is missing');
      if (isTerminalEffectState(effect.state)) {
        if (effect.state === state) return;
        throw new Error('Agent model effect terminal transition rejected');
      }
      if (effect.claimedGeneration !== fence.generation) {
        throw new Error('Agent model effect generation rejected');
      }
      effect.state = state;
      effect.checkpoint = JSON.stringify(checkpoint);
      effect.terminalAt = input.now;
      await input.effectRepository.save(effect);
      if (checkpoint.usage) {
        input.operation.usageInputTokens += checkpoint.usage.inputTokens;
        input.operation.usageOutputTokens += checkpoint.usage.outputTokens;
        input.operation.usageTotalTokens += checkpoint.usage.totalTokens;
      }
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
    });
  }

  async beginToolEffect(
    fence: AgentOperationFence,
    rawIntent: AgentStoredToolIntent,
  ): Promise<AgentToolEffectDecision> {
    const normalized = normalizeToolIntent(rawIntent);
    const effectKey = effectKeyForTool(normalized.value.roundIndex, normalized.value.ordinal);
    return this.withFence(fence, async input => {
      if (input.operation.cancelRequestedAt) throw new AgentOperationCancelledError();
      const existing = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        if (
          existing.kind !== 'tool' ||
          existing.intentFingerprint !== normalized.fingerprint ||
          existing.callId !== normalized.value.callId ||
          existing.toolName !== normalized.value.toolName
        ) {
          throw new Error('Agent tool effect identity conflict');
        }
        return existing.state === 'committed' && existing.outcome
          ? { action: 'reuse', effectKey, outcome: parseStoredToolOutcome(existing.outcome) }
          : { action: 'unknown', effectKey };
      }
      await input.effectRepository.save(
        input.effectRepository.create({
          operationId: fence.operationId,
          effectKey,
          kind: 'tool',
          roundIndex: normalized.value.roundIndex,
          ordinal: normalized.value.ordinal,
          attemptIndex: 0,
          callId: normalized.value.callId,
          toolName: normalized.value.toolName,
          intentFingerprint: normalized.fingerprint,
          intentPayload: normalized.serializedPayload,
          replayPolicy: normalized.value.replayPolicy,
          state: 'intent',
          claimedGeneration: fence.generation,
          recoveryAttempts: 0,
          checkpoint: null,
          outcome: null,
          terminalAt: null,
        }),
      );
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
      return { action: 'execute', effectKey };
    });
  }

  async commitToolEffect(
    fence: AgentOperationFence,
    effectKey: string,
    outcomeInput: AgentStoredToolOutcome,
  ): Promise<void> {
    const outcome = parseStoredToolOutcome(outcomeInput);
    await this.withFence(fence, async input => {
      const effect = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!effect || effect.kind !== 'tool') throw new Error('Agent tool effect is missing');
      if (effect.state === 'committed') {
        if (
          !effect.outcome ||
          JSON.stringify(parseStoredToolOutcome(effect.outcome)) !== JSON.stringify(outcome)
        ) {
          throw new Error('Agent tool outcome identity conflict');
        }
        return;
      }
      if (
        (effect.state !== 'intent' && effect.state !== 'replaying') ||
        effect.claimedGeneration !== fence.generation ||
        effect.callId !== outcome.callId ||
        effect.toolName !== outcome.toolName
      ) {
        throw new Error('Agent tool outcome transition rejected');
      }
      effect.state = 'committed';
      effect.outcome = JSON.stringify(outcome);
      effect.terminalAt = input.now;
      await input.effectRepository.save(effect);
      input.operation.toolCost = String(numericCost(input.operation.toolCost) + outcome.toolCost);
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
    });
  }

  async claimToolReplay(
    fence: AgentOperationFence,
    effectKey: string,
  ): Promise<AgentEffectEntity | null> {
    return this.withFence(fence, async input => {
      // 这是 recovery 工具真正获得派发资格的线性化边界。durable stop 与
      // replay claim 共用 operation 行锁；stop 先提交时不得再产生工具调用。
      if (input.operation.cancelRequestedAt) throw new AgentOperationCancelledError();
      const effect = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!effect || effect.kind !== 'tool' || effect.state !== 'intent') return null;
      if (effect.replayPolicy !== 'safe' || effect.recoveryAttempts !== 0) return null;
      effect.state = 'replaying';
      effect.claimedGeneration = fence.generation;
      effect.recoveryAttempts = 1;
      await input.effectRepository.save(effect);
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
      return effect;
    });
  }

  async settleEffectForRecovery(
    fence: AgentOperationFence,
    effectKey: string,
    state: Extract<AgentEffectState, 'interrupted' | 'unknown'>,
    outcomeInput?: AgentStoredToolOutcome,
  ): Promise<void> {
    const outcome = outcomeInput ? parseStoredToolOutcome(outcomeInput) : undefined;
    await this.withFence(fence, async input => {
      const effect = await input.effectRepository.findOne({
        where: { operationId: fence.operationId, effectKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!effect || isTerminalEffectState(effect.state)) return;
      effect.state = state;
      effect.claimedGeneration = fence.generation;
      effect.outcome = outcome ? JSON.stringify(outcome) : effect.outcome;
      effect.terminalAt = input.now;
      await input.effectRepository.save(effect);
      if (effect.kind === 'model' && effect.checkpoint) {
        try {
          const checkpoint = parseModelEffectCheckpoint(effect.checkpoint);
          if (checkpoint.usage) {
            input.operation.usageInputTokens += checkpoint.usage.inputTokens;
            input.operation.usageOutputTokens += checkpoint.usage.outputTokens;
            input.operation.usageTotalTokens += checkpoint.usage.totalTokens;
          }
        } catch {
          // checkpoint 只是恢复提示；损坏时仍要把未知 effect 安全收口，不能卡住 operation。
        }
      }
      this.touch(input.operation, input.now);
      await input.operationRepository.save(input.operation);
    });
  }

  async beginSettlement(
    fence: AgentOperationFence,
    input: { mode: AgentOperationSettlementMode; totalTokens: number; toolCost: number },
  ): Promise<void> {
    const mode = input.mode;
    const totalTokens = Math.max(0, Math.floor(Number(input.totalTokens) || 0));
    const toolCost = numericCost(input.toolCost);
    await this.withFence(fence, async context => {
      if (context.operation.cancelRequestedAt) throw new AgentOperationCancelledError();
      if (
        context.operation.billingPhase === 'settled' ||
        context.operation.billingPhase === 'settle_intent'
      ) {
        if (
          context.operation.settlementMode !== mode ||
          context.operation.settlementTotalTokens !== totalTokens ||
          numericCost(context.operation.settlementToolCost) !== toolCost
        ) {
          throw new Error('Agent operation billing settlement identity conflict');
        }
        return;
      }
      if (context.operation.billingPhase !== 'none') {
        throw new Error('Agent operation billing settlement transition rejected');
      }
      context.operation.billingPhase = 'settle_intent';
      context.operation.settlementMode = mode;
      context.operation.settlementTotalTokens = totalTokens;
      context.operation.settlementToolCost = String(toolCost);
      this.touch(context.operation, context.now);
      await context.operationRepository.save(context.operation);
    });
  }

  async completeSettlement(fence: AgentOperationFence, charged: number): Promise<void> {
    const normalizedCharged = Math.max(0, Math.floor(Number(charged) || 0));
    await this.withFence(fence, async context => {
      if (context.operation.billingPhase === 'settled') {
        if (context.operation.chargedAmount !== normalizedCharged) {
          throw new Error('Agent operation billing outcome identity conflict');
        }
        return;
      }
      if (context.operation.billingPhase !== 'settle_intent') {
        throw new Error('Agent operation billing settlement outcome rejected');
      }
      context.operation.billingPhase = 'settled';
      context.operation.chargedAmount = normalizedCharged;
      this.touch(context.operation, context.now);
      await context.operationRepository.save(context.operation);
    });
  }

  async beginRefund(fence: AgentOperationFence): Promise<void> {
    await this.withFence(fence, async context => {
      if (context.operation.billingPhase === 'refunded') return;
      context.operation.billingPhase = 'refund_intent';
      this.touch(context.operation, context.now);
      await context.operationRepository.save(context.operation);
    });
  }

  async completeRefund(fence: AgentOperationFence): Promise<void> {
    await this.withFence(fence, async context => {
      if (context.operation.billingPhase === 'refunded') return;
      if (context.operation.billingPhase !== 'refund_intent') {
        throw new Error('Agent operation billing refund outcome rejected');
      }
      context.operation.billingPhase = 'refunded';
      this.touch(context.operation, context.now);
      await context.operationRepository.save(context.operation);
    });
  }

  async markBillingUnknown(fence: AgentOperationFence): Promise<void> {
    await this.withFence(fence, async context => {
      if (context.operation.billingPhase === 'unknown') return;
      if (context.operation.billingPhase !== 'settle_intent') {
        throw new Error('Agent operation billing unknown transition rejected');
      }
      context.operation.billingPhase = 'unknown';
      this.touch(context.operation, context.now);
      await context.operationRepository.save(context.operation);
    });
  }

  async updateChatLogIfCurrent(
    fence: AgentOperationFence,
    chatLogId: number,
    patch: Partial<ChatLogEntity>,
  ): Promise<boolean> {
    return this.withFence(fence, async context => {
      if (![context.operation.userLogId, context.operation.assistantLogId].includes(chatLogId)) {
        throw new Error('Agent operation chatlog binding rejected');
      }
      const result = await context.manager
        .getRepository(ChatLogEntity)
        .update({ id: chatLogId }, patch);
      this.touch(context.operation, context.now);
      await context.operationRepository.save(context.operation);
      return Number(result.affected || 0) === 1;
    });
  }

  async terminalizeWithAssistant(
    fence: AgentOperationFence,
    input: {
      assistantLogId: number;
      phase: Extract<AgentOperationPhase, 'completed' | 'failed' | 'interrupted'>;
      terminalReason: string;
      chatLogPatch: Partial<ChatLogEntity>;
    },
  ): Promise<boolean> {
    return this.operations.manager.transaction(async manager => {
      const operationRepository = manager.getRepository(AgentOperationEntity);
      const operation = await operationRepository.findOne({
        where: { operationId: fence.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      const terminalReason = String(input.terminalReason || input.phase).slice(0, 64);
      if (!operation || operation.assistantLogId !== input.assistantLogId) {
        throw new Error('Agent operation assistant binding rejected');
      }
      if (isTerminalOperationPhase(operation.phase)) {
        if (operation.phase === input.phase && operation.terminalReason === terminalReason) {
          return true;
        }
        throw new Error('Agent operation terminal identity conflict');
      }
      if (operation.cancelRequestedAt && !terminalReason.startsWith('user_cancelled')) {
        throw new AgentOperationCancelledError();
      }
      const now = new Date();
      if (
        operation.generation !== fence.generation ||
        operation.leaseOwner !== fence.leaseOwner ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        throw new Error('Agent operation generation fence rejected');
      }
      const chatResult = await manager
        .getRepository(ChatLogEntity)
        .update({ id: input.assistantLogId }, input.chatLogPatch);
      if (Number(chatResult.affected || 0) !== 1) {
        throw new Error('Agent operation assistant terminal write failed');
      }
      operation.phase = input.phase;
      operation.terminalReason = terminalReason;
      operation.retryNotBefore = null;
      operation.leaseOwner = null;
      operation.leaseExpiresAt = null;
      operation.heartbeatAt = now;
      await operationRepository.save(operation);
      return true;
    });
  }
}

export class AgentOperationSession {
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    private readonly store: AgentOperationStore,
    readonly identity: AgentOperationIdentity,
    readonly fence: AgentOperationFence,
    private readonly abortController?: AbortController,
    private readonly recovery = false,
  ) {}

  startHeartbeat(): void {
    if (this.closed || this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      void this.store
        .heartbeat(this.fence, this.recovery)
        .then(current => {
          if (!current) this.abortController?.abort(new Error('agent_operation_lease_lost'));
        })
        .catch(() => this.abortController?.abort(new Error('agent_operation_heartbeat_failed')));
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
  }

  isCancelRequested(): Promise<boolean> {
    return this.store.isCancelRequested(this.fence);
  }

  setRetryNotBefore(value: Date): Promise<void> {
    return this.store.setRetryNotBefore(this.fence, value);
  }

  clearRetryNotBefore(): Promise<void> {
    return this.store.clearRetryNotBefore(this.fence);
  }

  beginModelEffect(intent: AgentModelEffectIntent): Promise<AgentModelEffectDecision> {
    return this.store.beginModelEffect(this.fence, intent);
  }

  checkpointModelEffect(effectKey: string, checkpoint: AgentModelEffectCheckpoint): Promise<void> {
    return this.store.checkpointModelEffect(this.fence, effectKey, checkpoint);
  }

  finishModelEffect(
    effectKey: string,
    state: Extract<AgentEffectState, 'committed' | 'rejected' | 'unknown'>,
    checkpoint: AgentModelEffectCheckpoint,
  ): Promise<void> {
    return this.store.finishModelEffect(this.fence, effectKey, state, checkpoint);
  }

  beginToolEffect(intent: AgentStoredToolIntent): Promise<AgentToolEffectDecision> {
    return this.store.beginToolEffect(this.fence, intent);
  }

  commitToolEffect(effectKey: string, outcome: AgentStoredToolOutcome): Promise<void> {
    return this.store.commitToolEffect(this.fence, effectKey, outcome);
  }

  markToolEffectUnknown(effectKey: string): Promise<void> {
    return this.store.settleEffectForRecovery(this.fence, effectKey, 'unknown');
  }

  markToolEffectInterrupted(effectKey: string): Promise<void> {
    return this.store.settleEffectForRecovery(this.fence, effectKey, 'interrupted');
  }

  beginSettlement(input: {
    mode: AgentOperationSettlementMode;
    totalTokens: number;
    toolCost: number;
  }): Promise<void> {
    return this.store.beginSettlement(this.fence, input);
  }

  completeSettlement(charged: number): Promise<void> {
    return this.store.completeSettlement(this.fence, charged);
  }

  beginRefund(): Promise<void> {
    return this.store.beginRefund(this.fence);
  }

  completeRefund(): Promise<void> {
    return this.store.completeRefund(this.fence);
  }

  markBillingUnknown(): Promise<void> {
    return this.store.markBillingUnknown(this.fence);
  }

  updateChatLog(chatLogId: number, patch: Partial<ChatLogEntity>): Promise<boolean> {
    return this.store.updateChatLogIfCurrent(this.fence, chatLogId, patch);
  }

  async terminalize(input: {
    assistantLogId: number;
    phase: Extract<AgentOperationPhase, 'completed' | 'failed' | 'interrupted'>;
    terminalReason: string;
    chatLogPatch: Partial<ChatLogEntity>;
  }): Promise<boolean> {
    const result = await this.store.terminalizeWithAssistant(this.fence, input);
    this.close();
    return result;
  }
}
