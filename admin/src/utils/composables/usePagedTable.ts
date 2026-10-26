import { getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import { createLatestGate } from '@/utils/latestRequest';

interface PagedResult<T> {
  rows: T[];
  count: number;
}

/** 查询表单中与分页相关的字段(页面的 formInline / queryForm 即可满足) */
interface PageState {
  page: number;
}

/** 交给加载函数的上下文：附加数据（如订单合计）只在 isCurrent() 时写，旧请求晚到不覆盖新结果 */
export interface PagedLoadContext {
  isCurrent: () => boolean;
}

/**
 * 分页表格的公共状态：loading / total / tableData + 统一的查询流程。
 * loader 负责发请求并返回 { rows, count }（可在其中处理各页面的附加数据，写之前看 ctx.isCurrent()）；
 * 请求失败时由 axios 拦截器统一提示（每个失败的请求各提示一次，包括已被更新的查询取代的旧请求）。
 *
 * 连续查询（翻页、改筛选）只认最后发出的那次：旧请求晚到不改表格、不结束加载态；卸载后都作废。
 *
 * 传入 pageState（页面的查询表单）后可用 search()：筛选条件变化时先回到第 1 页
 * 再查询，避免停留在旧页码上得到空列表。筛选 / 重置一律用 search()，
 * 翻页与切换每页条数用 query()。
 */
export default function usePagedTable<T = any>(
  loader: (ctx: PagedLoadContext) => Promise<PagedResult<T>>,
  pageState?: PageState,
) {
  const loading = ref(false);
  const total = ref(0);
  const tableData = ref<T[]>([]) as import('vue').Ref<T[]>;
  const latest = createLatestGate();
  if (getCurrentInstance()) onBeforeUnmount(() => latest.invalidate());

  async function query() {
    const token = latest.begin();
    const isCurrent = () => latest.isLatest(token);
    loading.value = true;
    try {
      const { rows, count } = await loader({ isCurrent });
      if (!isCurrent()) return;
      tableData.value = rows || [];
      total.value = Number(count) || 0;
    } catch {
      // 错误提示由 api 拦截器统一处理
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }

  /** 条件变化后的查询：回到第 1 页再查 */
  async function search() {
    if (pageState) {
      pageState.page = 1;
    }
    await query();
  }

  return { loading, total, tableData, query, search };
}
