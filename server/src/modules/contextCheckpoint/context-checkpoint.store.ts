import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AgentContextCheckpointEntity } from './context-checkpoint.entity';
import {
  AgentRuntimeOwner,
  ContextCheckpointV1,
  parseContextCheckpointV1,
} from './context-checkpoint.types';

export interface SaveContextCheckpointInput extends AgentRuntimeOwner {
  groupId: number;
  expectedSourceRevision: number;
  sourceStartLogId: number;
  compactedThroughLogId: number;
  retainedTailStartLogId?: number | null;
  retainedTailEndLogId?: number | null;
  retainedTailGroupCount?: number;
  backfillComplete: boolean;
  summary: ContextCheckpointV1;
  modelIdentity: string;
  estimatedInputTokens: number;
  compactionInputTokens: number;
  compactionOutputTokens: number;
}

function assertOwner(owner: AgentRuntimeOwner): void {
  if (
    !['user', 'visitor'].includes(owner.ownerType) ||
    !owner.ownerKey ||
    owner.ownerKey.length > 128
  ) {
    throw new Error('Invalid agent runtime owner');
  }
}

@Injectable()
export class AgentContextCheckpointStore {
  constructor(
    @InjectRepository(AgentContextCheckpointEntity)
    private readonly repository: Repository<AgentContextCheckpointEntity>,
  ) {}

  async loadValid(
    groupId: number,
    owner: AgentRuntimeOwner,
    expectedSourceRevision?: number,
  ): Promise<AgentContextCheckpointEntity | null> {
    assertOwner(owner);
    const checkpoint = await this.repository.findOne({
      where: {
        groupId: Math.floor(groupId),
        ownerType: owner.ownerType,
        ownerKey: owner.ownerKey,
        valid: true,
      },
    });
    if (!checkpoint) return null;
    try {
      const summary = parseContextCheckpointV1(checkpoint.summary);
      const checksum = createHash('sha256').update(JSON.stringify(summary)).digest('hex');
      if (
        checkpoint.policyVersion !== 1 ||
        checkpoint.sourceRevision <= 0 ||
        (expectedSourceRevision !== undefined &&
          checkpoint.sourceRevision !== expectedSourceRevision) ||
        checkpoint.sourceStartLogId <= 0 ||
        checkpoint.compactedThroughLogId < checkpoint.sourceStartLogId ||
        checksum !== checkpoint.summaryChecksum
      ) {
        throw new Error('invalid checkpoint metadata');
      }
      return checkpoint;
    } catch {
      if (expectedSourceRevision !== undefined) {
        await this.invalidateAtRevision(
          groupId,
          owner,
          expectedSourceRevision,
          'payload_validation_failed',
        );
      } else {
        await this.invalidateGroup(groupId, 'payload_validation_failed');
      }
      return null;
    }
  }

  /**
   * 在读取历史前取得一个持久写入世代。删除路径会递增同一 revision，
   * 因而更早开始的摘要无法在删除提交后重新激活旧投影。
   */
  async beginProjection(groupId: number, owner: AgentRuntimeOwner): Promise<number> {
    assertOwner(owner);
    const normalizedGroupId = Math.floor(groupId);
    if (normalizedGroupId <= 0) throw new Error('Invalid context checkpoint group');

    const begin = async (): Promise<number> =>
      this.repository.manager.transaction(async manager => {
        const repository = manager.getRepository(AgentContextCheckpointEntity);
        const current = await repository.findOne({
          where: { groupId: normalizedGroupId },
          lock: { mode: 'pessimistic_write' },
        });
        if (current) {
          if (current.ownerType !== owner.ownerType || current.ownerKey !== owner.ownerKey) {
            throw new Error('Context checkpoint owner mismatch');
          }
          current.sourceRevision = Math.max(0, Number(current.sourceRevision) || 0) + 1;
          await repository.save(current);
          return current.sourceRevision;
        }

        const sourceRevision = 1;
        await repository.save(
          repository.create({
            groupId: normalizedGroupId,
            ownerType: owner.ownerType,
            ownerKey: owner.ownerKey,
            policyVersion: 1,
            sourceRevision,
            sourceStartLogId: 0,
            compactedThroughLogId: 0,
            retainedTailStartLogId: null,
            retainedTailEndLogId: null,
            retainedTailGroupCount: 0,
            backfillComplete: false,
            summary: '{}',
            summaryChecksum: '0'.repeat(64),
            modelIdentity: '',
            estimatedInputTokens: 0,
            compactionInputTokens: 0,
            compactionOutputTokens: 0,
            valid: false,
            invalidatedAt: null,
            invalidationReason: 'projection_pending',
          }),
        );
        return sourceRevision;
      });

    try {
      return await begin();
    } catch (error) {
      if ((error as any)?.code !== 'ER_DUP_ENTRY' && (error as any)?.errno !== 1062) throw error;
      return begin();
    }
  }

