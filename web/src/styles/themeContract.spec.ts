import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { createDefaultAppState } from '@/store/modules/app/preferences'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { applyClientThemeMode } from '@/utils/themeMode'
import GeneralSettings from '@/components/Settings/GeneralSettings.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import Footer from '@/views/chat/components/Footer/index.vue'
import FilePreview from '@/views/chat/components/Footer/components/FilePreview.vue'
import List from '@/views/chat/components/Sider/List.vue'
import Sider from '@/views/chat/components/Sider/index.vue'
import CodePreviewSurface from '@/views/chat/components/UnifiedSidePanel/CodePreviewSurface.vue'
import ToolExecutionDetail from '@/views/chat/components/UnifiedSidePanel/ToolExecutionDetail.vue'
import {
  compileComponentStyles,
  compileDesignSystem,
  composite,
  computedStyle,
  contrastRatio,
  installStylesheet,
  isOpaqueColor,
  mountProbe,
  resolveColor,
  resolveVar,
  rootVar,
  scopeIdOf,
  toPx,
  withDarkTheme,
} from './stylesheet.testkit'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'
import { clearUserToken, setUserToken } from '@/services/identity'

const layout = vi.hoisted(() => ({ isMobile: false }))
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  resolve: vi.fn((location: { params?: { workspaceId?: string } }) => ({
    fullPath: `/chat/${location.params?.workspaceId ?? ''}`,
  })),
}))

vi.mock('@/hooks/useViewport', async () => {
  const { computed } = await import('vue')
  return {
    useViewport: () => ({
      isMobile: computed(() => layout.isMobile),
    }),
  }
})
vi.mock('vue-router', () => ({
  useRouter: () => router,
  useRoute: () => ({ hash: '', params: {}, name: 'Chat', fullPath: '/chat' }),
}))
// 扩展包页签由包自己的测试覆盖，这里只看内核导航
vi.mock('@/components/common/usePackSlot', async () => {
  const { computed } = await import('vue')
  return { usePackSlot: () => computed(() => []) }
})

let removeStyles: () => void
let compiledCss = ''
const wrappers: VueWrapper[] = []

