import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { clearUserToken, currentUserToken, setUserToken } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import WechatOpenWebCallback from './WechatOpenWebCallback.vue'

const nav = vi.hoisted(() => ({ replace: vi.fn() }))
const api = vi.hoisted(() => ({ callback: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { code: 'code-1', state: 'state-1' } }),
  useRouter: () => ({ replace: nav.replace }),
}))
vi.mock('./api/wechatOpenWeb', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/wechatOpenWeb')>()),
  fetchWechatOpenWebOAuthCallbackAPI: api.callback,
}))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
  clearUserToken()
  setActivePinia(createPinia())
  nav.replace.mockReset()
  api.callback.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('微信开放平台登录回调', () => {
  it('回调请求在途时别的入口已经登录：不写入令牌，停在「登录状态已变化」并给返回按钮，不自动跳转、不弹登录框', async () => {
    let finish: (value: unknown) => void = () => undefined
    api.callback.mockImplementation(() => new Promise(resolve => (finish = resolve)))
    wrapper = mount(WechatOpenWebCallback, { global: { plugins: [i18n] } })
    await flushPromises()
    setUserToken('someone-else')
    finish({ success: true, data: { token: 'token-from-callback', redirectPath: '/' } })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(5000)
    expect(currentUserToken()).toBe('someone-else')
    expect(wrapper.text()).toContain(i18n.global.t('login.identityChanged'))
    expect(useAuthStore().loginDialog).toBe(false)
    expect(nav.replace).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    expect(nav.replace).toHaveBeenCalledWith('/')
  })
})
