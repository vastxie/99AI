import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUserToken, setUserToken } from './identity'
import { socketService } from './socket-io'

vi.mock('@/locales', () => ({ t: (key: string) => key, tp: (key: string) => key }))
const deps = vi.hoisted(() => ({
  ensureVisitorToken: vi.fn(async () => 'visitor-token'),
  usableVisitorToken: vi.fn(() => 'visitor-token'),
  getInfo: vi.fn(),
  sockets: [] as Array<FakeSocket>,
  /** 还在生效的身份代次监听（服务构造时注册的那个常驻） */
  watchers: 0,
}))
vi.mock('./identity', async importOriginal => {
  const actual = await importOriginal<typeof import('./identity')>()
  return {
    ...actual,
    onIdentityEpochChange: (listener: () => void) => {
      deps.watchers += 1
      const stop = actual.onIdentityEpochChange(listener)
      return () => {
        deps.watchers -= 1
        stop()
      }
    },
  }
})
vi.mock('./visitorSession', () => ({
  ensureVisitorToken: deps.ensureVisitorToken,
  usableVisitorToken: deps.usableVisitorToken,
}))
vi.mock('@/api', () => ({ fetchGetInfo: deps.getInfo }))

/** 一个出站包：ack 是 Socket.IO 的回执回调（error 非空表示超时或断开） */
interface Packet {
  event: string
  data: unknown
  ack: (error: Error | null, response?: unknown) => void
}

/**
 * 假的 socket.io 连接，按 Socket.IO 4.8.3 的行为：同一事件可以有多个监听器；active 表示还在连接或自动重连；
 * 已连接时 emit 的包算「已发出、等回执」，断开时立即回调失败；未连接时 emit 的包进缓冲区，断开时不立即失败
 */
interface FakeSocket {
  handlers: Map<string, Set<(arg?: unknown) => void>>
  auth: unknown
  connected: boolean
  active: boolean
  sent: Packet[]
  buffered: Packet[]
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  on: (event: string, handler: (arg?: unknown) => void) => void
  fire: (event: string, arg?: unknown) => void
  timeout: (ms: number) => { emit: (event: string, data: unknown, ack: Packet['ack']) => void }
  /** 连上：触发 connect */
  open: () => void
}
vi.mock('socket.io-client', () => ({
  io: (_origin: string, options: { auth: unknown }) => {
    const socket: FakeSocket = {
      handlers: new Map(),
      auth: options.auth,
      connected: false,
      active: true,
      sent: [],
      buffered: [],
      connect: vi.fn(() => {
        socket.active = true
      }),
      disconnect: vi.fn(() => {
        socket.connected = false
        socket.active = false
        for (const packet of socket.sent.splice(0))
          packet.ack(new Error('socket has been disconnected'))
      }),
      removeAllListeners: vi.fn(() => socket.handlers.clear()),
      on(event, handler) {
        if (!socket.handlers.has(event)) socket.handlers.set(event, new Set())
        socket.handlers.get(event)!.add(handler)
      },
      fire(event, arg) {
        for (const handler of [...(socket.handlers.get(event) || [])]) handler(arg)
      },
      timeout: () => ({
        emit: (event, data, ack) =>
          (socket.connected ? socket.sent : socket.buffered).push({ event, data, ack }),
      }),
      open() {
        socket.connected = true
        socket.active = true
        socket.fire('connect')
      },
    }
    deps.sockets.push(socket)
    return socket
  },
}))

const latest = () => deps.sockets[deps.sockets.length - 1]
/** 让排队的微任务跑完（Promise 链在 await 之间推进） */
const flush = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve()
}

function resetService() {
  socketService.disconnect()
  deps.sockets.length = 0
  deps.getInfo.mockReset()
  deps.ensureVisitorToken.mockReset()
  deps.ensureVisitorToken.mockImplementation(async () => 'visitor-token')
  deps.usableVisitorToken.mockReset()
  deps.usableVisitorToken.mockImplementation(() => 'visitor-token')
  const internal = socketService as unknown as Record<string, number>
  internal.authProbeFailures = 0
  internal.authProbePausedUntil = 0
  internal.lastAuthProbeWakeAt = 0
}

