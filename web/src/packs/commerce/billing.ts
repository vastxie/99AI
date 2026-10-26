import { computed } from 'vue'
import { useAuthStore } from '@/store/modules/auth'

/** 商业包解释的账户摘要（服务端计费实现原样下发，内核不解释） */
export interface CommerceBilling {
  isMember: boolean
  packageId?: number
  packageWeight?: number
  packageName?: string
  credits: number
  memberCredits: number
  usedCredits: number
  usedTokens: number
  sumCredits: number
  expirationTime: string | Date | null
}

export function defaultCommerceBilling(): CommerceBilling {
  return {
    isMember: false,
    credits: 0,
    memberCredits: 0,
    usedCredits: 0,
    usedTokens: 0,
    sumCredits: 0,
    expirationTime: null,
  }
}

export function toCommerceBilling(summary: unknown): CommerceBilling {
  if (!summary || typeof summary !== 'object') return defaultCommerceBilling()
  return { ...defaultCommerceBilling(), ...(summary as Partial<CommerceBilling>) }
}

/** 当前用户的账户摘要（响应式） */
export function useCommerceBilling() {
  const authStore = useAuthStore()
  return computed(() => toCommerceBilling(authStore.billing))
}
