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
import PasswordForm from './PasswordForm.vue'

const api = vi.hoisted(() => ({
  sendCode: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@/api/user', () => ({
  fetchCaptchaSendCodeAPI: api.sendCode,
  fetchCaptchaVerifyResetAPI: vi.fn(),
  fetchRegisterAPI: api.register,
  fetchResetPasswordAPI: vi.fn(),
}))
vi.mock('@/api', () => ({ fetchLoginAPI: api.login }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

let wrapper: VueWrapper | undefined

function mountForm(mode: 'login' | 'register' = 'login') {
  wrapper = mount(PasswordForm, {
    attachTo: document.body,
    props: {
      mode,
      registerEnabled: false,
      captchaProviders: [
        { provider: 'email', displayName: 'Email', type: 'captcha', contactField: 'email' },
      ],
    },
    global: { plugins: [i18n] },
  })
  return wrapper
}

async function openForgot(form: VueWrapper) {
  const link = form
    .findAll('button')
    .find(button => button.text() === i18n.global.t('login.forgotPasswordLink'))
  expect(link, '忘记密码入口').toBeTruthy()
  await link!.trigger('click')
}

const verifyHeading = () => i18n.global.t('login.verifyIdentity')

beforeEach(() => {
  vi.useFakeTimers()
  clearUserToken()
  setActivePinia(createPinia())
  api.sendCode.mockReset().mockResolvedValue({ success: true, data: '' })
  api.login.mockReset()
  api.register.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('找回密码', () => {
  it('从验证页返回、联系方式没改：「下一步」直接回到填码，不重发', async () => {
    const form = mountForm()
    await openForgot(form)
    await form.get('input').setValue('user@example.com')
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.sendCode).toHaveBeenCalledTimes(1)
    expect(form.text()).toContain(verifyHeading())

    const back = form.findAll('button').find(b => b.text() === i18n.global.t('common.back'))
    await back!.trigger('click')
    expect(form.text()).not.toContain(verifyHeading())
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.sendCode).toHaveBeenCalledTimes(1)
    expect(form.text()).toContain(verifyHeading())
  })

  it('返回改了联系方式：倒计时内也重新发码给新的联系方式', async () => {
    const form = mountForm()
    await openForgot(form)
    await form.get('input').setValue('wrong@example.com')
    await form.get('form').trigger('submit')
    await flushPromises()

    const back = form.findAll('button').find(b => b.text() === i18n.global.t('common.back'))
    await back!.trigger('click')
    await form.get('input').setValue('right@example.com')
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.sendCode).toHaveBeenCalledTimes(2)
    expect(api.sendCode).toHaveBeenLastCalledWith(
      { contact: 'right@example.com', scene: 'reset' },
      { silentError: true }
    )
    expect(form.text()).toContain('right@example.com')
  })

  it('联系方式输入框不再监听按键：回车交给表单提交，输入法用回车上屏不会触发发码', async () => {
    const form = mountForm()
    await openForgot(form)
    const input = form.get('input')
    await input.setValue('user@example.com')
    await input.trigger('keyup', { key: 'Enter' })
    await flushPromises()
    expect(api.sendCode).not.toHaveBeenCalled()
  })
})

describe('登录与注册的就地提示', () => {
  it('密码不够长：在密码下方说明规则，不发请求', async () => {
    const form = mountForm()
    const [account, password] = form.findAll('input')
    await account.setValue('alice')
    await password.setValue('123')
    await form.get('form').trigger('submit')
    expect(api.login).not.toHaveBeenCalled()
    expect(password.attributes('aria-invalid')).toBe('true')
    expect(form.get('.ds-form-error').text()).toBe('密码长度需为 6-30 个字符')
    // 焦点移到出错的字段：读屏读出它的错误说明，同样的错误再提交一次也会再读到
    await flushPromises()
    expect(document.activeElement).toBe(password.element)
  })

  it('注册：用户名不合规时错误替换说明（同一句规则不显示两行），规则的位数来自账号规则', async () => {
    const form = mountForm('register')
    const username = form.findAll('input')[0]
    const field = username.element.closest('.ds-form-field')!
    expect(field.querySelectorAll('.ds-form-helper')).toHaveLength(1)
    expect(field.textContent).toContain('用户名 2-12 位')
    await username.setValue('a')
    await form.get('form').trigger('submit')
    expect(field.querySelectorAll('.ds-form-helper')).toHaveLength(1)
    expect(field.querySelector('.ds-form-error')?.textContent).toContain('用户名 2-12 位')
    await flushPromises()
    expect(document.activeElement).toBe(username.element)
  })

  it('服务端拒绝（如密码错误）：原因显示在表单里，不只靠 toast', async () => {
    api.login.mockRejectedValue(new Error('用户名或密码错误'))
    const form = mountForm()
    const [account, password] = form.findAll('input')
    await account.setValue('alice')
    await password.setValue('wrong-password')
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(api.login).toHaveBeenCalledWith(
      { username: 'alice', password: 'wrong-password' },
      { silentError: true }
    )
    expect(form.get('[role="alert"]').text()).toBe('用户名或密码错误')
  })

  it('注册：两次密码不一致时提示在确认框下方', async () => {
    const form = mountForm('register')
    const [username, , password, confirm] = form.findAll('input')
    await username.setValue('alice')
    await password.setValue('secret-1')
    await confirm.setValue('secret-2')
    await form.get('form').trigger('submit')
    expect(api.register).not.toHaveBeenCalled()
    expect(confirm.attributes('aria-invalid')).toBe('true')
    expect(form.text()).toContain('两次输入的密码不一致')
  })
})

describe('登录期间身份变化', () => {
  async function fillLogin(form: VueWrapper) {
    const [account, password] = form.findAll('input')
    await account.setValue('alice')
    await password.setValue('secret-password')
  }

  it('登录请求在途时别的入口已经登录：丢弃这次结果，不发 loginSuccess、不换掉别人的令牌', async () => {
    let finish: (value: unknown) => void = () => undefined
    api.login.mockImplementation(() => new Promise(resolve => (finish = resolve)))
    const form = mountForm()
    await fillLogin(form)
    await form.get('form').trigger('submit')
    setUserToken('someone-else')
    finish({ success: true, data: 'my-token' })
    await flushPromises()
    expect(form.emitted('loginSuccess')).toBeUndefined()
    expect(currentUserToken()).toBe('someone-else')
    expect(form.find('[role="alert"]').exists()).toBe(false)
  })

  it('注册同理：注册成功的结果在身份变化后不写入', async () => {
    let finish: (value: unknown) => void = () => undefined
    api.register.mockImplementation(() => new Promise(resolve => (finish = resolve)))
    const form = mountForm('register')
    const [username, , password, confirm] = form.findAll('input')
    await username.setValue('alice')
    await password.setValue('secret-password')
    await confirm.setValue('secret-password')
    await form.get('form').trigger('submit')
    setUserToken('someone-else')
    finish({ success: true, data: 'my-token' })
    await flushPromises()
    expect(form.emitted('loginSuccess')).toBeUndefined()
    expect(currentUserToken()).toBe('someone-else')
  })

  it('请求层报「身份已变化」：不显示错误，加载状态照常结束', async () => {
    api.login.mockRejectedValue(new IdentityChangedError())
    const form = mountForm()
    await fillLogin(form)
    await form.get('form').trigger('submit')
    await flushPromises()
    expect(form.find('[role="alert"]').exists()).toBe(false)
    expect(form.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
