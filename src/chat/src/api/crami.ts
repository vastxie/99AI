import { get, post } from '@/utils/request'

/* use crami */
export function fetchUseCramiAPI<T>(data: { code: string }): Promise<T> {
  return post<T>({
    url: '/crami/useCrami',
    data,
  })
}

/* get all crami package */
export function fetchGetPackageAPI<T>(data: { status: number; type?: number; size?: number }): Promise<T> {
  return get<T>({
    url: '/crami/queryAllPackage',
    data,
  })
}
