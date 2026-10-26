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
import { useAuthStore } from '@/store/modules/auth'
import QrLoginPanel from './QrLoginPanel.vue'

const api = vi.hoisted(() => ({ scene: vi.fn(), poll: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/api/user', () => ({ fetchQrSceneAPI: api.scene, fetchQrPollAPI: api.poll }))
vi.mock('@/utils/message', () => ({ message: () => toasts }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
  clearUserToken()
  setActivePinia(createPinia())
  toasts.success.mockReset()
  api.scene.mockReset().mockResolvedValue({
    success: true,
    data: { sceneId: 'scene-1', qrUrl: 'https://qr.example.com/1.png', expiresIn: 60 },
  })
  api.poll.mockReset().mockResolvedValue({ success: true, data: { status: 'pending' } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

async function mountAndConfirm() {
  wrapper = mount(QrLoginPanel, {
    props: { provider: 'example', displayName: 'Example', active: true },
    global: { plugins: [i18n] },
  })
  await flushPromises()
  api.poll.mockResolvedValue({ success: true, data: { status: 'confirmed', token: 'qr-token' } })
  return wrapper
}

describe('扫码登录面板', () => {
  it('扫码确认：用取码时的身份提交登录，资料取到才提示成功并通知', async () => {
    const getUserInfo = vi.spyOn(useAuthStore(), 'getUserInfo').mockResolvedValue({})
    const panel = await mountAndConfirm()
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(currentUserToken()).toBe('qr-token')
    expect(getUserInfo).toHaveBeenCalledTimes(1)
    expect(toasts.success).toHaveBeenCalledTimes(1)
    expect(panel.emitted('loginSuccess')).toHaveLength(1)
  })

  it('登录后资料随即因身份变化作废：不提示成功、不通知，二维码显示已过期', async () => {
    vi.spyOn(useAuthStore(), 'getUserInfo').mockRejectedValue(new IdentityChangedError())
    const panel = await mountAndConfirm()
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(toasts.success).not.toHaveBeenCalled()
    expect(panel.emitted('loginSuccess')).toBeUndefined()
  })

  it('取码之后别的入口已经登录：这次扫码确认不写入令牌、不通知', async () => {
    const panel = await mountAndConfirm()
    setUserToken('someone-else')
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(currentUserToken()).toBe('someone-else')
    expect(panel.emitted('loginSuccess')).toBeUndefined()
    expect(toasts.success).not.toHaveBeenCalled()
  })
})
