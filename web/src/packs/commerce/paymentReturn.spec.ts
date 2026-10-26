import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pendingOrderFor, rememberPendingOrder } from './pendingOrder'
import { handlePaymentReturn } from './paymentReturn'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(async (_to: string) => undefined),
  refreshBilling: vi.fn(async () => undefined),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('@/utils/router', () => ({ default: { replace: mocks.replace } }))
vi.mock('@/utils/message', () => ({ message: () => mocks }))
vi.mock('@/locales', () => ({ t: (key: string) => key }))
vi.mock('./store', () => ({ useCommerceStore: () => ({ refreshBilling: mocks.refreshBilling }) }))

const nativeReplaceState = History.prototype.replaceState
function openAt(url: string) {
  nativeReplaceState.call(window.history, null, '', url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  openAt('/')
})

describe('支付回跳', () => {
  it('付完回到 /?payment=success：提示结果、刷新余额，并把参数从地址里去掉（其余参数保留）', async () => {
    openAt('/c/g_abc?payment=success&from=pay')
    await handlePaymentReturn()
    expect(mocks.replace).toHaveBeenCalledWith('/c/g_abc?from=pay')
    expect(mocks.success).toHaveBeenCalledWith('pay.returnSuccess')
    expect(mocks.refreshBilling).toHaveBeenCalledTimes(1)
  })

  it('早先的 /#/chat?payment=… 地址同样认，去掉整个旧 hash', async () => {
    openAt('/#/chat?payment=cancel')
    await handlePaymentReturn()
    expect(mocks.replace).toHaveBeenCalledWith('/')
    expect(mocks.info).toHaveBeenCalledWith('pay.returnCancelled')
    expect(mocks.refreshBilling).not.toHaveBeenCalled()

    openAt('/?payment=failed')
    await handlePaymentReturn()
    expect(mocks.warning).toHaveBeenCalledWith('pay.returnFailed')
  })

  it('回跳（成功或取消）后清掉那一笔的待确认记录：再买同一套餐不会一进来就显示上一笔的结果', async () => {
    const owner = { userId: '1', goodsId: '11' }
    for (const result of ['success', 'cancel']) {
      rememberPendingOrder('fixture-order', owner)
      openAt(`/?payment=${result}`)
      await handlePaymentReturn()
      expect(pendingOrderFor(owner)).toBe('')
    }
  })

  it('不带可验证结果的回跳（易支付、支付宝）：只说正在确认，并隔几秒再刷新余额（异步到账常晚于回跳）', async () => {
    vi.useFakeTimers()
    openAt('/?payment=returned')
    await handlePaymentReturn()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith('pay.returnPending')
    expect(mocks.refreshBilling).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(mocks.refreshBilling).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('「正在确认」的回跳不清待确认记录：再打开支付页照样接着确认那一笔', async () => {
    const owner = { userId: '1', goodsId: '11' }
    rememberPendingOrder('fixture-order', owner)
    openAt('/?payment=returned')
    await handlePaymentReturn()
    expect(pendingOrderFor(owner)).toBe('fixture-order')
  })

  it('没有支付结果、或不认识的值：什么都不做', async () => {
    for (const url of ['/c/g_abc', '/?payment=paid', '/#settings']) {
      openAt(url)
      await handlePaymentReturn()
    }
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
