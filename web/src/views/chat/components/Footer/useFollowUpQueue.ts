import { computed, ref, watch } from 'vue'
import { t } from '@/locales'
import { chatDataEpoch, useChatStore } from '@/store/modules/chat'
import { isAssistantRunning, isAssistantUnsettled } from '@/store/modules/chat/messageState'
import { message } from '@/utils/message'
import { getMessageTurnId } from './footer.helpers'

/**
 * 生成中补充的要求：排进正在运行的这一轮，结束前可以撤回。
 * 排队的文字按会话保存（切走再切回还在），只在它排给的那一轮还没结局时显示；这一轮有了结局就清掉
 * （跟丢不算结局：服务端可能仍在跑，排队也还在）。回执回来前可能已经切走，按发起时的会话记。
 */
export function useFollowUpQueue(options: {
  model: () => { model: string; modelName: string; modelId?: number }
}) {
  const chatStore = useChatStore()
  const ms = message()
  const queueing = ref(false)
  const canceling = ref(false)
  const isRunning = computed(() => isAssistantRunning(chatStore.chatList.at(-1)))
  const isUnsettled = computed(() => isAssistantUnsettled(chatStore.chatList.at(-1)))

  function runningTarget() {
    const running = chatStore.chatList.findLast(item => isAssistantUnsettled(item) && item.cid)
    return running
      ? { cid: running.cid as string, turnId: getMessageTurnId(running) }
      : { cid: '', turnId: '' }
  }

  const queuedText = computed(() => {
    const queued = chatStore.activeQueuedFollowUp
    if (!queued || !isUnsettled.value) return ''
    const { turnId } = runningTarget()
    return !queued.turnId || !turnId || queued.turnId === turnId ? queued.text : ''
  })

  watch(isUnsettled, unsettled => {
    if (!unsettled) chatStore.setQueuedFollowUp(null)
  })

  // 运行中的那一轮换了（新一轮开始），之前没等到回执的排队请求作废
  watch(
    () => {
      const target = runningTarget()
      return target.cid ? `${target.cid}\u0000${target.turnId}` : ''
    },
    targetKey => {
      if (!targetKey) return
      const [cid, turnId] = targetKey.split('\u0000')
      chatStore.clearPendingQueueIntentIfTargetChanged(cid, turnId)
    },
    { immediate: true }
  )

  /**
   * 排进正在运行的这一轮；成功返回 true。展示的是服务端实际入队的文字（含引用前缀）；
   * draftText 是输入框里的原文，回执超时后按聊天记录对账时用它清草稿
   */
  async function queue(text: string, draftText = text, quoteId?: string) {
    const prompt = text.trim()
    if (!prompt || queueing.value) return false
    const target = runningTarget()
    if (!target.cid) {
      ms.warning(t('chat.followUpNoRunningTask'))
      return false
    }

    const workspaceId = chatStore.active
    const epoch = chatDataEpoch()
    queueing.value = true
    try {
      const { model, modelName, modelId } = options.model()
      const ack = await chatStore.submitQueueFollowUpIntent({
        targetCid: target.cid,
        parentTurnId: target.turnId,
        modelName,
        payload: { prompt, model: model || chatStore.activeModel || '', modelId: modelId || null },
        workspaceId,
        draftText,
        quoteId,
      })
      // 期间身份换了：排队状态属于旧身份，不写进新身份
      if (chatDataEpoch() !== epoch) return false
      if (!ack.ok) {
        ms.warning(ack.message || t('chat.followUpQueueFailed'))
        return false
      }
      chatStore.setQueuedFollowUp(
        {
          text: String(ack.data?.queuedPrompt || prompt),
          turnId: String(ack.data?.parentTurnId || target.turnId || ''),
        },
        workspaceId
      )
      return true
    } finally {
      queueing.value = false
    }
  }

  async function cancel() {
    if (!queuedText.value || canceling.value) return
    const workspaceId = chatStore.active
    const target = runningTarget()
    if (!target.cid) {
      chatStore.setQueuedFollowUp(null, workspaceId)
      chatStore.clearPendingQueueIntent()
      return
    }

    const epoch = chatDataEpoch()
    canceling.value = true
    try {
      const ack = await chatStore.cancelQueueFollowUpIntent(
        target.cid,
        chatStore.queuedFollowUps[workspaceId]?.turnId || target.turnId || undefined
      )
      if (chatDataEpoch() !== epoch) return
      if (!ack.ok) {
        ms.warning(ack.message || t('chat.followUpDeleteFailed'))
        return
      }
      chatStore.setQueuedFollowUp(null, workspaceId)
    } finally {
      canceling.value = false
    }
  }

  return { isRunning, queueing, canceling, queuedText, queue, cancel }
}
