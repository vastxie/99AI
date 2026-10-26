import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';
import type {
  AgentOperationBillingPhase,
  AgentOperationPhase,
  AgentOperationSettlementMode,
} from './operation-ledger.types';

@Entity({ name: 'agent_operation' })
@Index('uniq_agent_operation_operation_id', ['operationId'], { unique: true })
@Index('uniq_agent_operation_assistant_log', ['assistantLogId'], { unique: true })
@Index('uniq_agent_operation_turn', ['turnId'], { unique: true })
@Index('idx_agent_operation_owner', ['ownerType', 'ownerKey', 'phase'])
@Index('idx_agent_operation_recovery', ['phase', 'leaseExpiresAt', 'retryNotBefore'])
export class AgentOperationEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 128, comment: '服务端生成的稳定 operation ID' })
  operationId: string;

  @Column({ type: 'varchar', length: 16, comment: '归属类型: user/visitor' })
  ownerType: 'user' | 'visitor';

  @Column({ type: 'varchar', length: 128, comment: '规范化归属 ID' })
  ownerKey: string;

  @Column({ type: 'int', comment: '会话内部 ID' })
  groupId: number;

  @Column({ type: 'int', comment: '当前用户 chatlog ID' })
  userLogId: number;

  @Column({ type: 'int', comment: '当前助手 chatlog ID' })
  assistantLogId: number;

  @Column({ type: 'varchar', length: 128, comment: '服务端 Agent turn ID' })
  turnId: string;

  @Column({ type: 'int', nullable: true, comment: '计费所用模型记录 ID' })
  modelKeyId: number | null;

  @Column({ type: 'varchar', length: 24, default: 'admitted', comment: 'operation 阶段' })
  phase: AgentOperationPhase;

  @Column({ type: 'int', default: 0, comment: '租约接管世代' })
  generation: number;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '当前租约持有者' })
  leaseOwner: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '租约到期时间' })
  leaseExpiresAt: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '最近持久心跳时间' })
  heartbeatAt: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '持久取消请求时间' })
  cancelRequestedAt: Date | null;

  @Column({ type: 'int', nullable: true, comment: '接受取消请求时的 generation' })
  cancelRequestedGeneration: number | null;

  @Column({ type: 'datetime', nullable: true, comment: '允许下次恢复的最早时间' })
  retryNotBefore: Date | null;

  @Column({ type: 'int', default: 0, comment: '已提交模型输入 token 合计' })
  usageInputTokens: number;

  @Column({ type: 'int', default: 0, comment: '已提交模型输出 token 合计' })
  usageOutputTokens: number;

  @Column({ type: 'int', default: 0, comment: '已提交模型总 token 合计' })
  usageTotalTokens: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0, comment: '已提交工具报价合计' })
  toolCost: string;

  @Column({ type: 'varchar', length: 24, default: 'none', comment: '计费收敛阶段' })
  billingPhase: AgentOperationBillingPhase;

  @Column({ type: 'varchar', length: 16, nullable: true, comment: '结算模式' })
  settlementMode: AgentOperationSettlementMode | null;

  @Column({ type: 'int', default: 0, comment: '结算时使用的 token 事实' })
  settlementTotalTokens: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0, comment: '结算时工具费用事实' })
  settlementToolCost: string;

  @Column({ type: 'int', default: 0, comment: '计费实现返回的记账金额' })
  chargedAmount: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '低基数终态原因' })
  terminalReason: string | null;
}
