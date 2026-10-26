import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { AgentContinuationEntity } from './agent-continuation.entity';
import { AgentOperationEntity } from './agent-operation.entity';
import {
  AgentContinuationClaim,
  AgentContinuationParentBinding,
  AgentContinuationPayload,
  assertAgentContinuationClaim,
  assertAgentContinuationParentBinding,
  normalizeAgentContinuationPayload,
  serializeAgentContinuationPayload,
} from './continuation-inbox.types';
import { isTerminalOperationPhase } from './operation-ledger.types';

const CONTINUATION_TTL_MS = 10 * 60 * 1000;
const CONTINUATION_CLAIM_MS = 60_000;
const CONTINUATION_RECOVERY_BATCH = 100;

export class AgentContinuationConflictError extends Error {
  readonly code = 'SUBMISSION_CONFLICT';

  constructor() {
    super('submissionId 已用于另一项请求');
    this.name = 'AgentContinuationConflictError';
  }
}

export class AgentContinuationStateError extends Error {
  readonly code = 'TURN_MISMATCH';

  constructor(message = '当前任务状态已变化，请刷新后重试') {
    super(message);
    this.name = 'AgentContinuationStateError';
  }
}

export interface AgentContinuationEnqueueResult {
  replaced: boolean;
  duplicate: boolean;
  sequence: number;
  payload: AgentContinuationPayload;
  expiresAt: Date;
}

export interface AgentOperationCancelResult {
  requested: boolean;
  alreadyRequested: boolean;
  continuationDiscarded: boolean;
  terminalPhase?: string;
}

function addMilliseconds(now: Date, milliseconds: number): Date {
  return new Date(now.getTime() + milliseconds);
}

function operationMatchesBinding(
  operation: AgentOperationEntity,
  binding: AgentContinuationParentBinding,
): boolean {
  return (
    operation.operationId === binding.operationId &&
    operation.assistantLogId === binding.parentAssistantLogId &&
    operation.turnId === binding.parentTurnId &&
    operation.ownerType === binding.ownerType &&
    operation.ownerKey === binding.ownerKey &&
    operation.groupId === binding.groupId
  );
}

function entityMatchesBinding(
  entity: AgentContinuationEntity,
  binding: AgentContinuationParentBinding,
): boolean {
  return (
    entity.parentOperationId === binding.operationId &&
    entity.parentAssistantLogId === binding.parentAssistantLogId &&
    entity.parentTurnId === binding.parentTurnId &&
    entity.ownerType === binding.ownerType &&
    entity.ownerKey === binding.ownerKey &&
    entity.groupId === binding.groupId &&
    entity.conversationGid === binding.conversationGid
  );
}

function bindingFromEntity(
  entity: AgentContinuationEntity,
  generation: number,
): AgentContinuationParentBinding {
  return assertAgentContinuationParentBinding({
    operationId: entity.parentOperationId,
    parentAssistantLogId: entity.parentAssistantLogId,
    parentTurnId: entity.parentTurnId,
    ownerType: entity.ownerType,
    ownerKey: entity.ownerKey,
    groupId: entity.groupId,
    conversationGid: entity.conversationGid,
    generation,
  });
}

function claimFromEntity(entity: AgentContinuationEntity): AgentContinuationClaim {
  if (!entity.claimToken || entity.claimedGeneration === null) {
    throw new Error('Agent continuation claim is incomplete');
  }
  return assertAgentContinuationClaim({
    ...bindingFromEntity(entity, entity.claimedGeneration),
    inboxId: entity.id,
    kind: entity.kind,
    sequence: entity.sequence,
    claimToken: entity.claimToken,
    payloadFingerprint: entity.payloadFingerprint,
    payload: normalizeAgentContinuationPayload(entity.payload),
  });
}

/**
 * Inbox 终态只保留审计/幂等所需的低敏元数据。`{}` 对 active payload
 * parser 是无效 tombstone，若状态机误把终态行当 active 使用会 fail closed。
 */
