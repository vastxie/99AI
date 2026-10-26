import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, nextTick, reactive, ref } from 'vue'
import { useHistoryLayer } from '@/composables/useHistoryLayer'
import { useAuthStore } from '@/store/modules/auth'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import { useOverlayHashState } from './useOverlayHashState'

/**
 * 带历史栈的假路由：push 入栈、replace 改当前；退回走浏览器历史（和临时层的返回键记录同一个队列），
 * 这里让 history.go 异步落地、派发 popstate，并同步假路由的 hash。假路由的记录不带历史状态：
 * 落地时把真实的历史状态清掉（临时层记的那一笔带着层标记，退掉之后就不该还停在它上面）
 */
const nativeReplaceState = History.prototype.replaceState
function landOnRouterEntry() {
  nativeReplaceState.call(window.history, null, '')
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
}
const nav = vi.hoisted(() => ({
  route: null as any,
  stack: [] as string[],
  index: 0,
  isMobile: null as any,
  overlays: [] as any[],
}))

vi.mock('vue-router', () => ({
  useRoute: () => nav.route,
  useRouter: () => ({
    push: vi.fn(async (location: { hash: string }) => {
      nav.stack.splice(nav.index + 1)
      nav.stack.push(location.hash)
      nav.index += 1
      nav.route.hash = location.hash
    }),
    replace: vi.fn(async (location: { hash: string }) => {
      nav.stack[nav.index] = location.hash
      nav.route.hash = location.hash
    }),
  }),
}))
vi.mock('@/hooks/useViewport', () => ({ useViewport: () => ({ isMobile: nav.isMobile }) }))
vi.mock('@/packs', () => ({ packOverlays: () => nav.overlays }))

let scope: ReturnType<typeof effectScope> | undefined

function start(hash = '') {
  nav.route = reactive({ path: '/', query: {}, hash })
  nav.stack = [hash]
  nav.index = 0
  scope = effectScope()
  scope.run(useOverlayHashState)
  return { auth: useAuthStore(), global: useGlobalStoreWithOut() }
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().userInfoResolved = true
  nav.isMobile = ref(false)
  nav.overlays = []
  vi.spyOn(window.history, 'go').mockImplementation(delta => {
    setTimeout(() => {
      nav.index += Number(delta)
      nav.route.hash = nav.stack[nav.index]
      landOnRouterEntry()
    }, 0)
  })
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.restoreAllMocks()
})

describe('覆盖层与地址 hash 同步', () => {
  it('打开带 hash 的地址：#register 打开注册框，#settings/account 打开设置的账号页，清掉 hash 全部关闭', async () => {
    const { auth, global } = start('#register')
    await settle()
    expect(auth.loginDialog).toBe(true)
    expect(auth.authDialogMode).toBe('register')

    nav.route.hash = '#settings/account'
    await settle()
    expect(auth.loginDialog).toBe(false)
    expect(global.settingsDialog).toBe(true)
    expect(global.settingsActiveTab).toBe(DIALOG_TABS.ACCOUNT)

    nav.route.hash = ''
    await settle()
    expect(global.settingsDialog).toBe(false)
  })

  it('#settings 不指定页签；早先的 #settings/profile 等地址打开合并后的「通用」页', async () => {
    const { global } = start('#settings')
    await settle()
    expect(global.settingsDialog).toBe(true)
    expect(global.settingsActiveTab).toBeUndefined()

    nav.route.hash = '#settings/profile'
    await settle()
    expect(global.settingsActiveTab).toBe(DIALOG_TABS.GENERAL)
  })

  it('在页面里打开设置：写入 hash（可用浏览器返回关闭）；关闭时退回上一条历史', async () => {
    const { global } = start()
    await settle()
    global.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
    await settle()
    expect(nav.route.hash).toBe('#settings/account')
    expect(nav.stack).toEqual(['', '#settings/account'])

    global.updateSettingsDialog(false)
    await settle()
    expect(nav.route.hash).toBe('')
    expect(nav.index).toBe(0)
  })

  it('设置开着时页面换了地址、hash 保留（当前会话在别处被删）：关掉设置时替换掉 hash，不退回原来的页面', async () => {
    const { global } = start()
    await settle()
    global.updateSettingsDialog(true)
    await settle()
    expect(nav.stack).toEqual(['', '#settings'])

    // 被动跳转替换了这一笔：地址换成新会话，hash 保留
    nav.route.path = '/chat/new'
    await settle()
    global.updateSettingsDialog(false)
    await settle()
    expect(window.history.go).not.toHaveBeenCalled()
    expect(nav.route.hash).toBe('')
    expect(nav.index).toBe(1)
  })

  it('关掉临时层的同时打开设置：等它退掉自己那一笔再推设置的 hash，设置不会一闪就关', async () => {
    const { global } = start()
    const layerOpen = ref(true)
    const layer = mount(
      defineComponent({
        setup() {
          // 代码工作台一类的临时层：打开设置会先关掉所有预览
          useHistoryLayer(
            () => layerOpen.value,
            () => (layerOpen.value = false)
          )
          return () => null
        },
      })
    )
    await settle()
    const order: string[] = []
    vi.mocked(window.history.go).mockImplementation(delta => {
      order.push(`back ${delta} with hash stack [${nav.stack.join(',')}]`)
      setTimeout(landOnRouterEntry, 0)
    })

    layerOpen.value = false
    global.updateSettingsDialog(true)
    await settle()
    expect(order).toEqual(['back -1 with hash stack []'])
    expect(nav.stack).toEqual(['', '#settings'])
    expect(global.settingsDialog).toBe(true)
    layer.unmount()
  })

  it('登录框切到注册：替换 hash，不多压一条历史', async () => {
    const { auth } = start()
    await settle()
    auth.setLoginDialog(true)
    await settle()
    expect(nav.route.hash).toBe('#login')
    auth.setLoginDialog(true, 'register')
    await settle()
    expect(nav.route.hash).toBe('#register')
    expect(nav.stack).toEqual(['', '#register'])
  })

  it('扩展包登记的覆盖层：按 hash 打开，包里关掉后清掉 hash', async () => {
    const open = ref(false)
    nav.overlays = [
      {
        hash: '#checkin',
        open: () => (open.value = true),
        close: () => (open.value = false),
        isOpen: () => open.value,
      },
    ]
    start('#checkin')
    await settle()
    expect(open.value).toBe(true)

    open.value = false
    await settle()
    expect(nav.route.hash).toBe('')
  })
})

