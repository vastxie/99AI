import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '@/modules/user/user.entity';

@Entity({ name: 'user_bot_channels' })
@Index(['userId', 'channel'], { unique: true })
export class UserBotChannelEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ length: 32, comment: "通道标识: 'weixin' | 'telegram' | 'discord'" })
  channel: string;

  @Column({ default: 0, comment: '状态: 0=未绑定, 1=正常, 2=过期, 3=异常' })
  status: number;

  @Column({ type: 'text', nullable: true, select: false, comment: '通道凭证(AES加密存储)' })
  accessToken: string;

  @Column({ length: 256, nullable: true, comment: 'API Base URL' })
  baseUrl: string;

  @Column({ length: 128, nullable: true, comment: '通道侧用户ID' })
  channelUserId: string;

  @Column({ type: 'datetime', nullable: true, comment: '绑定时间' })
  boundAt: Date;

  @Column({ length: 512, nullable: true, select: false, comment: '上下文Token' })
  contextToken: string;

  @Column({ type: 'text', nullable: true, comment: '通道同步状态(如微信syncBuf)' })
  syncState: string;

  @Column({ type: 'json', nullable: true, comment: '通道特定元数据' })
  extraConfig: Record<string, any>;
}