describe('回执', () => {
  beforeEach(() => {
    resetService()
    setUserToken('user-a')
  })
  afterEach(() => {
    clearUserToken()
    socketService.destroy()
  })

  async function ackWith(response: unknown, error: Error | null = null) {
    const pending = socketService.emitWithAck('chat:start', { prompt: 'x' })
    await flush()
    if (!latest().connected) latest().open()
    await flush()
    const sent = latest().sent
    sent[sent.length - 1].ack(error, response)
    return pending
  }

  it('passes current success and error acknowledgements through', async () => {
    expect(await ackWith({ ok: true, data: { accepted: true } })).toMatchObject({
      ok: true,
      data: { accepted: true },
    })
    expect(
      await ackWith({ ok: false, code: 'SESSION_UNAVAILABLE', message: '服务暂时不可用' })
    ).toMatchObject({
      ok: false,
      code: 'SESSION_UNAVAILABLE',
      message: '服务暂时不可用',
    })
  })

  it.each([true, { success: true }, { ok: 'true' }, [], null])(
    'rejects a non-current acknowledgement: %j',
    async response => {
      expect(await ackWith(response)).toMatchObject({ ok: false, code: 'INVALID_ACK' })
    }
  )

  it('每次发送结束都撤掉自己的身份监听（回执到达、回执失败、身份变化）', async () => {
    const baseline = deps.watchers
    await ackWith({ ok: true })
    await ackWith(undefined, new Error('operation has timed out'))
    expect(deps.watchers).toBe(baseline)
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    expect(deps.watchers).toBe(baseline + 1)
    setUserToken('user-b')
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
    expect(deps.watchers).toBe(baseline)
  })

  it('keeps a distinct timeout result', async () => {
    expect(await ackWith(undefined, new Error('synthetic timeout'))).toMatchObject({
      ok: false,
      code: 'TIMEOUT',
    })
  })
})

