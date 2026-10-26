import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'user_balances' })
export class UserBalanceEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '用户积分', default: 0, nullable: true })
  credits: number;

  @Column({ comment: '当前使用的套餐ID', default: 0, nullable: true })
  packageId: number;

  @Column({ comment: '会员积分', default: 0, nullable: true })
  memberCredits: number;

  @Column({ comment: '已经使用的积分', default: 0, nullable: true })
  usedCredits: number;

  @Column({ comment: '已经使用的Token', default: 0, nullable: true })
  usedTokens: number;

  @Column({ comment: '扩展字段', nullable: true })
  extent: string;

  @Column({ comment: '会员到期时间', nullable: true })
  expirationTime: Date;
}
