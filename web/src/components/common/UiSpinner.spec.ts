import { mount } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  compileDesignSystem,
  computedStyle,
  installStylesheet,
  rootVar,
} from '@/styles/stylesheet.testkit'
import UiSpinner from './UiSpinner.vue'

let removeStyles: () => void

beforeAll(async () => {
  removeStyles = installStylesheet(await compileDesignSystem({ raw: 'ui-spinner' }))
})

afterAll(() => {
  removeStyles()
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.classList.remove('dark')
})

describe('UiSpinner 统一加载指示', () => {
  it('默认渲染单个装饰性 span：aria-hidden、无 role，sm 尺寸 16px、描边 2px', () => {
    const wrapper = mount(UiSpinner)
    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toEqual(['ui-spinner'])
    expect(wrapper.element.children).toHaveLength(0)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.attributes('style')).toContain('--ui-spinner-size: 16px')
    expect(wrapper.attributes('style')).toContain('--ui-spinner-stroke: 2px')
    wrapper.unmount()
  })

  it('预设与像素尺寸都写入 CSS 变量，超过 32px 才加粗描边', async () => {
    const wrapper = mount(UiSpinner, { props: { size: 'md' } })
    const style = () => wrapper.attributes('style') ?? ''
    expect(style()).toContain('--ui-spinner-size: 20px')
    await wrapper.setProps({ size: 'lg' })
    expect(style()).toContain('--ui-spinner-size: 32px')
    expect(style()).toContain('--ui-spinner-stroke: 2px')
    await wrapper.setProps({ size: 18 })
    expect(style()).toContain('--ui-spinner-size: 18px')
    await wrapper.setProps({ size: 40 })
    expect(style()).toContain('--ui-spinner-size: 40px')
    expect(style()).toContain('--ui-spinner-stroke: 3px')
    wrapper.unmount()
  })

  it('tone 只切换一个颜色 class：current 不加 class，link / inverse 各自一个', async () => {
    const wrapper = mount(UiSpinner, { props: { tone: 'link' } })
    expect(wrapper.classes()).toEqual(['ui-spinner', 'ui-spinner-link'])
    await wrapper.setProps({ tone: 'inverse' })
    expect(wrapper.classes()).toEqual(['ui-spinner', 'ui-spinner-inverse'])
    await wrapper.setProps({ tone: 'current' })
    expect(wrapper.classes()).toEqual(['ui-spinner'])
    wrapper.unmount()
  })

  it('透传 class 与 aria；调用方给出 role / aria-label 时不再对辅助技术隐藏', () => {
    const decorative = mount(UiSpinner, { attrs: { class: 'mr-2 text-text-muted' } })
    expect(decorative.classes()).toEqual(['ui-spinner', 'mr-2', 'text-text-muted'])
    expect(decorative.attributes('aria-hidden')).toBe('true')
    decorative.unmount()

    const named = mount(UiSpinner, { attrs: { role: 'status', 'aria-label': '加载中' } })
    expect(named.attributes('role')).toBe('status')
    expect(named.attributes('aria-label')).toBe('加载中')
    expect(named.attributes('aria-hidden')).toBeUndefined()
    named.unmount()
  })

  it('环形、色调与匀速旋转都来自共享样式层，色调只跟随语义 token', async () => {
    const wrapper = mount(UiSpinner, { props: { tone: 'link' }, attachTo: document.body })
    const element = wrapper.element as HTMLElement
    expect(computedStyle(element).borderRadius).toBe('9999px')
    expect(computedStyle(element).width).toBe('16px')
    expect(computedStyle(element).animation).toMatch(/^ui-spinner-rotate .*infinite/)
    const keyframes = Array.from(document.styleSheets).flatMap(sheet =>
      Array.from(sheet.cssRules).filter(
        rule => rule instanceof CSSKeyframesRule && rule.name === 'ui-spinner-rotate'
      )
    )
    expect(keyframes).toHaveLength(1)
    for (const theme of ['light', 'dark'] as const) {
      const check = async () => {
        await wrapper.setProps({ tone: 'link' })
        expect(computedStyle(element).color, theme).toBe(rootVar('--text-link'))
        await wrapper.setProps({ tone: 'inverse' })
        expect(computedStyle(element).color, theme).toBe(rootVar('--text-on-accent'))
        await wrapper.setProps({ tone: 'current' })
        expect(computedStyle(element).color, theme).not.toBe(rootVar('--text-link'))
      }
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
        await check()
        document.documentElement.classList.remove('dark')
      } else {
        await check()
      }
    }
    wrapper.unmount()
  })
})
