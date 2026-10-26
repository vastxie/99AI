import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('@/utils/message', () => ({ message: () => toast }))
vi.mock('@/locales', () => ({ t: (key: string) => key, tp: (key: string) => key }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

import { eventBus } from '@/core/events/eventBus'
import {
  clearUserToken,
  clearVisitorToken,
  currentVisitorToken,
  identityEpoch,
  markVisitorTokenUsed,
  setUserToken,
} from '@/services/identity'
import { replaceVisitorCredential } from '@/services/visitorSession'
import { useAuthStore } from '@/store/modules/auth'
import { setVisitorToken } from '@/services/identity'
import { get, post } from './index'

/**
 * 真实的请求实例、拦截器与请求层，只把网络换成假的 fetch：
 * 访客凭证申请（/auth/visitor-session）与业务接口分别由用例控制返回
 */
type Reply = { status: number; body: unknown }
let visitorReplies: Array<() => Promise<Reply>> = []
let apiReplies: Record<string, Array<() => Promise<Reply>>> = {}
const apiCalls: Array<{ url: string; authorization: string | null }> = []
let visitorRequests = 0

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let clock = Date.now()

beforeEach(() => {
  setActivePinia(createPinia())
  clearUserToken()
  clearVisitorToken()
  localStorage.clear()
  visitorReplies = []
  apiReplies = {}
  apiCalls.length = 0
  visitorRequests = 0
  toast.error.mockReset()
  // 访客凭证自动更换有频率上限（模块级记录）：每个用例的时间都往后推，从上一个用例的窗口之外开始
  clock += 10 * 60_000
  vi.setSystemTime(clock)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/auth/visitor-session')) {
        visitorRequests += 1
        const next = visitorReplies.shift()
        if (!next) throw new Error('no visitor reply')
        const reply = await next()
        return { ok: reply.status < 400, json: async () => reply.body } as Response
      }
      // 去掉接口前缀（VITE_GLOB_API_URL），用例按接口路径登记回复
      const path = new URL(url, 'http://localhost').pathname.replace(/^\/api(?=\/)/, '')
      const headers = new Headers(
        input instanceof Request ? input.headers : (init?.headers as HeadersInit)
      )
      apiCalls.push({ url: path, authorization: headers.get('authorization') })
      const next = apiReplies[path]?.shift()
      if (!next) throw new Error(`no reply for ${path}`)
      const reply = await next()
      return json(reply.status, reply.body)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ok =
  (data: unknown = {}) =>
  async () => ({ status: 200, body: { code: 200, data } })
const unauthorized = async () => ({ status: 401, body: { message: '请先登录' } })
const visitorToken = (token: string) => async () => ({ status: 200, body: { data: token } })
const reply = (path: string, ...replies: Array<() => Promise<Reply>>) => {
  apiReplies[path] = [...(apiReplies[path] ?? []), ...replies]
}

/** 让在途的 promise 链往前走几拍 */
async function settle(times = 6) {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('请求层：身份绑定', () => {
  it('首次访问等访客凭证（建立身份，不算换人）：凭证回来后带上它照常发出', async () => {
    const minted = deferred<Reply>()
    visitorReplies.push(() => minted.promise)
    reply('/group/query', ok([]))
    const request = get({ url: '/group/query' })
    await settle()
    expect(apiCalls).toHaveLength(0)
    const epoch = identityEpoch()
    minted.resolve({ status: 200, body: { data: 'visitor-first' } })
    await expect(request).resolves.toMatchObject({ code: 200 })
    expect(apiCalls).toEqual([{ url: '/group/query', authorization: 'Bearer visitor-first' }])
    expect(identityEpoch()).toBe(epoch)
  })

  it('等访客凭证期间登录了：访客发起的请求以 IDENTITY_CHANGED 中止，不带登录令牌发出', async () => {
    const minted = deferred<Reply>()
    visitorReplies.push(() => minted.promise)
    const request = get({ url: '/group/query' })
    await settle()
    setUserToken('user-token-during-wait')
    minted.resolve({ status: 200, body: { data: 'visitor-late' } })
    await expect(request).rejects.toMatchObject({ code: 'IDENTITY_CHANGED', notified: true })
    expect(apiCalls).toHaveLength(0)
  })

  it('登录前发出、登录后才回来的 401（HTTP 与业务码）：新会话不受影响，不弹登录框、不提示', async () => {
    setVisitorToken('visitor-before-login')
    const httpReply = deferred<Reply>()
    const businessReply = deferred<Reply>()
    reply('/a', () => httpReply.promise)
    reply('/b', () => businessReply.promise)
    const first = get({ url: '/a' })
    const second = get({ url: '/b' })
    await settle()
    expect(apiCalls).toHaveLength(2)
    setUserToken('user-token-after')
    const auth = useAuthStore()
    auth.loadInit = true
    httpReply.resolve({ status: 401, body: { message: 'expired' } })
    businessReply.resolve({ status: 200, body: { code: 401, message: 'expired' } })
    await expect(first).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    await expect(second).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(auth.token).toBe('user-token-after')
    expect(auth.loginDialog).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(visitorRequests).toBe(0)
  })

  it('本页用过的访客凭证被拒：换一张新的，旧请求不重放（IDENTITY_CHANGED），发 auth:visitorChanged', async () => {
    setVisitorToken('visitor-used')
    reply('/group/query', ok([]))
    await get({ url: '/group/query' })
    const changed = vi.fn()
    eventBus.on('auth:visitorChanged', changed)
    reply('/chat/start', unauthorized)
    visitorReplies.push(visitorToken('visitor-next'))
    const epoch = identityEpoch()
    await expect(post({ url: '/chat/start', data: {} })).rejects.toMatchObject({
      code: 'IDENTITY_CHANGED',
    })
    expect(currentVisitorToken()).toBe('visitor-next')
    expect(identityEpoch()).toBe(epoch + 1)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(apiCalls.filter(call => call.url === '/chat/start')).toHaveLength(1)
    eventBus.off('auth:visitorChanged', changed)
  })

  it('两条旧凭证的 401 错峰返回：只申请一次新凭证，后到的那条直接作废', async () => {
    setVisitorToken('visitor-stale')
    markVisitorTokenUsed('visitor-stale')
    const late = deferred<Reply>()
    reply('/a', unauthorized)
    reply('/b', () => late.promise)
    visitorReplies.push(visitorToken('visitor-fresh'))
    const second = get({ url: '/b' })
    await settle()
    await expect(get({ url: '/a' })).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    late.resolve({ status: 401, body: { message: 'expired' } })
    await expect(second).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(visitorRequests).toBe(1)
    expect(currentVisitorToken()).toBe('visitor-fresh')
  })

  it('申请新凭证失败：保留原凭证，按普通失败抛出', async () => {
    setVisitorToken('visitor-keep')
    markVisitorTokenUsed('visitor-keep')
    reply('/a', unauthorized)
    visitorReplies.push(async () => ({ status: 503, body: {} }))
    const result = get({ url: '/a' })
    await expect(result).rejects.toBeTruthy()
    await expect(result).rejects.not.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(currentVisitorToken()).toBe('visitor-keep')
  })

  it('没带凭证发出的请求 401（之前申请失败）：拿到凭证后重试一次；重试自身的错误原样传出', async () => {
    visitorReplies.push(async () => ({ status: 503, body: {} }))
    reply('/a', unauthorized)
    visitorReplies.push(visitorToken('visitor-established'))
    reply('/a', async () => ({ status: 500, body: { success: false, message: '服务繁忙' } }))
    await expect(get({ url: '/a', silentError: true })).rejects.toMatchObject({ status: 500 })
    expect(apiCalls).toEqual([
      { url: '/a', authorization: null },
      { url: '/a', authorization: 'Bearer visitor-established' },
    ])
  })

  it('没带凭证的两条请求都 401：只申请一次，第二条直接用已经建立的凭证重试', async () => {
    visitorReplies.push(async () => ({ status: 503, body: {} }))
    const firstReply = deferred<Reply>()
    const secondReply = deferred<Reply>()
    reply('/a', () => firstReply.promise, ok())
    reply('/b', () => secondReply.promise, ok())
    const first = get({ url: '/a' })
    const second = get({ url: '/b' })
    await settle()
    visitorReplies.push(visitorToken('visitor-shared'))
    firstReply.resolve({ status: 401, body: {} })
    await expect(first).resolves.toMatchObject({ code: 200 })
    secondReply.resolve({ status: 401, body: {} })
    await expect(second).resolves.toMatchObject({ code: 200 })
    expect(visitorRequests).toBe(2)
    expect(apiCalls.filter(call => call.authorization === 'Bearer visitor-shared')).toHaveLength(2)
  })

  it('本地已过期、本页没用过的访客凭证被替换：只是建立身份，代次不变，请求带上新凭证发出', async () => {
    const expired = `x.${btoa(JSON.stringify({ exp: 1 }))}.y`
    setVisitorToken(expired)
    const epoch = identityEpoch()
    visitorReplies.push(visitorToken('visitor-renewed'))
    reply('/group/query', ok([]))
    await get({ url: '/group/query' })
    expect(identityEpoch()).toBe(epoch)
    expect(apiCalls).toEqual([{ url: '/group/query', authorization: 'Bearer visitor-renewed' }])
  })

  it('同一张在用凭证的三条请求同时 401：只申请一次、只换一次身份，不触发暂停', async () => {
    setVisitorToken('visitor-busy')
    markVisitorTokenUsed('visitor-busy')
    const paused = vi.fn()
    eventBus.on('auth:visitorRecoveryPaused', paused)
    const replies = [deferred<Reply>(), deferred<Reply>(), deferred<Reply>()]
    replies.forEach((item, index) => reply(`/p${index}`, () => item.promise))
    const minted = deferred<Reply>()
    visitorReplies.push(() => minted.promise)
    const epoch = identityEpoch()
    const requests = [0, 1, 2].map(index => get({ url: `/p${index}` }))
    await settle()
    replies.forEach(item => item.resolve({ status: 401, body: {} }))
    await settle()
    minted.resolve({ status: 200, body: { data: 'visitor-calm' } })
    for (const request of requests) {
      await expect(request).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    }
    expect(visitorRequests).toBe(1)
    expect(identityEpoch()).toBe(epoch + 1)
    expect(paused).not.toHaveBeenCalled()
    eventBus.off('auth:visitorRecoveryPaused', paused)
  })

  it.each(['HTTP 401', '业务码 401'])(
    '%s：换签期间登录了、换签随后失败：静默作废，不弹登录框、不提示',
    async kind => {
      setVisitorToken('visitor-before')
      markVisitorTokenUsed('visitor-before')
      const auth = useAuthStore()
      auth.loadInit = true
      reply(
        '/a',
        kind === 'HTTP 401'
          ? unauthorized
          : async () => ({ status: 200, body: { code: 401, message: '请先登录' } })
      )
      const minted = deferred<Reply>()
      visitorReplies.push(() => minted.promise)
      const request = get({ url: '/a' })
      await settle()
      setUserToken('logged-in-meanwhile')
      minted.resolve({ status: 503, body: {} })
      await expect(request).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
      expect(auth.loginDialog).toBe(false)
      expect(toast.error).not.toHaveBeenCalled()
    }
  )

  it('更换在用身份的频率上限：申请失败不占额度；连换两次后第三次暂停并提示一次；冷却期满可以再换', async () => {
    const paused = vi.fn()
    eventBus.on('auth:visitorRecoveryPaused', paused)
    const use = (token: string) => {
      setVisitorToken(token)
      markVisitorTokenUsed(token)
    }
    use('v-0')
    visitorReplies.push(async () => ({ status: 503, body: {} }))
    await expect(replaceVisitorCredential('v-0')).rejects.toBeTruthy()
    visitorReplies.push(visitorToken('v-1'))
    await replaceVisitorCredential('v-0')
    markVisitorTokenUsed('v-1')
    visitorReplies.push(visitorToken('v-2'))
    await replaceVisitorCredential('v-1')
    markVisitorTokenUsed('v-2')
    await expect(replaceVisitorCredential('v-2')).rejects.toMatchObject({
      code: 'VISITOR_RECOVERY_PAUSED',
    })
    expect(paused).toHaveBeenCalledTimes(1)
    expect(visitorRequests).toBe(3)

    clock += 61_000
    vi.setSystemTime(clock)
    visitorReplies.push(visitorToken('v-3'))
    await expect(replaceVisitorCredential('v-2')).resolves.toBe('v-3')
    eventBus.off('auth:visitorRecoveryPaused', paused)
  })
})
