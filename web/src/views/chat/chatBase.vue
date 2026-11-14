<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue'
import UiButton from '@/components/common/UiButton.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { channelLabelByPacks } from '@/packs'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { isAssistantRunning } from '@/store/modules/chat/messageState'
import '@/styles/chat-page.css'
import { canAnimate, cancelAnimations, readDuration, readEasing } from '@/utils/motion'
import { isAuthenticatedChatUser } from './chatAccess.helpers'
import { chatMessageKey } from './chatBase.helpers'
import { ChatActionsKey, ChatReadonlyKey } from './chatActions'
import ChatCopyright from './components/ChatCopyright.vue'
import FooterComponent from './components/Footer/index.vue'
import ConversationSkeleton from './components/ConversationSkeleton.vue'
import ChatHeader from './components/Header/index.vue'
import Message from './components/Message/index.vue'
import ScrollToBottomButton from './components/ScrollToBottomButton.vue'
import SelectionQuotePopover from './components/SelectionQuotePopover.vue'
import Sider from './components/Sider/index.vue'
import TurnNavigator from './components/TurnNavigator.vue'
import PanelOverlays from './components/UnifiedSidePanel/PanelOverlays.vue'
import SidePanelDock from './components/UnifiedSidePanel/SidePanelDock.vue'
import WelcomeComponent from './components/Welcome/index.vue'
import { useChatRouteState } from './composables/useChatRouteState'
import { useChatShortcuts } from './composables/useChatShortcuts'
import { useChatTurnController } from './composables/useChatTurnController'
import { useConversationLayoutFollow } from './composables/useConversationLayoutFollow'
import { useConversationNavigator } from './composables/useConversationNavigator'
import { useConversationSwitchTransition } from './composables/useConversationSwitchTransition'
import { useHistoryPagination } from './composables/useHistoryPagination'
import { useLandingQuery } from './composables/useLandingQuery'
import { useMessageFocus } from './composables/useMessageFocus'
import { useSelectionQuote } from './composables/useSelectionQuote'
import { useMessageEntrance } from './hooks/useMessageEntrance'
import { useScroll } from './hooks/useScroll'

/** 对话页：侧栏、页头、消息画布、输入区与辅助面板的组装（编排与路由激活见各自组合式函数） */
const { isMobile } = useViewport()
const authStore = useAuthStore()
const chatStore = useChatStore()
const {
  isConversationRoute,
  isConversationLoading,
  isConversationUnavailable,
  shouldRenderConversationCanvas,
  retryRouteSync,
  recheckRouteAfterReconnect,
} = useChatRouteState()

const turnNavigatorRef = ref<InstanceType<typeof TurnNavigator> | null>(null)
const scrollControls = useScroll({
  // 读者把视口从底部移开：导航交互复位，取消尚未执行的兜底贴底
  onReaderDetach: () => {
    turnNavigatorRef.value?.reset()
    layout.cancelSettle()
  },
})
const { scrollRef, adjustScrollTopBy, isAtBottom } = scrollControls

const chatMessages = computed(() => chatStore.chatList)
const activeWorkspaceId = computed(() => chatStore.active)
const hasMessageCid = (cid?: string | null) =>
  Boolean(cid) && chatMessages.value.some(item => item.cid === cid)
const { highlightedCid, hasPendingFocus, focusMessage } = useMessageFocus({ scrollRef })

// 用户消息的入场动效只在发送时播放：历史加载、重连、切换会话都不重播
const {
  mark: markEnteringUserMessage,
  isEntering: isUserMessageEntering,
  handleAnimationEnd: handleMessageEntranceEnd,
  clear: clearEnteringUserMessages,
} = useMessageEntrance({ hasMessage: hasMessageCid })
watch(activeWorkspaceId, () => clearEnteringUserMessages())

// 非 web 渠道（微信 Bot、渠道网关等）创建的会话在网页端只读：后端会拒绝跨渠道写入
const isReadonlyChannel = computed(() => Boolean(chatStore.activeChannel))
const readonlyChannelLabel = computed(() => {
  const channel = String(chatStore.activeChannel || '')
  return channel ? (channelLabelByPacks(channel) ?? channel) : ''
})
const isAuthenticatedUser = computed(() =>
  isAuthenticatedChatUser({ token: authStore.token, role: authStore.userInfo?.role })
)

