import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import AccountMenu from './AccountMenu.vue'

const layoutState = vi.hoisted(() => ({ isMobile: false }))
const warning = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    isMobile: {
      __v_isRef: true,
      get value() {
        return layoutState.isMobile
      },
    },
  }),
}))

vi.mock('@/utils/dialog', () => ({
  confirmDialog: warning,
}))

let wrapper: VueWrapper | undefined

async function mountMenu() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.userInfo = {
    ...authStore.userInfo,
    avatar: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
    username: 'super',
    nickname: '管理员',
  }

  wrapper = mount(AccountMenu, {
    attachTo: document.body,
    props: { compact: false },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        transition: false,
        Teleport: true,
        PackSlot: true,
      },
    },
  })
  await wrapper.get('.chat-sidebar-account-trigger').trigger('click')
  await nextTick()
  await nextTick()
  return { authStore, globalStore: useGlobalStoreWithOut(), wrapper }
}

afterEach(() => {
  layoutState.isMobile = false
  warning.mockClear()
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('侧栏账号菜单', () => {
  it('提供菜单可访问名称，并在键盘打开时把焦点交给首个菜单项', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.userInfo = {
      ...authStore.userInfo,
      avatar: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
      username: 'super',
      nickname: '管理员',
    }
    wrapper = mount(AccountMenu, {
      attachTo: document.body,
      global: {
        plugins: [pinia, i18n],
        stubs: { transition: false, Teleport: true, PackSlot: true },
      },
    })

    const trigger = wrapper.get('.chat-sidebar-account-trigger')
    await trigger.trigger('keydown', { key: 'Enter' })
    await trigger.trigger('click')
    await nextTick()
    await nextTick()

    const menu = wrapper.get('[role="menu"]')
    expect(menu.attributes('aria-label')).toContain('管理员')
    expect(document.activeElement).toBe(menu.find('.menu-item').element)
  })

  it('从头像菜单打开通用设置和账号管理，不再依赖侧栏设置按钮', async () => {
    const { globalStore, wrapper } = await mountMenu()
    const menuItems = wrapper.findAll('.menu-item')
    const generalItem = menuItems.find(item => item.text().includes('通用设置'))
    expect(generalItem).toBeDefined()
    await generalItem!.trigger('click')

    expect(globalStore.settingsDialog).toBe(true)
    expect(globalStore.settingsActiveTab).toBe(DIALOG_TABS.GENERAL)

    globalStore.updateSettingsDialog(false)
    await wrapper.get('.chat-sidebar-account-trigger').trigger('click')
    await nextTick()
    const accountItems = wrapper
      .findAll('.menu-item')
      .filter(item => item.text().includes('账号管理'))
    await accountItems.at(-1)!.trigger('click')

    expect(globalStore.settingsDialog).toBe(true)
    expect(globalStore.settingsActiveTab).toBe(DIALOG_TABS.ACCOUNT)
  })

  it('退出登录保持二次确认，确认后才调用认证仓库', async () => {
    const { authStore, wrapper } = await mountMenu()
    const logoutSpy = vi.spyOn(authStore, 'logOut').mockImplementation(() => {})
    const logoutItem = wrapper.findAll('.menu-item').find(item => item.text().includes('退出登录'))
    expect(logoutItem).toBeDefined()

    await logoutItem!.trigger('click')
    expect(logoutSpy).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledOnce()

    const options = warning.mock.calls[0][0]
    // 退出登录是破坏性操作：确认按钮用危险色，文案直接写动作
    expect(options.tone).toBe('danger')
    expect(options.positiveText).toBe('退出登录')
    options.onPositiveClick()
    expect(logoutSpy).toHaveBeenCalledOnce()
  })
})
