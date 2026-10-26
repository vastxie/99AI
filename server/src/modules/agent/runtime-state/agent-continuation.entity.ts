import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';
import type { AgentContinuationKind, AgentContinuationStatus } from './continuation-inbox.types';

@Entity({ name: 'agent_continuation_inbox' })
@Index('uniq_agent_continuation_parent_operation', ['parentOperationId'], { unique: true })
@Index('uniq_agent_continuation_parent_assistant', ['parentAssistantLogId'], { unique: true })
@Index('idx_agent_continuation_recovery', ['status', 'claimExpiresAt', 'expiresAt', 'id'])
@Index('idx_agent_continuation_owner', ['ownerType', 'ownerKey', 'status'])
export class AgentContinuationEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 128, comment: '父 Agent operation ID' })
  parentOperationId: string;

  @Column({ type: 'int', comment: '父助手 chatlog ID' })
  parentAssistantLogId: number;

  @Column({ type: 'varchar', length: 128, comment: '父 Agent turn ID' })
  parentTurnId: string;

  @Column({ type: 'varchar', length: 16, comment: '归属类型: user/visitor' })
  ownerType: 'user' | 'visitor';

  @Column({ type: 'varchar', length: 128, comment: '规范化归属 ID' })
  ownerKey: string;

  @Column({ type: 'int', comment: '会话内部 ID' })
  groupId: number;

  @Column({ type: 'varchar', length: 64, comment: '会话公开 gid' })
  conversationGid: string;

  @Column({ type: 'varchar', length: 16, default: 'follow_up', comment: '接续类型' })
  kind: AgentContinuationKind;

  @Column({ type: 'varchar', length: 16, default: 'pending', comment: '接续状态' })
  status: AgentContinuationStatus;

  @Column({ type: 'int', default: 1, comment: '同一父轮的替换序号' })
  sequence: number;

  @Column({ type: 'varchar', length: 96, comment: '子轮稳定 submission ID' })
  submissionId: string;

  @Column({ type: 'char', length: 64, comment: '最小 payload 的 canonical SHA-256' })
  payloadFingerprint: string;

  @Column({ type: 'longtext', comment: '严格字段白名单的最小接续 payload JSON' })
  payload: string;

  @Column({ type: 'int', nullable: true, comment: '最后认领的父 operation generation' })
  claimedGeneration: number | null;

  @Column({ type: 'char', length: 64, nullable: true, comment: '内部认领 token' })
  claimToken: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '认领租约到期时间' })
  claimExpiresAt: Date | null;

  @Column({ type: 'datetime', comment: '接续过期时间' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '消费完成时间' })
  consumedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '低基数丢弃或过期原因' })
  terminalReason: string | null;
}
