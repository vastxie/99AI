import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import AccountManagement from '@/components/Settings/AccountManagement.vue'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import { clearUserToken, setUserToken } from '@/services/identity'

const viewport = vi.hoisted(() => ({ isMobile: { value: false } }))
const identities = vi.hoisted(() => ({ rows: { value: [] as unknown[] } }))

vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  const isMobile = ref(false)
  viewport.isMobile = isMobile
  return { useViewport: () => ({ isMobile }) }
})
vi.mock('@/components/common/usePackSlot', async () => {
  const { computed } = await import('vue')
  return { usePackSlot: () => computed(() => []) }
})
vi.mock('@/components/Settings/identity/useAuthIdentities', async () => {
  const { ref } = await import('vue')
  const rows = ref<unknown[]>([])
  identities.rows = rows
  return { useAuthIdentities: () => ({ rows, load: vi.fn(async () => undefined) }) }
})

let wrapper: VueWrapper | undefined

function loginAsUser() {
  const auth = useAuthStore()
  setUserToken('fixture-session')
  auth.userInfo = { ...auth.userInfo, id: 1, role: 'user' } as typeof auth.userInfo
  vi.spyOn(auth, 'getUserInfo').mockResolvedValue(undefined)
  return auth
}

beforeEach(() => {
  clearUserToken()
  setActivePinia(createPinia())
  loginAsUser()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  viewport.isMobile.value = false
  identities.rows.value = []
})

const settingsStubs = {
  GeneralSettings: true,
  PersonalSettings: true,
  AccountManagement: true,
  AnnouncementSettings: true,
  PackSlot: true,
  transition: false,
  Teleport: true,
}

it('切换设置页签时共用滚动区域回到顶部，键盘焦点仍在新页签上', async () => {
  wrapper = mount(SettingsDialog, {
    attachTo: document.body,
    props: { visible: true },
    global: { plugins: [i18n], stubs: settingsStubs },
  })
  await nextTick()
  const panel = wrapper.get('#settings-dialog-panel').element as HTMLElement
  panel.scrollTop = 300
  const tabs = wrapper.findAll('[role="tab"]')
  await tabs[0].trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
  expect(panel.scrollTop).toBe(0)
  expect(document.activeElement).toBe(tabs[1].element)
})

describe('设置的页签列表（手机）', () => {
  it('从别的入口直接带着页签打开，返回列表时焦点落到这个页签上', async () => {
    viewport.isMobile.value = true
    useGlobalStoreWithOut().updateSettingsActiveTab(DIALOG_TABS.ACCOUNT)
    wrapper = mount(SettingsDialog, {
      attachTo: document.body,
      props: { visible: true },
      global: { plugins: [i18n], stubs: settingsStubs },
    })
    await nextTick()
    await wrapper.get(`button[aria-label="${i18n.global.t('common.back')}"]`).trigger('click')
    await nextTick()
    await nextTick()
    expect(document.activeElement?.getAttribute('data-settings-tab')).toBe(DIALOG_TABS.ACCOUNT)
  })

  it('桌面没选页签（显示第一页）时缩到手机宽度：仍停在这一页，不跳回列表', async () => {
    wrapper = mount(SettingsDialog, {
      attachTo: document.body,
      props: { visible: true },
      global: { plugins: [i18n], stubs: settingsStubs },
    })
    const firstTitle = wrapper.get('#settings-dialog-title').text()
    viewport.isMobile.value = true
    await nextTick()
    await nextTick()
    expect(wrapper.get('#settings-dialog-title').text()).toBe(firstTitle)
    expect(wrapper.find('[data-settings-tab]').exists()).toBe(false)
  })
})

describe('账号页的子视图', () => {
  function mountAccount() {
    wrapper = mount(AccountManagement, {
      attachTo: document.body,
      props: { visible: true },
      global: { plugins: [i18n], stubs: { PackSlot: true, AccountIdentityRows: true } },
    })
    return wrapper
  }

  it('进入改密码时焦点落到子视图标题；返回后焦点回到「修改」键，再进来不留上次的输入和错误', async () => {
    const account = mountAccount()
    await flushPromises()
    const modify = account
      .findAll('button')
      .find(button => button.text() === i18n.global.t('settings.modify'))!
    ;(modify.element as HTMLElement).focus()
    await modify.trigger('click')
    await nextTick()
    const title = account.get('h3')
    expect(title.text()).toBe(i18n.global.t('settings.changePassword'))
    expect(document.activeElement).toBe(title.element)

    const [oldPassword] = account.findAll('input[type="password"]')
    await oldPassword.setValue('old-secret')
    await account.get('form').trigger('submit')
    await nextTick()
    await nextTick()
    // 校验没过：焦点移到第一个出错的字段
    const invalid = account.find('[aria-invalid="true"]')
    expect(invalid.exists()).toBe(true)
    expect(document.activeElement).toBe(invalid.element)

    await account.get(`button[aria-label="${i18n.global.t('common.back')}"]`).trigger('click')
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(modify.element)

    await modify.trigger('click')
    await nextTick()
    const inputs = account.findAll('input[type="password"]')
    expect(inputs.map(input => (input.element as HTMLInputElement).value)).toEqual(['', '', ''])
    expect(account.find('[aria-invalid="true"]').exists()).toBe(false)
  })

  it('绑定成功返回后，「绑定」已换成「解绑」：焦点落到这一行的新按钮上，不掉到整块主视图', async () => {
    const emailRow = {
      provider: 'email',
      kind: 'captcha',
      displayName: 'Email',
      bound: false,
      canBind: true,
    }
    identities.rows.value = [emailRow]
    const BindViewStub = defineComponent({
      emits: ['back', 'done'],
      setup(_, { emit }) {
        return () => h('button', { 'data-test': 'bind-done', onClick: () => emit('done') })
      },
    })
    wrapper = mount(AccountManagement, {
      attachTo: document.body,
      props: { visible: true },
      global: { plugins: [i18n], stubs: { PackSlot: true, CaptchaBindView: BindViewStub } },
    })
    await flushPromises()
    const bind = wrapper.get('[data-account-entry="identity:email"] button')
    expect(bind.text()).toBe(i18n.global.t('common.bind'))
    ;(bind.element as HTMLElement).focus()
    await bind.trigger('click')
    await nextTick()

    identities.rows.value = [
      { ...emailRow, bound: true, identity: { id: 7, email: 'a@example.com' } },
    ]
    await wrapper.get('[data-test="bind-done"]').trigger('click')
    await flushPromises()
    await nextTick()
    const unbind = wrapper.get('[data-account-entry="identity:email"] button')
    expect(unbind.text()).toBe(i18n.global.t('settings.unbind'))
    expect(document.activeElement).toBe(unbind.element)
  })
})
