import { mount } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileDesignSystem, installStylesheet, rootVar } from '@/styles/stylesheet.testkit'
import UiSegmentedControl from './UiSegmentedControl.vue'

let width = 100
let resize: () => void
const disconnect = vi.fn()
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const originalLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft')
const nativeAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
const animate = vi.fn()
let reduceMotion = false
let removeStyles: () => void
const options = [
  { value: 'first', label: 'First', id: 'tab-first', controls: 'panel-first' },
  { value: 'second', label: 'Second', id: 'tab-second', controls: 'panel-second' },
]
const wrappers: ReturnType<typeof mount>[] = []
function render(props: Record<string, unknown> = {}) {
  const wrapper = mount(UiSegmentedControl, {
    props: { modelValue: 'second', options, label: 'View', ...props },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}
beforeAll(async () => {
  removeStyles = installStylesheet(await compileDesignSystem({ raw: 'ui-segmented-control' }))
})
afterAll(() => {
  removeStyles()
})
beforeEach(() => {
  width = 100
  reduceMotion = false
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animate,
  })
  vi.spyOn(window, 'matchMedia').mockImplementation(
    query =>
      ({
        matches: reduceMotion && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect = disconnect
    }
  )
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get() {
      return this.id === 'tab-second' ? width + 4 : 4
    },
  })
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth')
  if (originalLeft) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', originalLeft)
  else Reflect.deleteProperty(HTMLElement.prototype, 'offsetLeft')
  if (nativeAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', nativeAnimate)
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('UiSegmentedControl shared capsule', () => {
  it('选中项后来禁用时，Tab 入口退回首个可用项，不改变业务选择', async () => {
    const wrapper = render()
    await wrapper.setProps({ options: [options[0], { ...options[1], disabled: true }] })
    expect(wrapper.get('#tab-first').attributes('tabindex')).toBe('0')
    expect(wrapper.get('#tab-second').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('#tab-second').attributes('aria-pressed')).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(wrapper.get('#tab-first').element)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['first'])
  })

  it('当前值无匹配且第一项禁用时，仍能通过 Tab 进入并使用方向键', async () => {
    const wrapper = render({
      modelValue: 'missing',
      options: [{ ...options[0], disabled: true }, options[1]],
    })
    expect(wrapper.get('#tab-first').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('#tab-second').attributes('tabindex')).toBe('0')
    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(wrapper.get('#tab-second').element)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['second'])
  })

  it('只有一个滑块，首次直接放在当前项下面，不从第一项滑入', () => {
    const wrapper = render({ kind: 'tabs' })
    expect(wrapper.findAll('.segmented-thumb')).toHaveLength(1)
    const thumb = wrapper.get('.segmented-thumb').element as HTMLElement
    expect(thumb.style.transform).toBe('translateX(104px)')
    expect(thumb.style.width).toBe('100px')
    expect(animate).not.toHaveBeenCalled()
    expect(wrapper.get('#tab-second').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#tab-second').attributes('aria-controls')).toBe('panel-second')
    expect(wrapper.get('#tab-first').attributes('tabindex')).toBe('-1')
  })

  it('点击仅发出选择；外部值切换时同一个滑块从原位置滑到新位置', async () => {
    const wrapper = render()
    const thumb = wrapper.get('.segmented-thumb').element as HTMLElement
    await wrapper.get('#tab-first').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['first']])
    await wrapper.setProps({ modelValue: 'first' })
    expect(thumb.style.transform).toBe('translateX(4px)')
    expect(animate).toHaveBeenLastCalledWith(
      [
        { transform: 'translateX(104px)', width: '100px' },
        { transform: 'translateX(4px)', width: '100px' },
      ],
      { duration: parseFloat(rootVar('--motion-duration-lg')), easing: rootVar('--motion-easing') }
    )
    expect(animate.mock.contexts.at(-1)).toBe(thumb)
    await wrapper.setProps({ modelValue: 'second' })
    expect(wrapper.get('.segmented-thumb').element).toBe(thumb)
    expect(thumb.style.transform).toBe('translateX(104px)')
    expect(wrapper.get('#tab-second').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('#tab-second').attributes('aria-selected')).toBeUndefined()
  })

  it('左右键、Home/End 循环并跳过禁用项，焦点和原生按钮语义保留', async () => {
    const wrapper = render({
      options: [...options, { value: 'disabled', label: 'Disabled', disabled: true }],
    })
    await wrapper.get('#tab-second').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['first'])
    expect(document.activeElement).toBe(wrapper.get('#tab-first').element)
    await wrapper.setProps({ modelValue: 'first' })
    await wrapper.get('#tab-first').trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['second'])
    expect(document.activeElement).toBe(wrapper.get('#tab-second').element)
    await wrapper.setProps({ modelValue: 'second' })
    await wrapper.get('#tab-second').trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(wrapper.get('#tab-first').element)
    const count = wrapper.emitted('update:modelValue')?.length
    ;(wrapper.get('[disabled]').element as HTMLButtonElement).click()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(count!)
    expect(wrapper.get('#tab-first').attributes('type')).toBe('button')
  })

  it('隐藏/重现和布局变化重新测量并直接到位，卸载清理观察器', async () => {
    width = 0
    const wrapper = render()
    expect(wrapper.get('.segmented-thumb').classes()).toContain('is-unplaced')
    width = 140
    resize()
    await wrapper.vm.$nextTick()
    const thumb = wrapper.get('.segmented-thumb').element as HTMLElement
    expect(thumb.style.width).toBe('140px')
    expect(thumb.style.transform).toBe('translateX(144px)')
    expect(wrapper.get('.segmented-thumb').classes()).not.toContain('is-unplaced')
    width = 120
    resize()
    await wrapper.vm.$nextTick()
    expect(thumb.style.width).toBe('120px')
    expect(animate).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('数值零也是有效选项，空列表不残留滑块', async () => {
    const wrapper = render({ modelValue: 0, options: [{ value: 0, label: 'Zero' }] })
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    await wrapper.setProps({ options: [] })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.get('.segmented-thumb').classes()).toContain('is-unplaced')
  })

  it('柔和落点按需开启：滑得更慢、带一点回弹；减弱动态效果时不滑动', async () => {
    const soft = render({ class: 'ui-segmented-soft' })
    await soft.setProps({ modelValue: 'first' })
    expect(animate.mock.calls.at(-1)?.[1]).toEqual({
      duration: parseFloat(rootVar('--segmented-soft-slide-duration')),
      easing: rootVar('--segmented-soft-slide-easing'),
    })
    expect(parseFloat(rootVar('--segmented-soft-slide-duration'))).toBeGreaterThan(
      parseFloat(rootVar('--motion-duration-lg'))
    )
    animate.mockClear()
    reduceMotion = true
    const still = render()
    await still.setProps({ modelValue: 'first' })
    expect((still.get('.segmented-thumb').element as HTMLElement).style.transform).toBe(
      'translateX(4px)'
    )
    expect(animate).not.toHaveBeenCalled()
  })
})
