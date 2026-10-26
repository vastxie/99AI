import type { FilterFieldOption } from '@/components/FilterBar/types';
import ApiUser from '@/api/modules/user';

/**
 * FilterBar 中「用户」remote-select 字段的公共实现（后端多处只支持 userId 精确过滤，
 * 用户名模糊搜索一律走这里）：
 * - fetchOptions：按关键词模糊搜索用户
 * - resolveLabel：按 userId 回查用户名，供筛选条件由外部带入（用户详情页钻取
 *   `?userId=`）时 chips 显示名字而不是原始 ID
 */
export default function useRemoteUserOptions() {
  async function fetchUserOptions(query: string): Promise<FilterFieldOption[]> {
    try {
      const res = await ApiUser.queryAllUser({ size: 30, keyword: query });
      return (res.data.rows || []).map((item: any) => ({ label: item.username, value: item.id }));
    } catch {
      return [];
    }
  }

  async function resolveUserLabel(value: string | number): Promise<string | undefined> {
    const id = Number(value);
    if (!id) return undefined;
    try {
      const res: any = await ApiUser.getUserProfile(id);
      return res.data?.basic?.username || res.data?.basic?.nickname || undefined;
    } catch {
      return undefined;
    }
  }

  return { fetchUserOptions, resolveUserLabel };
}
