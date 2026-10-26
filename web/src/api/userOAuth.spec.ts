import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@/locales'
import { sha256Hex } from '@/utils/sha256'
import { fetchOAuthCallbackAPI, fetchOAuthUrlAPI, oauthStateOf } from './user'

const mocks = vi.hoisted(() => ({ post: vi.fn(), error: vi.fn() }))

vi.mock('@/utils/request', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/request')>()),
  post: mocks.post,
}))
vi.mock('@/utils/message', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/message')>()),
  message: () => ({ error: mocks.error }),
}))

const AUTH_URL = 'https://sso.example.com/oauth/authorize?client_id=c&state=state-a'
const realStorage = window.sessionStorage
const secretKeys = () => Object.keys(realStorage).filter(key => key.startsWith('oauth:secret:'))

/** 换掉 window.sessionStorage：传函数时取值即抛错（存储被禁用），传对象时用假的存储 */
function replaceStorage(next: (() => never) | Partial<Storage>) {
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get: typeof next === 'function' ? next : () => next,
  })
}

/** 内存里的存储，failOn 返回 true 的操作抛错 */
function memoryStorage(failOn: (op: 'get' | 'set' | 'remove', key: string) => boolean) {
  const data = new Map<string, string>()
  const guard = (op: 'get' | 'set' | 'remove', key: string) => {
    if (failOn(op, key)) throw new DOMException('denied', 'SecurityError')
  }
  return {
    data,
    storage: {
      getItem: (key: string) => (guard('get', key), data.get(key) ?? null),
      setItem: (key: string, value: string) => (guard('set', key), void data.set(key, value)),
      removeItem: (key: string) => (guard('remove', key), void data.delete(key)),
    },
  }
}

beforeEach(() => {
  // mockReset 连同 mockResolvedValueOnce 的队列一起清掉：上一个用例没用完的响应不串到下一个
  mocks.post.mockReset()
  mocks.error.mockReset()
  realStorage.clear()
})

afterEach(() => {
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => realStorage })
  realStorage.clear()
  vi.restoreAllMocks()
})