  async replace(input: SaveContextCheckpointInput): Promise<AgentContextCheckpointEntity | null> {
    assertOwner(input);
    const groupId = Math.floor(input.groupId);
    const sourceStartLogId = Math.floor(input.sourceStartLogId);
    const compactedThroughLogId = Math.floor(input.compactedThroughLogId);
    const expectedSourceRevision = Math.floor(input.expectedSourceRevision);
    if (
      groupId <= 0 ||
      expectedSourceRevision <= 0 ||
      sourceStartLogId <= 0 ||
      compactedThroughLogId < sourceStartLogId
    ) {
      throw new Error('Invalid context checkpoint boundary');
    }
    const summary = parseContextCheckpointV1(input.summary);
    const serialized = JSON.stringify(summary);
    const summaryChecksum = createHash('sha256').update(serialized).digest('hex');

    return this.repository.manager.transaction(async manager => {
      const repository = manager.getRepository(AgentContextCheckpointEntity);
      const current = await repository.findOne({
        where: { groupId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.sourceRevision !== expectedSourceRevision) return null;
      if (current.ownerType !== input.ownerType || current.ownerKey !== input.ownerKey) {
        throw new Error('Context checkpoint owner mismatch');
      }
      if (current?.valid && current.compactedThroughLogId > compactedThroughLogId) {
        return current;
      }
      const entity = repository.create({
        ...current,
        groupId,
        ownerType: input.ownerType,
        ownerKey: input.ownerKey,
        policyVersion: 1,
        sourceRevision: expectedSourceRevision,
        sourceStartLogId,
        compactedThroughLogId,
        retainedTailStartLogId: input.retainedTailStartLogId ?? null,
        retainedTailEndLogId: input.retainedTailEndLogId ?? null,
        retainedTailGroupCount: Math.max(0, Math.floor(input.retainedTailGroupCount || 0)),
        backfillComplete: Boolean(input.backfillComplete),
        summary: serialized,
        summaryChecksum,
        modelIdentity: String(input.modelIdentity || '').slice(0, 191),
        estimatedInputTokens: Math.max(0, Math.floor(input.estimatedInputTokens || 0)),
        compactionInputTokens: Math.max(0, Math.floor(input.compactionInputTokens || 0)),
        compactionOutputTokens: Math.max(0, Math.floor(input.compactionOutputTokens || 0)),
        valid: true,
        invalidatedAt: null,
        invalidationReason: null,
      });
      return repository.save(entity);
    });
  }

  async invalidateAtRevision(
    groupId: number,
    owner: AgentRuntimeOwner,
    expectedSourceRevision: number,
    reason: string,
  ): Promise<number> {
    assertOwner(owner);
    const result = await this.repository.update(
      {
        groupId: Math.floor(groupId),
        ownerType: owner.ownerType,
        ownerKey: owner.ownerKey,
        sourceRevision: Math.floor(expectedSourceRevision),
      },
      {
        valid: false,
        invalidatedAt: new Date(),
        invalidationReason: String(reason || 'source_changed').slice(0, 64),
      },
    );
    return Number(result.affected || 0);
  }

  async invalidateGroup(groupId: number, reason: string, manager?: EntityManager): Promise<number> {
    const normalizedGroupId = Math.floor(groupId);
    if (normalizedGroupId <= 0) return 0;
    const repository = manager
      ? manager.getRepository(AgentContextCheckpointEntity)
      : this.repository;
    const result = await repository
      .createQueryBuilder()
      .update(AgentContextCheckpointEntity)
      .set({
        valid: false,
        sourceRevision: () => 'sourceRevision + 1',
        invalidatedAt: new Date(),
        invalidationReason: String(reason || 'source_changed').slice(0, 64),
      })
      .where('groupId = :groupId', { groupId: normalizedGroupId })
      .execute();
    return Number(result.affected || 0);
  }
}
