import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'agent_context_checkpoint' })
@Index('uniq_agent_context_checkpoint_group', ['groupId'], { unique: true })
@Index('idx_agent_context_checkpoint_owner', ['ownerType', 'ownerKey', 'valid'])
export class AgentContextCheckpointEntity extends BaseEntity {
  @Column({ comment: '会话内部 ID' })
  groupId: number;

  @Column({ type: 'varchar', length: 16, comment: '归属类型: user/visitor' })
  ownerType: 'user' | 'visitor';

  @Column({ type: 'varchar', length: 128, comment: '规范化归属 ID' })
  ownerKey: string;

  @Column({ type: 'int', default: 1, comment: 'ContextCheckpoint 合同版本' })
  policyVersion: number;

  @Column({ type: 'int', default: 0, comment: '源历史变更与异步写入的 CAS 围栏' })
  sourceRevision: number;

  @Column({ type: 'int', comment: '被摘要前缀的首条 chatlog ID' })
  sourceStartLogId: number;

  @Column({ type: 'int', comment: '已被摘要覆盖到的 chatlog ID' })
  compactedThroughLogId: number;

  @Column({ type: 'int', nullable: true, comment: '保留尾部的首条 chatlog ID' })
  retainedTailStartLogId: number | null;

  @Column({ type: 'int', nullable: true, comment: '保留尾部的末条 chatlog ID' })
  retainedTailEndLogId: number | null;

  @Column({ type: 'int', default: 0, comment: '保留尾部的原子组数量' })
  retainedTailGroupCount: number;

  @Column({ type: 'boolean', default: false, comment: '是否已回填到会话最早可见边界' })
  backfillComplete: boolean;

  @Column({ type: 'longtext', comment: '严格校验后的 ContextCheckpointV1 JSON' })
  summary: string;

  @Column({ type: 'char', length: 64, comment: 'summary SHA-256' })
  summaryChecksum: string;

  @Column({ type: 'varchar', length: 191, comment: '生成摘要的 protocol:model 身份' })
  modelIdentity: string;

  @Column({ type: 'int', default: 0, comment: '被摘要输入的估算 token' })
  estimatedInputTokens: number;

  @Column({ type: 'int', default: 0, comment: '摘要调用实际输入 token' })
  compactionInputTokens: number;

  @Column({ type: 'int', default: 0, comment: '摘要调用实际输出 token' })
  compactionOutputTokens: number;

  @Column({ type: 'boolean', default: true, comment: '是否为当前有效派生投影' })
  valid: boolean;

  @Column({ type: 'datetime', nullable: true, comment: '失效时间' })
  invalidatedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '低基数失效原因' })
  invalidationReason: string | null;
}
