import { get, post } from '@/utils/request'

/* order buy */
export function createShare<T>(data: { htmlContent: string }): Promise<T> {
  return post<T>({
    url: '/share/create',
    data,
  })
}

export function getShare<T>(shareCode: string): Promise<T> {
  return get<T>({
    url: `/share/${shareCode}`,
  })
}
