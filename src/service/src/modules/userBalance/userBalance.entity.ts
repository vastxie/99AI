import { UserStatusEnum } from '../../common/constants/user.constant';
import { Check, Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'user_balances' })
export class UserBalanceEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '充值的套餐包含的模型3次数', nullable: true })
  model3Count: number;

  @Column({ comment: '充值的套餐包含的模型4次数', nullable: true })
  model4Count: number;

  @Column({ comment: '充值的套餐包含的MJ绘画次数', nullable: true })
  drawMjCount: number;

  @Column({ comment: '当前使用的套餐ID', default: 0, nullable: true })
  packageId: number;

  @Column({ comment: '会员模型3额度', default: 0, nullable: true })
  memberModel3Count: number;

  @Column({ comment: '会员模型4额度', default: 0, nullable: true })
  memberModel4Count: number;

  @Column({ comment: '会员MJ绘画额度', default: 0, nullable: true })
  memberDrawMjCount: number;

  @Column({ comment: '已经使用的对话3的模型次数', nullable: true })
  useModel3Count: number;

  @Column({ comment: '已经使用的对话4的模型次数', nullable: true })
  useModel4Count: number;

  @Column({ comment: '已经使用的对话3的模型Token', nullable: true })
  useModel3Token: number;

  @Column({ comment: '已经使用的对话4的模型Token', nullable: true })
  useModel4Token: number;

  @Column({ comment: '已经使用的MJ绘画Token', nullable: true })
  useDrawMjToken: number;

  @Column({ comment: '扩展字段', nullable: true })
  extent: string;

  @Column({ comment: '会员到期时间', nullable: true })
  expirationTime: Date;
}
