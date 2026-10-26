import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { identityEpoch } from '@/services/identity'
import { chatDataEpoch, useChatStore } from '@/store/modules/chat'
import { useComposerAttachmentsStore } from '@/store/modules/chat/attachments'
import { useAuthStore } from '@/store/modules/auth'
import { isConversationId } from '@/constants/conversation'

type ChatRouteStatus =
  | 'home'
  | 'conversation-loading'
  | 'conversation-ready'
  | 'conversation-empty'
  /** 会话列表没拉到，无法确认地址里的会话是否存在：保留地址、给出重试，不回首页 */
  | 'conversation-unavailable'

/**
 * 路由是打开哪个会话的唯一依据：导航入口（useConversationNavigator）只改路由，
 * 这里监听路由变化统一激活会话、加载消息。首页（/）就是新对话；
 * 地址里的会话不存在（无效、已删除、登录后换了身份）同样回到首页的新对话。
 */
export function useChatRouteState() {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const chatStore = useChatStore()

  const status = ref<ChatRouteStatus>('home')
  const targetWorkspaceId = ref('')
  let routeVersion = 0

  const isConversationRoute = computed(() => route.name === 'ChatConversation')
  const isConversationLoading = computed(() => status.value === 'conversation-loading')
  const isConversationEmpty = computed(() => status.value === 'conversation-empty')
  const isConversationReady = computed(() => status.value === 'conversation-ready')
  const isConversationUnavailable = computed(() => status.value === 'conversation-unavailable')
  const isNewChatInitialState = computed(() => chatStore.chatList.length === 0)
  const shouldRenderConversationCanvas = computed(() => chatStore.chatList.length > 0)

  /** reuseList：用刚补拉的会话列表决定（重连核对），不再查一次 */
  async function syncRouteState(options: { reuseList?: boolean } = {}) {
    const version = ++routeVersion
    // 等待期间身份换了（会话数据被清空）：这次同步作废，按新身份的那次为准
    const epoch = chatDataEpoch()
    const stale = () => version !== routeVersion || chatDataEpoch() !== epoch
    const routeWorkspaceId = String(route.params.workspaceId || '').trim()
    const isConfigReady = authStore.loadInit || !authStore.globalConfigLoading

    if (!isConfigReady) {
      status.value = 'conversation-loading'
      targetWorkspaceId.value = isConversationId(routeWorkspaceId) ? routeWorkspaceId : ''
      return
    }

    status.value = 'conversation-loading'
    const routeConversationId =
      isConversationRoute.value && isConversationId(routeWorkspaceId) ? routeWorkspaceId : ''
    const isListed = (id: string) => chatStore.groupList.some(item => item.uuid === id)
    // 会话列表已加载、且路由里的会话就在列表里时直接激活，不必每次切换都重拉整张列表；
    // 列表由 chat:sync 事件保持新鲜，身份变化（登录、过期）时 store 会把它标成未加载
    if (
      !options.reuseList &&
      (!chatStore.groupPagination.initialized ||
        (routeConversationId && !isListed(routeConversationId)))
    ) {
      // 等列表期间：地址里的会话还不在已知列表里，先不显示原来那个会话的内容（也就发不进原来的会话）
      // （查询过会话列表后 active 可能已被清空，但原来的消息还挂着：看显示的内容，不只看 active）
      if (
        routeConversationId &&
        chatStore.active !== routeConversationId &&
        (chatStore.active || chatStore.chatList.length)
      )
        chatStore.resetRouteConversation()
      await chatStore.queryMyGroup()
    }
    if (stale()) return

    const workspaceId =
      routeConversationId && isListed(routeConversationId) ? routeConversationId : ''
    targetWorkspaceId.value = workspaceId
    if (!workspaceId) {
      chatStore.resetRouteConversation()
      // 列表这次没拉到：无法确认会话是否存在，保留地址、给出重试；只有拉到了、确认不在才回首页
      if (routeConversationId && chatStore.groupPagination.failed) {
        status.value = 'conversation-unavailable'
        return
      }
      status.value = 'conversation-empty'
      if (isConversationRoute.value) {
        await router.replace({ name: 'Chat', hash: route.hash, query: route.query })
      }
      return
    }

    await chatStore.activateWorkspaceFromRoute(workspaceId, {
      throwOnMessageError: false,
      silentError: true,
    })
    if (stale()) return
    status.value = chatStore.chatList.length > 0 ? 'conversation-ready' : 'conversation-empty'
  }

  watch(
    [
      () => route.name,
      () => route.path,
      () => authStore.loadInit,
      () => authStore.globalConfigLoading,
    ],
    () => {
      void syncRouteState()
    },
    { immediate: true }
  )

  // 登录（含过期后重新登录、换号）会按新身份清空会话数据：这里按当前路由重新同步，回到原来的会话。
  // 原来所在的会话不属于登录后的身份（游客会话）时会回到首页：没发出去的内容与附件一起带过去。
  // 退出登录（令牌清空）不在这里处理
  watch(
    () => authStore.token,
    async (token, previousToken) => {
      if (!token || token === previousToken) return
      const previousKey = isConversationRoute.value ? String(route.params.workspaceId || '') : ''
      const epoch = chatDataEpoch()
      await syncRouteState()
      // 同步期间身份又变了（过期、换号）：草稿与附件不再按这次登录搬
      if (chatDataEpoch() !== epoch) return
      const landingKey = isConversationRoute.value ? String(route.params.workspaceId || '') : ''
      if (previousKey && previousKey !== landingKey) {
        chatStore.moveDraft(previousKey, landingKey)
        useComposerAttachmentsStore().moveTo(previousKey, landingKey)
      }
    }
  )

  // 过期、访客身份被换掉之后（会话数据已按新身份清空），按当前地址重新同步；登录由上面的令牌 watcher 负责
  watch(
    () => identityEpoch(),
    () => {
      if (!authStore.token) void syncRouteState()
    }
  )

  /**
   * 重连后列表已经强制补拉：核对地址里的会话（离线期间可能在别处被删，也可能之前列表没拉到、停在「暂时无法确认」）。
   * 已经打开、还在列表里就不打扰；其余情况用刚补拉的列表重新按路由同步，不再查第二次（期间别的同步一并作废）：
   * 在列表里就打开；不在了，拉到了 → 回首页，没拉到 → 「暂时无法确认」。
   * 按此刻的地址核对：重连查询期间用户已经换到别的会话时，不会离开那个会话
   */
  async function recheckRouteAfterReconnect() {
    const routeWorkspaceId = String(route.params.workspaceId || '').trim()
    if (!isConversationRoute.value || !isConversationId(routeWorkspaceId)) return
    const listed = chatStore.groupList.some(item => item.uuid === routeWorkspaceId)
    if (listed && chatStore.active === routeWorkspaceId) return
    await syncRouteState({ reuseList: true })
  }

  watch(
    () => chatStore.chatList.length,
    length => {
      if (status.value === 'conversation-loading' || status.value === 'conversation-unavailable')
        return
      status.value = length > 0 ? 'conversation-ready' : 'conversation-empty'
    }
  )

  return {
    status,
    targetWorkspaceId,
    isConversationRoute,
    isConversationLoading,
    isConversationEmpty,
    isConversationReady,
    isConversationUnavailable,
    isNewChatInitialState,
    shouldRenderConversationCanvas,
    /** 「暂时无法确认」状态下的重试：重新按路由同步 */
    retryRouteSync: () => syncRouteState(),
    recheckRouteAfterReconnect,
  }
}
