import {
  isNavigationFailure,
  NavigationFailureType,
  useRoute,
  useRouter,
  type RouteLocationRaw,
} from 'vue-router'
import { closeHistoryLayers } from '@/composables/useHistoryLayer'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { IdentityChangedError, isIdentityChanged } from '@/services/identity'
import { chatDataEpoch, useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message, notifyError } from '@/utils/message'

/**
 * 会话导航的唯一入口：打开会话、开始新对话、离开会话。
 *
 * 这里只做导航锁检查、收起辅助界面并改路由；按路由激活会话、加载消息统一由 useChatRouteState 完成。
 * 调用方不再自己激活会话：以前「显式激活一次 + 路由监听再激活一次」，同一次切换会重复加载、
 * 重复清理流式订阅。
 *
 * 设置弹窗靠地址里的 hash 打开：换了会话时新地址不带 hash，设置随之关闭；只有路由没变时才手动关。
 * 先关设置再跳转会让覆盖层同步把这次跳转撤回（它会退回或替换成旧地址）。
 */
export function useConversationNavigator() {
  const router = useRouter()
  const route = useRoute()
  const chatStore = useChatStore()
  const appStore = useAppStore()
  const globalStore = useGlobalStoreWithOut()
  const { isMobile } = useViewport()
  const ms = message()

  /** 提交窗口内（发出到服务端确认前）不能切走：消息还没落地，切走会丢上下文 */
  function canNavigate() {
    if (!chatStore.isNavigationLocked) return true
    ms.info(t('chat.waitForSending'))
    return false
  }

  function closeSettings() {
    globalStore.updateSettingsDialog(false)
  }

  function collapseSidebarOnMobile() {
    if (isMobile.value) appStore.setSiderCollapsed(true)
  }

  /**
   * 先收起临时层并退掉它们的返回键记录，新地址才不会压在那几笔上面（回来时不用多按一次返回）。
   * 目标就是当前地址（点当前会话）时路由不动，临时层也不收；要定位到当前会话里的某条消息时
   * 照样收起（桌面的代码工作台盖着整个对话区，定位和高亮会发生在它下面）。
   * 地址在收完之后再算：等待期间 hash 可能变了（设置刚推入或刚退回）
   */
  async function navigate(
    location: () => RouteLocationRaw,
    replace = false,
    options: { revealMessage?: boolean; epoch?: number } = {}
  ) {
    if (options.revealMessage || router.resolve(location()).fullPath !== route.fullPath) {
      await closeHistoryLayers()
    }
    // 发起时记下了会话数据代次（发送链路）：收临时层期间身份换了就不再跳转，交给调用方按「身份已变化」结束
    if (options.epoch !== undefined && chatDataEpoch() !== options.epoch) {
      throw new IdentityChangedError()
    }
    const target = location()
    return replace ? router.replace(target) : router.push(target)
  }

  /**
   * 打开会话。focusCid 是要定位到的消息（搜索结果），不传表示回到最新消息。
   * checkLock: false 用于调用方已经检查过锁。
   * passive 用于不是用户发起的跳转（当前会话在别处被删除）：不受提交锁限制、替换历史记录，
   * 保留地址里的 hash（开着的设置不关），手机上也不收起侧栏。
   */
  async function openConversation(
    workspaceId: string,
    options: {
      focusCid?: string | null
      replace?: boolean
      checkLock?: boolean
      passive?: boolean
    } = {}
  ) {
    if (!workspaceId) return false
    if (!options.passive && options.checkLock !== false && !canNavigate()) return false
    chatStore.pendingFocusCid = options.focusCid ?? null
    const failure = await navigate(
      () => ({
        name: 'ChatConversation',
        params: { workspaceId },
        ...(options.passive ? { hash: route.hash } : {}),
      }),
      options.replace || options.passive,
      { revealMessage: Boolean(options.focusCid) }
    )
    if (options.passive) return true
    if (isNavigationFailure(failure, NavigationFailureType.duplicated)) closeSettings()
    collapseSidebarOnMobile()
    return true
  }

  /** 开始新对话：当前已经是空的新对话就留在这里，否则新建一个会话 */
  async function startNewConversation() {
    if (!canNavigate()) return false
    chatStore.pendingFocusCid = null
    if (chatStore.isCurrentConversationEmpty()) {
      closeSettings()
      collapseSidebarOnMobile()
      return true
    }
    try {
      const workspaceId = await chatStore.initializeWorkspace()
      if (!workspaceId) return false
      const failure = await navigate(() => ({ name: 'ChatConversation', params: { workspaceId } }))
      if (isNavigationFailure(failure, NavigationFailureType.duplicated)) closeSettings()
      collapseSidebarOnMobile()
      return true
    } catch (error) {
      notifyError(error, t('chat.createConversationFailed'))
      return false
    }
  }

  /**
   * 发送链路里还没有会话时建一个（首页发第一条消息）。调用方已持有提交锁，这里不做锁检查；
   * 新会话写入当前生效的模型。失败时已提示，返回空字符串。
   */
  async function createConversationForSubmit() {
    // 地址里是一个会话、只是还没打开（列表或消息还在加载）：不另建会话，免得消息发进新会话、还替换掉这个地址
    if (route.name === 'ChatConversation') {
      ms.info(t('chat.loadingConversation'))
      return ''
    }
    const activeConfig = chatStore.activeConfig || {}
    const config = activeConfig.modelInfo
      ? { ...activeConfig, modelInfo: { ...activeConfig.modelInfo, isFixedModel: false } }
      : undefined
    const epoch = chatDataEpoch()
    try {
      const workspaceId = await chatStore.initializeWorkspace(0, config)
      if (!workspaceId) return ''
      await navigate(
        () => ({ name: 'ChatConversation', params: { workspaceId }, hash: route.hash }),
        true,
        { epoch }
      )
      collapseSidebarOnMobile()
      return chatStore.active === workspaceId ? workspaceId : ''
    } catch (error) {
      // 期间身份换了：原样抛出，发送链路静默结束（不提示「建会话失败」，也不当成发送成功）
      if (isIdentityChanged(error)) throw error
      notifyError(error, t('chat.createConversationFailed'))
      return ''
    }
  }

  /** 离开当前会话回到首页（会话被删除、渠道解绑后没有可去的会话） */
  async function leaveConversation(options: { replace?: boolean } = {}) {
    chatStore.resetRouteConversation()
    await navigate(() => ({ name: 'Chat' }), options.replace)
  }

  return {
    canNavigate,
    openConversation,
    startNewConversation,
    createConversationForSubmit,
    leaveConversation,
  }
}
