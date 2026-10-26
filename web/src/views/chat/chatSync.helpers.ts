import { resolveChatTerminalStatus } from './agent-stream/events'

/**
 * 服务端 chat:sync 事件：同一用户其它连接上的会话级同步。
 * 发起方 socket 的过滤由服务端 except(sourceSocketId) 完成，页面收到的都是需要处理的事件。
 */
export type ChatSyncEvent = {
  type?: 'turn_created' | 'turn_done' | 'turn_error' | 'conversation_updated'
  channel?: string
  conversationGid?: string
  sourceSocketId?: string
  cids?: {
    user?: string
    assistant?: string
  }
  initialMessages?: {
    user?: Chat.Chat
    assistant?: Chat.Chat
  }
  conversation?: Record<string, any>
  deleted?: boolean
  finishReason?: string
}

/** 决策所需的页面快照：只读，不含任何 store / DOM 句柄 */
export interface ChatSyncContext {
  /** 当前激活会话的 gid；没有激活会话时为空串 */
  activeConversationGid: string
  /** 消息列表是否停在底部（决定同步后是否跟随到底部） */
  isAtBottom: boolean
  /** 本页正在流式渲染的助手消息 cid */
  currentStreamCid: string | null
  /** 当前列表里是否已有该 cid 的消息 */
  hasMessage: (cid?: string | null) => boolean
}

export type ChatSyncPlan =
  /** 会话在别处被删除：本地移除，若正是当前会话则由调用方切换路由 */
  | { kind: 'remove_conversation'; conversationGid: string; wasActive: boolean }
  /** 会话标题 / 置顶 / 配置在别处更新 */
  | { kind: 'upsert_conversation'; conversation: Record<string, any> }
  /** 与当前会话无关，或事件不完整 */
  | { kind: 'ignore' }
  /** 当前会话的轮次事件 */
  | {
      kind: 'turn'
      /** turn_created 时本地还没有的占位消息（用户 / 助手），按顺序追加 */
      appendMessages: Chat.Chat[]
      /** 处理后是否跟随到底部 */
      followBottom: boolean
      /** turn_done / turn_error 推出的终态，用于对账排队意图；非终态事件为 null */
      terminal: { cid: string; status: number } | null
      /** 是否需要延迟静默刷新；本页自己正在流式的消息不刷，DB 行此刻缺 loading 且内容滞后 */
      refresh: boolean
    }

export function getChatSyncConversationGid(event: ChatSyncEvent): string {
  return String(event.conversationGid || '').trim()
}

/** 纯决策：根据事件与页面快照给出要做的事，副作用（store、路由、滚动、刷新）由调用方执行 */
export function planChatSync(event: ChatSyncEvent, context: ChatSyncContext): ChatSyncPlan {
  if (event.type === 'conversation_updated') {
    if (event.deleted && event.conversationGid) {
      return {
        kind: 'remove_conversation',
        conversationGid: event.conversationGid,
        wasActive: context.activeConversationGid === event.conversationGid,
      }
    }
    if (event.conversation) {
      return { kind: 'upsert_conversation', conversation: event.conversation }
    }
    return { kind: 'ignore' }
  }

  const conversationGid = getChatSyncConversationGid(event)
  const isActiveWorkspaceEvent = Boolean(
    conversationGid && conversationGid === context.activeConversationGid
  )
  if (!isActiveWorkspaceEvent) return { kind: 'ignore' }

  const appendMessages: Chat.Chat[] = []
  if (event.type === 'turn_created' && event.initialMessages) {
    const { user, assistant } = event.initialMessages
    if (user && !context.hasMessage(user.cid)) appendMessages.push(user)
    if (assistant && !context.hasMessage(assistant.cid)) {
      appendMessages.push({
        ...assistant,
        loading: assistant.loading ?? true,
        error: assistant.error ?? false,
      })
    }
  }

  const assistantCid = String(event.cids?.assistant || '')
  const terminalStatus =
    event.type === 'turn_error' || event.type === 'turn_done'
      ? resolveChatTerminalStatus({ eventType: event.type, finishReason: event.finishReason })
      : null
  const terminal =
    assistantCid && terminalStatus !== null ? { cid: assistantCid, status: terminalStatus } : null

  const isOwnActiveStreamEvent = Boolean(
    assistantCid && context.currentStreamCid && assistantCid === context.currentStreamCid
  )

  return {
    kind: 'turn',
    appendMessages,
    followBottom: context.isAtBottom,
    terminal,
    refresh: !isOwnActiveStreamEvent,
  }
}
