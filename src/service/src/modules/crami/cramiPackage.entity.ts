import { UserStatusEnum } from '../../common/constants/user.constant';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'crami_package' })
export class CramiPackageEntity extends BaseEntity {
  @Column({ unique: true, comment: '套餐名称' })
  name: string;

  @Column({ comment: '套餐介绍详细信息' })
  des: string;

  @Column({ comment: '套餐封面图片', nullable: true })
  coverImg: string;

  @Column({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 })
  price: number;

  @Column({ comment: '套餐排序、数字越大越靠前', default: 100 })
  order: number;

  @Column({ comment: '套餐是否启用中 0：禁用 1：启用', default: 1 })
  status: number;

  @Column({ comment: '套餐权重、数字越大表示套餐等级越高越贵', unique: true })
  weight: number;

  @Column({ comment: '卡密有效期天数、从使用的时候开始计算，设为-1则不限时间', default: 0 })
  days: number;

  @Column({ comment: '套餐包含的模型3数量', default: 0, nullable: true })
  model3Count: number;

  @Column({ comment: '套餐包含的模型4数量', default: 0, nullable: true })
  model4Count: number;

  @Column({ comment: '套餐包含的MJ绘画数量', default: 0, nullable: true })
  drawMjCount: number;
}
