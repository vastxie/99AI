import { get, post } from '@/utils/request'

/* sign in */
export function fetchSignInAPI<T>(): Promise<T> {
  return post<T>({
    url: '/signin/sign',
  })
}

/* sign log */
export function fetchSignLogAPI<T>(): Promise<T> {
  return get<T>({
    url: '/signin/signinLog',
  })
}

/* 今日是否已签到与连续签到天数 */
export function fetchSignInStatusAPI<T>(): Promise<T> {
  return get<T>({
    url: '/signin/status',
  })
}
