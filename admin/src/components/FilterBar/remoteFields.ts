import { ref } from 'vue';
import { createLatestLoader, type LatestLoader } from '@/utils/latestRequest';
import { isActiveFilterValue } from './filterValues';
import type { FilterField, FilterFieldOption } from './types';

type LabelResult = { value: any; label: string | undefined };

/**
 * 远程选择字段（remote-select）的候选与已选标签，按 field.key 分开缓存（标签供 chips 回显）。
 *
 * 候选搜索、标签回查都只认最后发出的那次：晚到的旧结果不写入，加载态随之收起；失败已由请求层提示。
 * 面板里选中 / 清空（草稿换值）、应用后的筛选值变化都让这个字段在途的候选搜索作废；重置、卸载时全部作废。
 *
 * @param appliedValue 读页面当前（已应用）的筛选值：标签回来时值已经换了就不再写入
 */
export function createRemoteFields(appliedValue: (fieldKey: string) => unknown) {
  const options = ref<Record<string, FilterFieldOption[]>>({});
  const loading = ref<Record<string, boolean>>({});
  const labelCache = ref<Record<string, Record<string | number, string>>>({});
  const searchLoaders = new Map<string, LatestLoader<FilterFieldOption[]>>();
  const labelLoaders = new Map<string, LatestLoader<LabelResult>>();

  function searchLoader(fieldKey: string) {
    let loader = searchLoaders.get(fieldKey);
    if (!loader) {
      loader = createLatestLoader<FilterFieldOption[]>({
        apply: (result) => {
          options.value[fieldKey] = result;
        },
        setLoading: (value) => {
          loading.value[fieldKey] = value;
        },
      });
      searchLoaders.set(fieldKey, loader);
    }
    return loader;
  }

  function labelLoader(fieldKey: string) {
    let loader = labelLoaders.get(fieldKey);
    if (!loader) {
      loader = createLatestLoader<LabelResult>({
        apply: ({ value, label }) => {
          // 回来时这个字段的值已经换了：这个标签不再对应
          if (label && appliedValue(fieldKey) === value) {
            (labelCache.value[fieldKey] ||= {})[value] = label;
          }
        },
      });
      labelLoaders.set(fieldKey, loader);
    }
    return loader;
  }

  /** 静态选项与远端候选合并去重 */
  function fieldOptions(field: FilterField) {
    const merged = [...(field.options || []), ...(options.value[field.key] || [])];
    const seen = new Set();
    return merged.filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
  }

  function search(field: FilterField, query: string) {
    const fetchOptions = field.fetchOptions;
    if (!fetchOptions) return;
    void searchLoader(field.key).run(() => fetchOptions(query));
  }

  /** 这个字段的值换了：还没回来的候选搜索属于旧的输入，作废 */
  function invalidateSearch(fieldKey: string) {
    searchLoaders.get(fieldKey)?.invalidate();
  }

  /** 面板里选中或清空（草稿换值）：作废在途的候选搜索，记下选中项的标签 */
  function change(field: FilterField, value: string | number) {
    invalidateSearch(field.key);
    const option = fieldOptions(field).find((item) => item.value === value);
    if (option) {
      (labelCache.value[field.key] ||= {})[value] = option.label;
    }
  }

  /**
   * 筛选值由外部带入（路由参数钻取 / 页面回填）时选项里没有对应项，
   * 用 field.resolveLabel 回查一次，避免 chips 显示原始 ID。
   */
  function ensureLabel(field: FilterField) {
    if (field.type !== 'remote-select' || !field.resolveLabel) return;
    // 在途的旧回查不用作废：回来时按当前值核对，值换了就不写
    const value = appliedValue(field.key) as string | number;
    if (!isActiveFilterValue(value)) return;
    if (labelCache.value[field.key]?.[value] !== undefined) return;
    if (fieldOptions(field).some((option) => option.value === value)) return;
    const resolveLabel = field.resolveLabel;
    void labelLoader(field.key).run(async () => ({ value, label: await resolveLabel(value) }));
  }

  /** 让全部在途的取数作废并收起加载态（卸载） */
  function invalidateAll() {
    searchLoaders.forEach((loader) => loader.invalidate());
    labelLoaders.forEach((loader) => loader.invalidate());
  }

  /** 重置：作废在途取数，清掉候选与标签缓存 */
  function reset() {
    invalidateAll();
    labelCache.value = {};
    options.value = {};
  }

  return {
    options,
    loading,
    labelCache,
    fieldOptions,
    search,
    change,
    invalidateSearch,
    ensureLabel,
    invalidateAll,
    reset,
  };
}
