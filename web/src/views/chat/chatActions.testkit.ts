import { vi } from 'vitest'
import { ref } from 'vue'
import { ChatActionsKey, type ChatActions } from './chatActions'

/** 测试里挂载输入框、消息组件时提供会话页动作：放进 global.provide */
export function chatActionsProvide(overrides: Partial<ChatActions> = {}) {
  const actions: ChatActions = {
    onConversation: vi.fn(async () => undefined),
    requestRegenerate: vi.fn(async () => undefined),
    reconnect: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    isStopping: () => false,
    isTurnBusy: ref(false),
    ...overrides,
  }
  return { [ChatActionsKey as symbol]: actions }
}
