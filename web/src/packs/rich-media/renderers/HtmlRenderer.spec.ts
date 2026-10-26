import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// HtmlRenderer 仅用 t 渲染导出提示文案，stub 掉避免加载全量 locale JSON 与 i18n 实例
vi.mock('@/locales', () => ({
  t: (key: string) => key,
  tp: (key: string) => key,
}))

import HtmlRenderer from './HtmlRenderer.vue'

/**
 * PYRUN-001 边界监控（已接受风险）：
 * HTML 预览 iframe 通过 srcdoc 注入任意模型产出内容，安全边界完全依赖
 * sandbox 白名单。本测试钉死白名单集合，任何放宽（尤其 allow-same-origin，
 * 会让 srcdoc 内容继承宿主源并触达 localStorage / cookie）必须显式改测试。
 */
const EXPECTED_SANDBOX_TOKENS = ['allow-scripts', 'allow-popups', 'allow-forms']

describe('HtmlRenderer iframe sandbox', () => {
  it('sandbox 属性恰为预期白名单集合（正例）', () => {
    const wrapper = mount(HtmlRenderer, {
      props: { content: '<p>hello</p>' },
    })

    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)

    const sandbox = iframe.attributes('sandbox')
    expect(sandbox).toBeDefined()

    const tokens = String(sandbox).trim().split(/\s+/u).toSorted()
    expect(tokens).toEqual([...EXPECTED_SANDBOX_TOKENS].toSorted())

    wrapper.unmount()
  })

  it('不得包含 allow-same-origin / allow-top-navigation 等高危权限（反例）', () => {
    const wrapper = mount(HtmlRenderer, {
      props: { content: '<p>hello</p>' },
    })

    const sandbox = String(wrapper.find('iframe').attributes('sandbox'))
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(sandbox).not.toContain('allow-downloads')
    expect(sandbox).not.toContain('allow-modals')

    wrapper.unmount()
  })

  it('iframe 以 srcdoc 注入且 referrerpolicy 为 no-referrer（边界配套）', () => {
    const wrapper = mount(HtmlRenderer, {
      props: { content: '<p>hello</p>' },
    })

    const iframe = wrapper.find('iframe')
    expect(iframe.attributes('srcdoc')).toBeTruthy()
    expect(iframe.attributes('referrerpolicy')).toBe('no-referrer')

    wrapper.unmount()
  })
})
