import { get } from '@/utils/request'

export function fetchGetPackagePlansAPI<T>(data: any): Promise<T> {
  return get<T>({
    url: '/package/queryPlans',
    data,
  })
}
