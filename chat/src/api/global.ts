import { get } from '@/utils/request'

/* get notice */
export function fetchGetGlobalNoticeAPI<T>(): Promise<T> {
  return get<T>({
    url: '/config/notice',
  })
}
