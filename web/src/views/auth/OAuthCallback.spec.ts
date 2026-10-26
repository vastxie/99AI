import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import OAuthCallback from './OAuthCallback.vue'
import { saveOAuthRedirectPath } from './oauthRedirect'
import {
  clearUserToken,
  currentUserToken,
  IdentityChangedError,
  setUserToken,
} from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'

const nav = vi.hoisted(() => ({ replace: vi.fn() }))
const api = vi.hoisted(() => ({ callback: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { provider: 'example' },
    query: { code: 'code-1', state: 'state-1' },
  }),
  useRouter: () => ({
    replace: nav.replace,
    resolve: (path: string) => {
      const url = new URL(path, window.location.origin)
      return { path: url.pathname, query: Object.fromEntries(url.searchParams), hash: url.hash }
    },
  }),
}))
vi.mock('@/api/user', () => ({ fetchOAuthCallbackAPI: api.callback }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

const CONVERSATION = '/c/g_aaaaaaaaaaaaaaaaaaaaaaaa'
let wrapper: VueWrapper | undefined

async function failCallback() {
  api.callback.mockResolvedValue({ success: false, message: '授权失败' })
  wrapper = mount(OAuthCallback, { global: { plugins: [i18n] } })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('授权失败')
  return wrapper.findAll('button')
}

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  window.sessionStorage.clear()
  nav.replace.mockReset()
  api.callback.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('第三方登录失败页', () => {
  it('没登录：可以回到发起登录的会话，或回到那里重新打开登录框', async () => {
    saveOAuthRedirectPath(`${CONVERSATION}#login`)
    const [back, loginAgain] = await failCallback()
    expect(back.text()).toBe(i18n.global.t('common.back'))
    await back.trigger('click')
    expect(nav.replace).toHaveBeenLastCalledWith(CONVERSATION)
    await loginAgain.trigger('click')
    expect(nav.replace).toHaveBeenLastCalledWith({ path: CONVERSATION, query: {}, hash: '#login' })
  })

  it('绑定失败（仍是登录状态）：只给返回，回到发起绑定的设置页', async () => {
    setUserToken('fixture-session')
    saveOAuthRedirectPath(`${CONVERSATION}#settings/account`)
    const buttons = await failCallback()
    expect(buttons).toHaveLength(1)
    await buttons[0].trigger('click')
    expect(nav.replace).toHaveBeenLastCalledWith(`${CONVERSATION}#settings/account`)
  })

  it('没有记录发起页时回首页', async () => {
    const [back] = await failCallback()
    expect(back.text()).toBe(i18n.global.t('login.backToHome'))
    await back.trigger('click')
    expect(nav.replace).toHaveBeenLastCalledWith('/')
  })
})

describe('回调期间身份变化', () => {
  it('回调请求在途时别的入口已经登录：不写入令牌，停在「登录状态已变化」并可返回，不跳转', async () => {
    let finish: (value: unknown) => void = () => undefined
    api.callback.mockImplementation(() => new Promise(resolve => (finish = resolve)))
    wrapper = mount(OAuthCallback, { global: { plugins: [i18n] } })
    await flushPromises()
    setUserToken('someone-else')
    finish({ success: true, data: 'token-from-callback' })
    await flushPromises()
    expect(currentUserToken()).toBe('someone-else')
    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('login.identityChanged'))
    expect(nav.replace).not.toHaveBeenCalled()
    expect(wrapper.findAll('button').length).toBeGreaterThan(0)
  })

  it('登录后资料随即因身份变化作废：同样停在结束状态，不关登录框、不按成功跳转', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'getUserInfo').mockRejectedValue(new IdentityChangedError())
    auth.setLoginDialog(true)
    api.callback.mockResolvedValue({ success: true, data: 'token-from-callback' })
    wrapper = mount(OAuthCallback, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('login.identityChanged'))
    expect(auth.loginDialog).toBe(true)
    expect(nav.replace).not.toHaveBeenCalled()
  })
})