function terminalizeContinuation(
  entity: AgentContinuationEntity,
  status: Extract<AgentContinuationEntity['status'], 'consumed' | 'discarded' | 'expired'>,
  reason: string,
  consumedAt: Date | null = null,
): void {
  entity.status = status;
  entity.payload = '{}';
  entity.claimedGeneration = null;
  entity.claimToken = null;
  entity.claimExpiresAt = null;
  entity.consumedAt = consumedAt;
  entity.terminalReason = String(reason || status).slice(0, 64);
}

@Injectable()
export class AgentContinuationStore {
  constructor(
    @InjectRepository(AgentContinuationEntity)
    private readonly continuations: Repository<AgentContinuationEntity>,
    @InjectRepository(AgentOperationEntity)
    private readonly operations: Repository<AgentOperationEntity>,
  ) {}

  async enqueue(input: {
    binding: AgentContinuationParentBinding;
    payload: AgentContinuationPayload;
    now?: Date;
  }): Promise<AgentContinuationEnqueueResult> {
    const binding = assertAgentContinuationParentBinding(input.binding);
    const normalized = serializeAgentContinuationPayload(input.payload);
    if (
      normalized.value.parentTurnId !== binding.parentTurnId ||
      normalized.value.gid !== binding.conversationGid
    ) {
      throw new AgentContinuationStateError();
    }
    const now = input.now || new Date();
    return this.continuations.manager.transaction(async manager => {
      const operationRepository = manager.getRepository(AgentOperationEntity);
      const continuationRepository = manager.getRepository(AgentContinuationEntity);
      const operation = await operationRepository.findOne({
        where: { operationId: binding.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !operation ||
        !operationMatchesBinding(operation, binding) ||
        operation.generation !== binding.generation ||
        operation.phase !== 'running' ||
        operation.cancelRequestedAt ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        throw new AgentContinuationStateError();
      }

      let continuation = await continuationRepository.findOne({
        where: { parentOperationId: binding.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (continuation && !entityMatchesBinding(continuation, binding)) {
        throw new AgentContinuationStateError();
      }
      if (continuation?.status === 'claimed' || continuation?.status === 'consumed') {
        throw new AgentContinuationStateError();
      }
      if (
        continuation?.status === 'pending' &&
        continuation.expiresAt > now &&
        continuation.submissionId === normalized.value.submissionId
      ) {
        if (continuation.payloadFingerprint !== normalized.fingerprint) {
          throw new AgentContinuationConflictError();
        }
        return {
          replaced: false,
          duplicate: true,
          sequence: continuation.sequence,
          payload: normalizeAgentContinuationPayload(continuation.payload),
          expiresAt: continuation.expiresAt,
        };
      }

      const replaced = continuation?.status === 'pending';
      if (!continuation) {
        continuation = continuationRepository.create({
          parentOperationId: binding.operationId,
          parentAssistantLogId: binding.parentAssistantLogId,
          parentTurnId: binding.parentTurnId,
          ownerType: binding.ownerType,
          ownerKey: binding.ownerKey,
          groupId: binding.groupId,
          conversationGid: binding.conversationGid,
          kind: 'follow_up',
          sequence: 1,
        });
      } else {
        continuation.sequence = Math.max(1, Number(continuation.sequence) || 1) + 1;
      }
      continuation.status = 'pending';
      continuation.submissionId = normalized.value.submissionId;
      continuation.payloadFingerprint = normalized.fingerprint;
      continuation.payload = normalized.serialized;
      continuation.claimedGeneration = null;
      continuation.claimToken = null;
      continuation.claimExpiresAt = null;
      continuation.expiresAt = addMilliseconds(now, CONTINUATION_TTL_MS);
      continuation.consumedAt = null;
      continuation.terminalReason = null;
      const saved = await continuationRepository.save(continuation);
      return {
        replaced,
        duplicate: false,
        sequence: saved.sequence,
        payload: normalized.value,
        expiresAt: saved.expiresAt,
      };
    });
  }

  async peek(input: {
    binding: AgentContinuationParentBinding;
    now?: Date;
  }): Promise<AgentContinuationPayload | undefined> {
    const binding = assertAgentContinuationParentBinding(input.binding);
    const now = input.now || new Date();
    const entity = await this.continuations.findOne({
      where: {
        parentOperationId: binding.operationId,
        parentAssistantLogId: binding.parentAssistantLogId,
        parentTurnId: binding.parentTurnId,
        ownerType: binding.ownerType,
        ownerKey: binding.ownerKey,
        groupId: binding.groupId,
        conversationGid: binding.conversationGid,
        status: 'pending',
      },
    });
    if (!entity || entity.expiresAt <= now) return undefined;
    return normalizeAgentContinuationPayload(entity.payload);
  }

  async claimForParent(input: {
    binding: AgentContinuationParentBinding;
    now?: Date;
  }): Promise<AgentContinuationClaim | undefined> {
    const binding = assertAgentContinuationParentBinding(input.binding);
    const now = input.now || new Date();
    return this.continuations.manager.transaction(async manager => {
      const operationRepository = manager.getRepository(AgentOperationEntity);
      const continuationRepository = manager.getRepository(AgentContinuationEntity);
      const operation = await operationRepository.findOne({
        where: { operationId: binding.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !operation ||
        !operationMatchesBinding(operation, binding) ||
        operation.generation !== binding.generation ||
        !['running', 'recovering'].includes(operation.phase) ||
        operation.cancelRequestedAt ||
        !operation.leaseExpiresAt ||
        operation.leaseExpiresAt <= now
      ) {
        return undefined;
      }
      const continuation = await continuationRepository.findOne({
        where: { parentOperationId: binding.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!continuation || !entityMatchesBinding(continuation, binding)) return undefined;
      if (continuation.status !== 'pending') return undefined;
      if (continuation.expiresAt <= now) {
        terminalizeContinuation(continuation, 'expired', 'ttl_expired');
        await continuationRepository.save(continuation);
        return undefined;
      }
      continuation.status = 'claimed';
      continuation.claimedGeneration = binding.generation;
      continuation.claimToken = randomBytes(32).toString('hex');
      continuation.claimExpiresAt = addMilliseconds(now, CONTINUATION_CLAIM_MS);
      await continuationRepository.save(continuation);
      return claimFromEntity(continuation);
    });
  }

  async listRecoveryCandidates(
    now = new Date(),
    limit = CONTINUATION_RECOVERY_BATCH,
    afterId = 0,
  ): Promise<Array<Pick<AgentContinuationEntity, 'id'>>> {
    return this.continuations.find({
      where: [
        { id: MoreThan(afterId), status: 'pending' },
        {
          id: MoreThan(afterId),
          status: 'claimed',
          claimExpiresAt: IsNull(),
        },
        {
          id: MoreThan(afterId),
          status: 'claimed',
          claimExpiresAt: LessThanOrEqual(now),
        },
      ],
      select: { id: true },
      order: { id: 'ASC' },
      take: Math.max(
        1,
        Math.min(CONTINUATION_RECOVERY_BATCH, Math.floor(limit) || CONTINUATION_RECOVERY_BATCH),
      ),
    });
  }

  async claimForRecovery(
    inboxId: number,
    now = new Date(),
  ): Promise<AgentContinuationClaim | undefined> {
    const normalizedId = Math.floor(Number(inboxId) || 0);
    if (normalizedId <= 0) throw new Error('Invalid Agent continuation inbox');
    return this.continuations.manager.transaction(async manager => {
      const continuationRepository = manager.getRepository(AgentContinuationEntity);
      const operationRepository = manager.getRepository(AgentOperationEntity);
      // 所有会同时触碰 operation + continuation 的事务统一按这个顺序加锁。
      // 第一次读取只用于定位不可变的 parentOperationId，不持锁；拿到父 operation
      // 行锁后再重新锁定并校验 inbox，避免与 enqueue/cancel/consume 形成反向死锁。
      const candidate = await continuationRepository.findOne({ where: { id: normalizedId } });
      if (!candidate) return undefined;
      const operation = await operationRepository.findOne({
        where: { operationId: candidate.parentOperationId },
        lock: { mode: 'pessimistic_write' },
      });
      const continuation = await continuationRepository.findOne({
        where: { id: normalizedId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!continuation || !['pending', 'claimed'].includes(continuation.status)) return undefined;
      if (continuation.parentOperationId !== candidate.parentOperationId) {
        throw new AgentContinuationStateError();
      }
      if (continuation.expiresAt <= now) {
        terminalizeContinuation(continuation, 'expired', 'ttl_expired');
        await continuationRepository.save(continuation);
        return undefined;
      }
      if (
        continuation.status === 'claimed' &&
        continuation.claimExpiresAt &&
        continuation.claimExpiresAt > now
      ) {
        return undefined;
      }
      if (!operation || !operationMatchesBinding(operation, bindingFromEntity(continuation, 0))) {
        terminalizeContinuation(continuation, 'discarded', 'parent_missing');
        await continuationRepository.save(continuation);
        return undefined;
      }
      if (operation.cancelRequestedAt) {
        terminalizeContinuation(continuation, 'discarded', 'parent_cancelled');
        await continuationRepository.save(continuation);
        return undefined;
      }
      const launchable =
        operation.phase === 'completed' ||
        (operation.phase === 'interrupted' && operation.terminalReason === 'startup_recovery');
      if (!launchable) {
        if (isTerminalOperationPhase(operation.phase)) {
          terminalizeContinuation(continuation, 'discarded', 'parent_not_launchable');
          await continuationRepository.save(continuation);
        }
        return undefined;
      }
      continuation.status = 'claimed';
      continuation.claimedGeneration = operation.generation;
      continuation.claimToken = randomBytes(32).toString('hex');
      continuation.claimExpiresAt = addMilliseconds(now, CONTINUATION_CLAIM_MS);
      await continuationRepository.save(continuation);
      return claimFromEntity(continuation);
    });
  }

  async consumeForAdmissionInTransaction(
    manager: EntityManager,
    rawClaim: AgentContinuationClaim,
    input: {
      ownerType: 'user' | 'visitor';
      ownerKey: string;
      groupId: number;
      conversationGid: string;
      payload: AgentContinuationPayload;
      now?: Date;
    },
  ): Promise<void> {
    const claim = assertAgentContinuationClaim(rawClaim);
    const now = input.now || new Date();
    const continuation = await this.lockClaimForAdmissionInTransaction(
      manager,
      claim,
      input,
      now,
      true,
    );
    terminalizeContinuation(continuation, 'consumed', 'child_admitted', now);
    await manager.getRepository(AgentContinuationEntity).save(continuation);
  }

  /**
   * 在会话事务内、任何可变预检之前取得 operation -> inbox 行锁。
   * 调用方必须沿用同一个 EntityManager 到 child admission + consume 结束，
   * 这样 claim 即使跨过 60 秒租约也不能被另一实例换 token。
   */
  async lockForAdmissionInTransaction(
    manager: EntityManager,
    rawClaim: AgentContinuationClaim,
    input: {
      ownerType: 'user' | 'visitor';
      ownerKey: string;
      groupId: number;
      conversationGid: string;
      payload: AgentContinuationPayload;
      now?: Date;
    },
  ): Promise<void> {
    const claim = assertAgentContinuationClaim(rawClaim);
    await this.lockClaimForAdmissionInTransaction(
      manager,
      claim,
      input,
      input.now || new Date(),
      true,
    );
  }

  /** 前置锁已在同一事务持有时，claim lease 到时不撤销已线性化的 admission。 */
  async consumeLockedForAdmissionInTransaction(
    manager: EntityManager,
    rawClaim: AgentContinuationClaim,
    input: {
      ownerType: 'user' | 'visitor';
      ownerKey: string;
      groupId: number;
      conversationGid: string;
      payload: AgentContinuationPayload;
      now?: Date;
    },
  ): Promise<void> {
    const claim = assertAgentContinuationClaim(rawClaim);
    const now = input.now || new Date();
    const continuation = await this.lockClaimForAdmissionInTransaction(
      manager,
      claim,
      input,
      now,
      false,
    );
    terminalizeContinuation(continuation, 'consumed', 'child_admitted', now);
    await manager.getRepository(AgentContinuationEntity).save(continuation);
  }

  private async lockClaimForAdmissionInTransaction(
    manager: EntityManager,
    claim: AgentContinuationClaim,
    input: {
      ownerType: 'user' | 'visitor';
      ownerKey: string;
      groupId: number;
      conversationGid: string;
      payload: AgentContinuationPayload;
    },
    now: Date,
    requireLiveClaimLease: boolean,
  ): Promise<AgentContinuationEntity> {
    const normalizedPayload = serializeAgentContinuationPayload(input.payload);
    const operationRepository = manager.getRepository(AgentOperationEntity);
    const continuationRepository = manager.getRepository(AgentContinuationEntity);
    const operation = await operationRepository.findOne({
      where: { operationId: claim.operationId },
      lock: { mode: 'pessimistic_write' },
    });
    const binding = assertAgentContinuationParentBinding(claim);
    const launchable =
      operation?.phase === 'completed' ||
      (operation?.phase === 'interrupted' && operation.terminalReason === 'startup_recovery');
    if (
      !operation ||
      !operationMatchesBinding(operation, binding) ||
      operation.generation !== claim.generation ||
      operation.cancelRequestedAt ||
      !launchable
    ) {
      throw new AgentContinuationStateError();
    }
    const continuation = await continuationRepository.findOne({
      where: { id: claim.inboxId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !continuation ||
      !entityMatchesBinding(continuation, binding) ||
      continuation.status !== 'claimed' ||
      continuation.sequence !== claim.sequence ||
      continuation.claimToken !== claim.claimToken ||
      !continuation.claimExpiresAt ||
      (requireLiveClaimLease && continuation.claimExpiresAt <= now) ||
      continuation.expiresAt <= now ||
      continuation.claimedGeneration !== claim.generation ||
      continuation.payloadFingerprint !== claim.payloadFingerprint ||
      continuation.payloadFingerprint !== normalizedPayload.fingerprint ||
      continuation.submissionId !== normalizedPayload.value.submissionId ||
      input.ownerType !== claim.ownerType ||
      String(input.ownerKey) !== claim.ownerKey ||
      Number(input.groupId) !== claim.groupId ||
      input.conversationGid !== claim.conversationGid
    ) {
      throw new AgentContinuationStateError();
    }
    return continuation;
  }

  /** 当前 admission 已持有 operation/inbox 锁时使用；允许在慢预检后清理已到期 claim。 */
  async discardAdmissionInTransaction(
    manager: EntityManager,
    rawClaim: AgentContinuationClaim,
    reason: string,
  ): Promise<boolean> {
    const claim = assertAgentContinuationClaim(rawClaim);
    const continuation = await manager.getRepository(AgentContinuationEntity).findOne({
      where: { id: claim.inboxId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !continuation ||
      !entityMatchesBinding(continuation, claim) ||
      continuation.status !== 'claimed' ||
      continuation.sequence !== claim.sequence ||
      continuation.claimToken !== claim.claimToken ||
      continuation.claimedGeneration !== claim.generation ||
      continuation.payloadFingerprint !== claim.payloadFingerprint
    ) {
      return false;
    }
    terminalizeContinuation(continuation, 'discarded', reason || 'preflight_rejected');
    await manager.getRepository(AgentContinuationEntity).save(continuation);
    return true;
  }

  async discardForParent(
    rawBinding: AgentContinuationParentBinding,
    reason: string,
  ): Promise<boolean> {
    const binding = assertAgentContinuationParentBinding(rawBinding);
    return this.continuations.manager.transaction(async manager => {
      const operationRepository = manager.getRepository(AgentOperationEntity);
      const continuationRepository = manager.getRepository(AgentContinuationEntity);
      const operation = await operationRepository.findOne({
        where: { operationId: binding.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !operation ||
        !operationMatchesBinding(operation, binding) ||
        operation.generation !== binding.generation
      ) {
        throw new AgentContinuationStateError();
      }
      const continuation = await continuationRepository.findOne({
        where: { parentOperationId: binding.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !continuation ||
        !entityMatchesBinding(continuation, binding) ||
        !['pending', 'claimed'].includes(continuation.status)
      ) {
        return false;
      }
      terminalizeContinuation(continuation, 'discarded', reason || 'discarded');
      await continuationRepository.save(continuation);
      return true;
    });
  }

  async discardClaim(
    rawClaim: AgentContinuationClaim,
    reason: string,
    now = new Date(),
  ): Promise<boolean> {
    const claim = assertAgentContinuationClaim(rawClaim);
    return this.continuations.manager.transaction(async manager => {
      const continuationRepository = manager.getRepository(AgentContinuationEntity);
      const continuation = await continuationRepository.findOne({
        where: { id: claim.inboxId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !continuation ||
        !entityMatchesBinding(continuation, claim) ||
        continuation.status !== 'claimed' ||
        continuation.sequence !== claim.sequence ||
        continuation.claimToken !== claim.claimToken ||
        !continuation.claimExpiresAt ||
        continuation.claimExpiresAt <= now ||
        continuation.claimedGeneration !== claim.generation ||
        continuation.payloadFingerprint !== claim.payloadFingerprint
      ) {
        return false;
      }
      terminalizeContinuation(continuation, 'discarded', reason || 'launch_rejected');
      await continuationRepository.save(continuation);
      return true;
    });
  }

  async requestCancel(input: {
    parentAssistantLogId: number;
    ownerType: 'user' | 'visitor';
    ownerKey: string;
    expectedTurnId?: string;
    expectedGeneration?: number;
    now?: Date;
  }): Promise<AgentOperationCancelResult> {
    const parentAssistantLogId = Math.floor(Number(input.parentAssistantLogId) || 0);
    const ownerKey = String(input.ownerKey || '').trim();
    if (parentAssistantLogId <= 0 || !ownerKey) throw new AgentContinuationStateError();
    const now = input.now || new Date();
    return this.operations.manager.transaction(async manager => {
      const operationRepository = manager.getRepository(AgentOperationEntity);
      const continuationRepository = manager.getRepository(AgentContinuationEntity);
      const operation = await operationRepository.findOne({
        where: { assistantLogId: parentAssistantLogId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !operation ||
        operation.ownerType !== input.ownerType ||
        operation.ownerKey !== ownerKey ||
        (input.expectedTurnId && operation.turnId !== input.expectedTurnId) ||
        (input.expectedGeneration !== undefined &&
          operation.generation !== input.expectedGeneration)
      ) {
        throw new AgentContinuationStateError();
      }
      const alreadyRequested = Boolean(operation.cancelRequestedAt);
      const terminal = isTerminalOperationPhase(operation.phase);
      if (!terminal && !alreadyRequested) {
        operation.cancelRequestedAt = now;
        operation.cancelRequestedGeneration = operation.generation;
        await operationRepository.save(operation);
      }
      const continuation = await continuationRepository.findOne({
        where: { parentOperationId: operation.operationId },
        lock: { mode: 'pessimistic_write' },
      });
      let continuationDiscarded = false;
      if (continuation && ['pending', 'claimed'].includes(continuation.status)) {
        terminalizeContinuation(continuation, 'discarded', 'parent_cancelled');
        await continuationRepository.save(continuation);
        continuationDiscarded = true;
      }
      return {
        requested: !terminal,
        alreadyRequested,
        continuationDiscarded,
        ...(terminal ? { terminalPhase: operation.phase } : {}),
      };
    });
  }

  async countActive(now = new Date()): Promise<number> {
    return this.continuations.count({
      where: [
        { status: 'pending', expiresAt: MoreThan(now) },
        { status: 'claimed', expiresAt: MoreThan(now) },
      ],
    });
  }

  async expireDue(now = new Date()): Promise<number> {
    const result = await this.continuations.update(
      {
        status: In(['pending', 'claimed']),
        expiresAt: LessThanOrEqual(now),
      },
      {
        status: 'expired',
        payload: '{}',
        claimedGeneration: null,
        claimToken: null,
        claimExpiresAt: null,
        terminalReason: 'ttl_expired',
      },
    );
    return Number(result.affected || 0);
  }
}
