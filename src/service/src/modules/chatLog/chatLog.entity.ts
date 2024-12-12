import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'chatlog' })
export class ChatLogEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ comment: '使用的模型', nullable: true })
  model: string;

  @Column({
    comment: '使用类型1: 普通对话 2: 绘图 3: 拓展性对话',
    nullable: true,
    default: 1,
  })
  type: number;

  @Column({ comment: '自定义的模型名称', nullable: true, default: 'AI' })
  modelName: string;

  @Column({ comment: '自定义的模型名称', nullable: false, default: '' })
  modelAvatar: string;

  @Column({ comment: 'Ip地址', nullable: true })
  curIp: string;

  @Column({ comment: '询问的问题', type: 'text', nullable: true })
  prompt: string;

  @Column({ comment: '附加参数', nullable: true })
  extraParam: string;

  @Column({ comment: '插件参数', nullable: true })
  pluginParam: string;

  @Column({ comment: '回答的答案', type: 'text', nullable: true })
  answer: string;

  @Column({ comment: '提问的token', nullable: true })
  promptTokens: number;

  @Column({ comment: '回答的token', nullable: true })
  completionTokens: number;

  @Column({ comment: '总花费的token', nullable: true })
  totalTokens: number;

  @Column({ comment: 'role system user assistant', nullable: true })
  role: string;

  @Column({ comment: '任务进度', nullable: true })
  progress: string;

  @Column({ comment: '任务状态', nullable: true, default: 3 })
  status: number;

  @Column({ comment: '任务类型', nullable: true })
  action: string;

  @Column({ comment: '对图片操作的按钮ID', type: 'text', nullable: true })
  customId: string;

  @Column({ comment: '绘画的ID每条不一样', nullable: true })
  drawId: string;

  @Column({ comment: '文件信息', nullable: true, type: 'text' })
  fileInfo: string;

  @Column({ comment: '对话转语音的链接', nullable: true, type: 'text' })
  ttsUrl: string;

  @Column({ comment: '是否推荐0: 默认 1: 推荐', nullable: true, default: 0 })
  rec: number;

  @Column({ comment: '分组ID', nullable: true })
  groupId: number;

  @Column({ comment: '使用的应用id', nullable: true })
  appId: number;

  @Column({ comment: '是否删除', default: false })
  isDelete: boolean;

  @Column({ comment: '任务ID', nullable: true })
  taskId: string;

  @Column({ comment: '任务数据', nullable: true, type: 'text' })
  taskData: string;

  @Column({ comment: '视频Url', nullable: true, type: 'text' })
  videoUrl: string;

  @Column({ comment: '音频Url', nullable: true, type: 'text' })
  audioUrl: string;

  @Column({ comment: '提问参考', nullable: true })
  promptReference: string;
}
