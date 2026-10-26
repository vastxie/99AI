import type { AgentEvent, AgentEventOf } from '@99agent/contracts'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, watch, type Ref } from 'vue'
import { createSubmissionId, resyncChat, startChat, stopChat, type StopChatOutcome } from '@/api'
import { fetchQueryChatLogAroundAPI } from '@/api/chatLog'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { eventBus } from '@/core/events/eventBus'
import { t, tp } from '@/locales'
import { handleChatErrorByPacks } from '@/packs'
import {
  IDENTITY_CHANGED,
  IdentityChangedError,
  identityEpoch,
  isIdentityChanged,
} from '@/services/identity'
import { socketService } from '@/services/socket-io'
import { useAuthStore } from '@/store/modules/auth'
import {
  chatDataEpoch,
  markReplySettled,
  SubmissionCancelledError,
  useChatStore,
} from '@/store/modules/chat'
import {
  isAssistantFinished,
  isAssistantRunning,
  isAssistantUnsettled,
  TERMINAL_CHAT_LOG_STATUSES,
} from '@/store/modules/chat/messageState'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { confirmDialog } from '@/utils/dialog'
import { message } from '@/utils/message'
import { parseStoredTurnId } from '@/utils/messageParser'
import { resolveReasoningEffort } from '@/utils/reasoning'
import { buildUserMessage } from '@/utils/userMessageBuilder'
import { isAgentEvent, isPlaceholderMessageId } from '../agent-stream/events'
import { shouldRouteAgentEventToForeground } from '../agent-stream/routing'
import {
  createAgentStreamSession,
  type AgentStreamSession,
  type AgentStreamSessionOptions,
} from '../agent-stream/streamSession'
import { waitForMilliseconds } from '../chatBase.helpers'
import { classifyChatError } from '../chatError.helpers'
import { planChatSync, type ChatSyncEvent } from '../chatSync.helpers'
import {
  confirmTurnReplacement,
  countLaterTurns,
  turnReplaceConflictOf,
  type TurnReplaceConflict,
} from '../turnReplacement'
import { useConversationNavigator } from './useConversationNavigator'
import { useStreamLifecycle } from './useStreamLifecycle'

/** 控制器需要页面配合的视图动作：滚动跟随与入场动画都属于页面 */
export interface ChatTurnViewHooks {
  /** 底部仍归程序所有时跟随到最新 */
  followLatest: () => void
  /** 立即滚到底部 */
  scrollToBottom: () => Promise<void>
  /** 布局稳定后的兜底跟随 */
  settleLayout: () => void
  /** 消息列表是否停在底部（别处同步来的消息是否跟随） */
  isAtBottom: () => boolean
  /** 本页发出的提问入场动画 */
  markEnteringUserMessage: (cid?: string) => void
}

/** 服务端接受后等 agent.start 的上限：超过就先释放提交锁，事件到了照常渲染 */
const AGENT_START_WAIT_MS = 8000
/** 刚停下的回复服务端要一会儿才落成已停止：这段时间里重新生成被拒，稍等再试一次 */
const STOP_SETTLE_MS = 1500
const RECENT_STOP_MS = 5000
/** 回执没有送到（超时、连接失败、回执不对）：网络问题，不代表服务端拒绝 */
const TRANSPORT_FAILURE_CODES = new Set(['TIMEOUT', 'CONNECTION_FAILED', 'INVALID_ACK'])
/**
 * 发送结果不确定：回执没送到，或服务端处理到一半才失败（写入后没能启动、未知错误）。
 * 这一轮可能已经建好，重新生成时原来的回合可能已经删掉
 */
const UNCERTAIN_START_CODES = new Set([
  ...TRANSPORT_FAILURE_CODES,
  'NOT_ACCEPTED',
  'EXECUTION_START_FAILED',
  'INTERNAL_ERROR',
  // 实时连接校验失败：这个包没有执行，但超时重发时第一次可能已经被接受，不能据此判定没建好
  'SESSION_UNAVAILABLE',
  'SESSION_INVALID',
])

function isTransportFailure(code?: string) {
  return Boolean(code && TRANSPORT_FAILURE_CODES.has(code))
}

/**
 * 恢复（chat:resync）没成功但不代表服务端拒绝：网络问题，或连接刚建好、鉴权还没完成时回的「请先登录」。
 * 这类不标「拒绝过恢复」，看门狗与重连入口会再试
 */
function isTransientRecoveryFailure(code?: string) {
  return (
    isTransportFailure(code) ||
    code === 'UNAUTHORIZED' ||
    // 实时连接校验失败：服务端随后断开，核对身份后重连，看门狗与重连入口再试
    code === 'SESSION_UNAVAILABLE' ||
    code === 'SESSION_INVALID' ||
    // 身份已变：这次恢复作废，身份变化流程会清空会话区；不算拒绝
    code === IDENTITY_CHANGED
  )
}

type ForegroundSessionInput = Pick<AgentStreamSessionOptions, 'cid' | 'turnId' | 'modelName'> & {
  /** 只接收这个会话的事件：切走后不串到别的会话 */
  workspaceId?: string
  /** 这次发送的提交号：等 agent.start 时只认自己的 */
  submissionId?: string
  onAgentStart: (event: AgentEventOf<'agent.start'>) => void | Promise<void>
  onHandoff?: () => void
  onDone: (session: AgentStreamSession) => void
  onError: NonNullable<AgentStreamSessionOptions['onError']>
}

/**
 * 一轮对话的编排：发送（含重新生成 / 编辑重发）、断线恢复、停止、别处同步来的会话变化。
 *
 * 发送与恢复共用一个前台流式会话工厂（openForegroundSession）：建立事件归约会话、订阅 agent:event
 * （只收当前消息的事件）并登记到订阅生命周期；两者只在 agent.start、结束与出错时的处理上不同。
 * 页面（chatBase）只负责布局、滚动与装配。
 */
