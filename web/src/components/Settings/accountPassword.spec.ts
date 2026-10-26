import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import AccountManagement from './AccountManagement.vue'
import { clearUserToken, setUserToken } from '@/services/identity'

const api = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  updateInfo: vi.fn(),
}))
const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('@/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api')>()),
  fetchUpdatePasswordAPI: api.updatePassword,
  fetchUpdateInfoAPI: api.updateInfo,
  fetchGetInfo: vi.fn(async () => ({ data: { userInfo: { id: 7, role: 'viewer' } } })),
}))
vi.mock('./identity/useAuthIdentities', async () => {
  const { ref } = await import('vue')
  return { useAuthIdentities: () => ({ rows: ref([]), load: vi.fn(async () => undefined) }) }
})
vi.mock('@/utils/message', () => ({ message: () => toasts, notifyError: vi.fn() }))
vi.mock('@/services/socket-io', () => ({
  socketService: { disconnect: vi.fn(), connect: vi.fn(), on: vi.fn(() => () => undefined) },
}))
vi.mock('@/utils/fileAccessCookie', () => ({
  refreshFileAccessCookie: vi.fn(),
  registerFileAccessCredential: vi.fn(),
}))
vi.mock('@/api/config', () => ({ fetchQueryConfigAPI: vi.fn(async () => ({ data: {} })) }))
vi.mock('@/services/visitorSession', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/visitorSession')>()),
  ensureVisitorToken: vi.fn(async () => 'visitor-token'),
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  clearUserToken()
  localStorage.clear()
  setActivePinia(createPinia())
  Object.values(toasts).forEach(toast => toast.mockReset())
  api.updatePassword.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('修改密码', () => {
  it('成功后按登录过期收尾：令牌清掉、设置关闭、登录框打开，没发出去的草稿还在', async () => {
    const auth = useAuthStore()
    setUserToken('user-token')
    auth.userInfo = { id: 7, role: 'viewer', username: 'tester' } as any
    auth.loadInit = true
    const chatStore = useChatStore()
    chatStore.drafts = { g_aaaaaaaaaaaaaaaaaaaaaaaa: '写到一半的问题' }
    const globalStore = useGlobalStoreWithOut()
    globalStore.updateSettingsDialog(true)
    globalStore.updateAccountSettingsView('password')
    api.updatePassword.mockResolvedValue({ success: true })

    wrapper = mount(AccountManagement, {
      attachTo: document.body,
      props: { visible: true },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    const inputs = wrapper.findAll('input[type="password"]')
    expect(inputs).toHaveLength(3)
    await inputs[0].setValue('old-password-1')
    await inputs[1].setValue('new-password-1')
    await inputs[2].setValue('new-password-1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.updatePassword).toHaveBeenCalledTimes(1)
    expect(auth.token).toBeUndefined()
    expect(auth.loginDialog).toBe(true)
    expect(globalStore.settingsDialog).toBe(false)
    expect(toasts.success).toHaveBeenCalledWith('密码已修改，请用新密码重新登录')
    expect(chatStore.drafts).toEqual({ g_aaaaaaaaaaaaaaaaaaaaaaaa: '写到一半的问题' })
  })

  it('失败时留在改密页、显示原因，登录态不变', async () => {
    const auth = useAuthStore()
    setUserToken('user-token')
    auth.userInfo = { id: 7, role: 'viewer', username: 'tester' } as any
    const globalStore = useGlobalStoreWithOut()
    globalStore.updateAccountSettingsView('password')
    api.updatePassword.mockResolvedValue({ success: false, message: '原密码不正确' })

    wrapper = mount(AccountManagement, {
      attachTo: document.body,
      props: { visible: true },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('wrong-password')
    await inputs[1].setValue('new-password-1')
    await inputs[2].setValue('new-password-1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(auth.token).toBe('user-token')
    expect(wrapper.text()).toContain('原密码不正确')
  })
})