function render(component: Parameters<typeof mount>[0], options: Record<string, unknown> = {}) {
  const wrapper = mount(component, {
    attachTo: document.body,
    ...options,
    global: {
      plugins: [createPinia(), i18n],
      stubs: { Teleport: true, transition: false },
      ...((options.global as Record<string, unknown>) ?? {}),
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function loginAsUser() {
  const auth = useAuthStore()
  setUserToken('fixture-session')
  auth.userInfo = { ...auth.userInfo, id: 1, role: 'user' } as typeof auth.userInfo
  return auth
}

const BUTTON_VARIANTS = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger'] as const

beforeAll(async () => {
  compiledCss = await compileDesignSystem({
    raw: 'btn btn-primary btn-secondary btn-ghost btn-danger btn-send ui-button message-user-edit-shell dialog-surface',
  })
  removeStyles = installStylesheet(compiledCss)
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  layout.isMobile = false
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('style')
  i18n.global.locale.value = 'zh-CN'
  localStorage.clear()
  vi.clearAllMocks()
})

describe('用户端配色契约（计算样式）', () => {
  it('编辑气泡内取消悬停使用主题表面色，不改变默认透明态或发送按钮', () => {
    const shell = mountProbe('message-user-edit-shell')
    const cancel = mountProbe(
      'btn ui-button btn-ghost ui-button-icon ui-button-pill',
      shell,
      'button'
    )
    expect(computedStyle(cancel).backgroundColor).toBe('transparent')
    expect(computedStyle(cancel).borderColor).toBe('transparent')
    // 气泡内把 ghost 的悬停 / 按压底色改到中性表面，其它地方仍是统一的中性交互色
    expect(resolveVar(cancel, '--btn-bg-ghost-hover')).toBe(rootVar('--app-surface'))
    expect(resolveVar(cancel, '--btn-bg-ghost-active')).toBe(rootVar('--app-surface-sunken'))
    const outside = mountProbe('btn ui-button btn-ghost', document.body, 'button')
    expect(resolveVar(outside, '--btn-bg-ghost-hover')).toBe(rootVar('--interaction-bg-hover'))
    expect(resolveVar(outside, '--btn-bg-ghost-hover')).not.toBe(rootVar('--app-surface'))
    // ghost 的悬停规则本身读的就是这个可覆盖的变量
    expect(compiledCss).toMatch(
      /\.btn-ghost:hover:not\(:disabled\)[^{]*\{[^}]*background-color:\s*var\(--btn-bg-ghost-hover\)/
    )
    const send = mountProbe('btn ui-button btn-primary btn-send', shell, 'button')
    expect(computedStyle(send).backgroundColor).toBe(rootVar('--accent'))
    expect(computedStyle(send).color).toBe(rootVar('--text-on-accent'))
  })

  it('浅色普通表面与侧栏共用一档灰，保留白色画布及独立交互状态', () => {
    const aliases = [
      'dialog-card-bg',
      'dialog-control-bg',
      'btn-bg-secondary',
      'panel-bg-subtle',
      'code-block-bg',
      'code-block-header-bg',
      'code-block-content-bg',
    ]
    const states = [
      'interaction-bg-hover',
      'interaction-bg-active',
      'interaction-bg-selected',
      'control-track',
      'model-slider-track-bg',
    ]
    expect(rootVar('--app-surface-sunken')).toBe(rootVar('--app-canvas-muted'))
    expect(rootVar('--app-surface')).toBe(rootVar('--app-canvas'))
    expect(rootVar('--chat-input-surface')).toBe(rootVar('--app-canvas'))
    for (const alias of aliases) {
      expect(rootVar(`--${alias}`), alias).toBe(rootVar('--app-surface-sunken'))
    }
    for (const state of states) {
      expect(rootVar(`--${state}`), state).toBeTruthy()
      expect(rootVar(`--${state}`), state).not.toBe(rootVar('--app-surface-sunken'))
    }
    // 深色不合并层级：表面、下沉表面与侧栏底色各自独立，别名仍统一指向下沉表面
    withDarkTheme(() => {
      expect(rootVar('--app-surface-sunken')).not.toBe(rootVar('--app-canvas-muted'))
      expect(rootVar('--app-surface-sunken')).not.toBe(rootVar('--app-surface'))
      for (const alias of aliases) {
        expect(rootVar(`--${alias}`), alias).toBe(rootVar('--app-surface-sunken'))
      }
    })
  })

  it('附件卡、工具详情表面与来源 chip、预览代码块共用下沉表面色，不再单独混出更浅底色', () => {
    const componentStyles: Array<() => void> = []
    const mountWithStyles = (
      file: string,
      component: Parameters<typeof mount>[0],
      options: Record<string, unknown>
    ) => {
      const wrapper = render(component, options)
      componentStyles.push(
        installStylesheet(compileComponentStyles(file, scopeIdOf(wrapper.element)))
      )
      return wrapper
    }
    try {
      const attachments = mountWithStyles(
        'src/views/chat/components/Footer/components/FilePreview.vue',
        FilePreview,
        {
          props: {
            attachments: [
              {
                id: 'attachment-1',
                file: new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }),
                kind: 'file',
                previewUrl: '',
                status: 'uploaded',
                progress: 1,
                uploaded: null,
                error: '',
              },
            ],
          },
        }
      )
      const detailFile = 'src/views/chat/components/UnifiedSidePanel/ToolExecutionDetail.vue'
      const detail = mountWithStyles(detailFile, ToolExecutionDetail, {
        props: {
          event: { id: 'e1', title: '数据整理', status: 'success', summary: '合并了 3 张表格' },
        },
        global: { plugins: [createPinia(), i18n], stubs: { MediaOutput: true } },
      })
      const search = mountWithStyles(detailFile, ToolExecutionDetail, {
        props: {
          event: {
            id: 'e2',
            title: '联网搜索',
            status: 'success',
            toolName: 'web_search',
            output: {
              results: [
                { title: 'Example', url: 'https://example.com/a' },
                { title: 'Docs', url: 'https://docs.example.org/b' },
              ],
            },
          },
        },
        global: { plugins: [createPinia(), i18n], stubs: { MediaOutput: true } },
      })
      const preview = mountWithStyles(
        'src/views/chat/components/UnifiedSidePanel/CodePreviewSurface.vue',
        CodePreviewSurface,
        { props: { content: '```js\nconst a = 1\n```', contentType: 'text' } }
      )
      // happy-dom 下 DOMPurify 会把 <pre> 剥掉（浏览器不会），代码块节点手动挂到真实的 markdown 容器里
      const markdown = preview.get('.code-preview-markdown')
      expect(markdown.get('code.language-js').text()).toContain('const a = 1')
      const codeBlock = markdown.element.appendChild(document.createElement('pre'))
      const surfaces = [
        ['附件卡', attachments.get('.uploaded-file-card').element, '--app-surface-sunken'],
        ['工具详情表面', detail.get('.activity-detail-surface').element, '--app-surface-sunken'],
        ['来源 chip', search.get('.activity-source-chip').element, '--app-surface-sunken'],
        ['预览代码块', codeBlock, '--code-block-content-bg'],
      ] as const
      expect(search.findAll('.activity-source-chip').length).toBeGreaterThanOrEqual(2)
      for (const theme of ['light', 'dark'] as const) {
        const check = () => {
          for (const [name, element, token] of surfaces) {
            const background = computedStyle(element).backgroundColor
            expect(background, `${theme} ${name}`).toBe(rootVar(token))
            expect(background, `${theme} ${name}`).toBe(rootVar('--app-surface-sunken'))
            // 实色 token，而不是把表面色再混浅一档
            expect(isOpaqueColor(background), `${theme} ${name}`).toBe(true)
            expect(background, `${theme} ${name}`).not.toMatch(/color-mix/)
            expect(background, `${theme} ${name}`).not.toBe(rootVar('--app-surface'))
          }
        }
        if (theme === 'dark') withDarkTheme(check)
        else check()
      }
    } finally {
      componentStyles.forEach(remove => remove())
    }
  })

  it('键盘焦点指示是不透明的强调色，在页面、卡片与选中项底色上对比度都不低于 3:1', () => {
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        const ring = resolveColor(resolveVar(document.documentElement, '--focus-ring-color'))
        expect(ring[3], theme).toBe(1)
        for (const name of [
          '--app-canvas',
          '--app-surface',
          '--app-surface-elevated',
          '--app-surface-sunken',
          '--interaction-bg-selected',
        ]) {
          const background = resolveColor(resolveVar(document.documentElement, name))
          expect(contrastRatio(ring, background), `${theme} ${name}`).toBeGreaterThanOrEqual(3)
        }
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })

  it('危险操作红字在默认、悬停、按压底色上均保持正文对比度', () => {
    const danger = mountProbe('btn ui-button btn-danger', document.body, 'button')
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        const surface = resolveColor(rootVar('--app-surface'))
        const text = resolveColor(rootVar('--semantic-danger-text'))
        expect(computedStyle(danger).color, theme).toBe(rootVar('--semantic-danger-text'))
        for (const name of [
          '--btn-bg-danger',
          '--btn-bg-danger-hover',
          '--btn-bg-danger-active',
          '--semantic-danger-bg',
          '--control-danger-bg-active',
        ]) {
          const background = composite(resolveColor(rootVar(name)), surface)
          expect(contrastRatio(text, background), `${theme} ${name}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })

  it('弱化文字（说明、时间、提示）在页面、侧栏、卡片以及悬停、选中行的底色上都不低于 4.5:1', () => {
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        const text = resolveColor(rootVar('--text-muted'))
        const surface = resolveColor(rootVar('--app-surface'))
        for (const name of [
          '--app-canvas',
          '--app-canvas-muted',
          '--app-surface',
          '--interaction-bg-hover',
          '--interaction-bg-selected',
        ]) {
          const background = composite(resolveColor(rootVar(name)), surface)
          expect(contrastRatio(text, background), `${theme} ${name}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })

  it('下拉触发器和菜单不再冒用胶囊操作按钮或设置私有覆盖', async () => {
    const wrapper = render(GeneralSettings, { props: { visible: true } })
    const triggers = wrapper.findAll('button.ui-button')
    expect(triggers).toHaveLength(3)
    for (const trigger of triggers) {
      expect(trigger.classes()).toContain('ui-button-select')
      expect(trigger.classes()).not.toContain('ui-button-pill')
      expect(trigger.get('svg.lucide-chevron-down').attributes('width')).toBe('16')
      // 下拉触发器用控件字重，不是操作按钮的加粗
      expect(computedStyle(trigger.element).fontWeight).toBe(rootVar('--type-control-weight'))
    }
    expect(wrapper.find('.ui-segmented-control').exists()).toBe(false)
    const text = wrapper.text()
    expect(text.indexOf('主题')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('主题')).toBeLessThan(text.indexOf('语言'))
    expect(wrapper.find('svg.lucide-languages').exists()).toBe(false)

    const appStore = useAppStore()
    const setTheme = vi.spyOn(appStore, 'setTheme')
    await triggers[0].trigger('click')
    await nextTick()
    expect(triggers[0].attributes('aria-expanded')).toBe('true')
    // 展开态直接复用 ghost 悬停底色
    expect(computedStyle(triggers[0].element).backgroundColor).toBe(rootVar('--btn-bg-ghost-hover'))
    const menu = wrapper.get(`[id="${triggers[0].attributes('aria-controls')}"]`)
    expect(menu.classes()).toContain('menu-select')
    const options = menu.findAll('[role="menuitemradio"]')
    expect(options).toHaveLength(3)
    await options[2].trigger('click')
    await nextTick()
    expect(setTheme).toHaveBeenCalledWith('dark')
    // 选中后菜单收起：触发器不再处于展开态
    expect(triggers[0].attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('button[aria-expanded="true"]')).toHaveLength(0)
  })

  it('胶囊按钮统一主次与危险色、文字行高，不因所在弹窗变化', () => {
    const dialog = mountProbe('dialog-surface')
    for (const variant of BUTTON_VARIANTS) {
      const inside = mountProbe(`btn ui-button ${variant}`, dialog, 'button')
      const outside = mountProbe(`btn ui-button ${variant}`, document.body, 'button')
      for (const property of [
        'backgroundColor',
        'color',
        'borderColor',
        'lineHeight',
        'borderRadius',
        'fontWeight',
      ] as const) {
        expect(computedStyle(inside)[property], `${variant} ${property}`).toBe(
          computedStyle(outside)[property]
        )
      }
      expect(computedStyle(outside).lineHeight).toBe(toPx(rootVar('--type-control-line-height')))
    }
    expect(rootVar('--btn-bg-secondary')).toBe(rootVar('--app-surface-sunken'))
    expect(rootVar('--btn-bg-primary')).toBe(rootVar('--accent'))
    expect(rootVar('--btn-bg-danger')).toBe(rootVar('--app-surface'))
    expect(rootVar('--btn-text-danger')).toBe(rootVar('--control-danger-fg'))
    expect(rootVar('--btn-border-danger')).toBe(rootVar('--control-danger-fg'))
  })

  it('圆角按控件角色统一，设置导航容器不再裁掉首行的上角', () => {
    expect(computedStyle(mountProbe('settings-dialog-nav')).borderRadius).toBe('0px')
    for (const variant of ['btn-primary', 'btn-secondary', 'btn-danger']) {
      const button = mountProbe(`btn ui-button ${variant}`, document.body, 'button')
      expect(computedStyle(button).borderRadius, variant).toBe(toPx(rootVar('--btn-radius')))
      expect(computedStyle(button).borderRadius, variant).toBe(toPx(rootVar('--radius-pill')))
    }
    const ghost = mountProbe('btn ui-button btn-ghost', document.body, 'button')
    const icon = mountProbe('btn ui-button btn-ghost ui-button-icon', document.body, 'button')
    const pill = mountProbe('btn ui-button btn-ghost ui-button-pill', document.body, 'button')
    expect(computedStyle(ghost).borderRadius).toBe(toPx(rootVar('--radius-control')))
    expect(computedStyle(icon).borderRadius).toBe(toPx(rootVar('--radius-control')))
    expect(computedStyle(pill).borderRadius).toBe(toPx(rootVar('--radius-pill')))
  })

  it('只保留一套主题：明暗只通过 html.dark 切换，没有 data-theme 双机制', () => {
    const lightSurface = rootVar('--app-surface')
    applyClientThemeMode('dark')
    const root = document.documentElement
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.dataset.theme).toBeUndefined()
    expect(root.getAttribute('data-theme')).toBeNull()
    expect(rootVar('--app-surface')).not.toBe(lightSurface)
    applyClientThemeMode('light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(rootVar('--app-surface')).toBe(lightSurface)
    expect(createDefaultAppState().theme).toBe('auto')
  })

  it('设置导航使用短名称，自定义全称仅用于页标题', async () => {
    i18n.global.locale.value = 'en-US'
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = loginAsUser()
    auth.globalConfig = { ...auth.globalConfig, noticeTitle: 'Release notes' }
    const stubs = {
      GeneralSettings: true,
      PersonalSettings: true,
      AccountManagement: true,
      AnnouncementSettings: true,
      PackSlot: true,
      transition: false,
    }
    const desktop = render(SettingsDialog, {
      props: { visible: true },
      global: { plugins: [pinia, i18n], stubs },
    })
    const tabs = () => desktop.findAll('[role="tab"]').map(tab => tab.text())
    expect(tabs()).toEqual(['General', 'Account', 'Notices', 'Terms'])
    expect(desktop.get('#settings-dialog-title').text()).toBe('General Settings')
    await desktop.findAll('[role="tab"]')[2].trigger('click')
    await nextTick()
    expect(desktop.get('#settings-dialog-title').text()).toBe('Release notes')
    expect(tabs()).toEqual(['General', 'Account', 'Notices', 'Terms'])

    // 手机上同一个组件：先是页签列表（同一套页签），点进去是详情，返回回到列表
    desktop.unmount()
    layout.isMobile = true
    useGlobalStoreWithOut().updateSettingsActiveTab(undefined)
    const mobile = render(SettingsDialog, {
      props: { visible: true },
      global: { plugins: [pinia, i18n], stubs },
    })
    const items = mobile.findAll('.settings-nav-item')
    expect(items.map(item => item.text())).toEqual(['General', 'Account', 'Notices', 'Terms'])
    expect(mobile.find('[role="tab"]').exists()).toBe(false)
    expect(mobile.get('#settings-dialog-title').text()).toBe('Settings')
    await items[2].trigger('click')
    await nextTick()
    expect(mobile.get('#settings-dialog-title').text()).toBe('Release notes')
    await mobile.get('button[aria-label="Back"]').trigger('click')
    await nextTick()
    expect(mobile.get('#settings-dialog-title').text()).toBe('Settings')
    layout.isMobile = false
  })

  it('展开和折叠的新建入口都守卫已确认空白对话，图标为 SquarePen', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    loginAsUser()
    const chatStore = useChatStore()
    const isEmpty = vi.spyOn(chatStore, 'isCurrentConversationEmpty').mockReturnValue(true)
    const initialize = vi.spyOn(chatStore, 'initializeWorkspace').mockResolvedValue('ws-1')
    vi.spyOn(chatStore, 'activateWorkspaceFromRoute').mockResolvedValue(undefined as never)

    const list = render(List, { global: { plugins: [pinia, i18n], stubs: { PackSlot: true } } })
    const entry = list.get('nav button.chat-sidebar-nav-item')
    expect(entry.classes()).toContain('ui-button-no-scale')
    expect(entry.find('svg.lucide-square-pen').exists()).toBe(true)
    expect(entry.find('svg.lucide-message-circle').exists()).toBe(false)
    await entry.trigger('click')
    await flushPromises()
    expect(initialize).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()

    isEmpty.mockReturnValue(false)
    await entry.trigger('click')
    await flushPromises()
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: 'ws-1' },
    })

    // 折叠轨道上的新建入口走同一道守卫
    const sider = render(Sider, {
      global: {
        plugins: [pinia, i18n],
        stubs: { AccountMenu: true, SearchDialog: true, PackSlot: true, List: true },
      },
    })
    useAppStore().setSiderCollapsed(true)
    await nextTick()
    const rail = sider.get('.chat-sidebar-rail')
    expect(rail.attributes('inert')).toBeUndefined()
    const railEntry = rail.get('button[aria-label="新对话"]')
    expect(railEntry.find('svg.lucide-square-pen').exists()).toBe(true)
    isEmpty.mockReturnValue(true)
    await railEntry.trigger('click')
    await flushPromises()
    expect(initialize).toHaveBeenCalledTimes(1)
    isEmpty.mockReturnValue(false)
    await railEntry.trigger('click')
    await flushPromises()
    expect(initialize).toHaveBeenCalledTimes(2)
  })

  it('空输入框不按断点切换中临时折行的 placeholder 撑高', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = render(Footer, {
      global: {
        plugins: [pinia, i18n],
        provide: chatActionsProvide(),
        stubs: { ModelSelector: true, FilePreview: true },
      },
    })
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
    await textarea.setValue('draft')
    expect(textarea.element.style.height).toMatch(/px$/)
    await textarea.setValue('')
    expect(textarea.element.style.height).toBe('auto')
    expect(wrapper.find('button[aria-label="展开输入框"]').exists()).toBe(false)
  })

  it('面板和代码表面共用应用灰阶，不在明暗主题里维护第二套背景', () => {
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        expect(rootVar('--panel-bg'), theme).toBe(rootVar('--app-surface'))
        expect(rootVar('--code-block-bg'), theme).toBe(rootVar('--app-surface-sunken'))
        expect(rootVar('--code-block-content-bg'), theme).toBe(rootVar('--app-surface-sunken'))
        expect(rootVar('--panel-text'), theme).toBe(rootVar('--text-primary'))
        expect(rootVar('--control-track'), theme).toBeTruthy()
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })

  it('禁用发送按钮消费中性色，不与强调色和透明度叠加', () => {
    const send = mountProbe(
      'btn ui-button btn-primary ui-button-icon ui-button-pill btn-send',
      document.body,
      'button'
    )
    ;(send as HTMLButtonElement).disabled = true
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        const style = computedStyle(send)
        expect(style.backgroundColor, theme).toBe(rootVar('--btn-bg-disabled'))
        expect(style.color, theme).toBe(rootVar('--btn-text-disabled'))
        expect(style.opacity, theme).toBe('1')
        expect(style.backgroundColor, theme).not.toBe(rootVar('--accent'))
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
  })
})
