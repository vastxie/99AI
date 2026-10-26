import { mount, type VueWrapper } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/locales'
import {
  compileComponentStyles,
  compileDesignSystem,
  computedStyle,
  installStylesheet,
  mountProbe,
  parseTransitions,
  rootVar,
  scopeIdOf,
} from '@/styles/stylesheet.testkit'
import ScrollToBottomButton from './ScrollToBottomButton.vue'

const COMPONENT = 'src/views/chat/components/ScrollToBottomButton.vue'

let removeStyles: () => void
let scopeId: string | undefined
const wrappers: VueWrapper[] = []

/** 带上组件作用域属性的探针：组件样式是 scoped 的，裸探针匹配不到 */
function scopedProbe(className: string, tag?: string) {
  const probe = mountProbe(className, document.body, tag)
  if (scopeId) probe.setAttribute(scopeId, '')
  return probe
}

function render(visible: boolean) {
  const wrapper = mount(ScrollToBottomButton, {
    attachTo: document.body,
    props: { visible },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeAll(async () => {
  // 组件与 UiButton 的模板参与 Tailwind 扫描（pointer-events / absolute 等工具类），组件自带的过渡规则一并注入
  const designSystem = await compileDesignSystem({
    files: [COMPONENT, 'src/components/common/UiButton.vue'],
  })
  // 组件样式是 scoped 的：先挂一个探针读出作用域 id，再按它编译
  const probe = mount(ScrollToBottomButton, {
    props: { visible: true },
    global: { plugins: [i18n] },
  })
  scopeId = scopeIdOf(probe.element)
  probe.unmount()
  removeStyles = installStylesheet(`${designSystem}\n${compileComponentStyles(COMPONENT, scopeId)}`)
})

afterAll(() => {
  removeStyles()
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('style')
  i18n.global.locale.value = 'zh-CN'
})

describe('回到底部按钮', () => {
  it('是次要圆形图标按钮、关闭按压缩放，无障碍名取 chat.scrollToBottom，点击向外抛 click', async () => {
    const wrapper = render(true)
    const button = wrapper.get('button.scroll-bottom-button')
    expect(button.classes()).toEqual(
      expect.arrayContaining([
        'ui-button',
        'btn-secondary',
        'ui-button-icon',
        'ui-button-pill',
        'ui-button-no-scale',
        'pointer-events-auto',
      ])
    )
    expect(button.classes()).not.toContain('btn-primary')
    expect(button.classes()).not.toContain('btn-ghost')
    expect(button.attributes('aria-label')).toBe('滚动到底部')
    const icon = button.get('svg.lucide-chevron-down')
    expect(icon.attributes('width')).toBe('18')
    expect(icon.attributes('stroke-width')).toBe('2')
    expect(icon.attributes('aria-hidden')).toBe('true')
    await button.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    // 文案跟随语言切换
    i18n.global.locale.value = 'en-US'
    await wrapper.vm.$nextTick()
    expect(button.attributes('aria-label')).toBe('Scroll to Bottom')
  })

  it('下方还在生成时按钮带一个闪动的点，读屏说明下方仍在生成', async () => {
    const wrapper = render(true)
    const button = wrapper.get('button')
    expect(button.find('.scroll-bottom-generating-dot').exists()).toBe(false)
    await wrapper.setProps({ generating: true })
    expect(button.find('.scroll-bottom-generating-dot').exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('回到底部，下方仍在生成')
  })

  it('visible 控制显隐（v-show 保留节点），锚点浮在 dock 上方且不拦截指针，只有按钮本体可点', async () => {
    const wrapper = render(false)
    const button = wrapper.get<HTMLButtonElement>('button.scroll-bottom-button')
    expect(button.isVisible()).toBe(false)
    await wrapper.setProps({ visible: true })
    expect(button.isVisible()).toBe(true)
    await wrapper.setProps({ visible: false })
    expect(button.element.style.display).toBe('none')

    const anchor = wrapper.element as HTMLElement
    expect(anchor.classList.contains('chat-scroll-bottom-anchor')).toBe(true)
    expect(computedStyle(anchor).position).toBe('absolute')
    expect(computedStyle(anchor).pointerEvents).toBe('none')
    expect(computedStyle(button.element).pointerEvents).toBe('auto')
    // 锚点位置只跟随输入框 dock 高度，正文滚动区不为它扣除高度（见 interactionCoverage：滚动区高度 100%）
    document.documentElement.style.setProperty('--chat-footer-dock-height', '72px')
    expect(computedStyle(anchor).bottom).toContain('72px')
    expect(computedStyle(anchor).bottom).toContain('12px')
  })

  it('进出只淡化：进场 base 档、离场 fast 档，过渡里没有 transform / filter', () => {
    const enter = scopedProbe('scroll-bottom-button-enter-active ui-button', 'button')
    const leave = scopedProbe('scroll-bottom-button-leave-active ui-button', 'button')
    const enterTransitions = parseTransitions(computedStyle(enter).transition)
    const leaveTransitions = parseTransitions(computedStyle(leave).transition)
    expect(enterTransitions.map(item => item.property)).toEqual(['opacity'])
    expect(leaveTransitions.map(item => item.property)).toEqual(['opacity'])
    expect(enterTransitions[0].duration).toBe(rootVar('--motion-duration-md'))
    expect(leaveTransitions[0].duration).toBe(rootVar('--motion-duration-xs'))
    for (const probe of [enter, leave]) {
      expect(['', 'none']).toContain(computedStyle(probe).transform)
      expect(['', 'none']).toContain(computedStyle(probe).filter)
    }
    expect(computedStyle(scopedProbe('scroll-bottom-button-enter-from')).opacity).toBe('0')
    expect(computedStyle(scopedProbe('scroll-bottom-button-leave-to')).opacity).toBe('0')
    expect(computedStyle(scopedProbe('scroll-bottom-button-enter-to')).opacity).toBe('1')
    expect(computedStyle(scopedProbe('scroll-bottom-button-leave-from')).opacity).toBe('1')
    // 减弱动效下进出过渡与常态过渡一并关闭
    const reduced = Array.from(document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules))
      .filter(
        (rule): rule is CSSMediaRule =>
          rule instanceof CSSMediaRule &&
          /prefers-reduced-motion:\s*reduce/.test(rule.media.mediaText)
      )
      .flatMap(media => Array.from(media.cssRules))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find(rule => rule.selectorText.includes('.scroll-bottom-button-enter-active.ui-button'))
    expect(reduced?.selectorText).toContain('.scroll-bottom-button-leave-active.ui-button')
    expect(reduced?.style.getPropertyValue('transition')).toBe('none')
  })
})
