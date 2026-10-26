import { ref } from 'vue'

export interface UseMessageEntranceOptions {
  /** 列表里是否已有该 cid：历史分页、重连恢复带回来的消息不重放发送动效 */
  hasMessage: (cid: string) => boolean
}

/**
 * 用户消息入场标记（只做呈现）。
 *
 * 只有本轮新发送确认、且列表里此前不存在的用户 cid 会被标记为「入场中」，模板据此挂
 * `chat-message-enter`；历史加载、重连恢复、工作区切换都不重放发送动效。
 * 动画在元素自身结束（animationend 且 target === currentTarget，子元素冒泡上来的不算）后移除标记，
 * 切换会话时由调用方 clear() 清空。
 */
export function useMessageEntrance(options: UseMessageEntranceOptions) {
  const enteringCids = ref(new Set<string>())

  /** 新发送确认（agent.start 带回 initialMessages）时、插入列表之前调用；cid 已在列表里则不标记 */
  const mark = (cid?: string | null) => {
    if (!cid || options.hasMessage(cid)) return false
    enteringCids.value.add(cid)
    return true
  }

  const isEntering = (cid?: string | null) => Boolean(cid && enteringCids.value.has(cid))

  /** 绑到消息外层的 @animationend：只认元素自身的动画结束，气泡内子元素冒泡上来的不移除 */
  const handleAnimationEnd = (event: Event, cid?: string | null) => {
    if (!cid || event.target !== event.currentTarget) return
    enteringCids.value.delete(cid)
  }

  const clear = () => {
    enteringCids.value.clear()
  }

  return { mark, isEntering, handleAnimationEnd, clear }
}
