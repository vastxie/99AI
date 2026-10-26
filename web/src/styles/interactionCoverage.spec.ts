import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import CodePanelLite from '@/views/chat/components/UnifiedSidePanel/CodePanelLite.vue'
import FilePreviewLite from '@/views/chat/components/UnifiedSidePanel/FilePreviewLite.vue'
import AssistantMessage from '@/views/chat/components/Message/Text/AssistantMessage.vue'
import {
  compileComponentStyles,
  compileDesignSystem,
  computedStyle,
  installStylesheet,
  isOpaqueColor,
  mountProbe,
  rootVar,
  scopeIdOf,
  squash,
  toPx,
  withDarkTheme,
} from './stylesheet.testkit'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'

vi.mock('@/views/chat/components/Message/Text/highlightThemeStyles.helpers', () => ({
  injectThemeStyles: vi.fn(),
}))
vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

let compiledCss = ''
let removeStyles: () => void
const wrappers: VueWrapper[] = []

function render(component: Parameters<typeof mount>[0], options: Record<string, unknown> = {}) {
  const wrapper = mount(component, { global: { plugins: [i18n] }, ...options })
  wrappers.push(wrapper)
  return wrapper
}

beforeAll(async () => {
  compiledCss = await compileDesignSystem({
    raw: 'action-icon action-icon-wrap action-icon-danger action-icon-active action-icon-filled action-icon-outlined chat-code-block chat-code-block-header chat-code-block-content btn ui-button btn-ghost btn-secondary',
  })
  removeStyles = installStylesheet(compiledCss)
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('中性悬停覆盖与 sticky 容器契约（计算样式）', () => {
  it('UiButton / ActionIcon 变体是静态完整类名，生产 Tailwind 扫描能生成所有变体样式', async () => {
    // 只用两个组件源码做扫描内容：动态拼接的类名（`btn-${variant}`）在这里不会出现
    const scanned = await compileDesignSystem({
      files: ['src/components/common/UiButton.vue', 'src/components/common/ActionIcon/index.vue'],
    })
    for (const variant of ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger']) {
      expect(scanned, variant).toMatch(new RegExp(`\\.${variant}\\s*\\{`))
    }
    for (const variant of ['action-icon-filled', 'action-icon-outlined']) {
      expect(scanned, variant).toMatch(new RegExp(`\\.${variant}\\s*\\{`))
    }
  })

  it('菜单、侧栏、普通按钮共享不透明中性底色，不叠加所在表面的颜色', () => {
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        const hover = rootVar('--interaction-bg-hover')
        expect(isOpaqueColor(hover), `${theme} hover`).toBe(true)
        expect(isOpaqueColor(rootVar('--interaction-bg-active')), `${theme} active`).toBe(true)
        for (const alias of [
          'menu-item-bg-hover',
          'sidebar-item-hover',
          'btn-bg-ghost-hover',
          'btn-bg-secondary-hover',
        ]) {
          expect(rootVar(`--${alias}`), `${theme} ${alias}`).toBe(hover)
        }
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })

  it('Lite 代码与文件面板使用公共按钮，保留下载的次要操作语义', async () => {
    const close = vi.fn()
    const code = render(CodePanelLite, {
      props: { content: 'const a = 1', contentType: 'javascript', close },
    })
    const actions = code.findAll('.action-icon-wrap button.ui-button')
    expect(actions).toHaveLength(2)
    expect(actions.map(action => action.attributes('aria-label'))).toEqual(['复制', '关闭'])
    await actions[1].trigger('click')
    expect(close).toHaveBeenCalledOnce()

    const file = mount(FilePreviewLite, {
      props: { file: { name: 'report.pdf', sourceKind: 'private-file' }, close },
      global: { plugins: [i18n] },
    })
    wrappers.push(file)
    const download = file.get('button.btn-secondary')
    expect(download.classes()).not.toContain('btn-primary')
    expect((download.element as HTMLButtonElement).disabled).toBe(true)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await file.setProps({
      file: {
        name: 'report.pdf',
        sourceKind: 'public-url',
        downloadUrl: 'https://example.com/r.pdf',
      },
    })
    expect((download.element as HTMLButtonElement).disabled).toBe(false)
    await download.trigger('click')
    expect(open).toHaveBeenCalledWith('https://example.com/r.pdf', '_blank', 'noopener')
  })

  it('ActionIcon 包着公共按钮，active / danger 变体各自成类且 wrapper 不抢 hover', () => {
    const icon = render(ActionIcon, {
      props: { label: '更多', danger: true },
      attachTo: document.body,
    })
    const button = icon.get('button.ui-button')
    expect(button.classes()).toEqual(
      expect.arrayContaining(['action-icon', 'action-icon-danger', 'ui-button-icon'])
    )
    expect(button.classes()).not.toContain('action-icon-active')
    expect(computedStyle(button.element).color).toBe(rootVar('--control-fg-quiet'))
    const active = render(ActionIcon, {
      props: { label: '已选', active: true },
      attachTo: document.body,
    })
    expect(active.get('button').classes()).toContain('action-icon-active')
    expect(active.get('button').attributes('aria-pressed')).toBe('true')
    expect(computedStyle(active.get('button').element).color).toBe(rootVar('--control-accent-fg'))
    expect(compiledCss).toMatch(/\.action-icon-danger\s*\{/)
    expect(compiledCss).toMatch(/\.action-icon-active\s*\{/)
    expect(compiledCss).not.toMatch(/\.action-icon-wrap:hover\s+\.action-icon/)
  })

  it('正文滚动区延伸至输入框后方，底部留白跟随 dock 高度且与滚动锚点留白一致', () => {
    document.documentElement.style.setProperty('--chat-footer-dock-height', '72px')
    const spacer = mountProbe('chat-bottom-spacer')
    const surface = mountProbe('chat-scroll-surface ds-chat-scroll-surface')
    expect(toPx(computedStyle(spacer).height)).toBe(
      toPx(computedStyle(surface).scrollPaddingBottom)
    )
    expect(computedStyle(spacer).height).toContain('72px')
    expect(computedStyle(surface).height).toBe('100%')
    document.documentElement.style.setProperty('--chat-footer-dock-height', '120px')
    expect(computedStyle(spacer).height).toContain('120px')
    expect(toPx(computedStyle(spacer).height)).toBe(
      toPx(computedStyle(surface).scrollPaddingBottom)
    )
  })

  it('只保留输入框上方圆角的透出区域，底部通过裁切隐藏，不叠加背景遮罩', () => {
    const surface = mountProbe('chat-scroll-surface ds-chat-scroll-surface')
    // 裁切量跟随输入框圆角：只让圆角以上的正文透出，圆角以下靠 clip-path 隐藏
    expect(computedStyle(surface).clipPath).toMatch(/^inset\(/)
    expect(computedStyle(surface).clipPath).toContain(rootVar('--radius-dialog'))
    expect(['', 'transparent']).toContain(computedStyle(surface).getPropertyValue('background'))
    expect(computedStyle(surface).getPropertyValue('background-image')).not.toMatch(/gradient|url/)
    expect(computedStyle(surface).getPropertyValue('mask-image')).toBe('')
    const shell = mountProbe('chat-footer-input-shell')
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        expect(computedStyle(shell).backgroundColor, theme).toBe(rootVar('--chat-input-surface'))
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })

  it('代码卡与正文包装不产生假滚动祖先，标题仍为原生 sticky', () => {
    const block = mountProbe('chat-code-block')
    const header = mountProbe('chat-code-block-header', block)
    const content = mountProbe('chat-code-block-content', block, 'code')
    expect(computedStyle(block).overflow).toBe('clip')
    expect(computedStyle(block).borderWidth).toBe('0px')
    expect(computedStyle(header).position).toBe('sticky')
    expect(computedStyle(header).top).toBe('0px')
    expect(computedStyle(header).backgroundColor).toBe(rootVar('--app-canvas'))
    expect(computedStyle(content).overflowX).toBe('auto')

    const wrapper = render(AssistantMessage, {
      props: { index: 0, cid: 'sticky-test', content: 'hello', status: 3 },
      global: {
        plugins: [createPinia(), i18n],
        provide: chatActionsProvide(),
        stubs: { MediaOutput: true, MarkdownVNodeRenderer: true },
      },
    })
    expect(wrapper.get('.message-text-content').classes()).toContain('overflow-clip')
    expect(wrapper.get('.assistant-text-content').classes()).toContain('overflow-clip')
    expect(wrapper.get('.message-text-content').classes()).not.toContain('overflow-hidden')
  })

  it('消息操作栏平时隐藏，键盘焦点进入消息时显示', () => {
    const message = () => {
      const scope = mountProbe('message-hover-scope')
      const actions = mountProbe('message-actions-reveal', scope)
      return { actions, button: mountProbe('btn ui-button', actions, 'button') }
    }
    expect(computedStyle(message().actions).opacity).toBe('0')
    // happy-dom 会缓存算过的样式、焦点变化不失效：另挂一条先聚焦再读
    const focused = message()
    focused.button.focus()
    expect(computedStyle(focused.actions).opacity).toBe('1')
  })

  it('助手正文占满对话栏宽度，其余助手内容（活动行、操作栏）仍限 48rem', () => {
    const wrapper = render(AssistantMessage, {
      props: { index: 0, cid: 'width-test', content: 'hello', status: 3 },
      attachTo: document.body,
      global: {
        plugins: [createPinia(), i18n],
        provide: chatActionsProvide(),
        stubs: { MediaOutput: true, MarkdownVNodeRenderer: true },
      },
    })
    // 组件的 scoped 样式在共享样式之后加载，特异性与 .md-prose.chat-markdown 相同：正文宽度必须由组件自己写明
    const removeComponentStyles = installStylesheet(
      compileComponentStyles(
        'src/views/chat/components/Message/Text/AssistantMessage.vue',
        scopeIdOf(wrapper.element)
      )
    )
    try {
      expect(computedStyle(wrapper.get('.md-prose.chat-markdown').element).maxWidth).toBe('100%')
      // happy-dom 把 rem 换算成 px：48rem = 768px
      expect(computedStyle(wrapper.get('.assistant-action-layers').element).maxWidth).toBe(
        'min(768px, 100%)'
      )
    } finally {
      removeComponentStyles()
    }
  })

  it('触屏上胶囊按钮视觉高度收到行高档位，用 ::after 把触控热区外扩到统一触控尺寸；窄窗口的鼠标不变', () => {
    const viewport = (
      window as unknown as { happyDOM: { setViewport(v: { width: number }): void } }
    ).happyDOM
    const PILL = 'btn ui-button btn-ghost ui-button-icon ui-button-pill'
    const PLAIN = 'btn ui-button btn-secondary'
    // 桌面：图标胶囊就是控件高度
    expect(computedStyle(mountProbe(PILL, document.body, 'button')).height).toBe(
      toPx(rootVar('--control-height'))
    )
    // 触控尺寸按指针类型，不按宽度：窄窗口里用鼠标，按钮不变大
    try {
      viewport.setViewport({ width: 600 })
      expect(computedStyle(mountProbe(PLAIN, document.body, 'button')).minHeight).not.toBe(
        toPx(rootVar('--control-touch-size'))
      )
    } finally {
      viewport.setViewport({ width: 1024 })
    }
    // happy-dom 按 navigator.maxTouchPoints 判断 (pointer: coarse)
    const touch = Object.getOwnPropertyDescriptor(window.navigator, 'maxTouchPoints')
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true })
    try {
      // happy-dom 会缓存已算过的元素，换指针类型后用新探针读
      const pill = mountProbe(PILL, document.body, 'button')
      const plain = mountProbe(PLAIN, document.body, 'button')
      // 触屏：普通按钮长到触控尺寸，胶囊只到行高档位（比触控尺寸矮，热区靠 ::after 补齐）
      expect(computedStyle(plain).minHeight).toBe(toPx(rootVar('--control-touch-size')))
      expect(computedStyle(pill).height).toBe(toPx(rootVar('--control-row-height')))
      expect(computedStyle(pill).position).toBe('relative')
      expect(parseFloat(rootVar('--control-row-height'))).toBeLessThan(
        parseFloat(rootVar('--control-touch-size'))
      )
    } finally {
      if (touch) Object.defineProperty(window.navigator, 'maxTouchPoints', touch)
      else delete (window.navigator as unknown as Record<string, unknown>).maxTouchPoints
    }
    // happy-dom 不算伪元素的计算样式：::after 热区读编译后的 CSSOM
    const mobileRules = Array.from(document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules))
      .filter(
        (rule): rule is CSSMediaRule =>
          rule instanceof CSSMediaRule && /pointer:\s*coarse/.test(rule.media.mediaText)
      )
      .flatMap(media => Array.from(media.cssRules))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    const hitArea = mobileRules.find(
      rule => rule.selectorText === '.ui-button.ui-button-pill::after'
    )
    expect(hitArea).toBeTruthy()
    expect(hitArea!.style.getPropertyValue('content')).toBe("''")
    expect(hitArea!.style.getPropertyValue('position')).toBe('absolute')
    // 源码里 calc() 跨行书写，比较前去掉括号内侧的空白
    const inset = squash(hitArea!.style.getPropertyValue('inset')).replace(/\(\s+|\s+\)/g, match =>
      match.trim()
    )
    expect(inset).toBe(
      'calc((var(--control-row-height) - var(--control-touch-size)) / 2 - var(--btn-border-width))'
    )
    expect(hitArea!.style.getPropertyValue('border-radius')).toBe('inherit')
    const visual = mobileRules.find(rule => rule.selectorText === '.ui-button.ui-button-pill')
    expect(visual!.style.getPropertyValue('--control-height')).toBe('var(--control-row-height)')
  })

  it('代码滚动到纵向边界后可继续滚动对话，横向仍限制在代码内', () => {
    const content = mountProbe('chat-code-block-content', mountProbe('chat-code-block'), 'code')
    const style = computedStyle(content)
    expect(style.overscrollBehaviorY).toBe('auto')
    expect(style.overscrollBehaviorX).toBe('contain')
    expect(style.overflowY).toBe('auto')
    expect(style.maxHeight).toBeTruthy()
    expect(style.maxHeight).not.toBe('none')
  })
})
