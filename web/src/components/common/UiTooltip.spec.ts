import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import UiTooltip from './UiTooltip.vue'

const media = vi.hoisted(() => ({ hidden: { value: false } }))

vi.mock('./tooltip', async importOriginal => {
  const { ref } = await import('vue')
  const actual = await importOriginal<typeof import('./tooltip')>()
  const hidden = ref(false)
  media.hidden = hidden
  return { ...actual, useTooltipHidden: () => hidden }
})

afterEach(() => {
  media.hidden.value = false
})

describe('文字提示', () => {
  it('提示放在控件旁边，对读屏隐藏（控件自己带 aria-label）', () => {
    const wrapper = mount(UiTooltip, {
      props: { text: '关闭', placement: 'bottom' },
      slots: { default: () => h('button', { 'aria-label': '关闭' }, 'x') },
    })
    const tip = wrapper.get('.tooltip')
    expect(tip.text()).toBe('关闭')
    expect(tip.classes()).toContain('tooltip-bottom')
    expect(tip.attributes('aria-hidden')).toBe('true')
    expect(wrapper.classes()).toContain('group-btn')
  })

  it('指针点过控件后，指针离开或焦点移走之前不再出现', async () => {
    const wrapper = mount(UiTooltip, {
      props: { text: '发送' },
      slots: { default: () => h('button', 'send') },
    })
    await wrapper.get('button').trigger('click', { detail: 1 })
    expect(wrapper.find('.tooltip').exists()).toBe(false)
    await wrapper.trigger('pointerleave')
    expect(wrapper.find('.tooltip').exists()).toBe(true)

    await wrapper.get('button').trigger('click', { detail: 1 })
    await wrapper.get('button').trigger('focusout')
    expect(wrapper.find('.tooltip').exists()).toBe(true)
  })

  it('键盘（回车、空格）触发的点击不藏提示：键盘用户靠它看按钮的名字', async () => {
    const wrapper = mount(UiTooltip, {
      props: { text: '放大' },
      slots: { default: () => h('button', '+') },
    })
    await wrapper.get('button').trigger('click', { detail: 0 })
    expect(wrapper.find('.tooltip').exists()).toBe(true)
  })

  it('四个方位类都是字面量（拼接出来的类名在生产构建里会被清掉）', () => {
    for (const placement of ['top', 'bottom', 'left', 'right'] as const) {
      const wrapper = mount(UiTooltip, {
        props: { text: '提示', placement },
        slots: { default: () => h('button', 'x') },
      })
      expect(wrapper.get('.tooltip').classes()).toContain(`tooltip-${placement}`)
    }
  })

  it('样式层把提示关掉的环境（窄窗口、触屏）：包裹层改给原生 title，用鼠标悬停照样有提示', async () => {
    const wrapper = mount(UiTooltip, {
      props: { text: '刷新' },
      slots: { default: () => h('button', { 'aria-label': '刷新' }, 'r') },
    })
    expect(wrapper.attributes('title')).toBeUndefined()

    media.hidden.value = true
    await nextTick()
    expect(wrapper.attributes('title')).toBe('刷新')
    // 原生 title 在包裹层上：控件自己的名字仍是 aria-label，读屏不会读两遍
    expect(wrapper.get('button').attributes('title')).toBeUndefined()
  })
})
