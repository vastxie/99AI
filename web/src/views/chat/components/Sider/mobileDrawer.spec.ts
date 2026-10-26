import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import i18n from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import Header from '../Header/index.vue'
import Sider from './index.vue'
import { clearUserToken, setUserToken } from '@/services/identity'

const layout = vi.hoisted(() => ({ isMobile: true }))

vi.mock('@/hooks/useViewport', async () => {
  const { computed, reactive } = await import('vue')
  const state = reactive(layout)
  layout.isMobile = true
  return { useViewport: () => ({ isMobile: computed(() => state.isMobile) }) }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ hash: '', params: {}, name: 'Chat' }),
}))

let wrapper: VueWrapper | undefined

function renderChrome() {
  wrapper = mount(defineComponent({ render: () => h('div', [h(Header), h(Sider)]) }), {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: { AccountMenu: true, SearchDialog: true, PackSlot: true, transition: false },
    },
  })
  return wrapper
}

const settle = async () => {
  await nextTick()
  await flushPromises()
  await nextTick()
}

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  setUserToken('fixture-session')
  auth.userInfo = { ...auth.userInfo, id: 1, role: 'user' } as typeof auth.userInfo
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('移动端侧栏抽屉', () => {
  it('打开时是对话框：焦点移入、Esc 关闭、焦点还给打开它的按钮；开关带 aria-controls / aria-expanded', async () => {
    const view = renderChrome()
    await settle()
    const frame = () => view.get('#chat-sidebar')
    const toggle = view.get<HTMLButtonElement>(
      'button[aria-controls="chat-sidebar"][aria-label="展开侧栏"]'
    )
    expect(frame().attributes('role')).toBeUndefined()
    expect(toggle.attributes('aria-expanded')).toBe('false')

    toggle.element.focus()
    await toggle.trigger('click')
    await settle()
    expect(useAppStore().siderCollapsed).toBe(false)
    expect(frame().attributes('role')).toBe('dialog')
    expect(frame().attributes('aria-modal')).toBe('true')
    expect(frame().attributes('aria-label')).toBe('会话侧栏')
    expect(frame().element.contains(document.activeElement)).toBe(true)
    expect(
      view.get('#chat-sidebar button[aria-controls="chat-sidebar"]').attributes('aria-expanded')
    ).toBe('true')

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    await settle()
    expect(useAppStore().siderCollapsed).toBe(true)
    expect(frame().attributes('role')).toBeUndefined()
    expect(document.activeElement).toBe(toggle.element)
  })

  it('桌面侧栏展开时不带对话框语义', async () => {
    layout.isMobile = false
    const view = renderChrome()
    await settle()
    expect(useAppStore().siderCollapsed).toBe(false)
    expect(view.get('#chat-sidebar').attributes('role')).toBeUndefined()
    expect(view.get('#chat-sidebar').attributes('aria-modal')).toBeUndefined()
    layout.isMobile = true
  })
})
