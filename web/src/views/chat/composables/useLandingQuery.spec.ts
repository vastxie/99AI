import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUserToken, setUserToken } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import { useLandingQuery } from './useLandingQuery'

const route = vi.hoisted(() => ({
  path: '/',
  query: {} as Record<string, string>,
  hash: '',
}))
const router = vi.hoisted(() => ({ replace: vi.fn(async (_location: unknown) => undefined) }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))
vi.mock('@/utils/message', () => ({ message: () => toasts }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

beforeEach(() => {
  clearUserToken()
  toasts.success.mockClear()
  setActivePinia(createPinia())
  vi.spyOn(useAuthStore(), 'getUserInfo').mockResolvedValue({})
  router.replace.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('落地时地址里的一次性参数', () => {
  it('第三方登录回跳的 token 写入登录态后立即经路由从地址里去掉，其它参数与 hash 保留', async () => {
    Object.assign(route, {
      path: '/chat',
      query: { token: 't-123', from: 'oauth' },
      hash: '#settings',
    })
    const setToken = vi.spyOn(useAuthStore(), 'setToken')

    await useLandingQuery().consume()

    expect(setToken).toHaveBeenCalledWith('t-123')
    expect(toasts.success).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith({
      path: '/chat',
      query: { from: 'oauth' },
      hash: '#settings',
    })
  })

  it('没有 token 时什么都不做', async () => {
    Object.assign(route, { path: '/', query: { from: 'oauth' }, hash: '' })
    await useLandingQuery().consume()
    expect(router.replace).not.toHaveBeenCalled()
  })
})

describe('落地登录的提示时机', () => {
  it('资料取不到（含身份随即变化）：不提示登录成功，一次性令牌照样从地址里清掉', async () => {
    Object.assign(route, { path: '/chat', query: { token: 't-456' }, hash: '' })
    vi.spyOn(useAuthStore(), 'getUserInfo').mockRejectedValue(new Error('offline'))
    await useLandingQuery().consume()
    expect(toasts.success).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ path: '/chat', query: {}, hash: '' })
  })
})

describe('落地令牌的清理时机', () => {
  it('先从地址里清掉令牌，再取资料：资料请求挂着时地址里已经没有令牌', async () => {
    Object.assign(route, { path: '/chat', query: { token: 't-789' }, hash: '' })
    let finishProfile: () => void = () => undefined
    vi.spyOn(useAuthStore(), 'getUserInfo').mockImplementation(
      () => new Promise(resolve => (finishProfile = () => resolve({})))
    )
    const consuming = useLandingQuery().consume()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(router.replace).toHaveBeenCalledWith({ path: '/chat', query: {}, hash: '' })
    expect(toasts.success).not.toHaveBeenCalled()
    finishProfile()
    await consuming
    expect(toasts.success).toHaveBeenCalledTimes(1)
  })

  it('清理地址期间别的入口已经登录：不再写入落地令牌', async () => {
    Object.assign(route, { path: '/chat', query: { token: 't-000' }, hash: '' })
    router.replace.mockImplementationOnce(async () => {
      setUserToken('someone-else')
    })
    const getUserInfo = vi.spyOn(useAuthStore(), 'getUserInfo')
    await useLandingQuery().consume()
    expect(useAuthStore().token).toBe('someone-else')
    expect(getUserInfo).not.toHaveBeenCalled()
    expect(toasts.success).not.toHaveBeenCalled()
  })
})
