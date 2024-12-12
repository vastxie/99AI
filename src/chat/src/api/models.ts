import { get } from '@/utils/request'

/* query models list  */
export function fetchQueryModelsListAPI<T>() {
  return get<T>({
    url: '/models/list',
  })
}

/* query base model config  */
export function fetchModelBaseConfigAPI<T>() {
  return get<T>({
    url: '/models/baseConfig',
  })
}