const emptyStateRef = ref<HTMLElement | null>(null)
const chatFooterDockRef = ref<HTMLElement | null>(null)
const layout = useConversationLayoutFollow({
  scrollRef,
  footerDockRef: chatFooterDockRef,
  isReadonly: () => isReadonlyChannel.value,
  isMobile: () => isMobile.value,
  shouldHold: () =>
    hasPendingFocus() || isLoadingOlderMessages.value || chatMessages.value.length === 0,
  followIfPinned: scrollControls.followIfPinned,
})
const chatFooterInsetStyle = computed(() => ({
  '--chat-footer-dock-height': `${Math.ceil(layout.footerDockHeight.value)}px`,
}))

const turns = useChatTurnController({
  view: {
    followLatest: () => scrollControls.followIfPinned(),
    scrollToBottom: async () => void (await scrollControls.scrollToBottom()),
    settleLayout: () => layout.settle(),
    isAtBottom: () => isAtBottom.value,
    markEnteringUserMessage,
  },
  isMobile,
  isAuthenticatedUser,
  recheckRoute: recheckRouteAfterReconnect,
})

// 消息流划词引用：只有助手正文可引用，只读渠道不启用
const conversationCanvasRef = ref<HTMLElement | null>(null)
const {
  popover: messageQuotePopover,
  handleSelectionChange: handleMessageQuoteSelection,
  hidePopover: hideMessageQuotePopover,
  quoteSelection: quoteSelectedMessageText,
} = useSelectionQuote({
  hostRef: conversationCanvasRef,
  isEligibleNode: node => {
    if (isReadonlyChannel.value) return false
    const element = node instanceof Element ? node : node.parentElement
    return Boolean(element?.closest('[data-assistant-content-body]'))
  },
  isEnabled: () => true,
  minTop: 44,
  // 消息区一直延伸到输入区下面：贴着输入区的选区，气泡放上方，免得落在输入区背后
  bottomInset: () => layout.footerDockHeight.value,
})

const activePagination = computed(() =>
  activeWorkspaceId.value ? chatStore.messagePaginationByWorkspace[activeWorkspaceId.value] : null
)
// 打开尚未拉取过消息的会话时不显示欢迎页并给出骨架；新建空会话已标记 initialized，保持空状态不闪烁
const isInitialConversationLoading = computed(
  () =>
    isConversationRoute.value && isConversationLoading.value && !activePagination.value?.initialized
)
const shouldShowEmptyChatState = computed(
  () => chatMessages.value.length === 0 && !isInitialConversationLoading.value
)
/** 会话内容没取到（也没有缓存）：给出重试，不显示成空会话 */
const isActiveConversationLoadFailed = computed(
  () => Boolean(activePagination.value?.loadFailed) && chatMessages.value.length === 0
)
const hasOlderMessages = computed(() => Boolean(activePagination.value?.hasMore))
const isOlderMessagesLoadFailed = computed(() => Boolean(activePagination.value?.olderLoadFailed))
const isRetryingConversation = ref(false)

async function retryConversationLoad() {
  if (isRetryingConversation.value) return
  // 会话列表没拉到：重新按路由同步（拉到了就打开，确认不在才回首页）
  if (isConversationUnavailable.value) {
    isRetryingConversation.value = true
    try {
      await retryRouteSync()
    } finally {
      isRetryingConversation.value = false
    }
    return
  }
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId) return
  isRetryingConversation.value = true
  try {
    await chatStore.queryActiveChatLogList(workspaceId, { force: true, silentError: true })
    // 取到了：最后一条回复如果还在生成就接上
    await turns.checkAndReconnect()
  } finally {
    isRetryingConversation.value = false
  }
}

const shouldShowCopyright = computed(
  () => !isReadonlyChannel.value && !isMobile.value && shouldShowEmptyChatState.value
)
const headerConversationTitle = computed(() => {
  if (shouldShowEmptyChatState.value || !chatMessages.value.length) return ''
  // 还没自动命名的会话与侧栏一样显示「新对话」
  const title = String(chatStore.getChatByGroupInfo()?.title || '').trim()
  return title || t('common.newConversation')
})
const showsConversationSkeleton = computed(
  () => isInitialConversationLoading.value && !chatMessages.value.length
)
const isLatestReplyRunning = computed(() => isAssistantRunning(chatMessages.value.at(-1)))

