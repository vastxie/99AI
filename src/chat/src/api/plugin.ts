import { get } from '@/utils/request';

/*  查询全量app列表 */
export function fetchQueryPluginsAPI<T>(): Promise<any> {
  return get<T>({
    url: '/plugin/pluginList',
  });
}
