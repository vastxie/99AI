import { UserStatusEnum } from '../../common/constants/user.constant';
import { Check, Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'fingerprint_log' })
export class FingerprintLogEntity extends BaseEntity {
  @Column({ comment: '指纹ID' })
  fingerprint: string;
  
  @Column({ comment: '模型3对话次数' })
  model3Count: number;

  @Column({ comment: '模型4对话次数' })
  model4Count: number;

  @Column({ comment: 'MJ绘画次数' })
  drawMjCount: number;
}
