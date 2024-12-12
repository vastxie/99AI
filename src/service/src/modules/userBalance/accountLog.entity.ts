import { UserStatusEnum } from '../../common/constants/user.constant';
import { Check, Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'account_log' })
export class AccountLogEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

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

  @Column({ comment: '模型3对话次数' })
  model3Count: number;

  @Column({ comment: '模型4对话次数' })
  model4Count: number;

  @Column({ comment: 'MJ绘画次数' })
  drawMjCount: number;

  @Column({ comment: '套餐有效期' })
  days: number;

  @Column({ comment: '随机订单uid' })
  uid: string;

  @Column({ comment: '扩展字段', nullable: true })
  extent: string;
}
