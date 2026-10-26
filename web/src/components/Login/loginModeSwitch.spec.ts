import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import Login from './Login.vue'

vi.mock('@/api/user', () => ({
  fetchAuthProvidersAPI: vi.fn(async () => ({
    success: true,
    data: [
      { provider: 'password', displayName: '密码', type: 'password' },
      { provider: 'email', displayName: 'Email', type: 'captcha', contactField: 'email' },
    ],
  })),
  fetchOAuthUrlAPI: vi.fn(),
  fetchCaptchaLoginAPI: vi.fn(),
  fetchCaptchaSendCodeAPI: vi.fn(),
  fetchCaptchaVerifyResetAPI: vi.fn(),
  fetchRegisterAPI: vi.fn(),
  fetchResetPasswordAPI: vi.fn(),
}))
vi.mock('@/api', () => ({ fetchLoginAPI: vi.fn() }))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('登录框切换登录方式', () => {
  it('验证码登录 ↔ 密码登录：整块表单换掉后焦点落到新表单的第一个输入框', async () => {
    wrapper = mount(Login, {
      attachTo: document.body,
      props: { visible: false },
      global: { plugins: [i18n], stubs: { transition: false } },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const toPassword = wrapper.get(`button[aria-label="${i18n.global.t('login.passwordLogin')}"]`)
    await toPassword.trigger('click')
    await flushPromises()
    const firstInput = wrapper.get('form input')
    expect(firstInput.attributes('autocomplete')).toBe('username')
    expect(document.activeElement).toBe(firstInput.element)

    await wrapper
      .get(`button[aria-label="${i18n.global.t('login.captchaLogin')}"]`)
      .trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('form input').element)
  })
})
