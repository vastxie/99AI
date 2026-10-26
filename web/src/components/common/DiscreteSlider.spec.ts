import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import DiscreteSlider from './DiscreteSlider.vue'

describe('DiscreteSlider pointer geometry', () => {
  it('animates track clicks, ignores tiny press jitter, and only disables travel for a drag', async () => {
    const wrapper = mount(DiscreteSlider, {
      props: {
        modelValue: 0,
        label: 'Intensity',
        options: ['low', 'medium', 'high'].map(value => ({ value, label: value })),
      },
    })
    const input = wrapper.get<HTMLInputElement>('input')
    vi.spyOn(input.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 226,
    } as DOMRect)
    vi.spyOn(
      wrapper.get('.discrete-slider-thumb').element,
      'getBoundingClientRect'
    ).mockReturnValue({ left: 99, width: 28 } as DOMRect)
    input.element.setPointerCapture = vi.fn()
    input.element.releasePointerCapture = vi.fn()
    await input.trigger('pointerdown', { pointerId: 3, button: 0, clientX: 313 })
    expect(wrapper.classes()).not.toContain('is-dragging')
    expect(wrapper.attributes('style')).toContain('100%')
    await input.trigger('pointermove', { pointerId: 3, clientX: 311 })
    expect(wrapper.classes()).not.toContain('is-dragging')
    await input.trigger('pointerup', { pointerId: 3, clientX: 311 })
    expect(wrapper.emitted('change')).toEqual([[2]])
    await wrapper.setProps({ modelValue: 2 })
    await input.trigger('pointerdown', { pointerId: 4, button: 0, clientX: 213 })
    await input.trigger('pointermove', { pointerId: 4, clientX: 173 })
    expect(wrapper.classes()).toContain('is-dragging')
    expect(wrapper.attributes('style')).toContain('30%')
    await input.trigger('pointercancel', { pointerId: 4 })
    expect(wrapper.classes()).not.toContain('is-dragging')
    expect(wrapper.attributes('style')).toContain('100%')
    expect(wrapper.emitted('change')).toEqual([[2]])
    wrapper.unmount()
  })

  it('keeps the grab point stable, follows continuously, then commits one snapped step', async () => {
    const wrapper = mount(DiscreteSlider, {
      props: {
        modelValue: 1,
        label: 'Intensity',
        options: ['low', 'medium', 'high'].map(value => ({ value, label: value })),
      },
    })
    const input = wrapper.get<HTMLInputElement>('input')
    vi.spyOn(input.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 226,
    } as DOMRect)
    vi.spyOn(
      wrapper.get('.discrete-slider-thumb').element,
      'getBoundingClientRect'
    ).mockReturnValue({ left: 199, width: 28 } as DOMRect)
    input.element.setPointerCapture = vi.fn()
    input.element.releasePointerCapture = vi.fn()
    await input.trigger('pointerdown', { pointerId: 1, button: 0, clientX: 223 })
    expect(wrapper.get('.discrete-slider-shell').attributes('style')).toContain('50%')
    await input.trigger('pointermove', { pointerId: 1, clientX: 278 })
    expect(wrapper.get('.discrete-slider-shell').attributes('style')).toContain('77.5%')
    expect(wrapper.emitted('change')).toBeUndefined()
    await input.trigger('pointerup', { pointerId: 1, clientX: 278 })
    expect(wrapper.get('.discrete-slider-shell').attributes('style')).toContain('100%')
    expect(wrapper.emitted('change')).toEqual([[2]])
    wrapper.unmount()
  })

  it('disables keyboard and pointer input when inactive', () => {
    const wrapper = mount(DiscreteSlider, {
      props: {
        modelValue: 0,
        label: 'Intensity',
        active: false,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' },
        ],
      },
    })
    expect(wrapper.get<HTMLInputElement>('input').element.disabled).toBe(true)
    wrapper.unmount()
  })

  it('preserves the grab offset on the visible outer edge of a hovered thumb', async () => {
    const wrapper = mount(DiscreteSlider, {
      props: {
        modelValue: 1,
        label: 'Intensity',
        options: ['low', 'medium', 'high'].map(value => ({ value, label: value })),
      },
    })
    const input = wrapper.get<HTMLInputElement>('input')
    vi.spyOn(input.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 226,
    } as DOMRect)
    vi.spyOn(
      wrapper.get('.discrete-slider-thumb').element,
      'getBoundingClientRect'
    ).mockReturnValue({ left: 199, width: 28 } as DOMRect)
    vi.spyOn(
      wrapper.get('.discrete-slider-thumb-face').element,
      'getBoundingClientRect'
    ).mockReturnValue({ left: 197.32, width: 31.36 } as DOMRect)
    input.element.setPointerCapture = vi.fn()
    input.element.releasePointerCapture = vi.fn()
    await input.trigger('pointerdown', { pointerId: 2, button: 0, clientX: 228 })
    expect(wrapper.get('.discrete-slider-shell').attributes('style')).toContain('50%')
    expect(wrapper.emitted('change')).toBeUndefined()
    await input.trigger('pointerup', { pointerId: 2, clientX: 228 })
    expect(wrapper.emitted('change')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('DiscreteSlider keyboard focus', () => {
  it('draws focus through a sibling selector that does not need :has, with an outline for forced colors', () => {
    const wrapper = mount(DiscreteSlider, {
      props: {
        modelValue: 0,
        label: 'Intensity',
        options: ['low', 'high'].map(value => ({ value, label: value })),
      },
    })
    // 输入框在拇指之前，兄弟选择器才能命中
    const input = wrapper.get('input').element
    let sibling = input.nextElementSibling
    while (sibling && !sibling.classList.contains('discrete-slider-thumb'))
      sibling = sibling.nextElementSibling
    expect(sibling).not.toBeNull()

    const css = postcss.parse(
      readFileSync(resolve(__dirname, '../../styles/discrete-slider.css'), 'utf8')
    )
    const focusRules: postcss.Rule[] = []
    css.walkRules(rule => {
      if (rule.selector.includes(':focus-visible')) focusRules.push(rule)
    })
    expect(focusRules.length).toBeGreaterThan(0)
    for (const rule of focusRules) expect(rule.selector).not.toContain(':has(')
    const siblingRule = focusRules.find(rule =>
      rule.selector.includes('.discrete-slider-input:focus-visible ~ .discrete-slider-thumb')
    )
    expect(siblingRule?.nodes.some(node => node.type === 'decl' && node.prop === 'outline')).toBe(
      true
    )
  })
})