describe('等待身份恢复后打开地址中的覆盖层', () => {
  function prepare() {
    const auth = useAuthStore()
    auth.userInfoResolved = false
    const open = ref(false)
    const openOverlay = vi.fn(() => {
      if (auth.userInfo.role === 'visitor') auth.setLoginDialog(true)
      else open.value = true
    })
    nav.overlays = [
      {
        hash: '#test-overlay',
        open: openOverlay,
        close: () => (open.value = false),
        isOpen: () => open.value,
      },
    ]
    return { auth, open, openOverlay }
  }

  it('初始默认visitor不会误开登录；资料恢复后只打开一次，后续资料刷新不重开', async () => {
    const { auth, open, openOverlay } = prepare()
    start('#test-overlay')
    await settle()
    expect(openOverlay).not.toHaveBeenCalled()
    expect(auth.loginDialog).toBe(false)
    expect(nav.route.hash).toBe('#test-overlay')

    auth.userInfo.role = 'user'
    auth.userInfoResolved = true
    await settle()
    expect(open.value).toBe(true)
    expect(auth.loginDialog).toBe(false)
    expect(openOverlay).toHaveBeenCalledTimes(1)
    auth.userInfoResolved = false
    await settle()
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).toHaveBeenCalledTimes(1)
  })

  it('真正解析为visitor时仍执行原有登录校验', async () => {
    const { auth, open, openOverlay } = prepare()
    start('#test-overlay')
    await settle()
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).toHaveBeenCalledOnce()
    expect(open.value).toBe(false)
    expect(auth.loginDialog).toBe(true)
  })

  it('解析失败不会误开登录或丢失目标；正常重试成功后恢复', async () => {
    const { auth, openOverlay } = prepare()
    start('#test-overlay')
    await settle()
    auth.userInfoLoadFailed = true
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).not.toHaveBeenCalled()
    expect(nav.route.hash).toBe('#test-overlay')
    expect(auth.loginDialog).toBe(false)

    auth.userInfoResolved = false
    auth.userInfoLoadFailed = false
    await settle()
    auth.userInfo.role = 'user'
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).toHaveBeenCalledOnce()
  })

  it.each(['', '#login', '#register', '#settings/account'])(
    '等待期间转到%s，不重放旧目标',
    async hash => {
      const { auth, openOverlay } = prepare()
      const { global } = start('#test-overlay')
      await settle()
      nav.route.hash = hash
      await settle()
      if (hash === '#login' || hash === '#register') {
        expect(auth.loginDialog).toBe(true)
        expect(auth.authDialogMode).toBe(hash.slice(1))
      }
      auth.userInfo.role = 'user'
      auth.userInfoResolved = true
      await settle()
      expect(openOverlay).not.toHaveBeenCalled()
      expect(global.settingsDialog).toBe(hash === '#settings/account')
      expect(nav.route.hash).toBe(hash)
    }
  )

  it('等待期间明确打开登录框，取消原弹窗目标', async () => {
    const { auth, openOverlay } = prepare()
    start('#test-overlay')
    await settle()
    auth.setLoginDialog(true)
    await settle()
    expect(nav.route.hash).toBe('#login')
    auth.userInfo.role = 'user'
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).not.toHaveBeenCalled()
    expect(auth.loginDialog).toBe(true)
  })

  it('同时换页面和hash时，恢复新页面的目标而不是取消新目标', async () => {
    const { auth, openOverlay } = prepare()
    start('#settings/account')
    await settle()
    nav.route.path = '/chat/another'
    nav.route.hash = '#test-overlay'
    await settle()
    auth.userInfo.role = 'user'
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).toHaveBeenCalledOnce()
    expect(nav.route.hash).toBe('#test-overlay')
  })

  it('等待期间换到其他页面，即使hash相同也不回放原目标', async () => {
    const { auth, openOverlay } = prepare()
    start('#test-overlay')
    await settle()
    nav.route.path = '/chat/another'
    await settle()
    auth.userInfo.role = 'user'
    auth.userInfoResolved = true
    await settle()
    expect(openOverlay).not.toHaveBeenCalled()
  })
})
