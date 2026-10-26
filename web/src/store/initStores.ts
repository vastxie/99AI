import { watch } from 'vue'
import { eventBus } from '@/core/events/eventBus'
import { t } from '@/locales'
import { identityEpoch } from '@/services/identity'
import { socketService } from '@/services/socket-io'
import { ensureVisitorToken } from '@/services/visitorSession'
import { message } from '@/utils/message'
import { useAuthStore } from './modules/auth'
import { useChatStore } from './modules/chat'
import { useComposerAttachmentsStore } from './modules/chat/attachments'
import { useGlobalStore } from './modules/global'

/**
 * 登录状态与身份变化时各 store 的收尾，在 main.ts 启动时调用一次：
 * - 登录过期、重新登录、访客身份被换掉：会话数据按新身份清空，保留各会话的输入框草稿与模型选择，关掉所有预览；
 *   身份确定后如果换成了另一个账号，上一个账号的草稿、引用、附件与模型选择一并丢掉（游客的带进账号）；
 *   成了游客（过期后刷新页面）时先收起来，同一个账号再登录时放回（见 chat store 的 claimDraftsFor）；
 * - 主动退出：连同草稿一起清掉，随后整页刷新，所有页面状态从头开始。
 *
 * 过期与访客身份被换掉之后，按新身份恢复（访客凭证、实时连接、资料）也只在这里做：
 * 每个身份代次最多解析一次资料，恢复途中身份又变了就退出，不与新身份争抢。
 * 登录的资料由各登录入口自己取（见 auth store 的 commitLogin）。
 */
export function initializeStores() {
  const globalStore = useGlobalStore()
  const chatStore = useChatStore()
  const authStore = useAuthStore()

  /** 本页刚登录成功：接下来这次认领可以接管本地存储（别的页签换过账号时，最后登录的一方接管） */
  let loggedInJustNow = false
  /** 已经为哪个身份代次解析过资料 */
  let resolvedEpoch = -1

  // 身份确定后认领草稿：换成另一个账号时丢掉上一个账号没发出去的内容
  watch(
    () => {
      if (!authStore.userInfoResolved || authStore.userInfoLoadFailed) return ''
      const { id, role } = authStore.userInfo || {}
      return role === 'visitor' || !String(id ?? '') ? 'visitor' : `user:${id}`
    },
    owner => {
      if (!owner) return
      // 游客身份（登录前发出、晚到的请求）不用掉「刚登录」的标记
      chatStore.claimDraftsFor(owner, { takeOver: loggedInJustNow && owner !== 'visitor' })
      if (owner !== 'visitor') loggedInJustNow = false
    },
    { immediate: true }
  )

  const resetForNewIdentity = () => {
    chatStore.clearChat({ keepDraft: true })
    globalStore.closeAllPreviewers()
  }

  /** 按当前（访客）身份恢复：确保访客凭证、以它重连、解析一次资料；途中身份又变了就退出 */
  async function recoverVisitorIdentity() {
    const epoch = identityEpoch()
    try {
      await ensureVisitorToken()
    } catch {
      // 拿不到访客凭证：实时连接与请求层会各自重试
    }
    if (identityEpoch() !== epoch || authStore.isLogin) return
    socketService.disconnect()
    socketService.connect()
    if (resolvedEpoch === epoch) return
    resolvedEpoch = epoch
    try {
      await authStore.getUserInfo()
    } catch {
      // 资料取不到（含身份又变了）：由请求层与下一次恢复处理
    }
  }

  eventBus.on('auth:tokenExpired', () => {
    resetForNewIdentity()
    void recoverVisitorIdentity()
  })
  eventBus.on('auth:visitorChanged', () => {
    resetForNewIdentity()
    void recoverVisitorIdentity()
  })
  eventBus.on('auth:visitorRecoveryPaused', () => {
    message().warning(t('common.visitorRecoveryPaused'))
  })
  eventBus.on('auth:loginSuccess', () => {
    loggedInJustNow = true
    resetForNewIdentity()
  })

  eventBus.on('auth:logout', () => {
    chatStore.clearChat()
    useComposerAttachmentsStore().clearAll()
    globalStore.closeAllPreviewers()
    // 稍后刷新，让清空后的偏好先写进本地存储
    setTimeout(() => window.location.reload(), 100)
  })
}
