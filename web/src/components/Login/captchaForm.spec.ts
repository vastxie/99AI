import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import {
  clearUserToken,
  currentUserToken,
  IdentityChangedError,
  setUserToken,
} from '@/services/identity'
import CaptchaForm from './CaptchaForm.vue'

const api = vi.hoisted(() => ({ login: vi.fn(), sendCode: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/api/user', () => ({
  fetchCaptchaLoginAPI: api.login,
  fetchCaptchaSendCodeAPI: api.sendCode,
}))
vi.mock('@/utils/message', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/message')>()),
  message: () => toasts,
}))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  api.login.mockReset()
  toasts.success.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function submitWithCode() {
  wrapper = mount(CaptchaForm, {
    props: {
      captchaProviders: [
        { provider: 'email', displayName: 'Email', type: 'captcha', contactField: 'email' },
      ],
    },
    global: { plugins: [i18n] },
  })
  const [contact, code] = wrapper.findAll('input')
  await contact.setValue('user@example.com')
  await code.setValue('123456')
  await wrapper.get('form').trigger('submit')
  return wrapper
}

describe('验证码登录期间身份变化', () => {
  it('登录请求在途时别的入口已经登录：丢弃这次结果，不提示成功、不发 loginSuccess', async () => {
    let finish: (value: unknown) => void = () => undefined
    api.login.mockImplementation(() => new Promise(resolve => (finish = resolve)))
    const form = await submitWithCode()
    setUserToken('someone-else')
    finish({ success: true, data: 'my-token' })
    await flushPromises()
    expect(currentUserToken()).toBe('someone-else')
    expect(toasts.success).not.toHaveBeenCalled()
    expect(form.emitted('loginSuccess')).toBeUndefined()
  })

  it('请求层报「身份已变化」：不显示错误', async () => {
    api.login.mockRejectedValue(new IdentityChangedError())
    const form = await submitWithCode()
    await flushPromises()
    expect(form.find('[role="alert"]').exists()).toBe(false)
  })
})
