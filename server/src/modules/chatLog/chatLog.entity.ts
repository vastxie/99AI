import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { UserEntity } from '../user/user.entity';

@Entity({ name: 'chatlog' })
@Index(['userId', 'createdAt']) // 用户聊天记录查询（最常用）
@Index(['type', 'userId']) // 按类型查询用户记录
@Index(['status']) // 任务状态查询
@Index(['model']) // 模型使用统计
@Index(['cid'], { unique: true }) // 用户端消息外部ID
@Index(['channel', 'channelMessageId'], { unique: true }) // 通道消息幂等查询
@Index(['groupId', 'createdAt']) // 消息容器内聊天记录查询
@Index('uniq_chatlog_group_submission', ['groupId', 'submissionId'], { unique: true })
export class ChatLogEntity extends BaseEntity {
  @Column({ length: 32, comment: '用户端消息外部ID' })
  cid: string;

  @Column({ name: 'userId', comment: '用户ID', nullable: true })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '访客指纹ID', nullable: true })
  visitorId: string;

  @Column({ comment: '会话内部ID' })
  groupId: number;

  @Column({ length: 96, nullable: true, comment: 'Web 用户动作提交 ID' })
  submissionId: string;

  @Column({ nullable: true, comment: 'Web 提交摘要算法版本' })
  submissionFingerprintVersion: number;

  @Column({ length: 64, nullable: true, comment: 'Web 提交 canonical SHA-256 摘要' })
  submissionFingerprint: string;

  @ManyToOne(() => ChatGroupEntity, {
    onDelete: 'RESTRICT',
    nullable: false,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'groupId' })
  group: ChatGroupEntity;

  @Column({ name: 'model', comment: '使用的模型', nullable: true })
  model: string;

  @Column({ comment: '模型内容（纯文本，用于搜索）', nullable: true, type: 'mediumtext' })
  content: string;

  @Column({
    comment: '统一消息JSON（含parts、toolCalls等完整结构）',
    nullable: true,
    type: 'longtext',
  })
  message: string;

  @Column({
    comment: '使用类型 1: 普通对话 2: 图片生成 3: 视频生成 4: 音乐生成 5: 其他类型',
    nullable: true,
    default: 1,
  })
  type: number;

  @Column({ comment: '自定义的模型名称', nullable: true, default: 'AI' })
  modelName: string;

  @Column({ comment: 'Ip地址', nullable: true })
  curIp: string;

  @Column({ comment: '总花费的token', nullable: true })
  totalTokens: number;

  @Column({ comment: '任务状态', nullable: true, default: 3 })
  status: number;

  @Column({ comment: '是否删除', default: false })
  isDelete: boolean;

  @Column({
    length: 32,
    default: 'web',
    comment: '消息来源渠道：web 或渠道实现登记的渠道名',
  })
  channel: string;

  @Column({
    length: 128,
    nullable: true,
    comment: '通道原始消息ID(用于幂等去重)',
  })
  channelMessageId: string;

  @Column({
    length: 16,
    default: 'in',
    comment: "消息方向: 'in'=入站, 'out'=出站",
  })
  direction: string;

  @Column({ comment: 'TTS语音播报地址', nullable: true, type: 'text' })
  ttsUrl: string;
}
