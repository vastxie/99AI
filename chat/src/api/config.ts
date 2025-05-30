import { get } from '@/utils/request'

/* query globe config  */
export function fetchQueryConfigAPI<T>(data: any) {
  return get<T>({
    url: '/config/queryFront',
    data,
  })
}
