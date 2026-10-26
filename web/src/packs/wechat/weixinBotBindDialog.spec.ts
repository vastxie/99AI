import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import WeixinBotBindDialog from './WeixinBotBindDialog.vue'

const scan = vi.hoisted(() => ({ onBound: (() => undefined) as () => void }))

vi.mock('./useWeixinBotScan', async () => {
  const { ref } = await import('vue')
  return {
    useWeixinBotScan: (options: { onBound: () => void }) => {
      scan.onBound = options.onBound
      return { qrUrl: ref(''), phase: ref('waiting'), message: ref(''), refresh: vi.fn() }
    },
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('微信 Bot 绑定弹窗', () => {
  it('绑定成功后一秒内被关掉：照样通知成功一次，留下的定时器不会关掉下一次打开的弹窗', async () => {
    const wrapper = mount(WeixinBotBindDialog, {
      props: { modelValue: true },
      global: { plugins: [i18n], stubs: { Teleport: true, transition: false } },
    })
    scan.onBound()
    await wrapper.setProps({ modelValue: false })
    expect(wrapper.emitted('success')).toHaveLength(1)

    await wrapper.setProps({ modelValue: true })
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.emitted('success')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
