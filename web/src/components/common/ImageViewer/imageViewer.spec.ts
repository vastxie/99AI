import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import ImageViewer from './index.vue'

vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('图片预览', () => {
  it('是一个弹窗：打开时焦点移进来，Esc 关闭，关闭后焦点回到打开它的按钮', async () => {
    const trigger = document.body.appendChild(document.createElement('button'))
    trigger.focus()
    wrapper = mount(ImageViewer, {
      attachTo: document.body,
      props: { visible: false, imageUrl: 'https://cdn.example.com/a.png' },
      global: { plugins: [i18n], stubs: { transition: false } },
    })
    await wrapper.setProps({ visible: true })
    await nextTick()
    await nextTick()
    const dialog = document.querySelector<HTMLElement>('.image-viewer')!
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ visible: false })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })
})
