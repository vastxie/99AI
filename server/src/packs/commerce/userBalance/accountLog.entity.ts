import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '@/modules/user/user.entity';

@Entity({ name: 'account_log' })
@Index('uniq_account_log_refund_source_log_id', ['refundSourceLogId'], { unique: true })
export class AccountLogEntity extends BaseEntity {
  @Column({ comment: '用户ID', nullable: true })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '会员套餐名称', nullable: true })
  pkgName: string;

  @Column({ comment: '推荐人ID、返佣用户ID', nullable: true })
  rebateUserId: number;

  @Column({ comment: '充值套餐ID', nullable: true })
  packageId: number;

  @Column({ comment: '会员有效天数', nullable: true })
  memberDays: number;

  @Column({ comment: '账户充值类型' })
  rechargeType: number;

  @Column({ comment: '变动积分量' })
  credits: number;

  @Column({ comment: '套餐有效期' })
  days: number;

  @Column({ comment: '随机订单uid' })
  uid: string;

  @Column({ comment: '扩展字段', nullable: true })
  extent: string;

  @Column({ comment: '使用的Token数量', nullable: true, default: null })
  tokenUsed: number;

  @Column({ comment: '关联业务记录ID（如chatLogId）', nullable: true })
  relatedId: number;

  @Column({ comment: '退款来源扣费日志ID', nullable: true })
  refundSourceLogId: number;

  @Column({ comment: '从会员积分扣除的量', default: 0, nullable: true })
  memberCredits: number;
}
