import { eventBus } from '@/core/events/eventBus'

/** 微信 Bot 绑定状态变化：各入口各自查询，经这条事件保持同步（包内私有事件，键名带包前缀） */
export const WEIXIN_BOT_STATUS_EVENT = 'weixinBot:statusChanged'

export interface WeixinBotStatusPayload {
  bound: boolean
  status?: number
}

export function emitWeixinBotStatus(payload: WeixinBotStatusPayload) {
  eventBus.emit(WEIXIN_BOT_STATUS_EVENT, payload)
}

/** 订阅；返回取消订阅函数 */
export function onWeixinBotStatus(handler: (payload: WeixinBotStatusPayload) => void) {
  const wrapped = (payload: unknown) => handler(payload as WeixinBotStatusPayload)
  eventBus.on(WEIXIN_BOT_STATUS_EVENT, wrapped)
  return () => eventBus.off(WEIXIN_BOT_STATUS_EVENT, wrapped)
}
