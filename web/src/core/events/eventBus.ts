/**
 * 全局事件总线 - 解决 Store 之间的循环依赖
 * 使用事件驱动架构解耦各个模块
 */

import mitt from 'mitt'
import type { Emitter } from 'mitt'

/**
 * 内核事件类型定义；扩展包可以发布 / 订阅自己的事件（键名建议带包前缀），载荷类型由包自行收窄。
 */
export type KernelStoreEvents = {
  /** 按路由激活会话完成（消息已加载） */
  'chat:workspaceChanged': { workspaceId: string }

  // 登录状态变化：各 store 的收尾见 store/initStores.ts
  'auth:logout': void
  'auth:loginSuccess': { token: string }
  'auth:tokenExpired': void
  /** 未登录时本页用过的访客凭证被换成新的（服务端每次签发的访客都是新的 uid） */
  'auth:visitorChanged': void
  /** 自动更换访客凭证太频繁，暂停自动恢复（见 services/visitorSession.ts） */
  'auth:visitorRecoveryPaused': void
}

export type StoreEvents = KernelStoreEvents & Record<string, unknown>

// 创建类型安全的事件总线
export const eventBus: Emitter<StoreEvents> = mitt<StoreEvents>()

// 导出常用的事件方法
export const emit = eventBus.emit
export const on = eventBus.on
export const off = eventBus.off
