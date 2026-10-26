import { t } from '@/locales'
import { message } from '@/utils/message'
import { forgetAllPendingOrders } from './pendingOrder'
import { useCommerceStore } from './store'

const PAYMENT_RESULTS = ['success', 'cancel', 'failed', 'returned'] as const
/** 「正在确认」时异步到账通知常晚于回跳：隔几秒再刷新两次余额 */
const PENDING_BILLING_REFRESH_DELAYS_MS = [5_000, 20_000]
type PaymentResult = (typeof PAYMENT_RESULTS)[number]
/** 早先的回跳地址 `/#/chat?payment=…`：服务端改地址前发起的支付仍会回到这里 */
const LEGACY_HASH_PREFIX = '#/chat?'

function isPaymentResult(value: string | null): value is PaymentResult {
  return PAYMENT_RESULTS.some(result => result === value)
}

/**
 * 支付回跳：付完（或取消、确认失败）后，服务端的结果页把用户带回 `/?payment=success|cancel|failed`；
 * 回跳不带可验证结果的渠道（易支付、支付宝）回到 `returned`，只说正在确认。
 * 这里给出结果提示、刷新余额，再把参数从地址里去掉（替换当前记录，返回键不会回到带参数的地址）；
 * 那一笔的待确认记录一并清掉，下次进支付页按新的一次购买处理。
 * 在新窗口里付的，结果页会直接关掉自己，由原页面的支付弹窗确认到账，不会走到这里。
 * 到账与否以服务端为准，这里只负责告诉用户结果。
 */
export async function handlePaymentReturn() {
  const url = new URL(window.location.href)
  let result = url.searchParams.get('payment')
  if (result) {
    url.searchParams.delete('payment')
  } else if (url.hash.startsWith(LEGACY_HASH_PREFIX)) {
    result = new URLSearchParams(url.hash.slice(LEGACY_HASH_PREFIX.length)).get('payment')
    if (result) url.hash = ''
  }
  if (!isPaymentResult(result)) return
  // 成功、取消、失败交代过结果，清掉那一笔的待确认记录；「正在确认」还不知道到没到账，留着接着确认
  if (result !== 'returned') forgetAllPendingOrders()

  // 路由按需加载：扩展包在启动时就被导入，不让它提前依赖路由实例
  const { default: router } = await import('@/utils/router')
  await router.replace(`${url.pathname}${url.search}${url.hash}`)
  const ms = message()
  const refreshBilling = () =>
    void useCommerceStore()
      .refreshBilling()
      .catch(() => undefined)
  if (result === 'success') {
    ms.success(t('pay.returnSuccess'))
    refreshBilling()
  } else if (result === 'returned') {
    ms.info(t('pay.returnPending'))
    refreshBilling()
    for (const delay of PENDING_BILLING_REFRESH_DELAYS_MS) window.setTimeout(refreshBilling, delay)
  } else if (result === 'cancel') {
    ms.info(t('pay.returnCancelled'))
  } else {
    ms.warning(t('pay.returnFailed'))
  }
}
