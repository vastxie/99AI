import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'auto_reply' })
export class AutoReplyEntity extends BaseEntity {
  @Column({ comment: '提问的问题', type: 'text' })
  prompt: string;

  @Column({ comment: '定义的答案', type: 'text' })
  answer: string;

  @Column({ default: 1, comment: '是否开启AI回复，0：关闭 1：启用' })
  isAIReplyEnabled: number;

  @Column({ default: 1, comment: '启用当前自动回复状态， 0：关闭 1：启用' })
  status: number;
}
