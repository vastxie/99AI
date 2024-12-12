import { get } from '@/utils/request';

/* query globle config  */
export function fetchQueryConfigAPI<T>(data: any) {
  return get<T>({
    url: '/config/queryFronet',
    data,
  });
}
