import { Check, Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'violation_log' })
export class ViolationLogEntity extends BaseEntity {
  @Column({ comment: '用户id' })
  userId: number;

  @Column({ comment: '违规内容', type: 'text' })
  content: string;

  @Column({ comment: '敏感词', type: 'text' })
  words: string;

  @Column({ comment: '违规类型' })
  typeCn: string;

  @Column({ comment: '违规检测失败于哪个平台' })
  typeOriginCn: string;
}
