import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';
import type {
  AgentEffectKind,
  AgentEffectState,
  AgentToolReplayPolicy,
} from './operation-ledger.types';

@Entity({ name: 'agent_effect' })
@Index('uniq_agent_effect_operation_key', ['operationId', 'effectKey'], { unique: true })
@Index('idx_agent_effect_recovery', ['operationId', 'state', 'roundIndex', 'ordinal'])
export class AgentEffectEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 128, comment: '所属 operation ID' })
  operationId: string;

  @Column({ type: 'varchar', length: 191, comment: 'operation 内稳定 effect key' })
  effectKey: string;

  @Column({ type: 'varchar', length: 16, comment: 'effect 类型: model/tool' })
  kind: AgentEffectKind;

  @Column({ type: 'int', comment: '模型轮次序号' })
  roundIndex: number;

  @Column({ type: 'int', default: 0, comment: '同轮 effect 原始序号' })
  ordinal: number;

  @Column({ type: 'int', default: 0, comment: '模型请求 attempt 序号' })
  attemptIndex: number;

  @Column({ type: 'varchar', length: 191, nullable: true, comment: '工具调用 ID' })
  callId: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true, comment: '当前注册表工具名' })
  toolName: string | null;

  @Column({ type: 'char', length: 64, comment: '不含密钥或原文的 canonical SHA-256' })
  intentFingerprint: string;

  @Column({ type: 'longtext', nullable: true, comment: '严格校验后的最小重放参数 JSON' })
  intentPayload: string | null;

  @Column({ type: 'varchar', length: 16, default: 'never', comment: '落库时重放策略' })
  replayPolicy: AgentToolReplayPolicy;

  @Column({ type: 'varchar', length: 24, default: 'intent', comment: 'effect 状态' })
  state: AgentEffectState;

  @Column({ type: 'int', default: 0, comment: '最后一次写入该 effect 的 generation' })
  claimedGeneration: number;

  @Column({ type: 'int', default: 0, comment: '恢复重放已尝试次数' })
  recoveryAttempts: number;

  @Column({ type: 'longtext', nullable: true, comment: '限长脱敏的模型 partial checkpoint JSON' })
  checkpoint: string | null;

  @Column({ type: 'longtext', nullable: true, comment: '严格限长的 effect outcome JSON' })
  outcome: string | null;

  @Column({ type: 'datetime', nullable: true, comment: 'effect 终态时间' })
  terminalAt: Date | null;
}
