import { UserStatusEnum } from '../../common/constants/user.constant';
import { Check, Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'balance' })
export class BalanceEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '用户账户余额' })
  balance: number;

  @Column({ comment: '用户使用次数余额' })
  usesLeft: number;

  @Column({ comment: '绘画使用次数余额' })
  paintCount: number;

  @Column({ default: 0, comment: '用户总计使用的token数量' })
  useTokens: number;

  @Column({ default: 0, comment: '用户总计使用的对话次数' })
  useChats: number;

  @Column({ default: 0, comment: '用户总计使用的绘画次数' })
  usePaints: number;
}
