import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@/locales'

// 真实的 api/user（标签页密钥逻辑），只替换请求层与提示
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  error: vi.fn(),
  auth: { isLogin: false, beginLogin: vi.fn() },
}))

vi.mock('@/utils/request', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/request')>()),
  post: mocks.post,
}))
vi.mock('@/utils/message', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/message')>()),
  message: () => ({ error: mocks.error }),
}))
vi.mock('@/utils/router', () => ({ default: { replace: vi.fn(async () => undefined) } }))
vi.mock('@/store/modules/auth', () => ({ useAuthStore: () => mocks.auth }))

import { runWechatSilentLogin } from './silentLogin'

const realStorage = window.sessionStorage

beforeEach(() => {
  mocks.post.mockReset()
  mocks.error.mockReset()
})

afterEach(() => {
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => realStorage })
  realStorage.clear()
  vi.restoreAllMocks()
})

describe('微信内静默登录：本地存储被禁用', () => {
  it('提示原因（静默入口吞掉异常也能看到），不请求授权地址、不跳转', async () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined)

    await expect(runWechatSilentLogin()).resolves.toBeUndefined()

    expect(mocks.error).toHaveBeenCalledWith(t('login.oauthStorageUnavailable'))
    expect(mocks.post).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('存储正常时按授权地址跳转，密钥按 state 存在本标签页', async () => {
    const authUrl =
      'https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx&state=state-mp#wechat_redirect'
    mocks.post.mockResolvedValueOnce({ success: true, data: authUrl })
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined)

    await runWechatSilentLogin()

    expect(replace).toHaveBeenCalledWith(authUrl)
    expect(realStorage.getItem('oauth:secret:state-mp')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
