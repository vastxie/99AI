import { ref } from 'vue'
import type { ResData } from '@/api/types'
import { fetchWeixinBotStatus } from './api/weixinBot'
import { onWeixinBotStatus, type WeixinBotStatusPayload } from './events'

export type { WeixinBotStatusPayload } from './events'

/** 微信 Bot 绑定状态：各入口各自查询，经 eventBus 'weixinBot:statusChanged' 保持同步 */
export function useWeixinBotBindStatus() {
  const bound = ref(false)
  const status = ref(0)

  function apply(payload: WeixinBotStatusPayload) {
    bound.value = payload.bound
    if (typeof payload.status === 'number') status.value = payload.status
  }

  async function query() {
    try {
      const res: ResData = await fetchWeixinBotStatus()
      if (res.success) apply({ bound: res.data.bound, status: res.data.status })
    } catch {
      // 状态查询失败保持原值
    }
  }

  let stop: (() => void) | null = null

  function subscribe() {
    stop?.()
    stop = onWeixinBotStatus(apply)
  }

  function unsubscribe() {
    stop?.()
    stop = null
  }

  return { bound, status, apply, query, subscribe, unsubscribe }
}
