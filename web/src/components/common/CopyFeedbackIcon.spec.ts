import { mount } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { computedStyle, installStylesheet, readStyle } from '@/styles/stylesheet.testkit'
import CopyFeedbackIcon from './CopyFeedbackIcon.vue'

let removeStyles: () => void

beforeAll(() => {
  removeStyles = installStylesheet(
    ['src/styles/tokens.css', 'src/styles/motion.css'].map(readStyle).join('\n')
  )
})

afterAll(() => {
  removeStyles()
})

afterEach(() => {
  document.body.innerHTML = ''
})

const shownIcons = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('svg').map(svg => svg.attributes('data-icon'))

describe('复制图标反馈', () => {
  it('默认只显示复制图标，纯装饰内容不重复提供按钮的无障碍名称', () => {
    const wrapper = mount(CopyFeedbackIcon)
    expect(shownIcons(wrapper)).toEqual(['copy'])
    expect(wrapper.attributes('data-copied')).toBe('false')
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('svg').attributes('width')).toBe('16')
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('复制成功换成对勾、复位换回复制图标，外框元素始终是同一个', async () => {
    const wrapper = mount(CopyFeedbackIcon)
    const frame = wrapper.element
    for (const copied of [true, true, false, true, false]) {
      await wrapper.setProps({ copied })
      expect(wrapper.element).toBe(frame)
      expect(wrapper.attributes('data-copied')).toBe(String(copied))
      expect(shownIcons(wrapper)).toEqual([copied ? 'check' : 'copy'])
    }
    wrapper.unmount()
  })

  it('外框按图标尺寸固定，两种图标等大，切换不改变按钮大小', async () => {
    const wrapper = mount(CopyFeedbackIcon, { props: { size: 20 }, attachTo: document.body })
    for (const copied of [false, true, false]) {
      await wrapper.setProps({ copied })
      expect(wrapper.attributes('style')).toContain('width: 20px')
      expect(wrapper.attributes('style')).toContain('height: 20px')
      expect(wrapper.get('svg').attributes('width')).toBe('20')
      expect(wrapper.get('svg').attributes('height')).toBe('20')
    }
    expect(computedStyle(wrapper.element).display).toBe('inline-grid')
    expect(computedStyle(wrapper.get('svg').element).gridArea).toBe('1 / 1')
    wrapper.unmount()
  })
})
