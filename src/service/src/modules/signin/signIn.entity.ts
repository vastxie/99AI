import { UserStatusEnum } from '../../common/constants/user.constant';
import { Check, Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'signin' })
export class SigninEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '签到日期' })
  signInDate: string;

  @Column({ comment: '签到时间' })
  signInTime: Date;

  @Column({ default: false })
  isSigned: boolean;
}
