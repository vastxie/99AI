import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entity/baseEntity';
import { UserEntity } from '@/modules/user/user.entity';
import { PackageEntity } from '../package/package.entity';

@Entity({ name: 'order' })
export class OrderEntity extends BaseEntity {
  @Column({ unique: true, comment: '订单ID', length: 64 })
  orderId: string;

  @Column({
    unique: true,
    comment: '交易ID（服务商）',
    length: 255,
    nullable: true,
  })
  tradeId: string;

  @Column({
    comment: '支付平台【epay|wechat_official|alipay_official|paypal_official|stripe_official】',
    length: 32,
    nullable: true,
  })
  payPlatform: string;

  @Column({ comment: '用户ID', nullable: true })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '商品ID', nullable: true })
  goodsId: number;

  @ManyToOne(() => PackageEntity, {
    onDelete: 'SET NULL',
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'goodsId' })
  package: PackageEntity;

  @Column({ comment: '数量', default: 1 })
  count: number;

  @Column({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 })
  price: number;

  @Column({ comment: '订单总金额', type: 'decimal', scale: 2, precision: 10 })
  total: number;

  @Column({ comment: '支付币种快照', length: 8, default: 'CNY' })
  payCurrencySnapshot: string;

  @Column({
    comment: '支付金额快照',
    type: 'decimal',
    scale: 2,
    precision: 10,
    nullable: true,
  })
  payAmountSnapshot: number;

  @Column({
    comment: '订单状态（0：未支付、1：已支付、2、支付失败、3：支付超时）',
    default: 0,
  })
  status: number;

  @Column({ type: 'datetime', length: 0, nullable: true, comment: '支付时间' })
  paydAt: Date;

  @Column({ comment: '支付渠道）', length: 32, nullable: true })
  channel: string;

  @Column({ comment: '套餐积分快照', default: 0 })
  creditsSnapshot: number;

  @Column({ comment: '套餐天数快照', default: 0 })
  daysSnapshot: number;

  @Column({ comment: '套餐名称快照', length: 128, default: '' })
  pkgNameSnapshot: string;

  @Column({ comment: '方案标识快照', length: 64, default: '' })
  planKeySnapshot: string;

  @Column({ comment: '方案名称快照', length: 80, default: '' })
  planNameSnapshot: string;

  @Column({ comment: '规格名称快照', length: 80, default: '' })
  variantNameSnapshot: string;

  @Column({ comment: '方案类型快照', length: 24, default: '' })
  planTypeSnapshot: string;

  @Column({ comment: '会员等级权重快照', default: 0 })
  weightSnapshot: number;

  @Column({ comment: '计费周期快照', length: 24, default: '' })
  billingCycleSnapshot: string;

  @Column({ comment: '计费周期数量快照', default: 1 })
  billingCycleCountSnapshot: number;

  @Column({ comment: '权益文案快照', type: 'text', nullable: true })
  featureTextSnapshot: string;
}
