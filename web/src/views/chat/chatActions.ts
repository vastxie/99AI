import type { InjectionKey, Ref } from 'vue'

/** 会话页（chatBase）提供给输入框与消息组件的动作，只经这里的类型化注入键传递 */
export interface ChatActions {
  /** 发起一轮对话；带 cid 表示重新生成 / 编辑重发。用户在确认框里取消时返回 false */
  onConversation: (params: Chat.ConversationParams) => Promise<boolean | undefined>
  /** 重新生成第 index 条助手回复 */
  requestRegenerate: (index: number) => Promise<void>
  /** 重新连接本页跟丢的回复 */
  reconnect: (cid: string) => Promise<void>
  /** 停止一条回复（跟丢的回复上的「停止」：服务端可能仍在跑） */
  stop: (cid: string) => Promise<void>
  /** 这条回复的停止请求已发出、还没有结果；不传 cid 查输入框的停止目标（当前这一轮） */
  isStopping: (cid?: string) => boolean
  /** 有一轮正在发出或生成：重新生成、重试、编辑重发先停用（连点只会发一次，服务端也会拒绝） */
  isTurnBusy: Readonly<Ref<boolean>>
}

export const ChatActionsKey: InjectionKey<ChatActions> = Symbol('chatActions')

/** 当前会话是否只读（微信等非 web 渠道创建的会话在网页端只读） */
export const ChatReadonlyKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('chatReadonly')
