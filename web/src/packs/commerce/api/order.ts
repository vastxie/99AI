import { get, post } from '@/utils/request'
import { UPSTREAM_REQUEST_TIMEOUT_MS } from '@/utils/request/client'

export interface PaymentDisplay {
  type: 'qr_content' | 'redirect_url' | 'html_form' | 'wechat_jsapi'
  payload: Record<string, any>
}

interface BuyResponse {
  orderId: string
  paymentMethod: string
  total: number
  availableMethods: any[]
  method: string
  provider: string
  amount: string
  currency: 'CNY' | 'USD'
  display: PaymentDisplay
}

/* order buy */
export function fetchOrderBuyAPI<T = BuyResponse>(data: {
  goodsId: number
  method: string
  device?: string
}): Promise<T> {
  return post<T>({
    url: '/order/buy',
    data,
    // 下单要等支付渠道：上游慢时多等一会儿，免得前端先放弃、服务端照样建好一张没人付的单
    timeout: UPSTREAM_REQUEST_TIMEOUT_MS,
  })
}

/* order query */
export function fetchOrderQueryAPI<T>(data: { orderId: string }): Promise<T> {
  return get<T>({
    url: '/order/queryByOrderId',
    data,
  })
}

/* 获取可用支付方式 */
export function fetchAvailablePaymentMethods<T>(): Promise<T> {
  return get<T>({
    url: '/config/payment/methods',
  })
}
