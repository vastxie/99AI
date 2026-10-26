import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ request: vi.fn() }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))

vi.mock('./client', () => ({ apiClient: client }))
vi.mock('@/utils/message', () => ({ message: () => toast }))
vi.mock('@/locales', () => ({ t: (key: string) => key, tp: (key: string) => key }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))
const visitor = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('@/services/visitorSession', () => ({
  replaceVisitorCredential: visitor.replace,
  ensureVisitorToken: vi.fn(() => Promise.resolve()),
}))

import { eventBus } from '@/core/events/eventBus'
import { useAuthStore } from '@/store/modules/auth'
import { get, isRequestCancelled, post } from './index'
import { clearUserToken, setUserToken } from '@/services/identity'

/** sentBearer：真实拦截器写进请求配置的、实际带上的凭证（这里的 client 是假的，由用例给出） */
function httpError(
  status: number,
  url: string,
  data: Record<string, unknown> = {},
  sentBearer = ''
) {
  return Object.assign(new Error(`HTTP ${status}`), {
    response: { status, data },
    config: { url, sentBearer },
  })
}

function signedIn() {
  const auth = useAuthStore()
  setUserToken('session-token')
  auth.loadInit = true
  return auth
}

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  client.request.mockReset()
  toast.error.mockReset()
  visitor.replace.mockReset()
  visitor.replace.mockResolvedValue('visitor-2')
  // 登录提示有 3 秒节流：每个用例从节流窗口之外开始
  vi.setSystemTime(Date.now() + 60_000)
})

describe('请求层：登录态失效', () => {
  it('已登录用户在首页的静默接口上收到 401（会话过期）：清掉令牌、弹出登录框并提示', async () => {
    const auth = signedIn()
    client.request.mockRejectedValueOnce(httpError(401, '/chatlog/chatList', {}, 'session-token'))
    await expect(get({ url: '/chatlog/chatList' })).rejects.toBeTruthy()
    expect(auth.token).toBeUndefined()
    expect(visitor.replace).not.toHaveBeenCalled()
    expect(auth.loginDialog).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('common.sessionExpired')
  })

  it('游客访问首页的静默接口收到 401（换了凭证重试仍被拒）：不弹登录框、不提示', async () => {
    const auth = useAuthStore()
    auth.loadInit = true
    client.request
      .mockRejectedValueOnce(httpError(401, '/group/query'))
      .mockRejectedValueOnce(httpError(401, '/group/query', {}, 'visitor-2'))
    await expect(get({ url: '/group/query' })).rejects.toBeTruthy()
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(auth.loginDialog).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('游客调用其它接口收到 401（换了凭证重试仍被拒）：弹登录框，提示服务端给的原因，不结束任何会话', async () => {
    const auth = useAuthStore()
    auth.loadInit = true
    const expired = vi.fn()
    eventBus.on('auth:tokenExpired', expired)
    client.request
      .mockRejectedValueOnce(httpError(401, '/user/info', { message: '请先登录' }))
      .mockRejectedValueOnce(httpError(401, '/user/info', { message: '请先登录' }, 'visitor-2'))
    await expect(get({ url: '/user/info' })).rejects.toBeTruthy()
    expect(auth.loginDialog).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('请先登录')
    expect(expired).not.toHaveBeenCalled()
    eventBus.off('auth:tokenExpired', expired)
  })

  it('业务码 401（HTTP 200）与 HTTP 401 同样处理，不再整页刷新', async () => {
    const auth = signedIn()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    try {
      client.request.mockResolvedValueOnce({
        status: 200,
        data: { code: 401, success: false, message: 'token expired' },
        config: { url: '/chatlog/chatList', sentBearer: 'session-token' },
      })
      await expect(get({ url: '/chatlog/chatList' })).rejects.toMatchObject({
        code: 401,
        notified: true,
      })
      expect(reload).not.toHaveBeenCalled()
      expect(auth.token).toBeUndefined()
      expect(auth.loginDialog).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('其它失败：提示服务端原因并保留业务码；silentError 时交给调用方', async () => {
    client.request.mockRejectedValueOnce(
      httpError(500, '/x', { success: false, message: '服务繁忙', code: 500 })
    )
    await expect(get({ url: '/x' })).rejects.toMatchObject({
      code: 500,
      status: 500,
      // 已经提示过：调用方用 notifyError 时不会再提示一次
      notified: true,
    })
    expect(toast.error).toHaveBeenCalledWith('服务繁忙')

    toast.error.mockReset()
    client.request.mockRejectedValueOnce(
      httpError(500, '/x', { success: false, message: '服务繁忙' })
    )
    await expect(get({ url: '/x', silentError: true })).rejects.not.toHaveProperty('notified')
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('请求层：取消与上传进度', () => {
  it('调用方取消的请求原样抛出，不提示、不当成失败', async () => {
    const cancelled = Object.assign(new Error('canceled'), { name: 'CanceledError' })
    client.request.mockRejectedValueOnce(cancelled)
    const controller = new AbortController()
    const request = post({ url: '/upload/file', data: {}, signal: controller.signal })
    await expect(request).rejects.toBe(cancelled)
    expect(isRequestCancelled(cancelled)).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()
    expect(client.request.mock.calls[0][0].signal).toBe(controller.signal)
  })

  it('需要上传进度时改走 XHR，并把进度换算成 0–1', async () => {
    client.request.mockResolvedValueOnce({ data: { success: true, data: {} } })
    const progress = vi.fn()
    await post({ url: '/upload/file', data: {}, onUploadProgress: progress })
    const config = client.request.mock.calls[0][0]
    expect(config.adapter).toBe('xhr')
    config.onUploadProgress({ loaded: 50, total: 200 })
    config.onUploadProgress({ loaded: 10 })
    expect(progress.mock.calls).toEqual([[0.25]])
  })
})

describe('请求层：超时', () => {
  it('普通接口用实例的默认超时（30 秒）；上传默认不限时；调用方可以单独指定', async () => {
    client.request.mockResolvedValue({ data: { success: true, data: null }, config: {} })
    await get({ url: '/config/query' })
    expect(client.request.mock.calls[0][0]).not.toHaveProperty('timeout')

    await post({ url: '/upload/file', data: {}, onUploadProgress: () => undefined })
    expect(client.request.mock.calls[1][0]).toMatchObject({ timeout: 0 })

    await get({ url: '/slow/report', timeout: 120_000 })
    expect(client.request.mock.calls[2][0]).toMatchObject({ timeout: 120_000 })
  })

  it('超时给用户看「连接超时」，不是请求库的英文原文', async () => {
    client.request.mockRejectedValueOnce(
      Object.assign(new Error('timeout of 30000ms exceeded'), {
        code: 'ECONNABORTED',
        config: { url: '/group/query' },
      })
    )
    await expect(get({ url: '/group/query', silentError: true })).rejects.toThrow(
      'common.connectionTimeout'
    )
  })
})
