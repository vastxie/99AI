import type { PackChatError } from '@/core/packs/definePack'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { message } from '@/utils/message'
import { extractAgentErrorCode, extractHttpStatus } from '@/views/chat/chatError.extract'
import { useCommerceStore } from './store'

export type CommerceErrorKind = 'balanceInsufficient'

/** 额度 / 积分不足：HTTP 402，或对话连接上归类成的 PAYMENT_REQUIRED（不按文案猜） */
export function classifyCommerceError(error: unknown): CommerceErrorKind | undefined {
  if (extractHttpStatus(error) === 402) return 'balanceInsufficient'
  if (extractAgentErrorCode(error) === 'PAYMENT_REQUIRED') return 'balanceInsufficient'
  return undefined
}

export function handleCommerceError(
  error: PackChatError,
  context: { isMobile: boolean; isAuthenticated: boolean }
): boolean {
  const ms = message()
  const authStore = useAuthStore()
  const store = useCommerceStore()
  if (error.kind === 'balanceInsufficient') {
    if (!context.isAuthenticated) {
      ms.error(t('chat.balanceInsufficient'))
      authStore.setLoginDialog(true)
    } else {
      ms.error(t('chat.balanceInsufficientWithLogin'))
      store.openPackagePurchase('credits')
    }
    return true
  }
  return false
}