describe('连接复用与等待', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetService()
    setUserToken('user-a')
  })
  afterEach(() => {
    clearUserToken()
    socketService.destroy()
    vi.useRealTimers()
  })

  it('凭证相同就复用（正在连、自动重连中也复用）；凭证变了才重建', () => {
    const first = socketService.connect()
    expect(socketService.connect()).toBe(first)
    latest().fire('connect_error') // 自动重连中：active 仍为真
    expect(socketService.connect()).toBe(first)
    expect(deps.sockets).toHaveLength(1)
    setUserToken('user-b')
    expect(socketService.connect()).not.toBe(first)
    expect(deps.sockets).toHaveLength(2)
    expect(deps.sockets[0].disconnect).toHaveBeenCalled()
  })

  it('并发的发送各自等待（各有截止时间），当前 socket 连上时全部放行，各自发出一次', async () => {
    const first = socketService.emitWithAck('chat:start', { n: 1 })
    const second = socketService.emitWithAck('chat:queueTurn', { n: 2 })
    await flush()
    expect(deps.sockets).toHaveLength(1)
    latest().open()
    await flush()
    expect(latest().sent.map(packet => packet.event)).toEqual(['chat:start', 'chat:queueTurn'])
    for (const packet of latest().sent) packet.ack(null, { ok: true })
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toMatchObject({ ok: true })
  })

  it('自动重连中的 connect_error 不结束等待；连上后照常发出', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    latest().fire('connect_error')
    await vi.advanceTimersByTimeAsync(3000)
    latest().open()
    await flush()
    expect(latest().sent).toHaveLength(1)
    latest().sent[0].ack(null, { ok: true })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  it('同一身份下等待期间换了实例：等待者转到新实例，只在新实例发出一次', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const old = latest()
    socketService.disconnect()
    socketService.connect()
    const current = latest()
    expect(current).not.toBe(old)
    current.open()
    await flush()
    expect(old.sent).toHaveLength(0)
    expect(old.buffered).toHaveLength(0)
    expect(current.sent).toHaveLength(1)
    current.sent[0].ack(null, { ok: true })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  it('等待刚放行、发送之前同一身份换了实例：不往旧实例的缓冲区塞包，等新实例连上再发', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const old = latest()
    old.open() // 等待者放行（续体还没执行）
    socketService.disconnect()
    socketService.connect()
    const current = latest()
    await flush()
    // 超时之前断言：旧实例既没有发出也没有缓冲
    expect(old.sent).toHaveLength(0)
    expect(old.buffered).toHaveLength(0)
    expect(current.sent).toHaveLength(0)
    current.open()
    await flush()
    expect(current.sent).toHaveLength(1)
    current.sent[0].ack(null, { ok: true })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  it('等待放行后连接又断开（同一身份）：不发进缓冲区，重新等待并沿用最初的 10 秒截止时间', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    await vi.advanceTimersByTimeAsync(6000)
    const socket = latest()
    socket.open()
    socket.connected = false // 放行之后、发送之前又断开（自动重连中）
    await flush()
    expect(socket.sent).toHaveLength(0)
    expect(socket.buffered).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(3999)
    expect(await Promise.race([pending, Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'CONNECTION_FAILED' })
  })

  it('10 秒内没连上：连接失败；结束后没有残留的计时器与等待者', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'CONNECTION_FAILED' })
    expect((socketService as unknown as { waiters: Set<unknown> }).waiters.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('握手被服务端拒绝（active 变假）：等待以连接失败结束，并启动身份核对，不换凭证', async () => {
    deps.getInfo.mockResolvedValue({ data: {} })
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const socket = latest()
    socket.active = false
    socket.fire(
      'connect_error',
      Object.assign(new Error('WebSocket 鉴权失败'), { data: { code: 'SESSION_UNAVAILABLE' } })
    )
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'CONNECTION_FAILED' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(deps.getInfo).toHaveBeenCalledTimes(1)
    expect(socket.connect).toHaveBeenCalledTimes(1)
    expect(socket.auth).toEqual({ token: 'user-a' })
    expect(deps.ensureVisitorToken).not.toHaveBeenCalled()
  })
})

describe('身份变化', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetService()
    setUserToken('user-a')
  })
  afterEach(() => {
    clearUserToken()
    socketService.destroy()
    vi.useRealTimers()
  })

  it('等连接期间身份变了：立即回 IDENTITY_CHANGED，不等 10 秒；等待者与它的计时器同时撤掉', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    setUserToken('user-b')
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
    expect(latest().sent).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('A → B → A 也算身份变化', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    setUserToken('user-b')
    setUserToken('user-a')
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
  })

  it.each([
    ['申请成功', (finish: { resolve: (value: string) => void }) => finish.resolve('visitor-new')],
    [
      '申请失败',
      (finish: { reject: (error: Error) => void }) => finish.reject(new Error('offline')),
    ],
  ])(
    '等访客凭证期间换了身份：不等旧申请就立即回 IDENTITY_CHANGED；旧申请随后%s也不发送',
    async (_title, finishWith: any) => {
      clearUserToken()
      deps.usableVisitorToken.mockReturnValue('')
      const finish: { resolve: (value: string) => void; reject: (error: Error) => void } = {
        resolve: () => undefined,
        reject: () => undefined,
      }
      deps.ensureVisitorToken.mockImplementation(
        () => new Promise<string>((resolve, reject) => Object.assign(finish, { resolve, reject }))
      )
      const pending = socketService.emitWithAck('chat:resync', {})
      await flush()
      setUserToken('user-b')
      // 旧的凭证申请还没结束：结果已经是 IDENTITY_CHANGED
      await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
      finishWith(finish)
      await flush()
      // 旧申请回来之后也不为它建连接（更不会发送）、不留下等待者
      expect(deps.sockets).toHaveLength(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('等待先失败、紧接着换了身份（同一轮微任务里先后发生）：按代次判断，回 IDENTITY_CHANGED', async () => {
    clearUserToken()
    deps.usableVisitorToken.mockReturnValue('')
    let fail!: (error: Error) => void
    deps.ensureVisitorToken.mockImplementation(
      () => new Promise<string>((_resolve, reject) => (fail = reject))
    )
    const pending = socketService.emitWithAck('chat:resync', {})
    await flush()
    fail(new Error('offline'))
    // 失败已经在路上、发送方还没接到它时换了身份
    void Promise.resolve().then(() => setUserToken('user-b'))
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
  })

  it('连接刚成功、发送之前换了身份：不发送，回 IDENTITY_CHANGED', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const socket = latest()
    socket.open()
    setUserToken('user-b')
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
    expect(socket.sent).toHaveLength(0)
    expect(socket.buffered).toHaveLength(0)
  })

  it('等回执期间换了身份：立即回 IDENTITY_CHANGED，随后的断开失败回调不覆盖它', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const socket = latest()
    socket.open()
    await flush()
    expect(socket.sent).toHaveLength(1)
    setUserToken('user-b')
    socketService.disconnect() // 身份变化流程随后断开：已发出的包立即失败
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
  })

  it('等回执期间换了身份、连接还没断开：立即回 IDENTITY_CHANGED，不等回执超时', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const socket = latest()
    socket.open()
    await flush()
    expect(socket.sent).toHaveLength(1)
    setUserToken('user-b')
    await expect(pending).resolves.toEqual({ ok: false, code: 'IDENTITY_CHANGED' })
    // 之后迟到的回执不改变结果
    socket.sent[0].ack(null, { ok: true })
  })

  it('同一身份下等回执时连接被替换：已发出的包立即失败，按结果不确定（TIMEOUT）', async () => {
    const pending = socketService.emitWithAck('chat:start', {})
    await flush()
    const socket = latest()
    socket.open()
    await flush()
    socketService.disconnect()
    socketService.connect()
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'TIMEOUT' })
  })
})

