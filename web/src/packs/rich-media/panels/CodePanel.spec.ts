import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import {
  compileComponentStyles,
  computedStyle,
  installStylesheet,
  readStyle,
  rootVar,
  scopeIdOf,
  toPx,
} from '@/styles/stylesheet.testkit'
import zhCN from '../locales/zh-CN.json'
import { EditorView } from '@codemirror/view'
import CodePanel from './CodePanel.vue'

// 包的语言片段在应用安装 i18n 时才合并进来，测试里手动合并
i18n.global.mergeLocaleMessage('zh-CN', zhCN)

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }))
const download = vi.hoisted(() => ({ downloadText: vi.fn() }))

vi.mock('@/utils/clipboard', () => ({ copyText: clipboard.copyText }))
vi.mock('@/utils/download', () => ({ downloadText: download.downloadText }))
vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

let wrapper: VueWrapper | undefined

function render(props: Record<string, unknown> = {}) {
  wrapper = mount(CodePanel, {
    attachTo: document.body,
    props: {
      content: '<p>hello</p>',
      contentType: 'html',
      close: vi.fn(),
      variant: 'workspace',
      ...props,
    },
    global: { plugins: [i18n], stubs: { CodePreviewSurface: true } },
  })
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  clipboard.copyText.mockResolvedValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('代码工作区共享交互契约', () => {
  it('复制走统一反馈图标（20px），三秒后复位，按钮关闭按压缩放', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const panel = render()
    const copy = panel.get('button[aria-label="复制"]')
    expect(copy.classes()).toContain('ui-button-no-scale')
    const feedback = copy.get('.copy-feedback')
    expect(feedback.attributes('data-copied')).toBe('false')
    expect(feedback.findAll('svg').map(svg => svg.attributes('width'))).toEqual(['20'])
    await copy.trigger('click')
    await flushPromises()
    expect(clipboard.copyText).toHaveBeenCalledWith('<p>hello</p>')
    expect(feedback.attributes('data-copied')).toBe('true')
    vi.advanceTimersByTime(2999)
    await nextTick()
    expect(feedback.attributes('data-copied')).toBe('true')
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(feedback.attributes('data-copied')).toBe('false')
    expect(copy.get('.copy-feedback').element).toBe(feedback.element)
  })

  it('代码 / 预览切换是公共按钮，只在可预览内容上出现', async () => {
    const panel = render()
    const toggle = panel.get('button.code-workspace-code-toggle')
    expect(toggle.classes()).toEqual(expect.arrayContaining(['ui-button', 'ui-button-no-scale']))
    expect(toggle.attributes('aria-label')).toBe('隐藏代码')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-label')).toBe('显示代码')
    expect(panel.get('.code-workspace-body').classes()).toContain('code-workspace-body-code-hidden')
    await panel.setProps({ contentType: 'json', content: '{"a":1}' })
    await nextTick()
    expect(panel.find('button.code-workspace-code-toggle').exists()).toBe(false)
    expect(panel.get('.code-workspace-body').classes()).toContain('code-workspace-body-source-only')
  })

  it('工作区页头与聊天页头共用同一高度 token', () => {
    const panel = render()
    const removeStyles = installStylesheet(
      [
        readStyle('src/styles/tokens.css'),
        compileComponentStyles(
          'src/packs/rich-media/panels/CodePanel.vue',
          scopeIdOf(panel.element)
        ),
      ].join('\n')
    )
    try {
      const header = computedStyle(panel.get('.code-workspace-header').element)
      const shared = toPx(rootVar('--chat-header-height'))
      expect(shared).toMatch(/^\d+(\.\d+)?px$/)
      expect(header.height).toBe(shared)
      expect(header.minHeight).toBe(shared)
    } finally {
      removeStyles()
    }
  })

  it('内容流式增长：只把新增部分写进现有编辑器（光标位置保留，不重建状态）', async () => {
    const panel = render({ content: 'const a = 1', contentType: 'javascript' })
    await flushPromises()
    await nextTick()
    const editorElement = document.querySelector<HTMLElement>('.cm-editor')
    expect(editorElement).toBeTruthy()
    const view = EditorView.findFromDOM(editorElement!)!
    view.dispatch({ selection: { anchor: 3 } })

    await panel.setProps({ content: 'const a = 1\nconst b = 2' })
    await nextTick()
    expect(view.state.doc.toString()).toBe('const a = 1\nconst b = 2')
    expect(view.state.selection.main.head).toBe(3)
    expect(document.querySelector('.cm-editor')).toBe(editorElement)
  })

  it('格式化显示的 JSON 在流式更新：编辑器里是格式化后的文本，下载仍是原文（外部同步不回写草稿）', async () => {
    const panel = render({ content: '{"a":1}', contentType: 'json', variant: 'side' })
    await flushPromises()
    await nextTick()
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!
    expect(view.state.doc.toString()).toBe('{\n  "a": 1\n}')

    await panel.setProps({ content: '{"a":1,"b":2}' })
    await nextTick()
    expect(view.state.doc.toString()).toBe('{\n  "a": 1,\n  "b": 2\n}')
    await panel.get('button[aria-label="下载"]').trigger('click')
    expect(download.downloadText).toHaveBeenCalledWith('{"a":1,"b":2}', expect.any(String))
  })
})
