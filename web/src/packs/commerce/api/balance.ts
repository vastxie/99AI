import { get } from '@/utils/request'

/* get rechargeLog */
export function fetchGetRechargeLogAPI<T>(data: { page?: number; size?: number }): Promise<T> {
  return get<T>({
    url: '/balance/rechargeLog',
    data,
  })
}

/* query balance */
export function fetchGetBalanceQueryAPI<T>(): Promise<T> {
  return get<T>({
    url: '/balance/query',
  })
}