// 空状态发首条消息时，输入框从居中原位平滑滑入底部停靠栏并收敛高度（切换会话不触发）
let composerGlideSeq = 0
watch(
  shouldShowEmptyChatState,
  (isEmpty, wasEmpty) => {
    if (!wasEmpty || isEmpty || !chatStore.isSubmitting) return
    const fromRect = emptyStateRef.value
      ?.querySelector<HTMLElement>('.chat-footer-input-shell')
      ?.getBoundingClientRect()
    if (!fromRect || fromRect.height <= 0) return
    const seq = ++composerGlideSeq
    void (async () => {
      for (let i = 0; i < 6 && chatStore.isSubmitting; i++) await Promise.resolve()
      await nextTick()
      if (seq !== composerGlideSeq) return
      const toShell = chatFooterDockRef.value?.querySelector<HTMLElement>(
        '.chat-footer-input-shell'
      )
      if (!canAnimate(toShell)) return
      cancelAnimations(toShell)
      const toRect = toShell.getBoundingClientRect()
      const dx = fromRect.left - toRect.left
      const dy = fromRect.top - toRect.top
      if (toRect.height <= 0 || (Math.abs(dy) < 2 && Math.abs(fromRect.height - toRect.height) < 2))
        return
      toShell.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0)`, minHeight: `${fromRect.height}px` },
          { transform: 'translate3d(0, 0, 0)', minHeight: `${toRect.height}px` },
        ],
        {
          duration: readDuration(toShell, '--motion-duration-2xl', 450),
          easing: readEasing(toShell, '--motion-easing', 'cubic-bezier(0.22, 1, 0.36, 1)'),
        }
      )
    })()
  },
  { flush: 'sync' }
)

const navigation = useConversationNavigator()
useChatShortcuts({
  focusComposer: () => {
    const input = document.querySelector<HTMLTextAreaElement>('.chat-footer-textarea')
    input?.focus()
    return Boolean(input)
  },
  startNewConversation: () => void navigation.startNewConversation(),
})

let isFirstScroll = true
watch(
  chatMessages,
  messages => {
    void layout.refreshLayoutObserver()
    void layout.refreshDockObserver()
    if (messages.length > 0 && isFirstScroll && !hasPendingFocus()) {
      isFirstScroll = false
      void scrollControls.scrollToBottom().then(layout.settle)
    }
    if (chatStore.pendingFocusCid) void focusMessage(chatStore.pendingFocusCid)
  },
  { immediate: true }
)
// 输入框内容与会话加载状态会改变输入区高度
watch([() => chatStore.prompt, isConversationLoading], () => void layout.refreshDockObserver(), {
  flush: 'post',
})
watch(
  shouldRenderConversationCanvas,
  shouldRender => {
    if (!shouldRender) {
      layout.stop()
      return
    }
    void layout.refreshLayoutObserver().then(() => {
      if (chatMessages.value.length > 0 && !hasPendingFocus()) layout.settle()
    })
  },
  { immediate: true }
)

const { isCanvasSwitching } = useConversationSwitchTransition({
  scrollRef,
  isConversationLoading,
  activeWorkspaceId,
  hasActivePendingFocus: hasPendingFocus,
  pinToBottom: scrollControls.pinToBottomNow,
  onReveal: () => {
    suppressHistoryPrefetch(300)
    layout.settle()
  },
})

const {
  isLoadingOlderMessages,
  suppressHistoryPrefetch,
  maybeLoadOlderMessagesOnScroll,
  retryOlderMessages,
} = useHistoryPagination({
  scrollRef,
  adjustScrollTopBy,
  activeWorkspaceId,
  hasMessages: computed(() => chatMessages.value.length > 0),
  isCanvasSwitching,
  getPagination: workspaceId => chatStore.messagePaginationByWorkspace[workspaceId],
  loadOlderMessages: workspaceId => chatStore.loadOlderChatMessages(workspaceId),
})

function handleChatScroll() {
  scrollControls.handleScroll()
  hideMessageQuotePopover()
  turnNavigatorRef.value?.onScroll()
  void maybeLoadOlderMessagesOnScroll()
}

const landingQuery = useLandingQuery()
onMounted(async () => {
  void authStore.getUserInfo().catch(() => undefined)
  await nextTick()
  await layout.refreshLayoutObserver()
  await landingQuery.consume()
  await turns.checkAndReconnect()
})

provide(ChatActionsKey, {
  onConversation: turns.onConversation,
  requestRegenerate: turns.requestRegenerate,
  reconnect: turns.reconnect,
  stop: cid => turns.stopReply(cid),
  isStopping: turns.isStopping,
  isTurnBusy: computed(() => Boolean(chatStore.isStreamIn)),
})
provide(ChatReadonlyKey, isReadonlyChannel)
</script>

<template>
  <div class="chat-app-shell ds-chat-shell flex h-full w-full">
    <Sider class="h-full" />
    <div class="ds-chat-frame relative flex h-full w-full flex-1 overflow-hidden">
      <!-- 设置/文件/会员改为 chat.vue 中的弹窗层，对话画布常驻 -->
      <div class="ds-chat-main flex h-full w-full flex-1">
        <div class="relative h-full min-w-0 flex flex-1 flex-col overflow-hidden">
          <ChatHeader
            :conversation-title="headerConversationTitle"
            :show-home-brand="shouldShowEmptyChatState && !isReadonlyChannel"
            class="ds-chat-header chat-header-surface relative z-header flex-shrink-0"
          />
          <!-- 对话画布：内容层（z-content），压在输入区浮层与页头之下 -->
          <main
            v-if="shouldRenderConversationCanvas"
            ref="conversationCanvasRef"
            class="chat-conversation-canvas ds-chat-canvas relative z-content flex-1 overflow-hidden"
            :class="{ 'is-switching': isCanvasSwitching }"
            :style="chatFooterInsetStyle"
          >
            <div
              ref="scrollRef"
              class="chat-scroll-surface ds-chat-scroll-surface relative h-full custom-scrollbar flex flex-col justify-start"
              style="background-color: transparent; position: relative; z-index: 5"
              @scroll="handleChatScroll"
              @mouseup="handleMessageQuoteSelection"
              @keyup="handleMessageQuoteSelection"
            >
              <div data-chat-transcript class="chat-content-inset mx-auto w-full">
                <template v-if="chatMessages.length">
                  <!-- 还有更早的消息时预留一行：加载中显示进度，失败时给出重试，出现时不挤动正文 -->
                  <div
                    v-if="hasOlderMessages"
                    class="chat-transcript-width mx-auto flex h-10 items-center justify-center"
                  >
                    <span
                      v-if="isLoadingOlderMessages"
                      class="older-message-loading"
                      role="status"
                      :aria-label="t('chat.loadingOlderMessages')"
                    >
                      <span></span><span></span><span></span>
                    </span>
                    <button
                      v-else-if="isOlderMessagesLoadFailed"
                      type="button"
                      class="type-caption fg-link"
                      @click="retryOlderMessages"
                    >
                      {{ t('chat.olderMessagesLoadFailedRetry') }}
                    </button>
                  </div>
                  <div data-chat-message-list class="chat-transcript-width mx-auto pt-3 md:pt-4">
                    <!-- 流式输出时每帧只有正在生成的那条变化：v-memo 让其余消息跳过重新渲染；
                         依赖要覆盖下面用到的每个字段（新增字段时同步补上）。
                         key 必须写成函数调用，原因见 chatMessageKey 的说明 -->
                    <div
                      v-for="(item, index) of chatMessages"
                      :key="chatMessageKey(item.cid, activeWorkspaceId, index)"
                      v-memo="[
                        item,
                        item.content,
                        item.message,
                        item.status,
                        item.loading,
                        item.error,
                        item.errorMessage,
                        item.errorRetryable,
                        item.recovery,
                        item.recoveryMessage,
                        item.progress,
                        item.liveToolCalls,
                        item.model,
                        item.modelName,
                        item.createdAt,
                        item.startedAt,
                        index,
                        index === chatMessages.length - 1,
                        activeWorkspaceId,
                        highlightedCid === item.cid,
                        item.role === 'user' && isUserMessageEntering(item.cid),
                      ]"
                      class="rounded-xl transition-colors duration-xl"
                      :class="{
                        'bg-[var(--message-highlight-bg)]': highlightedCid === item.cid,
                        'chat-message-enter':
                          item.role === 'user' && isUserMessageEntering(item.cid),
                      }"
                      @animationend="handleMessageEntranceEnd($event, item.cid)"
                      :data-chat-message-cid="item.cid || undefined"
                      :data-turn-anchor="item.role === 'user' && item.cid ? item.cid : undefined"
                    >
                      <Message
                        :index="index"
                        :cid="item.cid"
                        :content="item.content"
                        :model="item.model"
                        :modelName="item.modelName"
                        :status="item.status"
                        :createdAt="item.createdAt"
                        :startedAt="item.startedAt"
                        :role="item.role"
                        :loading="item.loading"
                        :error="item.error"
                        :error-message="item.errorMessage"
                        :retry-disabled="item.errorRetryable === false"
                        :recovery="item.recovery"
                        :recovery-message="item.recoveryMessage"
                        :message="item.message"
                        :progress="item.progress"
                        :live-tool-calls="item.liveToolCalls"
                        :isLast="index === chatMessages.length - 1"
                        :conversationId="activeWorkspaceId"
                        @delete="turns.confirmDeleteMessage(item)"
                      />
                    </div>
                  </div>
                </template>
                <div class="bottom chat-bottom-spacer" />
              </div>
            </div>
            <SelectionQuotePopover
              :visible="messageQuotePopover.visible"
              :top="messageQuotePopover.top"
              :left="messageQuotePopover.left"
              :placement="messageQuotePopover.placement"
              @quote="quoteSelectedMessageText"
            />
            <ScrollToBottomButton
              :visible="!isAtBottom"
              :generating="isLatestReplyRunning"
              @click="scrollControls.scrollToBottomSmooth()"
            />
            <TurnNavigator
              ref="turnNavigatorRef"
              :scroll-element="scrollRef"
              :record-programmatic-scroll="scrollControls.recordProgrammaticScroll"
            />
          </main>

          <div
            v-if="showsConversationSkeleton"
            class="chat-content-inset relative z-content flex-1 overflow-hidden"
          >
            <ConversationSkeleton />
          </div>
          <div v-if="isReadonlyChannel && shouldShowEmptyChatState" class="flex-1"></div>
          <!-- 空状态（桌面/移动统一）：标题/输入框一体居中的文档流布局 -->
          <div
            v-if="!isReadonlyChannel && shouldShowEmptyChatState"
            ref="emptyStateRef"
            class="chat-empty-state-scroll ds-chat-canvas chat-surface-enter relative z-content flex-1 overflow-y-auto custom-scrollbar"
          >
            <div class="chat-content-inset flex min-h-full w-full flex-col items-center">
              <div class="chat-empty-spacer-top" aria-hidden="true"></div>
              <div class="chat-composer-width">
                <!-- 会话内容没取到：先重试，暂不显示输入框，免得在看不到上下文的会话里继续发 -->
                <div
                  v-if="isActiveConversationLoadFailed || isConversationUnavailable"
                  class="flex flex-col items-center gap-4 text-center"
                  role="alert"
                >
                  <p class="type-body text-text-secondary">
                    {{
                      isConversationUnavailable
                        ? t('chat.conversationListLoadFailed')
                        : t('chat.conversationLoadFailed')
                    }}
                  </p>
                  <UiButton
                    variant="secondary"
                    :disabled="isRetryingConversation"
                    :aria-busy="isRetryingConversation || undefined"
                    @click="retryConversationLoad"
                  >
                    {{ t('common.retry') }}
                  </UiButton>
                </div>
                <template v-else>
                  <WelcomeComponent class="mb-6 md:mb-7" />
                  <FooterComponent class="relative z-1" @pause-request="turns.stopReply()" />
                </template>
              </div>
              <div class="chat-empty-spacer-bottom" aria-hidden="true"></div>
            </div>
          </div>
          <!-- 有消息或首屏加载期间保持底部挂载，避免切换会话闪烁 -->
          <div
            v-else-if="!isReadonlyChannel"
            ref="chatFooterDockRef"
            class="chat-footer-dock ds-input-dock chat-content-inset pointer-events-none absolute inset-x-0 bottom-0 z-composer bg-transparent"
          >
            <FooterComponent class="relative z-1 pb-3 md:pb-4" @pause-request="turns.stopReply()" />
          </div>
          <!-- 非 web 渠道会话：只读提示，替代输入框 -->
          <div
            v-else
            class="chat-readonly-channel-notice ds-input-dock chat-content-inset pointer-events-none absolute inset-x-0 bottom-0 z-composer flex justify-center"
          >
            <div
              class="pointer-events-auto inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-app-border bg-app-elevated px-4 py-2 text-sm text-text-muted shadow-sm"
              :class="isMobile ? 'mb-3' : 'mb-5'"
              role="status"
            >
              <Lock :size="14" class="shrink-0" aria-hidden="true" />
              <span class="truncate">{{
                t('chat.readonlyChannelNotice', { channel: readonlyChannelLabel })
              }}</span>
            </div>
          </div>
          <ChatCopyright v-if="shouldShowCopyright" />
        </div>
        <SidePanelDock />
      </div>
      <PanelOverlays />
    </div>
  </div>
</template>
