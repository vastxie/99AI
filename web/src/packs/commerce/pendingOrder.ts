import { localStore } from '@/utils/storage'

/**
 * 还没确认到账的订单：下单后记下来，关掉支付界面、切走再回来时接着确认，到账后清掉。
 * 按账号与套餐记：只有同一个账号进入同一个套餐的支付页时才接着确认这一笔；
 * 换了账号、或改买别的套餐时不把它当成这一次的订单（到账由服务端处理，与这里无关）。
 * 只记最近的一笔：新下的订单覆盖旧的；放了半小时还没确认的、以及已经从支付页回跳交代过结果的，
 * 不再接着确认——再进支付页就是新的一次购买（续费、再买一个积分包），不能一进来就显示上一笔的结果。
 */
const PENDING_ORDER_KEY = 'commercePendingOrder'
/** 早先只存订单号、不分账号与套餐的键：读到就丢掉 */
const LEGACY_PENDING_ORDER_KEY = 'pending_order_id'
/** 下单后超过这么久还没确认：不再接着确认（到账仍由服务端处理） */
const PENDING_ORDER_MAX_AGE_MS = 30 * 60 * 1000

export interface PendingOrderOwner {
  userId: string
  goodsId: string
}

interface PendingOrder extends PendingOrderOwner {
  orderId: string
  /** 下单时间（毫秒）；没有的是早先的记录，按过期处理 */
  createdAt: number
}

function readPendingOrder(): PendingOrder | null {
  const stored = localStore.get<Partial<PendingOrder>>(PENDING_ORDER_KEY)
  if (!stored?.orderId || !stored.userId || !stored.goodsId) return null
  return stored as PendingOrder
}

export function rememberPendingOrder(orderId: string, owner: PendingOrderOwner) {
  localStore.set<PendingOrder>(PENDING_ORDER_KEY, { orderId, ...owner, createdAt: Date.now() })
}

/** 这个账号买这个套餐时还没确认的订单号；没有就是空字符串（放太久的记录顺手丢掉） */
export function pendingOrderFor(owner: PendingOrderOwner): string {
  localStore.remove(LEGACY_PENDING_ORDER_KEY)
  const stored = readPendingOrder()
  if (!stored) return ''
  if (!(Date.now() - Number(stored.createdAt) < PENDING_ORDER_MAX_AGE_MS)) {
    localStore.remove(PENDING_ORDER_KEY)
    return ''
  }
  return stored.userId === owner.userId && stored.goodsId === owner.goodsId ? stored.orderId : ''
}

/** 支付页回跳（成功、取消或失败）：那一笔的结果已经告诉过用户，不再接着确认 */
export function forgetAllPendingOrders() {
  localStore.remove(PENDING_ORDER_KEY)
}

/** 这笔订单确认到账：清掉记录（已被更新的订单覆盖时不动） */
export function forgetPendingOrder(orderId: string) {
  if (readPendingOrder()?.orderId === orderId) localStore.remove(PENDING_ORDER_KEY)
}
