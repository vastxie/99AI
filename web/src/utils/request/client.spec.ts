import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter } from 'axios'

vi.mock('@/utils/fileAccessCookie', () => ({
  refreshFileAccessCookie: vi.fn(),
  registerFileAccessCredential: vi.fn(),
}))

import { ensureVisitorToken } from '@/services/visitorSession'
import { apiClient } from './client'
import { clearUserToken, clearVisitorToken, setUserToken } from '@/services/identity'

/** 不发真请求：记下拦截器处理后的请求头 */
const seen: Array<Record<string, unknown>> = []
const adapter: AxiosAdapter = async config => {
  seen.push({ ...config.headers })
  return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
}

let resolveVisitor: (body: unknown) => void = () => undefined

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  seen.length = 0
  clearVisitorToken()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise(resolve => {
          resolveVisitor = body => resolve({ ok: true, json: async () => body })
        })
    )
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearVisitorToken()
})

describe('请求实例：身份', () => {
  it('首次访问时游客令牌还在申请：没登录的请求等它回来，再带上令牌发出', async () => {
    const visitor = ensureVisitorToken()
    const request = apiClient.get('/group/query', { adapter })
    await Promise.resolve()
    expect(seen).toHaveLength(0)
    resolveVisitor({ data: 'visitor-token' })
    await visitor
    await request
    expect(seen[0]?.Authorization).toBe('Bearer visitor-token')
  })

  it('已登录时不等游客令牌', async () => {
    setUserToken('session-token')
    void ensureVisitorToken().catch(() => undefined)
    await apiClient.get('/group/query', { adapter })
    expect(seen[0]?.Authorization).toBe('Bearer session-token')
    resolveVisitor({ data: 'visitor-token' })
  })
})
