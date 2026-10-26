import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { resyncChat } from '@/api'
import { useStreamLifecycle } from './useStreamLifecycle'

vi.mock('@/api', () => ({
  resyncChat: vi.fn(),
}))

function makeMessage(partial: Partial<Chat.Chat>): Chat.Chat {
  return {
    content: '',
    error: false,
    role: 'assistant',
    ...partial,
  } as Chat.Chat
}

function mountStreamLifecycle(
  messages: Chat.Chat[],
  isResumableMessage: (message: Chat.Chat | undefined) => boolean = message =>
    Boolean(message?.loading)
) {
  let exposed!: ReturnType<typeof useStreamLifecycle>
  const chatMessages = ref(messages)
  const resumeWorkflow = vi.fn()
  const onResyncRejected = vi.fn()
  const onWatchdogExhausted = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        const rows = computed(() => chatMessages.value)
        exposed = useStreamLifecycle({
          getLastMessage: () => rows.value[rows.value.length - 1],
          getMessageByCid: cid => rows.value.find(item => item.cid === cid),
          isResumableMessage,
          resumeWorkflow,
          onResyncRejected,
          onWatchdogExhausted,
        })
        return () => null
      },
    })
  )

  return { wrapper, exposed, chatMessages, resumeWorkflow, onResyncRejected, onWatchdogExhausted }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-22T00:00:00.000Z'))
  vi.mocked(resyncChat).mockReset()
  vi.mocked(resyncChat).mockResolvedValue({ ok: true, data: { accepted: true } } as any)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useStreamLifecycle recovery target', () => {
  it('uses currentStreamCid instead of the last message for watchdog resume and exhaustion', () => {
    const { wrapper, exposed, resumeWorkflow, onWatchdogExhausted } = mountStreamLifecycle([
      makeMessage({ cid: 'target', loading: true }),
      makeMessage({ cid: 'other', loading: false }),
    ])

    exposed.currentStreamCid.value = 'target'
    exposed.startWatchdog()

    vi.advanceTimersByTime(50_000)
    expect(resumeWorkflow).toHaveBeenLastCalledWith('target')

    vi.advanceTimersByTime(150_000)
    expect(resumeWorkflow).toHaveBeenCalledTimes(3)
    expect(onWatchdogExhausted).toHaveBeenCalledTimes(1)
    expect(onWatchdogExhausted).toHaveBeenCalledWith('target')

    expect(exposed.currentStreamCid.value).toBe('target')
    exposed.tryResumeActiveTask()
    expect(resumeWorkflow).toHaveBeenCalledTimes(4)
    expect(resumeWorkflow).toHaveBeenLastCalledWith('target')

    wrapper.unmount()
  })

  it('resumes by the page judgment when loading was dropped by a refresh merge', () => {
    // 刷新合并会用服务端行整体替换流式行，loading 丢失但 status 仍是「生成中」，
    // 此时恢复入口必须依然生效，否则消息会永久停在生成中。
    const { wrapper, exposed, resumeWorkflow } = mountStreamLifecycle(
      [makeMessage({ cid: 'target', loading: undefined, status: 2 })],
      message => Boolean(message?.loading) || message?.status === 2
    )

    exposed.tryResumeActiveTask()
    expect(resumeWorkflow).toHaveBeenCalledWith('target')

    wrapper.unmount()
  })

  it('stops the watchdog once the page reports the message is no longer generating', () => {
    const { wrapper, exposed, resumeWorkflow } = mountStreamLifecycle(
      [makeMessage({ cid: 'target', loading: false, status: 3 })],
      message => Boolean(message?.loading) || message?.status === 2
    )

    exposed.currentStreamCid.value = 'target'
    exposed.startWatchdog()
    vi.advanceTimersByTime(200_000)

    expect(resumeWorkflow).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('reports rejected resync ack to the page fallback handler', async () => {
    vi.mocked(resyncChat).mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: '无权访问此对话',
    } as any)
    const { wrapper, exposed, onResyncRejected } = mountStreamLifecycle([
      makeMessage({ cid: 'target', loading: true }),
    ])

    exposed.currentStreamCid.value = 'target'
    exposed.requestStreamResync(4)

    await vi.advanceTimersByTimeAsync(200)

    expect(resyncChat).toHaveBeenCalledWith('target', 4)
    expect(onResyncRejected).toHaveBeenCalledWith('target', '无权访问此对话', 'FORBIDDEN')

    wrapper.unmount()
  })

  it('补发请求没送到时带上连接失败的错误码，由页面区分网络问题与服务端拒绝', async () => {
    vi.mocked(resyncChat).mockRejectedValueOnce(new Error('offline'))
    const { wrapper, exposed, onResyncRejected } = mountStreamLifecycle([
      makeMessage({ cid: 'target', loading: true }),
    ])

    exposed.currentStreamCid.value = 'target'
    exposed.requestStreamResync(4)
    await vi.advanceTimersByTimeAsync(200)

    expect(onResyncRejected).toHaveBeenCalledWith('target', 'offline', 'CONNECTION_FAILED')
    wrapper.unmount()
  })

  describe('补发绑定发起时的流会话与 cid（R42）', () => {
    const fakeSession = () => ({ dispose: vi.fn() }) as any

    it('去抖期间清掉订阅：计时一并清掉，到点不按旧序号补发', async () => {
      const { wrapper, exposed } = mountStreamLifecycle([makeMessage({ cid: 'a', loading: true })])
      exposed.registerStreamSession(vi.fn(), fakeSession())
      exposed.currentStreamCid.value = 'a'
      const timersBefore = vi.getTimerCount()
      exposed.requestStreamResync(7)
      expect(vi.getTimerCount()).toBe(timersBefore + 1)
      exposed.cleanupSubscription()
      expect(vi.getTimerCount()).toBe(timersBefore)
      await vi.advanceTimersByTimeAsync(200)
      expect(resyncChat).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('去抖期间换了会话：旧目标不补发，新目标可以重新计时', async () => {
      const { wrapper, exposed } = mountStreamLifecycle([makeMessage({ cid: 'b', loading: true })])
      exposed.registerStreamSession(vi.fn(), fakeSession())
      exposed.currentStreamCid.value = 'a'
      exposed.requestStreamResync(7)
      exposed.registerStreamSession(vi.fn(), fakeSession())
      exposed.currentStreamCid.value = 'b'
      exposed.requestStreamResync(2)
      await vi.advanceTimersByTimeAsync(200)
      expect(resyncChat).toHaveBeenCalledTimes(1)
      expect(resyncChat).toHaveBeenCalledWith('b', 2)
      wrapper.unmount()
    })

    it('同一会话 handoff 换了 cid：旧计时作废，不挡住新 cid 的首次补发', async () => {
      const { wrapper, exposed } = mountStreamLifecycle([
        makeMessage({ cid: 'next', loading: true }),
      ])
      exposed.registerStreamSession(vi.fn(), fakeSession())
      exposed.currentStreamCid.value = 'parent'
      exposed.requestStreamResync(9)
      exposed.currentStreamCid.value = 'next'
      await vi.advanceTimersByTimeAsync(200)
      expect(resyncChat).not.toHaveBeenCalled()

      exposed.requestStreamResync(1)
      await vi.advanceTimersByTimeAsync(200)
      expect(resyncChat).toHaveBeenCalledTimes(1)
      expect(resyncChat).toHaveBeenCalledWith('next', 1)
      wrapper.unmount()
    })

    it('同一目标在去抖期内只补发一次', async () => {
      const { wrapper, exposed } = mountStreamLifecycle([makeMessage({ cid: 'a', loading: true })])
      exposed.registerStreamSession(vi.fn(), fakeSession())
      exposed.currentStreamCid.value = 'a'
      exposed.requestStreamResync(3)
      exposed.requestStreamResync(5)
      await vi.advanceTimersByTimeAsync(200)
      expect(resyncChat).toHaveBeenCalledTimes(1)
      expect(resyncChat).toHaveBeenCalledWith('a', 3)
      wrapper.unmount()
    })

    it('回执晚于换目标：拒绝与失败都不再回调页面', async () => {
      let rejectAck!: (value: any) => void
      let failAck!: (error: Error) => void
      vi.mocked(resyncChat)
        .mockImplementationOnce(() => new Promise(resolve => (rejectAck = resolve)))
        .mockImplementationOnce(() => new Promise((_, reject) => (failAck = reject)))
      const { wrapper, exposed, onResyncRejected } = mountStreamLifecycle([
        makeMessage({ cid: 'a', loading: true }),
      ])
      exposed.registerStreamSession(vi.fn(), fakeSession())
      exposed.currentStreamCid.value = 'a'
      exposed.requestStreamResync(3)
      await vi.advanceTimersByTimeAsync(200)
      exposed.currentStreamCid.value = 'b'
      exposed.requestStreamResync(4)
      await vi.advanceTimersByTimeAsync(200)
      exposed.cleanupSubscription()
      rejectAck({ ok: false, code: 'FORBIDDEN', message: '无权访问此对话' })
      failAck(new Error('offline'))
      await vi.advanceTimersByTimeAsync(0)
      expect(onResyncRejected).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })
})
