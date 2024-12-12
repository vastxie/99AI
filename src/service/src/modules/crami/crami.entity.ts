import { UserStatusEnum } from '../../common/constants/user.constant';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'crami' })
export class CramiEntity extends BaseEntity {
  @Column({ unique: true, comment: '存储卡密CDK编码', length: 50 })
  code: string;

  @Column({ comment: '卡密CDK类型：1： 普通 | 2： 单人可使用一次 ', default: 1 })
  cramiType: number;

  @Column({ comment: '卡密CDK类型： 默认套餐类型 | 不填就是自定义类型', nullable: true })
  packageId: number;

  @Column({ comment: '卡密CDK状态，如已使用、未使用等', default: 0 })
  status: number;

  @Column({ comment: '卡密使用账户用户ID信息', nullable: true })
  useId: number;

  @Column({ comment: '卡密有效期天数、从生成创建的时候开始计算，设为0则不限时间', default: 0 })
  days: number;

  @Column({ comment: '卡密模型3额度', nullable: true })
  model3Count: number;

  @Column({ comment: '卡密模型4额度', nullable: true })
  model4Count: number;

  @Column({ comment: '卡密MJ绘画额度', nullable: true })
  drawMjCount: number;
}
