import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { clearUserToken, IdentityChangedError, setUserToken } from '@/services/identity'
import { qrPollFailureReason, useQrScanFlow, type QrScanStatus } from './useQrScanFlow'

let replies: Array<QrScanStatus | Error> = []

function setup(overrides: Partial<Parameters<typeof useQrScanFlow>[0]> = {}) {
  const active = ref(true)
  const onConfirmed = vi.fn()
  let flow!: ReturnType<typeof useQrScanFlow>
  let loads = 0
  const wrapper = mount(
    defineComponent({
      setup() {
        flow = useQrScanFlow({
          active: () => active.value,
          load: async () => {
            loads += 1
            return { id: `scene-${loads}`, qrUrl: `https://qr.example.com/${loads}.png` }
          },
          poll: vi.fn(async (): Promise<QrScanStatus> => {
            const next = replies.shift()
            if (next instanceof Error) throw next
            return next ?? { status: 'pending' }
          }),
          onConfirmed,
          intervalMs: 1000,
          maxSeconds: 10,
          ...overrides,
        })
        return () => null
      },
    })
  )
  return { wrapper, active, onConfirmed, flow: () => flow }
}

beforeEach(() => {
  vi.useFakeTimers()
  replies = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('扫码流程', () => {
  it('取码后等待扫码；扫了显示已扫码，确认后收尾并结束', async () => {
    const { flow, onConfirmed } = setup()
    await flushPromises()
    expect(flow().phase.value).toBe('waiting')
    expect(flow().qrUrl.value).toBe('https://qr.example.com/1.png')

    replies = [{ status: 'scanned' }, { status: 'confirmed', token: 't-1' }]
    await vi.advanceTimersByTimeAsync(1000)
    expect(flow().phase.value).toBe('scanned')
    await vi.advanceTimersByTimeAsync(1000)
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', token: 't-1' }),
      expect.objectContaining({ id: 'scene-1' })
    )
    expect(flow().phase.value).toBe('done')
  })

  it('上一次查询还没回来时这一拍跳过：慢网下查询不会越堆越多', async () => {
    let resolveSlow: (value: QrScanStatus) => void = () => undefined
    const poll = vi.fn(
      () =>
        new Promise<QrScanStatus>(resolve => {
          resolveSlow = resolve
        })
    )
    const { flow } = setup({ poll })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
    // 第一次查询一直没回来：后面几拍都跳过
    await vi.advanceTimersByTimeAsync(3000)
    expect(poll).toHaveBeenCalledTimes(1)

    resolveSlow({ status: 'scanned' })
    await flushPromises()
    expect(flow().phase.value).toBe('scanned')
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('超过有效期停下等刷新；刷新换一张新码', async () => {
    const { flow } = setup()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(11_000)
    expect(flow().phase.value).toBe('expired')
    await flow().refresh()
    expect(flow().phase.value).toBe('waiting')
    expect(flow().qrUrl.value).toBe('https://qr.example.com/2.png')
  })

  it('查询出错：网络抖动继续轮询，服务端明确拒绝停下并显示原因', async () => {
    const { flow } = setup({
      isTerminalError: error => ((error as Error).message === 'rejected' ? '会话已失效' : null),
    })
    await flushPromises()
    replies = [new Error('network'), new Error('rejected')]
    await vi.advanceTimersByTimeAsync(1000)
    expect(flow().phase.value).toBe('waiting')
    await vi.advanceTimersByTimeAsync(1000)
    expect(flow().phase.value).toBe('failed')
    expect(flow().message.value).toBe('会话已失效')
  })

  it('确认后的收尾失败（如确认绑定被拒）：停在失败并可刷新，不再卡在「正在绑定」', async () => {
    const { flow, onConfirmed } = setup()
    onConfirmed.mockRejectedValueOnce(new Error('绑定确认失败'))
    await flushPromises()
    replies = [{ status: 'confirmed' }]
    await vi.advanceTimersByTimeAsync(1000)
    expect(flow().phase.value).toBe('failed')
    expect(flow().message.value).toBe('绑定确认失败')
  })

  it('本地判定过期之后，迟到的「已扫码」不再把状态改回去（刷新键还在）', async () => {
    let resolveSlow: (value: QrScanStatus) => void = () => undefined
    const poll = vi.fn(
      () =>
        new Promise<QrScanStatus>(resolve => {
          resolveSlow = resolve
        })
    )
    const { flow } = setup({ poll, maxSeconds: 2 })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(flow().phase.value).toBe('expired')
    resolveSlow({ status: 'scanned' })
    await flushPromises()
    expect(flow().phase.value).toBe('expired')
  })

  it('确认只收尾一次：进入收尾之后迟到的「已确认」直接丢掉', async () => {
    const pending: Array<(value: QrScanStatus) => void> = []
    const poll = vi.fn(
      () =>
        new Promise<QrScanStatus>(resolve => {
          pending.push(resolve)
        })
    )
    let finishConfirm: () => void = () => undefined
    const { flow, onConfirmed } = setup({ poll })
    onConfirmed.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishConfirm = resolve
        })
    )
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    pending.shift()!({ status: 'confirmed' })
    await flushPromises()
    expect(flow().phase.value).toBe('confirming')
    // 收尾期间不再查询，也就不会再收到第二个「已确认」
    await vi.advanceTimersByTimeAsync(3000)
    expect(poll).toHaveBeenCalledTimes(1)
    finishConfirm()
    await flushPromises()
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(flow().phase.value).toBe('done')
  })

  it('刷新换码后，新码不等旧码还没回来的查询', async () => {
    const poll = vi.fn(
      (ticket: { id: string }) =>
        new Promise<QrScanStatus>(resolve => {
          if (ticket.id === 'scene-2') resolve({ status: 'scanned' })
        })
    )
    const { flow } = setup({ poll })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
    await flow().refresh()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(2)
    expect(flow().phase.value).toBe('scanned')
  })

  it('默认的失败判定：断网继续轮询，401 停下不再给原因，5xx 用通用文案，其它 4xx 用服务端原因', () => {
    const withStatus = (message: string, status: number) =>
      Object.assign(new Error(message), { status })
    expect(qrPollFailureReason(new Error('Network Error'), '没查到')).toBeNull()
    expect(qrPollFailureReason(new TypeError('Failed to fetch'), '没查到')).toBeNull()
    expect(qrPollFailureReason(undefined, '没查到')).toBeNull()
    expect(qrPollFailureReason({ status: 'error', message: 'x' }, '没查到')).toBeNull()
    expect(qrPollFailureReason(withStatus('请登录', 401), '没查到')).toBe('')
    expect(
      qrPollFailureReason(withStatus('Request failed with status code 502', 502), '没查到')
    ).toBe('没查到')
    expect(qrPollFailureReason(withStatus('二维码已失效', 400), '没查到')).toBe('二维码已失效')
    expect(qrPollFailureReason(withStatus('   ', 404), '没查到')).toBe('没查到')
  })

  it('没传判定时按默认判定：服务端拒绝（4xx）停下并显示原因', async () => {
    const { flow } = setup()
    await flushPromises()
    replies = [Object.assign(new Error('会话不存在'), { status: 404 })]
    await vi.advanceTimersByTimeAsync(1000)
    expect(flow().phase.value).toBe('failed')
    expect(flow().message.value).toBe('会话不存在')
  })

  it('面板收起就停下清空，不再轮询', async () => {
    const { flow, active } = setup()
    await flushPromises()
    active.value = false
    await flushPromises()
    expect(flow().phase.value).toBe('idle')
    expect(flow().qrUrl.value).toBe('')
  })

  describe('身份换了', () => {
    beforeEach(() => clearUserToken())

    it('两次轮询之间登录了别的账号：不再查旧码，作废并显示已过期，可刷新', async () => {
      const poll = vi.fn(async (): Promise<QrScanStatus> => ({ status: 'pending' }))
      const { flow } = setup({ poll })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1000)
      expect(poll).toHaveBeenCalledTimes(1)
      setUserToken('someone-else')
      await vi.advanceTimersByTimeAsync(3000)
      expect(poll).toHaveBeenCalledTimes(1)
      expect(flow().phase.value).toBe('expired')
      expect(flow().message.value).toBe('')
    })

    it('查询在途时身份换了：成功的结果也不再采用，按过期处理', async () => {
      let resolvePoll: (value: QrScanStatus) => void = () => undefined
      const poll = vi.fn(() => new Promise<QrScanStatus>(resolve => (resolvePoll = resolve)))
      const { flow, onConfirmed } = setup({ poll })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1000)
      setUserToken('someone-else')
      resolvePoll({ status: 'confirmed', token: 't-old' })
      await flushPromises()
      expect(onConfirmed).not.toHaveBeenCalled()
      expect(flow().phase.value).toBe('expired')
    })

    it('确认收尾时抛「身份已变化」：按过期处理，不进完成、不显示失败原因', async () => {
      const onConfirmed = vi.fn(async () => {
        throw new IdentityChangedError()
      })
      const { flow } = setup({ onConfirmed })
      await flushPromises()
      replies = [{ status: 'confirmed', token: 't-1' }]
      await vi.advanceTimersByTimeAsync(1000)
      expect(flow().phase.value).toBe('expired')
      expect(flow().message.value).toBe('')
    })

    it('取码期间身份换了：这张码不用，显示已过期', async () => {
      let resolveLoad: (value: { id: string; qrUrl: string }) => void = () => undefined
      const load = vi.fn(
        () => new Promise<{ id: string; qrUrl: string }>(resolve => (resolveLoad = resolve))
      )
      const { flow } = setup({ load })
      await flushPromises()
      setUserToken('someone-else')
      resolveLoad({ id: 'scene-x', qrUrl: 'https://qr.example.com/x.png' })
      await flushPromises()
      expect(flow().phase.value).toBe('expired')
      expect(flow().qrUrl.value).toBe('')
    })
  })
})
