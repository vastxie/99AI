import { UserStatusEnum } from '../../common/constants/user.constant';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'order' })
export class OrderEntity extends BaseEntity {
  @Column({ unique: true, comment: '订单ID', length: 64 })
  orderId: string;

  @Column({ unique: true, comment: '交易ID（服务商）', length: 32, nullable: true })
  tradeId: string;

  @Column({ comment: '支付平台【epay|hupi|ltzf】）', length: 32, nullable: true })
  payPlatform: string;

  @Column({ comment: '用户ID', nullable: true })
  userId: number;

  @Column({ comment: '商品ID', nullable: true })
  goodsId: number;

  @Column({ comment: '数量', default: 1 })
  count: number;

  @Column({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 })
  price: number;

  @Column({ comment: '订单总金额', type: 'decimal', scale: 2, precision: 10 })
  total: number;

  @Column({ comment: '订单状态（0：未支付、1：已支付、2、支付失败、3：支付超时）', default: 0 })
  status: number;

  @Column({ type: 'datetime', length: 0, nullable: true, comment: '支付时间' })
  paydAt: Date;

  @Column({ comment: '支付渠道）', length: 32, nullable: true })
  channel: string;
}
