import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import PersonalSettings from './PersonalSettings.vue'
import { clearUserToken, setUserToken } from '@/services/identity'

const api = vi.hoisted(() => ({ updateInfo: vi.fn() }))
vi.mock('@/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api')>()),
  fetchUpdateInfoAPI: api.updateInfo,
}))
vi.mock('@/utils/message', () => ({
  message: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  notifyError: vi.fn(),
}))

type Pending = { resolve: (instruction: string) => void; reject: (error: unknown) => void }
let pending: Pending[] = []
let wrapper: VueWrapper | undefined

function render(visible = true) {
  wrapper = mount(PersonalSettings, {
    attachTo: document.body,
    props: { visible },
    global: { plugins: [i18n] },
  })
  return wrapper
}

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  pending = []
  api.updateInfo.mockReset().mockResolvedValue({ success: true })
  const auth = useAuthStore()
  setUserToken('user-token')
  // 每次加载挂起，由用例决定何时、以什么结果返回
  vi.spyOn(auth, 'getUserInfo').mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        pending.push({
          resolve: instruction => {
            auth.userInfo = { ...auth.userInfo, customInstruction: instruction } as any
            resolve(undefined)
          },
          reject,
        })
      })
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('个人指令', () => {
  it('原值加载完之前不能编辑、保存或清空，加载失败可以重试', async () => {
    const view = render()
    await flushPromises()
    const textarea = view.get<HTMLTextAreaElement>('textarea')
    const [save, clear] = view.findAll<HTMLButtonElement>('button')
    expect(textarea.element.readOnly).toBe(true)
    expect(save.element.disabled).toBe(true)
    expect(clear.element.disabled).toBe(true)
    await save.trigger('click')
    expect(api.updateInfo).not.toHaveBeenCalled()

    pending[0].reject(new Error('offline'))
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('个人指令没有加载出来')
    expect(save.element.disabled).toBe(true)
    await view.get('[role="alert"] button').trigger('click')
    pending[1].resolve('回答简短')
    await flushPromises()
    expect(textarea.element.value).toBe('回答简短')
    expect(textarea.element.readOnly).toBe(false)
    expect(save.element.disabled).toBe(false)
  })

  it('关闭后重开：旧请求晚回来不覆盖新加载的内容，也不覆盖用户已经改过的内容', async () => {
    const view = render()
    await flushPromises()
    // 第一次打开的请求还没回来就关掉、再打开
    await view.setProps({ visible: false })
    await view.setProps({ visible: true })
    await flushPromises()
    pending[1].resolve('新的指令')
    await flushPromises()
    const textarea = view.get<HTMLTextAreaElement>('textarea')
    expect(textarea.element.value).toBe('新的指令')
    // 用户编辑后又改回原值，仍算改过
    await textarea.setValue('改了一下')
    await textarea.setValue('新的指令')
    pending[0].resolve('很早以前的指令')
    await flushPromises()
    expect(textarea.element.value).toBe('新的指令')
    // 旧请求也不改加载状态与错误
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(textarea.element.readOnly).toBe(false)
  })

  it('重开后旧请求先回来：不落地，仍在等新请求、不显示旧内容', async () => {
    const view = render()
    await flushPromises()
    await view.setProps({ visible: false })
    await view.setProps({ visible: true })
    await flushPromises()
    pending[0].resolve('上一次打开时的指令')
    await flushPromises()
    const textarea = view.get<HTMLTextAreaElement>('textarea')
    expect(textarea.element.value).toBe('')
    expect(textarea.element.readOnly).toBe(true)
    pending[1].resolve('这一次的指令')
    await flushPromises()
    expect(textarea.element.value).toBe('这一次的指令')
    expect(textarea.element.readOnly).toBe(false)
  })

  it('卸载后旧请求晚回来不报错、不再更新', async () => {
    const view = render()
    await flushPromises()
    view.unmount()
    wrapper = undefined
    pending[0].resolve('卸载后才到')
    await flushPromises()
    expect(api.updateInfo).not.toHaveBeenCalled()
  })
})
