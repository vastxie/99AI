import { t, tp } from '@/locales'

export interface PackageVariant {
  id: number
  name: string
  variantName: string
  billingCycle: 'day' | 'week' | 'month' | 'year' | 'one_time'
  billingCycleCount: number
  variantOrder: number
  isDefaultVariant: number
  badgeText?: string
  price: number
  /** 接口按字符串返回（DECIMAL），用 usdPriceText 格式化 */
  priceUsd?: number | string
  days: number
  credits: number
  weight: number
}

export interface PackagePlan {
  planKey: string
  planName: string
  planDescription?: string
  planType: 'membership' | 'credit_pack'
  features: string[]
  featureText?: string
  defaultVariantId?: number
  variants: PackageVariant[]
}

export function billingCycleText(variant: PackageVariant) {
  if (variant.billingCycle === 'one_time') return t('member.cycleOneTime')
  const count = variant.billingCycleCount || 1
  // 一个周期只写单位（「/ 月」）；多个周期写成「3 个月」，英文按单复数
  const single = { day: 'cycleDay', week: 'cycleWeek', month: 'cycleMonth', year: 'cycleYear' }
  const multiple = {
    day: 'cycleDays',
    week: 'cycleWeeks',
    month: 'cycleMonths',
    year: 'cycleYears',
  }
  if (count === 1) return t(`member.${single[variant.billingCycle]}`)
  return tp(`member.${multiple[variant.billingCycle]}`, count)
}

export function moneyText(value: number) {
  return Number(value).toFixed(2).replace(/\.00$/u, '')
}

export function isLowerMembershipVariant(
  plan: PackagePlan,
  variant: PackageVariant,
  currentWeight: number
) {
  return plan.planType === 'membership' && currentWeight > Number(variant.weight || 0)
}

/**
 * 美元价：接口里的 priceUsd 是数据库 DECIMAL，按字符串返回（例如 "9.99"）；转成有限数值再格式化。
 * 没有有效的美元价时按人民币价与默认汇率估算
 */
export function usdPriceText(pkgInfo: {
  priceUsd?: number | string | null
  price?: number | string
}) {
  const usd = Number(pkgInfo.priceUsd)
  if (Number.isFinite(usd) && usd > 0) return usd.toFixed(2)
  const price = Number.parseFloat(String(pkgInfo.price ?? ''))
  return Number.isFinite(price) ? (price / 7.3).toFixed(2) : '0.00'
}
