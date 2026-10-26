import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@/common/entity/baseEntity';
import { UserEntity } from '@/modules/user/user.entity';

@Entity({ name: 'signin' })
@Index('IDX_signin_user_date_unique', ['userId', 'signInDate'], { unique: true })
export class SigninEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '签到日期' })
  signInDate: string;

  @Column({ comment: '签到时间' })
  signInTime: Date;

  @Column({ default: false })
  isSigned: boolean;

  @Column({ default: 1, comment: '截至本次签到的连续签到天数' })
  consecutiveDays: number;
}
