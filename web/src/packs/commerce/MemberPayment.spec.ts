import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MemberPayment from './MemberPayment.vue'
import { pendingOrderFor, rememberPendingOrder } from './pendingOrder'
import { useCommerceStore } from './store'

/** 默认场景：账号 1 在买套餐 11 */
const USER_1 = { userId: '1', goodsId: '11' }
const USER_2 = { userId: '2', goodsId: '11' }

const mocks = vi.hoisted(() => ({
  auth: {} as { isLogin: boolean; token: string; userInfo: { id: number; role: string } },
  methods: vi.fn(),
  buy: vi.fn(),
  query: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('./api/order', () => ({
  fetchAvailablePaymentMethods: mocks.methods,
  fetchOrderBuyAPI: mocks.buy,
  fetchOrderQueryAPI: mocks.query,
}))
vi.mock('@/utils/message', () => ({
  message: () => mocks,
  notifyError: (error: { notified?: boolean } | null, fallback: string) => {
    if (!error?.notified) mocks.error(fallback)
  },
}))
vi.mock('@/locales', () => ({ t: (key: string) => key, tp: (key: string) => key }))
vi.mock('@/hooks/useViewport', () => ({ useViewport: () => ({ isMobile: ref(false) }) }))
vi.mock('@/store/modules/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/store/modules/global', () => ({ useGlobalStoreWithOut: () => ({}) }))
vi.mock('./api/balance', () => ({ fetchGetBalanceQueryAPI: vi.fn() }))
// 支付方式图标取自在线图标库：测试里不联网，按取不到处理（显示首字母徽标）
vi.mock('@iconify/vue', () => ({
  Icon: { name: 'Icon', render: () => null },
  loadIcons: vi.fn(() => () => undefined),
}))

const wrappers = new Set<VueWrapper>()
function render() {
  const wrapper = mount(MemberPayment, {
    props: { visible: true },
    global: { stubs: { QRCode: true, Icon: true } },
  })
  wrappers.add(wrapper)
  return wrapper
}
function unmount(wrapper: VueWrapper) {
  wrapper.unmount()
  wrappers.delete(wrapper)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const paymentMethods = {
  success: true,
  data: [{ method: 'fixture', name: 'Fixture', channel: 'fixture', priority: 1, icon: 'test' }],
}
const unpaid = { success: true, data: { status: 0 } }
const paid = { success: true, data: { status: 1 } }
const created = (type = 'qr_content') => ({
  success: true,
  data: {
    orderId: 'fixture-order',
    currency: 'CNY',
    display: { type, payload: { content: 'fixture-qr', url: 'https://example.invalid/payment' } },
  },
})

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  mocks.auth = reactive({
    isLogin: true,
    token: 'fixture-session-a',
    userInfo: { id: 1, role: 'user' },
  })
  useCommerceStore().updateOrderInfo({ pkgInfo: { id: 11, name: 'Fixture package', price: 19 } })
  localStorage.clear()
  mocks.methods.mockResolvedValue(paymentMethods)
  mocks.query.mockResolvedValue(unpaid)
  mocks.buy.mockResolvedValue(created())
})
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('payment dialog lifecycle (only mocked orders)', () => {
  it.each(['redirect_url', 'wechat_jsapi'])(
    '持续登录时切换账户，旧 %s 下单响应完全失活',
    async type => {
      const page = render()
      await flushPromises()
      const request = deferred<ReturnType<typeof created>>()
      mocks.buy.mockReturnValueOnce(request.promise)
      await page
        .findAll('button')
        .find(button => button.text() === 'pay.clickToPay')!
        .trigger('click')
      const invoke = vi.fn()
      window.WeixinJSBridge = { invoke } as unknown as typeof window.WeixinJSBridge
      const beforeUrl = location.href
      mocks.auth.token = 'fixture-session-b'
      mocks.auth.userInfo.id = 2
      request.resolve({ ...created(type), data: { ...created(type).data, currency: 'USD' } })
      await flushPromises()
      // 首次 Vue mount 有 3 秒 devtools 探测 timer；走过该窗口再断言无支付轮询残留。
      await vi.advanceTimersByTimeAsync(3000)
      expect(location.href).toBe(beforeUrl)
      expect(invoke).not.toHaveBeenCalled()
      expect(mocks.query).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      expect(pendingOrderFor(USER_1)).toBe('')
      expect(pendingOrderFor(USER_2)).toBe('')
      expect(useCommerceStore().orderCreationPending).toBe(false)
      Reflect.deleteProperty(window, 'WeixinJSBridge')
    }
  )

  it('旧账户的成功查询不能 emit 或删除新账户恢复凭据', async () => {
    rememberPendingOrder('fixture-order', USER_1)
    const query = deferred<typeof paid>()
    mocks.query.mockReturnValueOnce(query.promise)
    const page = render()
    await flushPromises()
    mocks.auth.token = 'fixture-session-b'
    mocks.auth.userInfo.id = 2
    rememberPendingOrder('fixture-order-b', USER_2)
    query.resolve(paid)
    await flushPromises()
    expect(page.emitted('payment-success')).toBeUndefined()
    expect(pendingOrderFor(USER_2)).toBe('fixture-order-b')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('打开仅查询方式，不自动下单；双击只创建一次', async () => {
    const page = render()
    await flushPromises()
    expect(mocks.buy).not.toHaveBeenCalled()
    const request = deferred<ReturnType<typeof created>>()
    mocks.buy.mockReturnValueOnce(request.promise)
    const payButton = page.findAll('button').find(button => button.text() === 'pay.clickToPay')!
    await payButton.trigger('click')
    await payButton.trigger('click')
    expect(mocks.buy).toHaveBeenCalledTimes(1)
    expect(mocks.buy).toHaveBeenCalledWith({ goodsId: 11, method: 'fixture', device: 'pc' })
    request.resolve(created())
    await flushPromises()
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(pendingOrderFor(USER_1)).toBe('fixture-order')
  })

  it('下单在途关闭：只保留恢复凭据，不跳转/查询/重启计时器', async () => {
    const page = render()
    await flushPromises()
    const request = deferred<ReturnType<typeof created>>()
    mocks.buy.mockReturnValueOnce(request.promise)
    await page
      .findAll('button')
      .find(button => button.text() === 'pay.clickToPay')!
      .trigger('click')
    await page.setProps({ visible: false })
    unmount(page)
    const beforeUrl = location.href
    request.resolve({
      ...created('redirect_url'),
      data: { ...created('redirect_url').data, currency: 'USD' },
    })
    await flushPromises()
    expect(location.href).toBe(beforeUrl)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(useCommerceStore().orderCreationPending).toBe(false)
    expect(pendingOrderFor(USER_1)).toBe('fixture-order')
  })

  it('在途关闭重开不能绕过下单锁，旧响应到达后新实例只恢复确认', async () => {
    const first = render()
    await flushPromises()
    const request = deferred<ReturnType<typeof created>>()
    mocks.buy.mockReturnValueOnce(request.promise)
    await first
      .findAll('button')
      .find(button => button.text() === 'pay.clickToPay')!
      .trigger('click')
    unmount(first)
    const second = render()
    await flushPromises()
    const button = second.findAll('button').find(button => button.text() === 'pay.clickToPay')!
    expect(button.attributes('disabled')).toBeDefined()
    request.resolve(created())
    await flushPromises()
    expect(mocks.buy).toHaveBeenCalledTimes(1)
    expect(mocks.query).toHaveBeenCalled()
    expect(second.text()).toContain('pay.confirmingPayment')
  })

  it('关闭后的方式/订单查询响应不 emit、不删除待确认标记', async () => {
    const methods = deferred<typeof paymentMethods>()
    mocks.methods.mockReturnValueOnce(methods.promise)
    const page = render()
    unmount(page)
    rememberPendingOrder('fixture-order', USER_1)
    methods.resolve(paymentMethods)
    await flushPromises()
    expect(mocks.query).not.toHaveBeenCalled()
    const query = deferred<typeof paid>()
    mocks.query.mockReturnValueOnce(query.promise)
    const second = render()
    await flushPromises()
    unmount(second)
    query.resolve(paid)
    await flushPromises()
    expect(second.emitted('payment-success')).toBeUndefined()
    expect(pendingOrderFor(USER_1)).toBe('fixture-order')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('仅 status===1 判定成功，结果保留，唯一 emit 并清理轮询', async () => {
    rememberPendingOrder('fixture-order', USER_1)
    mocks.query
      .mockResolvedValueOnce({ success: true, data: { status: '1' } })
      .mockResolvedValueOnce(unpaid)
      .mockResolvedValueOnce(paid)
    const page = render()
    await flushPromises()
    expect(page.emitted('payment-success')).toBeUndefined()
    // 字符串 1 不是成功；恢复的确认链下一次查询收到真正的数字 1 才成功。
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(page.emitted('payment-success')).toHaveLength(1)
    expect(page.text()).toContain('pay.paymentSuccess')
    expect(pendingOrderFor(USER_1)).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('上一笔没确认的订单是别的套餐的：打开这个套餐的支付页不接着确认它，照常下单', async () => {
    rememberPendingOrder('fixture-order-other', { userId: '1', goodsId: '12' })
    const page = render()
    await flushPromises()
    expect(mocks.query).not.toHaveBeenCalled()
    expect(page.text()).not.toContain('pay.confirmingPayment')
    expect(pendingOrderFor({ userId: '1', goodsId: '12' })).toBe('fixture-order-other')
  })

  it('放了半小时还没确认的订单：不再接着确认，按新的一次购买处理', async () => {
    rememberPendingOrder('fixture-order-stale', USER_1)
    vi.setSystemTime(Date.now() + 31 * 60 * 1000)
    const page = render()
    await flushPromises()
    expect(mocks.query).not.toHaveBeenCalled()
    expect(page.text()).not.toContain('pay.confirmingPayment')
    expect(pendingOrderFor(USER_1)).toBe('')
  })

  it('早先不分账号与套餐的待确认记录：直接丢掉，不再接着确认', async () => {
    localStorage.setItem('pending_order_id', 'fixture-legacy-order')
    const page = render()
    await flushPromises()
    expect(mocks.query).not.toHaveBeenCalled()
    expect(localStorage.getItem('pending_order_id')).toBeNull()
    expect(page.text()).not.toContain('pay.confirmingPayment')
  })

  it('微信桥接待就绪时关闭，监听被移除且不再唤起支付', async () => {
    const invoke = vi.fn()
    const page = render()
    await flushPromises()
    mocks.buy.mockResolvedValueOnce(created('wechat_jsapi'))
    await page
      .findAll('button')
      .find(button => button.text() === 'pay.clickToPay')!
      .trigger('click')
    await flushPromises()
    unmount(page)
    window.WeixinJSBridge = { invoke } as unknown as typeof window.WeixinJSBridge
    document.dispatchEvent(new Event('WeixinJSBridgeReady'))
    expect(invoke).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    Reflect.deleteProperty(window, 'WeixinJSBridge')
  })
})
