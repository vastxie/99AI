import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import {
  compileDesignSystem,
  computedStyle,
  installStylesheet,
  mountProbe,
  parseTransitions,
  rootVar,
  toPx,
} from '@/styles/stylesheet.testkit'
import Header from '../Header/index.vue'
import Sider from './index.vue'
import { clearUserToken, setUserToken } from '@/services/identity'

const layout = vi.hoisted(() => ({ isMobile: false }))

vi.mock('@/hooks/useViewport', async () => {
  const { computed } = await import('vue')
  return { useViewport: () => ({ isMobile: computed(() => layout.isMobile) }) }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ hash: '', params: {}, name: 'Chat' }),
}))

let removeStyles: () => void
const wrappers: VueWrapper[] = []

beforeAll(async () => {
  removeStyles = installStylesheet(await compileDesignSystem({ raw: 'btn ui-button' }))
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  layout.isMobile = false
  const auth = useAuthStore()
  setUserToken('fixture-session')
  auth.userInfo = { ...auth.userInfo, id: 1, role: 'user' } as typeof auth.userInfo
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

function renderSider() {
  const wrapper = mount(Sider, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: { AccountMenu: true, SearchDialog: true, PackSlot: true, transition: false },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('桌面侧栏布局动效', () => {
  it('新建与历史行共用行高，页头与侧栏页头共用高度 token', () => {
    const navItem = mountProbe('chat-sidebar-nav-item btn ui-button', document.body, 'button')
    const conversation = mountProbe('chat-sidebar-conversation')
    expect(computedStyle(navItem).height).toBe(toPx(rootVar('--control-row-height')))
    expect(computedStyle(conversation).height).toBe(computedStyle(navItem).height)
    expect(computedStyle(conversation).borderRadius).toBe(computedStyle(navItem).borderRadius)
    const header = mountProbe('chat-header', document.body, 'header')
    const sidebarHeader = mountProbe('chat-sidebar-header')
    expect(computedStyle(header).height).toBe(toPx(rootVar('--chat-header-height')))
    expect(computedStyle(sidebarHeader).height).toBe(computedStyle(header).height)
  })

  it('侧栏导航项与会话行键盘聚焦只有一圈内描边，不再叠加按钮的外描边', () => {
    // 「新对话」是 UiButton：自带 ds-focus-ring 的外描边，侧栏规则换成内描边时要一并去掉外描边
    const navItem = mountProbe(
      'chat-sidebar-nav-item btn ui-button ds-focus-ring',
      document.body,
      'button'
    )
    navItem.focus()
    expect(computedStyle(navItem).outlineStyle).toBe('none')
    expect(computedStyle(navItem).boxShadow).toContain('inset')
    // 会话行本身不可聚焦（行里还有「更多」按钮）：焦点在行内的打开按钮上，内描边画在整行
    const row = mountProbe('chat-sidebar-conversation')
    const open = mountProbe('chat-sidebar-conversation-open', row, 'button')
    open.focus()
    expect(computedStyle(open).outlineStyle).toBe('none')
    expect(computedStyle(row).boxShadow).toContain('inset')
  })

  it('顶部搜索与折叠共用 ActionIcon 并保留统一间隔，不再有独立搜索行', () => {
    const sider = renderSider()
    const header = sider.get('.chat-sidebar-expanded .chat-sidebar-header')
    expect(header.classes()).toContain('gap-2')
    const actions = header.findAll('.action-icon-wrap button.ui-button')
    expect(actions.map(action => action.attributes('aria-label'))).toEqual(['搜索', '折叠侧栏'])
    for (const action of actions) expect(action.classes()).toContain('ui-button-no-scale')
    expect(sider.find('.chat-sidebar-expanded nav button[aria-label="搜索"]').exists()).toBe(false)
    expect(sider.find('.chat-sidebar-expanded nav input').exists()).toBe(false)
  })

  it('折叠栏与完整侧栏保持常驻并用 inert 隔离隐藏层', async () => {
    const sider = renderSider()
    const rail = sider.get('.chat-sidebar-rail')
    const expanded = sider.get('.chat-sidebar-expanded')
    expect(rail.attributes('inert')).toBeDefined()
    expect(rail.attributes('aria-hidden')).toBe('true')
    expect(expanded.attributes('inert')).toBeUndefined()
    expect(expanded.attributes('aria-hidden')).toBeUndefined()
    useAppStore().setSiderCollapsed(true)
    await nextTick()
    expect(sider.get('.chat-sidebar-rail').element).toBe(rail.element)
    expect(sider.get('.chat-sidebar-expanded').element).toBe(expanded.element)
    expect(rail.attributes('inert')).toBeUndefined()
    expect(rail.attributes('aria-hidden')).toBeUndefined()
    expect(expanded.attributes('inert')).toBeDefined()
    expect(expanded.attributes('aria-hidden')).toBe('true')
    expect(rail.classes()).toContain('is-active')
    expect(expanded.classes()).not.toContain('is-active')
  })

  it('折叠为 56px 轨道，收放走布局 / 淡化两档共享时长', async () => {
    const sider = renderSider()
    const frame = sider.get('.chat-sidebar-frame')
    expect(frame.classes()).toContain('w-[260px]')
    useAppStore().setSiderCollapsed(true)
    await nextTick()
    expect(frame.classes()).toContain('w-14')
    expect(frame.classes()).not.toContain('w-[260px]')
    const layoutDuration = rootVar('--sidebar-layout-duration')
    const fadeDuration = rootVar('--sidebar-fade-duration')
    expect(layoutDuration).toMatch(/^\d+ms$/)
    expect(parseFloat(fadeDuration)).toBeLessThan(parseFloat(layoutDuration))
    const frameTransitions = parseTransitions(computedStyle(frame.element).transition)
    expect(frameTransitions.find(item => item.property === 'width')?.duration).toBe(layoutDuration)
    expect(frameTransitions.find(item => item.property === 'transform')?.duration).toBe(
      layoutDuration
    )
    const layerTransitions = parseTransitions(
      computedStyle(sider.get('.chat-sidebar-layer').element).transition
    )
    expect(layerTransitions.find(item => item.property === 'opacity')?.duration).toBe(fadeDuration)
    const offset = parseTransitions(computedStyle(mountProbe('chat-layout-offset')).transition)
    expect(offset).toEqual([
      expect.objectContaining({ property: 'padding-left', duration: layoutDuration }),
    ])
    for (const item of [...frameTransitions, ...layerTransitions, ...offset]) {
      if (item.property !== 'visibility') expect(item.timing).toBe(rootVar('--motion-easing'))
    }
  })

  it('品牌只保留一份常驻 Logo，账号菜单成为统一设置入口', async () => {
    const sider = renderSider()
    expect(sider.findAll('img.chat-sidebar-brand-logo')).toHaveLength(1)
    const menus = sider.findAllComponents({ name: 'AccountMenu' })
    expect(menus).toHaveLength(2)
    const railMenu = menus.find(menu => menu.props('compact'))
    const expandedMenu = menus.find(menu => !menu.props('compact'))
    expect(railMenu?.props('active')).toBe(false)
    expect(expandedMenu?.props('active')).toBe(true)
    useAppStore().setSiderCollapsed(true)
    await nextTick()
    expect(railMenu?.props('active')).toBe(true)
    expect(expandedMenu?.props('active')).toBe(false)
    expect(sider.text()).not.toContain('设置中心')

    layout.isMobile = true
    const header = mount(Header, {
      global: { plugins: [i18n], stubs: { AccountMenu: true, transition: false } },
    })
    wrappers.push(header)
    const mobileMenu = header.getComponent({ name: 'AccountMenu' })
    expect(mobileMenu.props('compact')).toBe(true)
    expect(mobileMenu.props('menuPosition')).toBe('auto')
  })

  it('折叠栏不裁剪右侧操作提示与展开热点', () => {
    const surface = mountProbe('chat-sidebar-surface')
    const frame = mountProbe('chat-sidebar-frame')
    expect(computedStyle(surface).overflow).not.toBe('hidden')
    expect(computedStyle(frame).contain).not.toContain('paint')
    expect(computedStyle(frame).overflow).not.toBe('hidden')
  })
})
