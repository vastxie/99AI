import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useSocketStatus } from './useSocketStatus'

const socket = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>()
  return {
    connected: true,
    started: true,
    listeners,
    on(event: string, handler: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
      return () => listeners.get(event)?.delete(handler)
    },
    push(event: string) {
      listeners.get(event)?.forEach(handler => handler())
    },
  }
})
vi.mock('@/services/socket-io', () => ({ socketService: socket }))

function mountStatus() {
  let status!: ReturnType<typeof useSocketStatus>
  const wrapper = mount(
    defineComponent({
      setup() {
        status = useSocketStatus()
        return () => null
      },
    })
  )
  return { status, wrapper }
}

beforeEach(() => {
  vi.useFakeTimers()
  socket.connected = true
  socket.started = true
  socket.listeners.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('实时连接状态', () => {
  it('断开超过 2 秒才提示；重新连上立即恢复', () => {
    const { status } = mountStatus()
    socket.connected = false
    socket.push('socket:disconnected')
    vi.advanceTimersByTime(1500)
    expect(status.isDisconnected.value).toBe(false)
    vi.advanceTimersByTime(600)
    expect(status.isDisconnected.value).toBe(true)

    socket.connected = true
    socket.push('socket:connected')
    expect(status.isDisconnected.value).toBe(false)
  })

  it('短暂抖动（2 秒内重新连上）不提示', () => {
    const { status } = mountStatus()
    socket.connected = false
    socket.push('socket:disconnected')
    vi.advanceTimersByTime(800)
    socket.connected = true
    socket.push('socket:connected')
    vi.advanceTimersByTime(3000)
    expect(status.isDisconnected.value).toBe(false)
  })

  it('页面刚打开、还没开始连接（先取凭证与模型列表）：不算断开', () => {
    socket.connected = false
    socket.started = false
    const { status } = mountStatus()
    vi.advanceTimersByTime(5000)
    expect(status.isDisconnected.value).toBe(false)
    // 开始连了却连不上：照常提示
    socket.started = true
    socket.push('socket:connect_error')
    vi.advanceTimersByTime(2100)
    expect(status.isDisconnected.value).toBe(true)
  })

  it('迟迟没开始连接（启动时取凭证一直不成功）：10 秒后照样提示', () => {
    socket.connected = false
    socket.started = false
    const { status } = mountStatus()
    vi.advanceTimersByTime(9900)
    expect(status.isDisconnected.value).toBe(false)
    vi.advanceTimersByTime(200)
    expect(status.isDisconnected.value).toBe(true)
  })

  it('退出登录断开后先换游客凭证、还没开始重连：不算断开；开始连了连不上照常提示', () => {
    const { status } = mountStatus()
    socket.connected = false
    socket.started = false
    socket.push('socket:disconnected')
    vi.advanceTimersByTime(2100)
    expect(status.isDisconnected.value).toBe(false)

    socket.started = true
    socket.push('socket:connect_error')
    vi.advanceTimersByTime(2100)
    expect(status.isDisconnected.value).toBe(true)
  })

  it('页面打开时还没连上：超过 2 秒仍没连上才提示；卸载后不再订阅', () => {
    socket.connected = false
    const { status, wrapper } = mountStatus()
    vi.advanceTimersByTime(2100)
    expect(status.isDisconnected.value).toBe(true)
    wrapper.unmount()
    expect([...socket.listeners.values()].every(set => set.size === 0)).toBe(true)
  })
})
