import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UserEntity } from '../../user/user.entity';
import { AUTH_IDENTITY_STATUS, AuthIdentityStatus, AuthProvider } from './auth-identity.types';

@Entity({ name: 'user_auth_identities' })
@Index(['provider', 'providerUserId'], { unique: true })
@Index(['userId', 'provider'], { unique: true })
@Index(['provider', 'linkKey'])
@Index(['userId', 'status'])
export class UserAuthIdentityEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 32, comment: '身份供应商' })
  provider: AuthProvider;

  @Column({ length: 191, comment: '供应商侧稳定用户ID' })
  providerUserId: string;

  @Column({ length: 32, nullable: true, comment: '本次进入场景' })
  scene: string;

  /** 列名沿用历史的 unionId，避免迁移；语义是各登录渠道包定义的跨渠道关联键 */
  @Column({
    name: 'unionId',
    length: 128,
    nullable: true,
    comment: '跨渠道关联同一账号的键（由登录渠道包定义，如同一生态内的联合 ID）',
  })
  linkKey: string;

  @Column({ length: 191, nullable: true, comment: '身份邮箱' })
  email: string;

  @Column({ default: false, comment: '邮箱是否由供应商验证' })
  emailVerified: boolean;

  @Column({ length: 32, nullable: true, comment: '身份手机号' })
  phone: string;

  @Column({ length: 128, nullable: true, comment: '身份昵称' })
  nickname: string;

  @Column({ length: 500, nullable: true, comment: '身份头像' })
  avatar: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: AUTH_IDENTITY_STATUS.ACTIVE,
    comment: '身份状态: active/disabled/unbound',
  })
  status: AuthIdentityStatus;

  @Column({ type: 'datetime', nullable: true, comment: '绑定时间' })
  boundAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '最近登录时间' })
  lastLoginAt: Date;

  @Column({ length: 255, nullable: true, select: false, comment: '本地凭证哈希' })
  credentialHash: string;

  @Column({ type: 'json', nullable: true, comment: '身份资料快照' })
  profileSnapshot: Record<string, any> | null;

  @Column({ type: 'json', nullable: true, comment: '扩展信息' })
  extra: Record<string, any> | null;
}
