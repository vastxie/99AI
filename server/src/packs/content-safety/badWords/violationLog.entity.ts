import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@/common/entity/baseEntity';
import { UserEntity } from '@/modules/user/user.entity';

@Entity({ name: 'violation_log' })
export class ViolationLogEntity extends BaseEntity {
  @Column({ comment: '用户id' })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '违规内容', type: 'text' })
  content: string;

  @Column({ comment: '敏感词', type: 'text' })
  words: string;

  @Column({ comment: '违规类型' })
  typeCn: string;

  @Column({ comment: '违规检测失败于哪个平台' })
  typeOriginCn: string;

  @Index('IDX_violation_log_preflight_key', { unique: true })
  @Column({
    length: 64,
    nullable: true,
    select: false,
    comment: '对话预检幂等摘要',
  })
  /** 可空列；strictNullChecks 下联合类型会让 design:type 退化为 Object，故属性不标 | null，写 null 见 BadWordsService */
  preflightKey: string;
}
