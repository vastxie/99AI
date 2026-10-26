import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import Welcome from './index.vue'

vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

function mountAt(hour: number) {
  vi.setSystemTime(new Date(2026, 8, 28, hour, 30))
  return mount(Welcome, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  i18n.global.locale.value = 'zh-CN'
})

describe('首页问候', () => {
  it('后台没配站点名：只问候，不留「欢迎使用」半句', () => {
    useAuthStore().globalConfig = { ...useAuthStore().globalConfig, siteName: '' }
    const wrapper = mountAt(9)
    expect(wrapper.get('h1').text()).toBe('早上好')
  })

  it('英文界面 11 点到 13 点用中性的问候（不是 Good afternoon）', () => {
    i18n.global.locale.value = 'en-US'
    useAuthStore().globalConfig = { ...useAuthStore().globalConfig, siteName: '99Agent' }
    const wrapper = mountAt(11)
    expect(wrapper.get('h1').text()).toBe('Hello. Welcome to 99Agent')
  })
})
