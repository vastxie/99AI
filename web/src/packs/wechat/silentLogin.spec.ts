import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(async (_to: string) => undefined),
  callback: vi.fn(),
  auth: {
    isLogin: false,
    setToken: vi.fn(),
    getUserInfo: vi.fn(),
    setLoginDialog: vi.fn(),
    beginLogin: vi.fn(() => ({
      commit: vi.fn((_token: string): boolean => true),
      isCurrent: (): boolean => true,
      epoch: 0,
    })),
  },
}))

vi.mock('@/utils/router', () => ({ default: { replace: mocks.replace } }))
vi.mock('@/store/modules/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/api/user', () => ({
  fetchOAuthCallbackAPI: mocks.callback,
  fetchOAuthUrlAPI: vi.fn(),
}))

import { runWechatSilentLogin } from './silentLogin'

const nativeReplaceState = History.prototype.replaceState

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  nativeReplaceState.call(window.history, null, '', '/')
})

describe('微信内静默登录', () => {
  it('带 code 回来但换取失败：经路由去掉 code 与 state（其余参数与 hash 保留），不清空历史状态', async () => {
    nativeReplaceState.call(
      window.history,
      { position: 3 },
      '',
      '/c/g_abc?code=c1&state=s1&from=wx#settings'
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')
    mocks.callback.mockRejectedValueOnce(new Error('code 已失效'))
    await runWechatSilentLogin()
    expect(mocks.replace).toHaveBeenCalledWith('/c/g_abc?from=wx#settings')
    expect(replaceState).not.toHaveBeenCalled()
    expect(mocks.auth.setToken).not.toHaveBeenCalled()
  })

  it('换取请求在途期间别的入口已经登录：不写入令牌、不取资料、不跳到回跳地址', async () => {
    nativeReplaceState.call(window.history, null, '', '/?code=c2&state=s2')
    mocks.auth.beginLogin.mockReturnValueOnce({
      commit: vi.fn(() => false),
      isCurrent: () => false,
      epoch: 0,
    })
    mocks.callback.mockResolvedValueOnce({ success: true, data: 'token-from-wechat' })
    await runWechatSilentLogin()
    expect(mocks.auth.getUserInfo).not.toHaveBeenCalled()
    expect(mocks.auth.setLoginDialog).not.toHaveBeenCalled()
    // 只有清理授权参数那一次地址替换，没有按成功跳到回跳地址
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })
})
