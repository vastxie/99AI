import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import SignInDialog from './SignInDialog.vue'
import zhCN from './locales/zh-CN.json'
import { useCommerceStore } from './store'
import { clearUserToken, setUserToken } from '@/services/identity'

// 扩展包的语言片段在应用安装时合并（installI18n）；用例里单独合并
i18n.global.mergeLocaleMessage('zh-CN', zhCN as any)

const api = vi.hoisted(() => ({ log: vi.fn(), status: vi.fn(), signIn: vi.fn() }))
vi.mock('./api/signin', () => ({
  fetchSignLogAPI: api.log,
  fetchSignInStatusAPI: api.status,
  fetchSignInAPI: api.signIn,
}))
vi.mock('@/utils/message', () => ({
  message: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

let wrapper: VueWrapper | undefined

function monthLog(year: number, month: number, signed: string[]) {
  const days = new Date(year, month, 0).getDate()
  return Array.from({ length: days }, (_, index) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
    return { signInDate: date, isSigned: signed.includes(date) }
  })
}

function render() {
  wrapper = mount(SignInDialog, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { teleport: true } },
  })
  return wrapper
}

const signButton = () => wrapper!.get<HTMLButtonElement>('button.w-full')

beforeEach(() => {
  clearUserToken()
  vi.useFakeTimers()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  setUserToken('user-token')
  auth.userInfo = { id: 7, role: 'viewer' } as any
  auth.globalConfig = { signInStatus: '1', signInCredits: '5' } as any
  useCommerceStore().updateSignInDialog(true)
  api.log.mockReset()
  api.status.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('签到弹窗跨天', () => {
  it('打开期间跨过午夜：重新拉取，昨天已签、今天未签时按钮恢复可点', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 30))
    api.log.mockResolvedValueOnce({ data: monthLog(2026, 10, ['2026-10-14']) })
    api.status.mockResolvedValueOnce({ data: { signedToday: true, consecutiveDays: 3 } })
    render()
    await flushPromises()
    expect(signButton().element.disabled).toBe(true)

    api.log.mockResolvedValueOnce({ data: monthLog(2026, 10, ['2026-10-14']) })
    api.status.mockResolvedValueOnce({ data: { signedToday: false, consecutiveDays: 3 } })
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    expect(api.status).toHaveBeenCalledTimes(2)
    expect(signButton().element.disabled).toBe(false)
    expect(wrapper!.get('[aria-current="date"]').text()).toBe('15')
  })

  it('跨月：月份标题与日期都换成新月份；前一天发出、晚到的结果不覆盖', async () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 30))
    let lateResolve: (value: unknown) => void = () => undefined
    api.log.mockImplementationOnce(() => new Promise(resolve => (lateResolve = resolve)))
    api.status.mockResolvedValue({ data: { signedToday: false, consecutiveDays: 0 } })
    render()
    await flushPromises()

    api.log.mockResolvedValueOnce({ data: monthLog(2026, 10, []) })
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    expect(wrapper!.text()).toMatch(/2026\s*年\s*10\s*月|October 2026/u)
    expect(wrapper!.get('[aria-current="date"]').text()).toBe('1')
    // 9 月那次请求现在才回来：不再落地
    lateResolve({ data: monthLog(2026, 9, ['2026-09-30']) })
    await flushPromises()
    expect(wrapper!.find('time[datetime="2026-09-30"]').exists()).toBe(false)
    expect(wrapper!.find('time[datetime="2026-10-31"]').exists()).toBe(true)
  })

  it('拉取失败可重试，不把旧状态当成今天的', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 10, 0, 0))
    api.log.mockRejectedValueOnce(new Error('offline'))
    api.status.mockRejectedValueOnce(new Error('offline'))
    render()
    await flushPromises()
    const alert = wrapper!.get('[role="alert"]')
    expect(alert.text()).toContain('签到信息没有加载出来')
    api.log.mockResolvedValueOnce({ data: monthLog(2026, 10, []) })
    api.status.mockResolvedValueOnce({ data: { signedToday: false, consecutiveDays: 0 } })
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(signButton().element.disabled).toBe(false)
  })

  it('关闭后停掉日期检查', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 10, 0, 0))
    api.log.mockResolvedValue({ data: monthLog(2026, 10, []) })
    api.status.mockResolvedValue({ data: { signedToday: false, consecutiveDays: 0 } })
    render()
    await flushPromises()
    useCommerceStore().updateSignInDialog(false)
    await flushPromises()
    vi.setSystemTime(new Date(2026, 9, 15, 10, 0, 0))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api.status).toHaveBeenCalledTimes(1)
  })

  it('签到请求还没回来时关掉并卸载：回来后只刷新账户，不再拉弹窗的记录', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 10, 0, 0))
    api.log.mockResolvedValue({ data: monthLog(2026, 10, []) })
    api.status.mockResolvedValue({ data: { signedToday: false, consecutiveDays: 0 } })
    let finish: (value: unknown) => void = () => undefined
    api.signIn.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    render()
    await flushPromises()
    const refresh = vi.spyOn(useCommerceStore(), 'refreshBilling').mockResolvedValue(undefined)
    await signButton().trigger('click')
    useCommerceStore().updateSignInDialog(false)
    wrapper!.unmount()
    wrapper = undefined
    const logCalls = api.log.mock.calls.length
    finish({ success: true })
    await flushPromises()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(api.log.mock.calls.length).toBe(logCalls)
  })
})
