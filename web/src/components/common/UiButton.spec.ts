import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import UiButton from './UiButton.vue'

describe('UiButton 统一按钮', () => {
  it('下拉选择器复用 ghost 状态并固定为无缩放的轻量触发器', async () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'select' },
      attrs: { 'aria-expanded': true, 'aria-haspopup': 'menu' },
    })
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['btn-ghost', 'ui-button-select', 'ui-button-no-scale'])
    )
    expect(wrapper.classes()).not.toContain('btn-secondary')
    expect(wrapper.attributes('aria-expanded')).toBe('true')
    await wrapper.setProps({ variant: 'secondary' })
    expect(wrapper.classes()).not.toContain('ui-button-select')
    expect(wrapper.classes()).not.toContain('ui-button-no-scale')
    expect(wrapper.classes()).toContain('btn-secondary')
    wrapper.unmount()
  })

  it('精确操作可统一关闭悬停与按压缩放，其他按钮保持默认反馈', async () => {
    const wrapper = mount(UiButton, { props: { pill: true, scale: false } })
    expect(wrapper.classes()).toContain('ui-button-no-scale')
    expect(wrapper.attributes('scale')).toBeUndefined()
    await wrapper.setProps({ scale: true })
    expect(wrapper.classes()).not.toContain('ui-button-no-scale')
    wrapper.unmount()
  })

  it('切换主次状态时只保留一个视觉变体', async () => {
    const wrapper = mount(UiButton, { props: { variant: 'primary' } })
    const variants = () =>
      wrapper.classes().filter(name => /^btn-(primary|secondary|ghost|danger)$/.test(name))
    expect(variants()).toEqual(['btn-primary'])
    await wrapper.setProps({ variant: 'secondary' })
    expect(variants()).toEqual(['btn-secondary'])
    wrapper.unmount()
  })

  it('保持原生按钮、ARIA 与事件属性透传，不创建额外容器', async () => {
    const click = vi.fn()
    const wrapper = mount(UiButton, {
      props: { variant: 'secondary', icon: true, pill: true },
      attrs: { 'aria-label': '打开菜单', 'aria-expanded': true, onClick: click },
      slots: { default: () => h('svg') },
    })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('aria-expanded')).toBe('true')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['ui-button-icon', 'ui-button-pill']))
    await wrapper.trigger('click')
    expect(click).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('显式保留 submit 与 disabled，不让禁用操作触发 handler', async () => {
    const click = vi.fn()
    const wrapper = mount(UiButton, {
      props: { type: 'submit', disabled: true },
      attrs: { onClick: click },
    })
    expect(wrapper.attributes('type')).toBe('submit')
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true)
    ;(wrapper.element as HTMLButtonElement).click()
    expect(click).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
