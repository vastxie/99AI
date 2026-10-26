import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UserEntity } from '../user/user.entity';

export type ChatGroupOwnerType = 'user' | 'visitor';

@Entity({ name: 'chat_group' })
@Index('uniq_chat_group_gid', ['gid'], { unique: true })
@Index(
  'uniq_chat_group_external_thread',
  ['ownerType', 'ownerKey', 'channel', 'externalThreadKey'],
  { unique: true },
)
@Index('idx_chat_group_owner_updated', [
  'ownerType',
  'ownerKey',
  'isDelete',
  'isSticky',
  'updatedAt',
])
@Index('idx_chat_group_user_updated', ['userId', 'isDelete', 'updatedAt'])
@Index('idx_chat_group_visitor_updated', ['visitorId', 'isDelete', 'updatedAt'])
export class ChatGroupEntity extends BaseEntity {
  @Column({ length: 64, comment: '对外消息容器ID' })
  gid: string;

  @Column({ type: 'varchar', length: 16, comment: '归属类型: user/visitor' })
  ownerType: ChatGroupOwnerType;

  @Column({ length: 128, comment: '规范化归属ID' })
  ownerKey: string;

  @Column({ comment: '用户ID', nullable: true })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ length: 128, comment: '访客指纹ID', nullable: true })
  visitorId: string;

  @Column({ length: 32, default: 'web', comment: '消息容器来源渠道：web 或渠道实现登记的渠道名' })
  channel: string;

  @Column({ length: 128, comment: '可信外部渠道线程键', nullable: true })
  externalThreadKey: string;

  @Column({ comment: '是否置顶聊天', type: 'boolean', default: false })
  isSticky: boolean;

  @Column({ length: 160, comment: '容器标题', nullable: true })
  title: string;

  @Column({ comment: '是否删除', default: false })
  isDelete: boolean;

  @Column({ comment: '配置', nullable: true, default: null, type: 'text' })
  config: string | null;

  @Column({ comment: '附加参数', nullable: true, type: 'text' })
  params: string | null;
}