export function useChatTurnController(options: {
  view: ChatTurnViewHooks
  isMobile: Ref<boolean>
  isAuthenticatedUser: Ref<boolean>
  /** 重连后列表补拉完：由路由状态按此刻的地址核对当前会话还在不在（见 useChatRouteState） */
  recheckRoute?: () => Promise<void>
}) {
  const { view } = options
  const ms = message()
  const authStore = useAuthStore()
  const chatStore = useChatStore()
  const globalStore = useGlobalStoreWithOut()
  const navigation = useConversationNavigator()

  const chatMessages = computed(() => chatStore.chatList)
  const activeWorkspaceId = computed(() => chatStore.active)

  /* 流式订阅生命周期：订阅登记 / 清理 + watchdog + 页面级恢复入口，详见 useStreamLifecycle */
  const {
    currentStreamCid,
    isReconnecting,
    getActiveStreamSession,
    registerStreamSession,
    cleanupSubscription,
    settleStreamText,
    requestStreamResync,
    noteStreamActivity,
    resetWatchdog,
    startWatchdog,
    tryResumeActiveTask,
  } = useStreamLifecycle({
    getLastMessage: () => chatMessages.value[chatMessages.value.length - 1],
    getMessageByCid: cid => chatMessages.value.find(item => item.cid === cid),
    // 跟丢的回复也接着找：网络恢复、切回页面时自动重连，不必等用户点「重新连接」；
    // 服务端明确拒绝过恢复的不再自动重试，留给用户手动重连或停止
    isResumableMessage: item => isAssistantUnsettled(item) && !item?.recoveryRejected,
    resumeWorkflow: cid => {
      void reconnectToWorkflow(cid, activeWorkspaceId.value || undefined)
    },
    // 补发请求没送到是网络问题：看门狗与重连入口会再试，不判跟丢；已经出错或结束的回复不改成跟丢
    onResyncRejected: (cid, reason, code) => {
      if (isTransientRecoveryFailure(code)) return
      const current = chatMessages.value.find(item => item.cid === cid)
      if (!current || isAssistantFinished(current)) return
      markStreamRecoveryStalled(cid, reason, { rejected: true })
    },
    onWatchdogExhausted: cid => void settleAfterRecoveryExhausted(cid),
  })

  /** 正在停止的回复（停止请求发出到有结果之间，按 cid）：输入框与跟丢卡片的停止按钮据此显示进行中 */
  const stoppingCids = reactive(new Set<string>())
  /** 本页最近停下的回复：服务端落成已停止之前重新生成会被拒，据此稍等重试 */
  let lastStop: { cid: string; at: number } | null = null
  /** 页面已卸载：延后执行的续接不再开订阅 */
  let disposed = false
  /** 续接因为正在发出新一轮而让了路：提交锁释放后补一次 */
  let resumeDeferredBySubmit = false
  /** 每次续接一个令牌：切换会话后旧的续接返回时不去清新续接的「重连中」 */
  let reconnectToken = 0

  function hasMessageCid(cid?: string | null) {
    if (!cid) return false
    return chatMessages.value.some(item => item.cid === cid)
  }

  function findMessageIndexByCid(cid?: string | null) {
    if (!cid) return -1
    return chatMessages.value.findIndex(item => item.cid === cid)
  }

  function updateGroupChatByCid(
    cid: string | null | undefined,
    patch: Partial<Chat.Chat>,
    pendingQueueIntentExpectation?: Chat.PendingQueueIntentIdentity | null
  ) {
    const targetIndex = findMessageIndexByCid(cid)
    if (targetIndex < 0) return false
    chatStore.updateGroupChatSome(targetIndex, patch, pendingQueueIntentExpectation)
    return true
  }

  function updateStreamMessage(
    patch: Partial<Chat.Chat>,
    fallbackCid?: string | null,
    pendingQueueIntentExpectation?: Chat.PendingQueueIntentIdentity | null
  ) {
    const targetCid = patch.cid || fallbackCid || currentStreamCid.value
    if (!targetCid) return false
    return updateGroupChatByCid(targetCid, patch, pendingQueueIntentExpectation)
  }

  /**
   * 回复出错的提示（发送与恢复共用）：扩展包认识的（如额度不足）交给扩展包，违规弹说明，
   * 要登录打开登录框，其余直接提示。取消（含用户主动停止）不提示；返回错误的分类
   */
  function presentChatError(error: any) {
    const errorMessage = error?.message || ''
    // 优先按后端错误码分流，读不到再回退文案匹配，详见 chatError.helpers
    const errorKind = classifyChatError(error)
    if (errorKind === 'aborted') return errorKind
    if (
      handleChatErrorByPacks(
        { kind: errorKind, message: errorMessage, raw: error },
        {
          isMobile: options.isMobile.value,
          isAuthenticated: options.isAuthenticatedUser.value,
        }
      )
    ) {
      // 扩展包认识并已处理这类错误（如额度不足）
    } else if (errorKind === 'contentViolation') {
      globalStore.updateContentViolationDialog(true)
    } else if (errorKind === 'loginRequired') {
      ms.error(t('common.loginRequired'))
      authStore.setLoginDialog(true)
    } else if (errorMessage) {
      ms.error(errorMessage)
    }
    return errorKind
  }

  /** agent.error 带来的错误：文案与结构化错误码（错误分流按码） */
  function streamErrorOf(message: string | undefined, event?: unknown) {
    return Object.assign(new Error(message || t('common.unknownError')), {
      code: (event as { data?: { code?: unknown } } | undefined)?.data?.code,
    })
  }

  /**
   * 跟丢了仍在运行的回复（恢复被拒、多次重连没有结果）：不再显示运行中，留下说明与「重新连接」，
   * 由用户决定何时再试（isAssistantRunning 不再把它算作生成中，输入框与删除会话不会一直被挡住）
   */
  function markStreamRecoveryStalled(
    cid: string,
    reason?: string,
    options: { rejected?: boolean; clearError?: boolean } = {}
  ) {
    // 标成不再生成之前先把已经流出的正文落盘（订阅还留着，事件再到会自动接上）
    settleStreamText(cid)
    updateGroupChatByCid(cid, {
      loading: false,
      recovery: 'stalled',
      recoveryMessage: reason || t('chat.streamRecoveryStalled'),
      recoveryRejected: options.rejected || undefined,
      // 服务端拒绝恢复时先推一条指向这条回复的错误：那不是回复本身出错，按跟丢显示
      ...(options.clearError
        ? { error: false, errorMessage: undefined, errorRetryable: undefined }
        : {}),
      liveToolCalls: [],
    })
  }

  /**
   * watchdog 重试耗尽（约 200 秒没有任何事件 + 3 次重连没有结果）：先按服务端刷新这条回复——
   * 它可能早就结束了、只是结束事件没送到；服务端仍显示在运行才标成跟丢，交给用户手动重连。
   * 以前这里直接判失败，用户再点重新生成会删掉服务端其实已完成的回答再跑一次
   */
  async function settleAfterRecoveryExhausted(cid: string) {
    await chatStore.queryActiveChatLogList(activeWorkspaceId.value, {
      force: true,
      silent: true,
      silentError: true,
    })
    const current = chatMessages.value.find(item => item.cid === cid)
    if (!current || isAssistantFinished(current)) return
    markStreamRecoveryStalled(cid)
  }

  /** 服务端确认这条回复还在：去掉跟丢 / 重连中的标记，回到生成中 */
  function clearStreamRecovery(cid: string) {
    const current = chatMessages.value.find(item => item.cid === cid)
    if (!current?.recovery || isAssistantFinished(current)) return
    updateGroupChatByCid(cid, {
      recovery: undefined,
      recoveryMessage: undefined,
      recoveryRejected: undefined,
      loading: true,
    })
  }

  /** 重连请求没送到：手动点的「重新连接」回到跟丢，按钮还在，可以再试 */
  function settleReconnectAfterTransportFailure(cid: string) {
    const current = chatMessages.value.find(item => item.cid === cid)
    if (current?.recovery === 'reconnecting') {
      markStreamRecoveryStalled(cid, t('common.connectionFailed'))
    }
  }

  /**
   * 用户在跟丢的回复上点「重新连接」。有一轮正在发出或生成时不接：前台订阅只有一个，
   * 接上旧的会把正在进行的那一轮挤掉（界面上按钮此时也是停用的）
   */
  async function reconnect(cid: string) {
    if (chatStore.isStreamIn) return
    updateGroupChatByCid(cid, {
      recovery: 'reconnecting',
      recoveryMessage: undefined,
      recoveryRejected: undefined,
    })
    await reconnectToWorkflow(cid, activeWorkspaceId.value || undefined)
  }

  /**
   * 重连途中前台订阅被新发出的一轮接走：这条回复回到跟丢（服务端可能仍在跑），之后可以再接。
   * 现在跟着的正是这条（另一次续接接上了它）就不回写；服务端回执说它早已结束（结局事件因为订阅已换
   * 而没送到）就按服务端刷新，不标跟丢
   */
  function settleSupersededReconnect(
    cid: string,
    ack?: Awaited<ReturnType<typeof resyncChat>> | null,
    handshakeFailure?: { reason: string; rejected: boolean } | null
  ) {
    if (currentStreamCid.value === cid) return
    const current = chatMessages.value.find(item => item.cid === cid)
    if (!current) return
    // 握手期间推来的错误已把它写成了「出错」，恢复其实没成功：按跟丢显示，之后可以再接
    if (handshakeFailure) {
      markStreamRecoveryStalled(cid, handshakeFailure.reason, {
        rejected: handshakeFailure.rejected,
        clearError: true,
      })
      return
    }
    if (isAssistantFinished(current)) return
    if (ack?.ok && ack.data?.terminal) {
      void chatStore.queryActiveChatLogList(activeWorkspaceId.value, {
        force: true,
        silent: true,
        silentError: true,
      })
      return
    }
    markStreamRecoveryStalled(
      cid,
      current.recovery === 'stalled' ? current.recoveryMessage : undefined
    )
  }

  /**
   * 接续的下一轮没能开始（排队的补充要求被拒、服务端没能启动它）：按服务端刷新这个会话，
   * 那条补充要求落成了什么（已收口的提问与回复、或者没有）以服务端为准。已经切走的不动
   */
  function refreshAfterContinuationFailure(workspaceId: string) {
    if (activeWorkspaceId.value !== workspaceId) return
    void chatStore.queryActiveChatLogList(workspaceId, {
      force: true,
      silent: true,
      silentError: true,
    })
  }

  /**
   * 发送失败后补一次续接：发送期间自动续接让了路，最后一条若是跟丢的回复，等提交锁释放后再接上
   * （输入框在发送失败后才释放提交锁）
   */
  function resumeAfterFailedSubmit(workspaceId: string) {
    setTimeout(() => {
      if (disposed || activeWorkspaceId.value !== workspaceId || chatStore.isSubmitting) return
      void checkAndReconnect()
    }, 0)
  }

  /**
   * 建立前台流式会话（发送与恢复共用）：先清掉上一条订阅，建立事件归约会话，
   * 订阅 agent:event（只收当前消息的事件），再登记到订阅生命周期。
   */
  function openForegroundSession(input: ForegroundSessionInput) {
    cleanupSubscription()
    currentStreamCid.value = input.cid || null
    /** 恢复的会话接续下一轮之前：只认父回合是刚结束那一轮的 agent.start（发送的会话按提交号认） */
    let handoffParentTurnId = ''
    const session = createAgentStreamSession({
      cid: input.cid,
      turnId: input.turnId,
      modelName: input.modelName,
      applyPatch: (patch, pendingQueueIntentExpectation) => {
        const targetCid = patch.cid || currentStreamCid.value || input.cid
        // 事件又到了：这条回复不再是跟丢状态（也不再算拒绝过恢复）
        const recovering = chatMessages.value.find(item => item.cid === targetCid)?.recovery
        const nextPatch = recovering
          ? {
              ...patch,
              recovery: undefined,
              recoveryMessage: undefined,
              recoveryRejected: undefined,
            }
          : patch
        return updateStreamMessage(nextPatch, targetCid, pendingQueueIntentExpectation)
      },
      isSettled: settledCid => {
        const row = chatMessages.value.find(item => item.cid === settledCid)
        return Boolean(row && isAssistantFinished(row))
      },
      onCidResolved: resolvedCid => {
        currentStreamCid.value = resolvedCid
      },
      onAgentStart: input.onAgentStart,
      onBilling: summary => authStore.setBilling(summary),
      // 同一工作流接续下一轮：保持订阅，等新的 agent.start 带来下一轮的消息
      onHandoff: () => {
        handoffParentTurnId = input.submissionId ? '' : session.turnId
        currentStreamCid.value = null
        input.onHandoff?.()
      },
      onDone: () => input.onDone(session),
      onError: input.onError,
      onSeqGap: lastSeq => requestStreamResync(lastSeq),
    })
    // 发送的会话在等 agent.start 时（刚发出、接续下一轮）只认这一串回合的提交号：
    // 接续轮的 agent.start 带的也是发起时的提交号，别的页签、别的会话的不认
    const unsubscribe = socketService.on('agent:event', async (event: AgentEvent) => {
      if (!isAgentEvent(event)) return
      const routed = shouldRouteAgentEventToForeground(event, {
        targetCid: currentStreamCid.value,
        awaitingSubmissionId: input.submissionId,
        awaitingParentTurnId: handoffParentTurnId,
      })
      if (!routed) return
      if (event.type === 'agent.start') handoffParentTurnId = ''
      if (input.workspaceId && activeWorkspaceId.value !== input.workspaceId) return
      await session.applyEvent(event, {
        pendingQueueIntentExpectation: chatStore.getPendingQueueIntentIdentity(),
      })
      noteStreamActivity()
    })
    // 先登记订阅，再发 chat:start / chat:resync，确保同步返回的事件也被这个会话接住
    registerStreamSession(unsubscribe, session)
    return session
  }

  async function waitForActiveMessageLoadSettled(workspaceId: string) {
    for (let attempts = 0; attempts < 40; attempts += 1) {
      const pagination = chatStore.messagePaginationByWorkspace[workspaceId]
      if (!pagination?.loading) return
      await waitForMilliseconds(50)
    }
  }

  async function ensureWorkspaceInitialized() {
    // 这里始终处在发送链路内：调用方（Footer 提交 / 重新生成 / 编辑重发）可能已持有提交锁，
    // 建会话走发送专用入口，不做导航锁检查（失败时已提示原因）。
    // 每个 await 之后核对会话数据代次：期间身份换了就抛「身份已变化」，不为新身份建会话、不按旧会话取消息
    const epoch = chatDataEpoch()
    const assertSameIdentity = () => {
      if (chatDataEpoch() !== epoch) throw new IdentityChangedError()
    }
    if (!chatStore.active && !(await navigation.createConversationForSubmit())) {
      assertSameIdentity()
      throw new Error(t('chat.createConversationFailed'))
    }
    assertSameIdentity()

    const targetWorkspaceId = activeWorkspaceId.value
    await waitForActiveMessageLoadSettled(targetWorkspaceId)
    assertSameIdentity()

    // 新消息要接在已加载的记录后面：还没加载过就先取一次
    const pagination = chatStore.messagePaginationByWorkspace[targetWorkspaceId]
    if (!pagination?.initialized) {
      await chatStore.queryActiveChatLogList(targetWorkspaceId, { force: true, silentError: true })
      assertSameIdentity()
    }
  }

  /** 发送当时的生效模型：与模型选择器同源（重新生成、编辑重发不传模型时也发选择器显示的那个） */
  function resolveTurnModel(params: Chat.ConversationParams) {
    const config = chatStore.effectiveModelConfig
    const modelInfo = config?.modelInfo
    return {
      model: params.model || String(modelInfo?.model || ''),
      modelName: params.modelName || String(modelInfo?.modelName || 'AI'),
      modelId: params.modelId || Number(modelInfo?.id || 0),
      reasoningEffort: resolveReasoningEffort(
        params.reasoningEffort ??
          resolveReasoningEffort(config?.reasoningEffort, modelInfo?.capabilities),
        modelInfo?.capabilities
      ),
    }
  }

  /** 提问的统一消息结构：重新生成 / 编辑重发沿用原消息（保留媒体），只换文字 */
  function buildTurnUserMessage(
    promptText: string,
    urlItems: Chat.UrlItem[],
    existingMessage?: string
  ) {
    if (!existingMessage) return buildUserMessage(promptText, urlItems)
    try {
      const parsed = JSON.parse(existingMessage)
      parsed.content = promptText
      if (parsed.rounds && parsed.rounds.length > 0) {
        parsed.rounds[0].text = promptText || null
      }
      parsed.timestamp = new Date().toISOString()
      return JSON.stringify(parsed)
    } catch {
      return buildUserMessage(promptText, urlItems)
    }
  }

  /**
   * 发起一轮对话；带 cid 表示重新生成 / 编辑重发（见 replaceTurn）。
   * 用户在确认框里取消、或已有一次发送在路上时返回 false，调用方据此保留编辑状态。
   */
  async function onConversation(params: Chat.ConversationParams): Promise<boolean | undefined> {
    const normalizedMsg = String(params.msg || '').trim()
    // 输入长度上限读后端配置，默认 20000 字
    const maxInputLength = Number(authStore.globalConfig?.maxInputLength) || 20000
    if (normalizedMsg.length > maxInputLength) {
      ms.warning(t('chat.inputTooLong', { max: maxInputLength }))
      throw new Error(t('chat.inputTooLong', { max: maxInputLength }))
    }
    return params.cid ? replaceTurn(params, params.cid) : submitTurn(params)
  }

  /** 本页有没有还没结局的回复：生成中，或跟丢了（服务端可能仍在跑） */
  function hasUnsettledTurn() {
    return chatMessages.value.some(item => isAssistantUnsettled(item))
  }

  function confirmReplaceLaterTurns(count: number, changed: boolean) {
    return confirmDialog({
      title: t('chat.replaceLaterTurnsTitle'),
      content: tp(
        changed ? 'chat.replaceLaterTurnsChangedContent' : 'chat.replaceLaterTurnsContent',
        count
      ),
      positiveText: t('chat.replaceLaterTurnsConfirm'),
      negativeText: t('common.cancel'),
      tone: 'danger',
    })
  }

  /**
   * 按服务端重新对一遍会话：刷新消息（别处删掉的回合一并去掉），最后一条还没结局就接上。
   * 已经切走的会话丢掉缓存，下次打开重新加载
   */
  function resyncConversation(workspaceId: string) {
    if (!workspaceId) return
    if (activeWorkspaceId.value !== workspaceId) {
      chatStore.dropMessageCache(workspaceId)
      return
    }
    void chatStore
      .queryActiveChatLogList(workspaceId, { force: true, silent: true, silentError: true })
      .then(() => {
        if (activeWorkspaceId.value === workspaceId) void checkAndReconnect()
      })
  }

  /** 替换被服务端拒绝（什么都没删）：说明原因，按服务端刷新会话 */
  function handleReplaceConflict(conflict: TurnReplaceConflict, workspaceId: string) {
    if (conflict === 'TURN_RUNNING') ms.info(t('chat.replaceTurnRunning'))
    else if (conflict === 'REPLACE_TARGET_GONE') ms.warning(t('chat.replaceTargetGone'))
    else ms.warning(t('chat.replaceRangeChanged'))
    resyncConversation(workspaceId)
  }

  /** 带 cid 的发送正在进行（从确认框到这一轮开始）：连点重新生成、按住回车只发一次 */
  let replacing = false

  /** 刚在本页停下的回复在这次要替换的范围里（替换起点之后）：服务端落成已停止之前会拒绝替换 */
  function wasJustStopped(fromCid: string) {
    if (!lastStop || Date.now() - lastStop.at >= RECENT_STOP_MS) return false
    const stoppedIndex = findMessageIndexByCid(lastStop.cid)
    const fromIndex = findMessageIndexByCid(fromCid)
    return stoppedIndex >= 0 && fromIndex >= 0 && stoppedIndex > fromIndex
  }

  /**
   * 重新生成 / 编辑重发：从这条提问起替换原来的回合。
   *
   * 还没结局的回复不能被删：被删的回复服务端不会收到停止指令，会继续跑、继续计费；
   * 跟丢的回复可能仍在跑，同样要先停止或重新连接。后面还有对话时先说清楚删几轮。
   * 服务端在接受新一轮的同一事务里删掉原来的回合，下列情况拒绝（什么都不删）：这条提问已经不在、
   * 后面还有回复在生成、后面的轮数和用户确认的不一样（页面只加载了一部分）。
   * 最后一种按服务端给的实际轮数再确认一次，其余提示原因后按服务端刷新会话。
   */
  async function replaceTurn(params: Chat.ConversationParams, cid: string) {
    if (replacing || chatStore.isSubmitting) return false
    const workspaceId = activeWorkspaceId.value
    // 身份在确认框、等待重试期间换了（即使之后又回到同一个会话）：这次替换作废
    const epoch = chatDataEpoch()
    const assertSameIdentity = () => {
      if (chatDataEpoch() !== epoch) throw new IdentityChangedError()
    }
    replacing = true
    try {
      let laterTurns = countLaterTurns(chatMessages.value, cid)
      let rangeChanged = false
      let needsConfirm = true
      let retriedAfterStop = false
      for (;;) {
        if (needsConfirm) {
          const decision = await confirmTurnReplacement({
            isRunning: hasUnsettledTurn,
            laterTurns,
            confirm: count => confirmReplaceLaterTurns(count, rangeChanged),
          })
          if (decision === 'cancelled') {
            if (rangeChanged) resyncConversation(workspaceId)
            return false
          }
          if (decision === 'running') {
            ms.info(t('chat.replaceWhileUnsettled'))
            throw new Error(t('chat.replaceWhileUnsettled'))
          }
          needsConfirm = false
        }
        assertSameIdentity()
        // 确认框开着期间页面换了会话（当前会话在别处被删）：不再发
        if (activeWorkspaceId.value !== workspaceId) return false

        // 确认框开着期间别的提交拿到了锁：这次不发
        const lock = chatStore.acquireSubmitLock()
        if (!lock) return false
        try {
          return await submitTurn(params, { cid, laterTurns })
        } catch (error) {
          // 已被停止按钮作废或身份换了：不再重试、不再处理冲突
          if (!chatStore.isSubmitLockCurrent(lock)) throw error
          const conflict = turnReplaceConflictOf(error)
          const actualLaterTurns = Number(
            (error as { data?: { laterTurns?: unknown } })?.data?.laterTurns
          )
          if (
            conflict === 'REPLACE_RANGE_CHANGED' &&
            !rangeChanged &&
            Number.isInteger(actualLaterTurns) &&
            actualLaterTurns >= 0
          ) {
            rangeChanged = true
            laterTurns = actualLaterTurns
            needsConfirm = true
            continue
          }
          // 刚在本页停下的那一轮，服务端还没落成已停止：稍等再试一次，不打扰用户
          // （等待期间占着提交锁，输入框不会在这时另发一轮）
          if (conflict === 'TURN_RUNNING' && !retriedAfterStop && wasJustStopped(cid)) {
            retriedAfterStop = true
            await waitForMilliseconds(STOP_SETTLE_MS)
            // 等待期间被停止按钮作废或身份换了：不再重新取锁重试
            if (!chatStore.isSubmitLockCurrent(lock)) throw new SubmissionCancelledError()
            assertSameIdentity()
            continue
          }
          if (conflict) handleReplaceConflict(conflict, workspaceId)
          throw error
        } finally {
          // 只释放自己仍持有的锁：被作废的旧操作结束时不会解开新提交的锁
          chatStore.releaseSubmitLock(lock)
        }
      }
    } finally {
      replacing = false
    }
  }

  /** 发出一轮：新提问，或（带 replace）替换从某条提问起的回合 */
  async function submitTurn(
    params: Chat.ConversationParams,
    replace?: { cid: string; laterTurns: number }
  ): Promise<undefined> {
    const { urlItems } = params
    const normalizedMsg = String(params.msg || '').trim()
    // 这次提交仍有效：会话数据代次没变（身份没换），调用方持有的提交锁没被停止按钮作废。
    // 失效之后不再重试、恢复订阅、启动看门狗或改别的回合的消息，只把自己的结果交给服务端状态收口
    const lock = chatStore.heldSubmitLock()
    const epoch = chatDataEpoch()
    const stillOwned = () =>
      chatDataEpoch() === epoch && (!lock || chatStore.isSubmitLockCurrent(lock))

    await ensureWorkspaceInitialized()
    if (!stillOwned()) throw new SubmissionCancelledError()

    const turnModel = resolveTurnModel(params)
    const submittedPromptText = normalizedMsg || t('chat.askQuestion')
    const finalUrlItems: Chat.UrlItem[] = urlItems || []
    const userMessageRounds = buildTurnUserMessage(
      submittedPromptText,
      finalUrlItems,
      params.message
    )

    let useStatus: number = ChatLogStatus.PENDING
    let initialMessagesInserted = false
    /** 这次发出的那一轮开始过（之后可能已经结束、接续了下一轮）：服务端接受了 */
    let firstTurnInserted = false
    /** 接续下一轮之前（handoff 之后、新的 agent.start 之前） */
    let awaitingContinuation = false
    // 服务端接受后要等 agent.start 插入这一轮的消息，发送才算完成：在此之前输入框保持「发送中」，
    // 不会先掉回空闲再跳到「生成中」
    let markStarted = () => {}
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    // 本轮发送的目标会话：ACK / agent.start 的消息归位与 409 清理都锚定它，不随发送后的切换漂移
    const workspaceId = activeWorkspaceId.value
    const submittedConversationGid = chatStore.activeConversationGid(workspaceId)
    const pendingQueueIntentExpectation = chatStore.getPendingQueueIntentIdentity()

    let replacedLocally = false
    /** 原来的回合服务端已经删掉：本地也去掉（agent.start 与接受回执，先到的那个做） */
    const removeReplacedTurn = () => {
      if (!replace || replacedLocally) return
      replacedLocally = true
      chatStore.removeMessagesFromCid(replace.cid, workspaceId)
    }

    const insertInitialMessages = async (initialMessages?: {
      user?: Chat.Chat
      assistant?: Chat.Chat
    }) => {
      if (initialMessagesInserted) return
      if (!initialMessages?.user || !initialMessages?.assistant) return

      removeReplacedTurn()
      view.markEnteringUserMessage(initialMessages.user.cid)
      // 本地拼的提问（带附件）只属于这次发出的那一轮；接续轮的提问是排队的补充要求，用服务端给的
      const isFirstTurn = !firstTurnInserted
      firstTurnInserted = true
      awaitingContinuation = false
      chatStore.addGroupChat(
        isFirstTurn && finalUrlItems.length > 0
          ? { ...initialMessages.user, message: userMessageRounds }
          : initialMessages.user
      )
      chatStore.addGroupChat({
        ...initialMessages.assistant,
        loading: true,
        error: false,
        status: initialMessages.assistant.status ?? useStatus,
      })

      initialMessagesInserted = true
      markStarted()
      await nextTick()
      await view.scrollToBottom()
      view.settleLayout()
    }

    /** 本轮结束（agent.end）：agent.end 已带上最终消息投影，本地这一行就是权威内容，不再重拉 */
    const finishStreaming = async (targetCid?: string | null) => {
      resetWatchdog()
      const finishingIndex = findMessageIndexByCid(targetCid)
      if (finishingIndex >= 0) {
        chatStore.updateGroupChatSome(finishingIndex, { loading: false, liveToolCalls: [] })
      }
      // 会话标题由服务端在头几轮生成：还没有标题时刷新侧栏列表，有了就只把它排到前面
      await chatStore.refreshAfterTurn(workspaceId)
      view.followLatest()
    }

    const handleStreamError = (
      error: any,
      expectation?: Chat.PendingQueueIntentIdentity | null
    ) => {
      const stopAssistantLoading = () => {
        if (!initialMessagesInserted) return
        const targetCid = currentStreamCid.value
        if (targetCid) {
          updateGroupChatByCid(targetCid, { loading: false, liveToolCalls: [] }, expectation)
          return
        }
        const lastIndex = chatMessages.value.length - 1
        if (chatMessages.value[lastIndex]?.role === 'assistant') {
          chatStore.updateGroupChatSome(
            lastIndex,
            { loading: false, liveToolCalls: [] },
            expectation
          )
        }
      }
      stopAssistantLoading()
      resetWatchdog()

      // 取消请求（含用户主动停止）：只收尾，不提示
      if (presentChatError(error) === 'aborted') {
        view.followLatest()
        setTimeout(() => {
          void authStore.refreshBilling()
        }, 200)
        return
      }

      if (chatMessages.value[chatMessages.value.length - 1]?.role === 'assistant') {
        view.followLatest()
      }
    }

    /** 回执到了没有：发起失败时服务端先推 agent.error、再回失败回执，提示只由回执那边做一次 */
    let ackReceived = false
    let preAckError: Error | null = null
    let markPreAckErrorArrived = () => {}
    const preAckErrorArrived = new Promise<void>(resolve => {
      markPreAckErrorArrived = resolve
    })
    /** 先到的错误指向的消息：写入之后才失败（认领失败等），这一轮其实已经建好 */
    let preAckMessageId = ''
    let session: AgentStreamSession | null = null
    try {
      if (!submittedConversationGid) throw new Error(t('chat.createConversationFailed'))
      const submissionId = createSubmissionId()
      const requestData = {
        modelId: turnModel.modelId,
        model: turnModel.model,
        modelName: turnModel.modelName,
        reasoningEffort: turnModel.reasoningEffort,
        prompt: submittedPromptText || ' ',
        message: userMessageRounds,
        gid: submittedConversationGid,
        submissionId,
        // 原来的回合由服务端在接受这一轮时一并删除：没被接受（余额、审核、网络）时原来的问答保留
        ...(replace ? { replaceFromCid: replace.cid, replaceLaterTurns: replace.laterTurns } : {}),
        ...(finalUrlItems.length > 0
          ? {
              files: JSON.stringify(finalUrlItems),
              attachments: JSON.stringify(finalUrlItems),
            }
          : {}),
      }

      session = openForegroundSession({
        modelName: turnModel.modelName,
        workspaceId,
        submissionId,
        onAgentStart: async event => {
          useStatus = ChatLogStatus.GENERATING
          await insertInitialMessages(event.data.initialMessages)
        },
        onHandoff: () => {
          initialMessagesInserted = false
          awaitingContinuation = true
        },
        onDone: finished => {
          const doneCid = currentStreamCid.value || finished.cid
          cleanupSubscription()
          resetWatchdog()
          markStarted()
          void finishStreaming(doneCid)
        },
        onError: ({ message: errMessage, event, pendingQueueIntentExpectation: expectation }) => {
          // 透传 agent.error 的结构化错误码，否则错误分流只能靠文案猜类型
          const streamError = streamErrorOf(errMessage, event)
          // 回执前、这次发出的那一轮还没开始时推来的错误是发起失败的原因：等失败回执一起提示（只提示一次）；
          // 服务端接受了的话它与这次发送无关。那一轮开始过（含已接续到下一轮）就是回复出错，照常处理
          if (!ackReceived && !firstTurnInserted) {
            preAckError = streamError
            const messageId = String(event?.messageId || '').trim()
            preAckMessageId = isPlaceholderMessageId(messageId) ? '' : messageId
            markPreAckErrorArrived()
            return
          }
          markStarted()
          handleStreamError(streamError, expectation)
          cleanupSubscription()
          resetWatchdog()
          // 接续的下一轮没能开始（排队的补充要求被拒、没能启动）：按服务端刷新，看到它落成了什么
          if (awaitingContinuation) refreshAfterContinuationFailure(workspaceId)
        },
      })

      let ack: Awaited<ReturnType<typeof startChat>>
      try {
        try {
          ack = await startChat(requestData)
        } catch (error: any) {
          if (error?.code !== 'TIMEOUT' || preAckError || !stillOwned()) throw error
          // 回执超时：服务端可能处理得慢，也可能没收到。用同一提交号、同一载荷再发一次：
          // 已经接受的回「重复提交」和这一轮的 cid，没收到的照常处理
          ack = await startChat(requestData)
        }
      } catch (error: any) {
        // 身份已变：按取消结束（不提示、不标失败、不重发）
        if (isIdentityChanged(error)) throw new SubmissionCancelledError()
        throw error
      }
      ackReceived = true
      // 回执到的时候这次提交已被作废（停止、换身份）：这一轮由流事件与服务端状态收口，这里不再动订阅与看门狗；
      // 对调用方是「已取消」（不清草稿、不关编辑框），不是发送成功
      if (!stillOwned()) throw new SubmissionCancelledError()
      // 服务端接受了：回执前收到的、不指向这一轮的错误与这次发送无关
      const duplicateCid = ack.data?.accepted === false ? ack.data.cid : undefined
      const alreadyStreaming =
        Boolean(duplicateCid) && initialMessagesInserted && duplicateCid === currentStreamCid.value
      if (ack.data?.accepted === false && !alreadyStreaming) {
        // 重复提交（同一提交号已经被接受过，超时重发时最常见）：替换已经生效；
        // 刷新列表，接上正在运行的那一轮
        removeReplacedTurn()
        cleanupSubscription()
        resetWatchdog()
        await chatStore.queryActiveChatLogList(activeWorkspaceId.value, {
          force: true,
          silent: true,
          silentError: true,
        })
        if (!stillOwned()) throw new SubmissionCancelledError()
        const duplicateMessage = duplicateCid
          ? chatMessages.value.find(item => item.cid === duplicateCid)
          : undefined
        if (duplicateCid && isAssistantRunning(duplicateMessage)) {
          void reconnectToWorkflow(duplicateCid, activeWorkspaceId.value || undefined, {
            duringSubmit: true,
          })
        }
        return undefined
      }
      // 替换被接受：服务端已删掉原来的回合。agent.start 还没到、或这一页收不到了（已切走），本地也先去掉
      removeReplacedTurn()
      startWatchdog()
    } catch (error: any) {
      // 已被作废（停止、换身份、回执说身份已变）：不再处理——不动当前的订阅与看门狗（可能已是新提交的），
      // 不提示、不重同步
      if (!stillOwned() || error instanceof SubmissionCancelledError) throw error
      // 两次回执都超时：服务端可能只是慢。这一轮的 agent.start 已经到了、或再等一会儿到了，就是接受了
      // （它可能已经结束或出错、订阅已经清掉，照样算接受）；等的时候先到了发起失败的原因就不再等
      if (error?.code === 'TIMEOUT' && session) {
        if (!firstTurnInserted && !preAckError) {
          await Promise.race([
            started,
            preAckErrorArrived,
            waitForMilliseconds(AGENT_START_WAIT_MS),
          ])
        }
        if (!stillOwned()) throw error
        if (firstTurnInserted) {
          ackReceived = true
          removeReplacedTurn()
          if (getActiveStreamSession() === session) startWatchdog()
          view.followLatest()
          return undefined
        }
      }
      ackReceived = true
      if (session && getActiveStreamSession() === session) {
        cleanupSubscription()
        resetWatchdog()
      }
      const code = error?.code
      // 替换被拒（回执没到时看先到的错误）由重新发送的入口处理
      const conflictError = turnReplaceConflictOf(error)
        ? error
        : turnReplaceConflictOf(preAckError)
          ? preAckError
          : null
      const conflict = conflictError ? turnReplaceConflictOf(conflictError) : null
      // 服务端先推 agent.error 说明具体原因（限流、访客额度、模型不可用），再回一个笼统的失败回执：
      // 提示用先到的那条
      if (!conflict) handleStreamError(preAckError ?? error, pendingQueueIntentExpectation)
      // 结果不确定（回执没送到、写入后才失败）：这一轮可能已经建好（重新生成时原来的回合可能已经删掉），
      // 按服务端对一遍。先到的是预检拒绝（限流、违规、额度、未登录……）才确定没被接受；
      // 先到的错误指向一条真实的消息（写入后认领失败），这一轮已经建好了
      const preAckCode = String((preAckError as { code?: unknown } | null)?.code || '')
      const certainlyRejected =
        Boolean(preAckCode) && !UNCERTAIN_START_CODES.has(preAckCode) && !preAckMessageId
      if (preAckMessageId || (UNCERTAIN_START_CODES.has(code) && !certainlyRejected)) {
        resyncConversation(workspaceId)
      } else if (!conflict) {
        resumeAfterFailedSubmit(workspaceId)
      }
      throw conflictError ?? error
    }

    // 提交锁由调用方在本函数返回后释放：等这一轮开始（或结束 / 出错），最多等 AGENT_START_WAIT_MS
    await Promise.race([started, waitForMilliseconds(AGENT_START_WAIT_MS)])
    // 等待期间被作废：不滚动（可能已是别的会话或新的提交），按已取消交给调用方
    if (!stillOwned()) throw new SubmissionCancelledError()
    view.followLatest()
    return undefined
  }

  /**
   * 页面初次加载、切回会话时的兜底：最后一条回复还没结局（生成中或跟丢了）就接上；
   * 服务端明确拒绝过恢复的等用户手动重连
   */
  async function checkAndReconnect() {
    const lastMessage = chatMessages.value[chatMessages.value.length - 1]
    if (
      lastMessage &&
      isAssistantUnsettled(lastMessage) &&
      !lastMessage.recoveryRejected &&
      lastMessage.cid
    ) {
      await reconnectToWorkflow(lastMessage.cid, activeWorkspaceId.value || undefined)
    }
  }

  /**
   * 重连到正在执行的工作流。
   *
   * 正在发出新一轮时不接：发送与重连共用一个前台订阅，后开的会把先开的清掉——续接顶掉发送，
   * 这一轮的 agent.start 就没人接了（发送失败后会补一次续接；发送里「重复提交」的分支要接上
   * 正在运行的那一轮，传 duringSubmit）。反过来，重连途中订阅被新发出的一轮接走时，
   * 返回后不再动订阅、看门狗与那一轮的消息，这条回复回到跟丢。
   */
  async function reconnectToWorkflow(
    cid: string,
    expectedWorkspaceId?: string,
    options: { duringSubmit?: boolean } = {}
  ) {
    if (isReconnecting.value) return
    if (expectedWorkspaceId && activeWorkspaceId.value !== expectedWorkspaceId) return

    // 同一消息已有活跃会话（socket 闪断 / watchdog 触发）：带 lastSeq 增量补发，复用现有投影，不重建订阅
    // （不换订阅，发送途中也可以做）
    const activeSession = getActiveStreamSession()
    if (currentStreamCid.value === cid && activeSession) {
      const ack = await resyncChat(cid, activeSession.lastSeq || undefined).catch(() => null)
      if (getActiveStreamSession() !== activeSession) {
        settleSupersededReconnect(cid, ack)
        return
      }
      if (ack?.ok) {
        // 服务端确认这条回复还在（或已补发结局）：算作有动静，看门狗重新计时（长时间不出声的工具不再被判跟丢）
        noteStreamActivity()
        clearStreamRecovery(cid)
        startWatchdog()
      } else if (!ack || isTransientRecoveryFailure(ack.code)) {
        // 连接还没恢复：看门狗与重连入口会再试
        settleReconnectAfterTransportFailure(cid)
      } else {
        markStreamRecoveryStalled(cid, ack.message, { rejected: true })
      }
      return
    }

    if (chatStore.isSubmitting && !options.duringSubmit) {
      // 让路给正在发出的一轮：提交锁释放后补一次（发送失败、确认框里取消、建会话失败都算）
      resumeDeferredBySubmit = true
      return
    }

    const token = ++reconnectToken
    isReconnecting.value = true
    let session: AgentStreamSession | null = null
    /** 恢复的握手（chat:resync）还没回执：服务端拒绝恢复时先推一条错误、再回失败回执 */
    let handshakePending = true
    let handshakeError: string | null = null
    let handshakeErrorCode = ''
    /** 接续下一轮之前（handoff 之后、新的 agent.start 之前） */
    let awaitingContinuation = false
    try {
      updateStreamMessage({ loading: true }, cid)
      const reconnectingMessage = chatMessages.value.find(item => item.cid === cid)
      session = openForegroundSession({
        cid,
        turnId: String(
          reconnectingMessage?.turnId || parseStoredTurnId(reconnectingMessage?.message) || ''
        ),
        workspaceId: expectedWorkspaceId,
        // handoff 接续新一轮时服务端会重新下发 agent.start：恢复会话同样要插入新一轮的消息，
        // 否则接续回复无处渲染
        onAgentStart: async event => {
          awaitingContinuation = false
          const initialMessages = event.data.initialMessages
          if (initialMessages?.user && !hasMessageCid(initialMessages.user.cid)) {
            chatStore.addGroupChat(initialMessages.user as Chat.Chat)
          }
          if (initialMessages?.assistant && !hasMessageCid(initialMessages.assistant.cid)) {
            chatStore.addGroupChat({
              ...(initialMessages.assistant as Chat.Chat),
              loading: true,
              error: false,
              status: initialMessages.assistant.status ?? ChatLogStatus.GENERATING,
            })
          }
          await nextTick()
          view.followLatest()
        },
        onDone: finished => {
          // handoff 接续后终态消息可能已不是最初重连的那条，按当前活跃 cid 收口
          const doneCid = currentStreamCid.value || finished.cid || cid
          cleanupSubscription()
          resetWatchdog()
          void chatStore.refreshAfterTurn(activeWorkspaceId.value, { resumed: true })
          void chatStore.queryActiveChatLogList(undefined, { force: true })
          setTimeout(() => {
            const targetIndex = findMessageIndexByCid(doneCid)
            if (targetIndex >= 0) {
              chatStore.updateGroupChatSome(targetIndex, {
                loading: false,
                message: chatMessages.value[targetIndex]?.message || '',
                liveToolCalls: [],
              })
            }
          }, 300)
        },
        onHandoff: () => {
          awaitingContinuation = true
        },
        onError: ({ message: errMessage, event }) => {
          const streamError = streamErrorOf(errMessage, event)
          // 握手期间的错误等回执：被拒就按跟丢显示（不当成回复出错），回执成功再照常提示
          if (handshakePending) {
            handshakeError = streamError.message
            handshakeErrorCode = String(streamError.code || '')
            return
          }
          presentChatError(streamError)
          cleanupSubscription()
          resetWatchdog()
          if (awaitingContinuation && expectedWorkspaceId) {
            refreshAfterContinuationFailure(expectedWorkspaceId)
          }
        },
      })

      const ack = await resyncChat(cid).catch(() => null)
      handshakePending = false
      // 握手期间推来的错误把这条回复落成了失败（权威的失败事件）：那是回复本身失败了，照常显示与提示
      const failedDuringHandshake =
        Boolean(handshakeError) &&
        Number(chatMessages.value.find(item => item.cid === cid)?.status) === ChatLogStatus.FAILED
      // 否则握手期间推来错误、回执又不是成功：那是恢复没成功的原因（服务端拒绝时先推错误、再回失败回执），
      // 不是回复本身出错。回执没送到（超时、连接失败）时按推来的错误码判断是不是拒绝；
      // 一时的失败（连接、鉴权还没完成）不算拒绝
      const ackDelivered = Boolean(ack) && !isTransportFailure(ack?.code)
      const handshakeFailure =
        handshakeError && !failedDuringHandshake && !ack?.ok
          ? {
              reason: (ackDelivered && ack?.message) || handshakeError,
              rejected: !isTransientRecoveryFailure(ackDelivered ? ack?.code : handshakeErrorCode),
            }
          : null
      if (getActiveStreamSession() !== session) {
        settleSupersededReconnect(cid, ack, handshakeFailure)
        return
      }
      if (failedDuringHandshake) {
        presentChatError(
          Object.assign(new Error(handshakeError || ''), { code: handshakeErrorCode })
        )
        cleanupSubscription()
        resetWatchdog()
        return
      }
      if (!ack || isTransientRecoveryFailure(ack.code)) {
        if (handshakeFailure?.rejected) {
          // 回执没送到，但服务端已经推来了拒绝恢复的错误：不再自动重试，按跟丢显示
          cleanupSubscription()
          resetWatchdog()
          markStreamRecoveryStalled(cid, handshakeFailure.reason, {
            rejected: true,
            clearError: true,
          })
          return
        }
        if (handshakeFailure) {
          // 一时的失败推来的错误不算回复出错：回到恢复中，等看门狗与重连入口再试
          updateGroupChatByCid(cid, {
            error: false,
            errorMessage: undefined,
            errorRetryable: undefined,
            loading: true,
          })
        }
        // 连接还没恢复（或连接刚建好、鉴权还没完成）：留着订阅，看门狗与重连入口会再试
        settleReconnectAfterTransportFailure(cid)
        startWatchdog()
        return
      }
      if (!ack.ok) {
        // 服务端明确拒绝：不再自动重试，留给用户手动重连或停止
        cleanupSubscription()
        resetWatchdog()
        markStreamRecoveryStalled(
          cid,
          ack.message || handshakeError || t('chat.streamRecoveryRejected'),
          { rejected: true, clearError: true }
        )
        return
      }
      if (handshakeError) {
        // 接上了，但这条回复在握手期间出错了：照常提示并收尾
        presentChatError(Object.assign(new Error(handshakeError), { code: handshakeErrorCode }))
        cleanupSubscription()
        resetWatchdog()
        return
      }
      clearStreamRecovery(cid)
      startWatchdog()
    } catch (error: any) {
      if (session && getActiveStreamSession() !== session) {
        settleSupersededReconnect(cid)
        return
      }
      cleanupSubscription()
      resetWatchdog()
      markStreamRecoveryStalled(cid, error?.message)
    } finally {
      if (token === reconnectToken) isReconnecting.value = false
    }
  }

  /** 输入框停止按钮的目标：当前这一轮，没有时是最后一条 */
  function defaultStopTarget() {
    return currentStreamCid.value || chatMessages.value[chatMessages.value.length - 1]?.cid || ''
  }

  /** 这条回复的停止请求还没有结果；不传 cid 查输入框的停止目标 */
  function isStopping(cid?: string) {
    const target = cid || defaultStopTarget()
    return Boolean(target) && stoppingCids.has(target)
  }

  interface StopOperation {
    cid: string
    workspaceId: string
    session: AgentStreamSession | null
    isCurrent: () => boolean
  }

  /** 目标仍占着前台订阅：发起停止时的流会话还在，当前流 cid 仍是它（handoff 换了 cid 就不是） */
  function ownsForeground(op: StopOperation) {
    return (
      Boolean(op.session) &&
      getActiveStreamSession() === op.session &&
      currentStreamCid.value === op.cid
    )
  }

  /**
   * 落定之前的共同核对：操作仍有效；会话已切走时丢掉那个会话的缓存（下次打开按服务端重新加载）。
   * 目标占着前台时先清订阅再落地：dispose 会冲刷积压的正文、执行待完成的终态（可能触发 onDone），
   * 清完再核对一次，不让它盖掉落定的结果
   */
  function prepareStopSettle(op: StopOperation) {
    const stillHere = () => {
      if (!op.isCurrent()) return false
      if (activeWorkspaceId.value === op.workspaceId) return true
      chatStore.dropMessageCache(op.workspaceId)
      return false
    }
    if (!stillHere()) return false
    if (ownsForeground(op)) {
      cleanupSubscription()
      resetWatchdog()
      return stillHere()
    }
    return true
  }

  /**
   * 本地这条已有结局：只看状态（完成、失败、停止）。流的终态归约写入结局时仍带着 loading，
   * 收尾要等 onDone；error 标记也不算（它不代表服务端的结局）
   */
  function hasTerminalStatus(message: Chat.Chat | undefined) {
    return TERMINAL_CHAT_LOG_STATUSES.has(Number(message?.status))
  }

  /** 服务端已受理取消：这条回复按已停止落定；流自己先给出了结局（完成、失败）就保留它，只收起加载 */
  function settleStopAccepted(op: StopOperation) {
    if (!prepareStopSettle(op)) return
    const local = chatMessages.value.find(item => item.cid === op.cid)
    if (!local) return
    lastStop = { cid: op.cid, at: Date.now() }
    if (hasTerminalStatus(local)) {
      updateGroupChatByCid(op.cid, { loading: false, liveToolCalls: [] })
      markReplySettled(op.cid, Number(local.status))
      return
    }
    // 本地落终态，与服务端随后持久化的状态一致；否则消息只是停下来，用户与刷新后都看不出这条是被停止的。
    // 之前流里来过的错误标记（不是权威的失败）一并清掉，否则卡片仍按出错显示
    updateGroupChatByCid(op.cid, {
      loading: false,
      status: ChatLogStatus.STOPPED,
      error: false,
      errorMessage: undefined,
      errorRetryable: undefined,
      recovery: undefined,
      recoveryMessage: undefined,
      recoveryRejected: undefined,
      liveToolCalls: [],
    })
    markReplySettled(op.cid, ChatLogStatus.STOPPED)
  }

  /**
   * 回复其实已经结束、或服务端没有它的运行记录：按 cid 取这一条核对（不建订阅、不动别的回合），
   * 服务端已是终态才落定；还在生成或没取到就不改，交给现有恢复（前台看门狗、跟丢卡片上的重连与停止）
   */
  async function verifyStoppedReply(op: StopOperation) {
    if (!op.isCurrent()) return
    if (activeWorkspaceId.value !== op.workspaceId) {
      chatStore.dropMessageCache(op.workspaceId)
      return
    }
    const local = chatMessages.value.find(item => item.cid === op.cid)
    if (!local || hasTerminalStatus(local)) return
    const gid = chatStore.activeConversationGid(op.workspaceId)
    if (!gid) return
    let row: Chat.Chat | undefined
    try {
      const res: any = await fetchQueryChatLogAroundAPI(
        { gid, targetCid: op.cid, limit: 3 },
        { silentError: true }
      )
      const rows: Chat.Chat[] = Array.isArray(res?.data?.rows) ? res.data.rows : []
      row = rows.find(item => item?.cid === op.cid)
    } catch {
      row = undefined
    }
    // 回来先核对操作与会话（切走了就丢掉原会话的缓存），再看核对结果
    if (!op.isCurrent()) return
    if (activeWorkspaceId.value !== op.workspaceId) {
      chatStore.dropMessageCache(op.workspaceId)
      return
    }
    if (!row || !hasTerminalStatus(row)) return
    if (!prepareStopSettle(op)) return
    chatStore.applySettledReplyRow(op.workspaceId, row)
  }

  /**
   * 停止回复：不传 cid 是输入框的停止（当前这一轮）；传 cid 是跟丢的回复上的「停止」。
   * 发出后等服务端的结果再落地：结果回来之前订阅、看门狗与加载态都不动（停止可能被拒、可能没送到，
   * 回复也可能其实已经结束）。结果按发起时的身份、会话数据与会话核对，页面卸载、换了身份就不处理
   */
  async function stopReply(cid?: string) {
    const targetCid = cid || defaultStopTarget()
    if (!targetCid || stoppingCids.has(targetCid)) return
    const identity = identityEpoch()
    const chat = chatDataEpoch()
    const op: StopOperation = {
      cid: targetCid,
      workspaceId: activeWorkspaceId.value,
      session: getActiveStreamSession(),
      isCurrent: () => !disposed && identityEpoch() === identity && chatDataEpoch() === chat,
    }
    stoppingCids.add(targetCid)
    let outcome: StopChatOutcome = { kind: 'cancelled' }
    try {
      outcome = await stopChat(targetCid, op.isCurrent)
      if (outcome.kind === 'rejected' && !outcome.notified) ms.error(outcome.message)
      if (outcome.kind === 'unknown') ms.warning(t('chat.stopResultUnknown'))
      if (outcome.kind === 'accepted') settleStopAccepted(op)
      if (outcome.kind === 'ended' || outcome.kind === 'verify') await verifyStoppedReply(op)
    } finally {
      stoppingCids.delete(targetCid)
    }
    if (outcome.kind === 'accepted' || outcome.kind === 'ended' || outcome.kind === 'verify') {
      setTimeout(() => {
        if (op.isCurrent() && activeWorkspaceId.value === op.workspaceId) view.followLatest()
      }, 1000)
    }
  }

  /** 重新生成第 index 条回复：用它前面那条提问的统一消息结构（保留媒体）重发 */
  async function requestRegenerate(index: number) {
    if (chatStore.groupList.length === 0 || !index) return
    const prevMessage = chatMessages.value[index - 1]
    if (!prevMessage || prevMessage.role === 'assistant') return

    // 失败原因已由 onConversation 提示，这里不再向上抛
    void onConversation({
      msg: prevMessage.content || '',
      cid: prevMessage.cid,
      message: prevMessage.message,
    }).catch(() => {})
    view.followLatest()
  }

  /** 删除一条消息：确认框里点「删除」后按 cid 删除，确认框等删除完成再关闭 */
  function confirmDeleteMessage(target: Chat.Chat) {
    void confirmDialog({
      title: t('chat.deleteMessage'),
      content: t('chat.deleteMessageConfirm'),
      positiveText: t('chat.delete'),
      negativeText: t('common.cancel'),
      tone: 'danger',
      onPositiveClick: async () => {
        await chatStore.deleteChatByCid(target.cid)
        ms.success(t('chat.deleteSuccess'))
      },
    })
  }

  // ====== 别处（其它标签页、渠道）同步来的会话变化 ======
  let chatSyncRefreshTimer: number | null = null

  function scheduleChatSyncRefresh(
    shouldFollowBottom: boolean,
    pendingQueueIntentExpectation: Chat.PendingQueueIntentIdentity | null
  ) {
    if (chatSyncRefreshTimer) window.clearTimeout(chatSyncRefreshTimer)
    chatSyncRefreshTimer = window.setTimeout(async () => {
      chatSyncRefreshTimer = null
      await chatStore.queryActiveChatLogList(activeWorkspaceId.value, {
        force: true,
        silent: true,
        silentError: true,
        pendingQueueIntentExpectation,
      })
      if (shouldFollowBottom) {
        view.followLatest()
        view.settleLayout()
      }
    }, 120)
  }

  // 决策在 planChatSync（纯函数，有单测）里；这里只执行副作用：store、路由、滚动与延迟刷新
  async function handleChatSync(event: ChatSyncEvent) {
    const plan = planChatSync(event, {
      activeConversationGid: chatStore.activeConversationGid(activeWorkspaceId.value),
      isAtBottom: view.isAtBottom(),
      currentStreamCid: currentStreamCid.value,
      hasMessage: hasMessageCid,
    })
    if (plan.kind === 'ignore') return

    if (plan.kind === 'upsert_conversation') {
      chatStore.upsertConversationGroup(plan.conversation)
      return
    }

    if (plan.kind === 'remove_conversation') {
      const nextWorkspaceId = chatStore.removeConversationGroupFromSync(plan.conversationGid)
      if (!plan.wasActive) return
      cleanupSubscription()
      resetWatchdog()
      // 当前会话在别处被删除：不是用户发起的跳转（不受提交锁限制，不关设置、不收侧栏）
      if (nextWorkspaceId) {
        await navigation.openConversation(nextWorkspaceId, { passive: true })
      } else {
        await navigation.leaveConversation({ replace: true })
      }
      return
    }

    const pendingQueueIntentExpectation = chatStore.getPendingQueueIntentIdentity()
    if (plan.appendMessages.length > 0) {
      plan.appendMessages.forEach(item => chatStore.addGroupChat(item))
      if (plan.followBottom) void nextTick().then(() => view.followLatest())
    }

    if (plan.terminal) {
      const terminalMessage = chatMessages.value.find(item => item.cid === plan.terminal?.cid)
      if (terminalMessage) {
        chatStore.reconcilePendingQueueIntentFromChatLog(
          { ...terminalMessage, loading: false, status: plan.terminal.status },
          pendingQueueIntentExpectation
        )
      }
    }

    if (plan.refresh) scheduleChatSyncRefresh(plan.followBottom, pendingQueueIntentExpectation)
  }

  /**
   * 会话激活完成（消息已加载）：当前会话还没有活跃订阅时，按最后一条消息接上恢复入口——
   * 切走再切回时服务端工作流可能仍在跑，不接上消息会一直停在「生成中」。
   * 换会话时旧订阅已由下面的 activeWorkspaceId 监听清掉；同一会话再次激活（建会话后路由同步、重新登录）
   * 不清理正在进行的订阅，以免掐掉首条消息刚建立的订阅；订阅的消息不在当前会话里时才清掉重接。
   */
  function handleWorkspaceReady(payload?: { workspaceId?: string }) {
    // 迟到的、别的会话的激活不处理
    if (payload?.workspaceId && payload.workspaceId !== activeWorkspaceId.value) return
    if (currentStreamCid.value && getActiveStreamSession()) {
      // 正在跟着的这一轮就在当前会话里：保留订阅
      if (hasMessageCid(currentStreamCid.value)) return
      // 订阅挂在别的会话的消息上：清掉，按当前会话重新续接
      cleanupSubscription()
      resetWatchdog()
    }
    void checkAndReconnect()
  }

  watch(activeWorkspaceId, (next, previous) => {
    if (next === previous) return
    cleanupSubscription()
    resetWatchdog()
    // 旧会话的续接作废：它返回时不去清新续接的「重连中」
    reconnectToken += 1
    isReconnecting.value = false
  })

  // 续接给发送让过路：提交锁释放后补一次（发送成功时最后一条是新的一轮，不会再续接旧的）
  watch(
    () => chatStore.isSubmitting,
    submitting => {
      if (submitting || !resumeDeferredBySubmit) return
      resumeDeferredBySubmit = false
      setTimeout(() => {
        if (!disposed && !chatStore.isSubmitting) void checkAndReconnect()
      }, 0)
    }
  )

  let socketConnectedUnsubscribe: (() => void) | null = null
  let chatSyncUnsubscribe: (() => void) | null = null
  /** 挂载时已连上：之后的每次连上都是断线重连 */
  let hasConnectedBefore = false

  /**
   * 断线重连后：续接正在生成的回复；会话列表只靠在线时的 chat:sync 保持新鲜，这里补拉一次——
   * 离线期间当前会话在别处被删除时回到首页
   */
  async function refreshAfterReconnect() {
    tryResumeActiveTask()
    if (!hasConnectedBefore) {
      hasConnectedBefore = true
      return
    }
    // 重连后强制补拉列表（离线期间会话可能在别处被删）；要不要离开由路由状态按此刻的地址决定：
    // 列表没拉到不离开，查询期间用户已换到别的会话也不离开
    await chatStore.queryMyGroup()
    await options.recheckRoute?.()
  }

  onMounted(() => {
    hasConnectedBefore = socketService.connected
    eventBus.on('chat:workspaceChanged', handleWorkspaceReady)
    socketConnectedUnsubscribe = socketService.on('socket:connected', () => {
      void refreshAfterReconnect()
    })
    chatSyncUnsubscribe = socketService.on('chat:sync', (event: ChatSyncEvent) => {
      void handleChatSync(event)
    })
  })

  onBeforeUnmount(() => {
    disposed = true
    eventBus.off('chat:workspaceChanged', handleWorkspaceReady)
    socketConnectedUnsubscribe?.()
    chatSyncUnsubscribe?.()
    if (chatSyncRefreshTimer) window.clearTimeout(chatSyncRefreshTimer)
  })

  return {
    currentStreamCid,
    isStopping,
    onConversation,
    requestRegenerate,
    stopReply,
    reconnect,
    confirmDeleteMessage,
    checkAndReconnect,
  }
}
