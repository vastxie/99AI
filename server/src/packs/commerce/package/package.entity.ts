import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

export const PACKAGE_PLAN_TYPES = ['membership', 'credit_pack'] as const;
export type PackagePlanType = (typeof PACKAGE_PLAN_TYPES)[number];

export const PACKAGE_BILLING_CYCLES = ['day', 'week', 'month', 'year', 'one_time'] as const;
export type PackageBillingCycle = (typeof PACKAGE_BILLING_CYCLES)[number];

@Entity({ name: 'package' })
export class PackageEntity extends BaseEntity {
  @Column({ comment: '套餐名称' })
  name: string;

  @Column({ comment: '套餐介绍详细信息', default: '' })
  des: string;

  @Column({ comment: '方案标识', length: 64, default: 'default' })
  planKey: string;

  @Column({ comment: '方案名称', length: 80, default: '' })
  planName: string;

  @Column({ comment: '方案说明', type: 'text', nullable: true })
  planDescription: string | null;

  @Column({ comment: '方案图标', length: 64, default: '' })
  planIcon: string;

  @Column({
    comment: '方案类型 membership|credit_pack',
    type: 'varchar',
    length: 24,
    default: 'membership',
  })
  planType: PackagePlanType;

  @Column({ comment: '权益文案，每行一条', type: 'text', nullable: true })
  featureText: string | null;

  @Column({ comment: '规格名称', length: 80, default: '' })
  variantName: string;

  @Column({
    comment: '计费周期 day|week|month|year|one_time',
    type: 'varchar',
    length: 24,
    default: 'month',
  })
  billingCycle: PackageBillingCycle;

  @Column({ comment: '计费周期数量', default: 1 })
  billingCycleCount: number;

  @Column({ comment: '规格排序、数字越小越靠前', default: 100 })
  variantOrder: number;

  @Column({ comment: '是否默认规格 0：否 1：是', default: 0 })
  isDefaultVariant: number;

  @Column({ comment: '规格角标文案', length: 64, default: '' })
  badgeText: string;

  @Column({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 })
  price: number;

  @Column({ comment: '套餐USD价格$', type: 'decimal', scale: 2, precision: 10, nullable: true })
  priceUsd: number | null;

  @Column({ comment: '套餐排序、数字越大越靠前', default: 100 })
  order: number;

  @Column({ comment: '套餐是否启用中 0：禁用 1：启用', default: 1 })
  status: number;

  @Column({ comment: '套餐权重、数字越大表示套餐等级越高越贵' })
  weight: number;

  @Column({
    comment: '套餐有效期天数、-1为永久',
    default: 0,
  })
  days: number;

  @Column({ comment: '套餐包含的积分数量', default: 0, nullable: true })
  credits: number;
}
