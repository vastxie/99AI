import { get, post } from '@/utils/request'

/* order buy */
export function fetchOrderBuyAPI<T>(data: { goodsId: number; payType?: string }): Promise<T> {
  return post<T>({
    url: '/order/buy',
    data,
  })
}

/* order query */
export function fetchOrderQueryAPI<T>(data: { orderId: string }): Promise<T> {
  return get<T>({
    url: '/order/queryByOrderId',
    data,
  })
}