describe('连接恢复', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetService()
    clearUserToken()
  })
  afterEach(() => {
    socketService.destroy()
    vi.useRealTimers()
  })

  async function serverDisconnects() {
    socketService.connect()
    latest().fire('disconnect', 'io server disconnect')
  }

  it('断网、传输失败（connect_error）：交给 socket.io 自己重连，不申请、不替换访客凭证', async () => {
    socketService.connect()
    latest().fire('connect_error')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.ensureVisitorToken).not.toHaveBeenCalled()
    expect(deps.getInfo).not.toHaveBeenCalled()
  })

  it('服务端主动断开：2 秒后用资料请求核对身份，通过就以当前凭证重连', async () => {
    deps.getInfo.mockResolvedValue({ data: {} })
    await serverDisconnects()
    await vi.advanceTimersByTimeAsync(1999)
    expect(deps.getInfo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(deps.getInfo).toHaveBeenCalledTimes(1)
    expect(latest().connect).toHaveBeenCalledTimes(1)
    expect(latest().auth).toEqual({ token: 'visitor-token' })
  })

  it('核对失败（503、断网）按 2、5、15、30、30 秒退避再核对', async () => {
    deps.getInfo.mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }))
    await serverDisconnects()
    for (const [step, calls] of [
      [2000, 1],
      [5000, 2],
      [15000, 3],
      [30000, 4],
      [30000, 5],
    ] as const) {
      await vi.advanceTimersByTimeAsync(step)
      expect(deps.getInfo).toHaveBeenCalledTimes(calls)
    }
    expect(latest().connect).not.toHaveBeenCalled()
  })

  it('核对途中身份变了（401 换了凭证、别处登录）：任务结束，不重连、不再核对', async () => {
    let fail: (error: unknown) => void = () => undefined
    deps.getInfo.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)))
    await serverDisconnects()
    await vi.advanceTimersByTimeAsync(2000)
    setUserToken('someone-else')
    fail(Object.assign(new Error('unauthorized'), { status: 401 }))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(deps.getInfo).toHaveBeenCalledTimes(1)
    expect(latest().connect).not.toHaveBeenCalled()
  })

  it('主动断开或销毁：核对任务取消，之后没有请求，也不重连', async () => {
    deps.getInfo.mockResolvedValue({ data: {} })
    await serverDisconnects()
    socketService.disconnect()
    // 定时器也一并清掉，不留着到点空转
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.getInfo).not.toHaveBeenCalled()
  })

  it('连续 10 次没能恢复就暂停 5 分钟；暂停期间的唤醒立即试一次（10 秒内合并）；期满从头退避', async () => {
    deps.getInfo.mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }))
    await serverDisconnects()
    await vi.advanceTimersByTimeAsync(2000 + 5000 + 15000 + 30000 * 7)
    expect(deps.getInfo).toHaveBeenCalledTimes(10)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deps.getInfo).toHaveBeenCalledTimes(10)

    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.getInfo).toHaveBeenCalledTimes(11)
    // 那次尝试结束后 10 秒内再唤醒：合并，不再尝试；过了 10 秒再唤醒才会再试
    await vi.advanceTimersByTimeAsync(5000)
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.getInfo).toHaveBeenCalledTimes(11)
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(deps.getInfo).toHaveBeenCalledTimes(12)

    // 暂停从第 10 次失败算起 5 分钟（唤醒的尝试失败不延长）；期满后从 2 秒重新退避
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 60_000 - 10_000)
    expect(deps.getInfo).toHaveBeenCalledTimes(12)
    await vi.advanceTimersByTimeAsync(2000)
    expect(deps.getInfo).toHaveBeenCalledTimes(13)
  })

  it('重连后连接保持 30 秒以上，计数清零：之后再被断开从 2 秒重新退避', async () => {
    deps.getInfo.mockRejectedValueOnce(new Error('busy')).mockResolvedValue({ data: {} })
    await serverDisconnects()
    await vi.advanceTimersByTimeAsync(2000 + 5000)
    expect(latest().connect).toHaveBeenCalledTimes(1)
    const socket = latest()
    socket.connected = true
    socket.fire('connect')
    await vi.advanceTimersByTimeAsync(30_000)
    socket.connected = false
    socket.fire('disconnect', 'io server disconnect')
    await vi.advanceTimersByTimeAsync(2000)
    expect(deps.getInfo).toHaveBeenCalledTimes(3)
  })

  it('核对任务在加载请求模块期间被断开：不再发请求', async () => {
    deps.getInfo.mockResolvedValue({ data: {} })
    await serverDisconnects()
    vi.advanceTimersByTime(2000)
    socketService.disconnect()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    expect(deps.getInfo).not.toHaveBeenCalled()
  })
})
