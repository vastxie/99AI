import { onBeforeUnmount, onMounted, ref } from 'vue'
import { socketService } from '@/services/socket-io'

/** 断开超过这么久才提示：网络抖动、页面刚打开时的首次连接不打扰 */
const DISCONNECT_NOTICE_DELAY_MS = 2000
/** 页面打开后迟迟没开始连接（启动时取凭证、模型列表一直不成功）：过这么久照样提示 */
const STARTUP_NOTICE_DELAY_MS = 10000

/**
 * 实时连接状态：断开（含连不上）超过一小段时间后 isDisconnected 为真，重新连上立即恢复。
 * socket.io 会自动重连，这里只负责让用户知道「现在收不到回复」。
 * 页面刚打开时要先取到游客凭证、模型列表等才开始连接，退出登录后也要先换游客凭证再连：
 * 还没开始连的这段不算断开（迟迟不开始的除外）
 */
export function useSocketStatus() {
  const isDisconnected = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let startupTimer: ReturnType<typeof setTimeout> | null = null
  const unsubscribers: Array<() => void> = []

  const clearTimers = () => {
    if (timer) clearTimeout(timer)
    if (startupTimer) clearTimeout(startupTimer)
    timer = null
    startupTimer = null
  }

  const markConnected = () => {
    clearTimers()
    isDisconnected.value = false
  }

  const markDisconnected = () => {
    if (timer || isDisconnected.value) return
    timer = setTimeout(() => {
      timer = null
      // 还没重新开始连（退出登录后先换游客凭证）：不算断开；开始连了连不上会再触发这里
      isDisconnected.value = socketService.started && !socketService.connected
    }, DISCONNECT_NOTICE_DELAY_MS)
  }

  onMounted(() => {
    unsubscribers.push(
      socketService.on('socket:connected', markConnected),
      socketService.on('socket:disconnected', markDisconnected),
      socketService.on('socket:connect_error', markDisconnected)
    )
    if (socketService.started) {
      if (!socketService.connected) markDisconnected()
      return
    }
    startupTimer = setTimeout(() => {
      startupTimer = null
      if (!socketService.connected) isDisconnected.value = true
    }, STARTUP_NOTICE_DELAY_MS)
  })

  onBeforeUnmount(() => {
    clearTimers()
    unsubscribers.forEach(unsubscribe => unsubscribe())
  })

  return { isDisconnected }
}
