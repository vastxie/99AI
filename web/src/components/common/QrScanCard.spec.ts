import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/locales'
import QrScanCard from './QrScanCard.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('二维码卡片', () => {
  it('过期或失败时盖一个刷新键；点下去焦点落到卡片上（刷新键随即换成转圈），不掉回页面开头', async () => {
    const wrapper = mount(QrScanCard, {
      attachTo: document.body,
      props: { qrUrl: 'https://qr.example.com/1.png', phase: 'failed', hint: '扫码登录' },
      global: { plugins: [i18n] },
    })
    // 失败没有原因时不说「已过期」
    expect(wrapper.get('[role="status"]').text()).toBe(i18n.global.t('login.qrFailedRefresh'))
    const refresh = wrapper.get(`button[aria-label="${i18n.global.t('login.qrRefresh')}"]`)
    await refresh.trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.element)
    wrapper.unmount()
  })
})