describe('第三方登录发起：标签页密钥', () => {
  it('请求只带密钥的 SHA-256，成功后按授权地址里的 state 存下密钥原文', async () => {
    mocks.post.mockResolvedValueOnce({ success: true, data: AUTH_URL })

    await expect(
      fetchOAuthUrlAPI('demo_oauth', { scene: 'login', redirectPath: '/' })
    ).resolves.toMatchObject({ data: AUTH_URL })

    const { url, data } = mocks.post.mock.calls[0][0]
    expect(url).toBe('/auth/oauth/demo_oauth/url')
    expect(data).toMatchObject({ scene: 'login', redirectPath: '/' })
    expect(data.browserProof).toMatch(/^[0-9a-f]{64}$/)
    const secret = realStorage.getItem('oauth:secret:state-a') || ''
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(sha256Hex(secret)).toBe(data.browserProof)
    // 原文不出现在发起请求里
    expect(JSON.stringify(mocks.post.mock.calls[0][0])).not.toContain(secret)
  })

  it('对象响应取 state 字段（内嵌扫码类），也认 url / authUrl；每次发起的密钥不同、互不覆盖', async () => {
    mocks.post
      .mockResolvedValueOnce({ success: true, data: { appId: 'app', state: 'state-open' } })
      .mockResolvedValueOnce({ success: true, data: { url: `${AUTH_URL}-2` } })
      .mockResolvedValueOnce({
        success: true,
        data: 'https://mp.example.com/connect/authorize?appid=app&state=state-mp#app_redirect',
      })
    await fetchOAuthUrlAPI('demo_qr')
    await fetchOAuthUrlAPI('demo_oauth')
    await fetchOAuthUrlAPI('demo_mp')

    expect(secretKeys().sort()).toEqual([
      'oauth:secret:state-a-2',
      'oauth:secret:state-mp',
      'oauth:secret:state-open',
    ])
    const proofs = mocks.post.mock.calls.map(call => call[0].data.browserProof)
    expect(new Set(proofs).size).toBe(3)
  })

  it('响应里取不到 state：提示失败并抛出（已提示），不留密钥', async () => {
    mocks.post.mockResolvedValueOnce({
      success: true,
      data: 'https://sso.example.com/oauth/authorize',
    })
    await expect(fetchOAuthUrlAPI('demo_oauth')).rejects.toMatchObject({ notified: true })
    expect(mocks.error).toHaveBeenCalledWith(t('login.oauthFailed'))
    expect(secretKeys()).toEqual([])
  })

  it('浏览器禁用存储（取存储即抛错，或写入抛错）：提示原因并抛出，不发请求', async () => {
    replaceStorage(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    await expect(fetchOAuthUrlAPI('demo_oauth')).rejects.toMatchObject({
      message: t('login.oauthStorageUnavailable'),
      notified: true,
    })

    replaceStorage(memoryStorage(op => op === 'set').storage)
    await expect(fetchOAuthUrlAPI('demo_oauth')).rejects.toMatchObject({ notified: true })

    expect(mocks.error.mock.calls).toEqual([
      [t('login.oauthStorageUnavailable')],
      [t('login.oauthStorageUnavailable')],
    ])
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('请求回来后写入失败（如存储已满）：提示并抛出，调用方不会跳转', async () => {
    const fake = memoryStorage((op, key) => op === 'set' && key === 'oauth:secret:state-a')
    replaceStorage(fake.storage)
    mocks.post.mockResolvedValueOnce({ success: true, data: AUTH_URL })
    await expect(fetchOAuthUrlAPI('demo_oauth')).rejects.toMatchObject({ notified: true })
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.error).toHaveBeenCalledWith(t('login.oauthStorageUnavailable'))
    expect([...fake.data.keys()]).toEqual([])
  })

  it('服务端返回失败：原样交给调用方，不存密钥', async () => {
    mocks.post.mockResolvedValueOnce({ success: false, data: null, message: 'no' })
    await expect(fetchOAuthUrlAPI('demo_oauth')).resolves.toMatchObject({ success: false })
    expect(secretKeys()).toEqual([])
    expect(mocks.error).not.toHaveBeenCalled()
  })
})

describe('第三方登录回调：取出密钥', () => {
  it('按回调的 state 取出密钥随请求发出并删除，只用一次；其他 state 的密钥不受影响', async () => {
    realStorage.setItem('oauth:secret:s1', 'secret-one')
    realStorage.setItem('oauth:secret:s2', 'secret-two')
    mocks.post.mockResolvedValue({ success: true, data: 'token' })

    await fetchOAuthCallbackAPI('demo_oauth', { code: 'c1', state: 's1' })
    expect(mocks.post.mock.calls[0][0]).toMatchObject({
      url: '/auth/oauth/demo_oauth/callback',
      data: { code: 'c1', state: 's1', browserSecret: 'secret-one' },
    })
    expect(realStorage.getItem('oauth:secret:s1')).toBeNull()
    expect(realStorage.getItem('oauth:secret:s2')).toBe('secret-two')

    // 同一个回调地址再打开一次：没有密钥了，交给服务端拒绝
    await fetchOAuthCallbackAPI('demo_oauth', { code: 'c1', state: 's1' })
    expect(mocks.post.mock.calls[1][0].data.browserSecret).toBe('')
  })

  it('请求失败时密钥也已删除；读取或删除抛错不影响发出请求', async () => {
    realStorage.setItem('oauth:secret:s3', 'secret-three')
    mocks.post.mockRejectedValueOnce(new Error('network'))
    await expect(fetchOAuthCallbackAPI('demo_oauth', { code: 'c', state: 's3' })).rejects.toThrow(
      'network'
    )
    expect(realStorage.getItem('oauth:secret:s3')).toBeNull()

    const removeFails = memoryStorage(op => op === 'remove')
    removeFails.data.set('oauth:secret:s4', 'secret-four')
    replaceStorage(removeFails.storage)
    mocks.post.mockResolvedValue({ success: true, data: 'token' })
    await fetchOAuthCallbackAPI('demo_oauth', { code: 'c', state: 's4' })
    expect(mocks.post.mock.calls[1][0].data.browserSecret).toBe('secret-four')

    const readFails = memoryStorage(op => op === 'get')
    readFails.data.set('oauth:secret:s5', 'secret-five')
    replaceStorage(readFails.storage)
    await fetchOAuthCallbackAPI('demo_oauth', { code: 'c', state: 's5' })
    expect(mocks.post.mock.calls[2][0].data.browserSecret).toBe('')
    expect(readFails.data.has('oauth:secret:s5')).toBe(false)

    replaceStorage(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    await fetchOAuthCallbackAPI('demo_oauth', { code: 'c', state: 's6' })
    expect(mocks.post.mock.calls[3][0].data.browserSecret).toBe('')
  })
})

describe('oauthStateOf', () => {
  it('解析各种授权响应里的 state', () => {
    expect(oauthStateOf('/oauth/authorize?state=relative')).toBe('relative')
    expect(oauthStateOf({ authUrl: 'https://example.com/a?state=from-auth-url' })).toBe(
      'from-auth-url'
    )
    expect(oauthStateOf({ state: 7 })).toBe('')
    expect(oauthStateOf(null)).toBe('')
    expect(oauthStateOf('http://[bad')).toBe('')
  })
})
