<script lang="ts" setup>
  import type { FilterField, FilterFieldOption, KeywordSearch } from './types';
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { createLatestLoader } from '@/utils/latestRequest';
  import {
    emptyFieldValue,
    isActiveFilterValue,
    pickFieldValues,
    resetFieldValues,
  } from './filterValues';
  import { createRemoteFields } from './remoteFields';

  /**
   * 统一筛选栏(设计准则:列表页筛选的唯一写法)。
   *
   * 布局:关键词输入(回车/清空生效) + 「筛选」弹层(手动应用) + 右侧操作按钮插槽。
   * 已选条件以 chips 展示,点 ✕ 立即移除并生效。
   *
   * 重置语义:emit('reset') 之前组件已清空关键词与全部声明字段,
   * 页面把 @apply / @reset 接到同一个 search() 即可,不需要自己清关键词。
   *
   * 关键词位有两种形态:默认文本输入;传 keywordSearch 时变成远程选择器
   * (如按昵称/手机号/邮箱搜用户,选中后回填 id)。同一个筛选条件只允许有一个
   * 入口 —— 关键词位已经承担的条件,不要在 fields 里再声明一遍。
   *
   * 用法:
   *   <FilterBar
   *     v-model:keyword="formInline.username"
   *     keyword-placeholder="用户姓名"
   *     :fields="fields"
   *     :filters="formInline"
   *     @update:filters="Object.assign(formInline, $event)"
   *     @apply="search"
   *     @reset="search"
   *   >
   *     <el-button type="primary" @click="handleAdd">新增</el-button>
   *   </FilterBar>
   */

  const props = withDefaults(
    defineProps<{
      keyword?: string | number;
      keywordPlaceholder?: string;
      /** 关键词位改用远程选择器(选中后 keyword 为选项 value) */
      keywordSearch?: KeywordSearch;
      filters: Record<string, any>;
      fields: FilterField[];
      /** 关键词位已由外部固定(如详情页内嵌表格)时隐藏 */
      hideKeyword?: boolean;
    }>(),
    {
      keyword: '',
      keywordPlaceholder: '关键词搜索',
      keywordSearch: undefined,
      hideKeyword: false,
    },
  );

  const emit = defineEmits<{
    'update:keyword': [value: string | number];
    'update:filters': [value: Record<string, any>];
    apply: [];
    reset: [];
  }>();

  const popoverVisible = ref(false);
  const draft = ref<Record<string, any>>({});
  const panelRef = ref<HTMLElement>();

  function onPopoverShow() {
    draft.value = pickFieldValues(props.fields, props.filters);
    // 打开后把焦点交给首个字段,键盘用户不必先 Tab 穿过整个面板
    nextTick(() => {
      panelRef.value?.querySelector<HTMLElement>('input:not([type="hidden"])')?.focus();
    });
  }

  const activeFields = computed(() =>
    props.fields.filter(
      (field) => field.countAsFilter !== false && isActiveFilterValue(props.filters[field.key]),
    ),
  );
  const activeCount = computed(() => activeFields.value.length);

  /** 面板分组:按 group 首次出现顺序保持字段相对次序 */
  const fieldGroups = computed(() => {
    const groups: Array<{ title: string; fields: FilterField[] }> = [];
    props.fields.forEach((field) => {
      const title = field.group || '';
      const last = groups.at(-1);
      if (last && last.title === title) {
        last.fields.push(field);
      } else {
        groups.push({ title, fields: [field] });
      }
    });
    return groups;
  });

  function optionLabel(field: FilterField) {
    const value = props.filters[field.key];
    if (field.type === 'remote-select') {
      return (
        remoteLabelCache.value[field.key]?.[value] ??
        field.options?.find((option) => option.value === value)?.label ??
        String(value)
      );
    }
    if (field.type === 'select') {
      return field.options?.find((option) => option.value === value)?.label ?? String(value);
    }
    if (Array.isArray(value)) return value.join(' ~ ');
    return String(value);
  }

  function applyDraft() {
    emit('update:filters', { ...draft.value });
    popoverVisible.value = false;
    emit('apply');
  }

  /**
   * 重置:关键词与全部字段一并清空(页面无需再自行清关键词)。
   * 先发字段的重置值、最后清关键词：字段更新只含字段键，不会把旧关键词写回；在途的远端取数一并作废
   */
  function resetDraft() {
    const cleared = resetFieldValues(props.fields);
    keywordSearchLoader.invalidate();
    keywordLabelLoader.invalidate();
    remote.reset();
    emit('update:filters', cleared);
    emit('update:keyword', '');
    draft.value = { ...cleared };
    keywordOptions.value = [];
    popoverVisible.value = false;
    emit('reset');
  }

  function removeChip(field: FilterField) {
    emit('update:filters', { [field.key]: emptyFieldValue(field.type) });
    emit('apply');
  }

  function onKeywordInput(value: string) {
    emit('update:keyword', value);
  }

  /*
   * 远端取数（关键词候选、关键词标签、各远程字段的候选与标签）都只认最后发出的那次：
   * 被更新的取数取代、值变化、重置、卸载后，晚到的旧结果不再写入，加载态随之收起；失败已由请求层提示
   */
  /* ---- 关键词位的远程选择器(keywordSearch) ---- */
  const keywordOptions = ref<FilterFieldOption[]>([]);
  const keywordLoading = ref(false);
  const keywordSearchLoader = createLatestLoader<FilterFieldOption[]>({
    apply: (options) => {
      keywordOptions.value = options;
    },
    setLoading: (loading) => {
      keywordLoading.value = loading;
    },
  });
  const keywordLabelLoader = createLatestLoader<{ value: any; label: string | undefined }>({
    apply: ({ value, label }) => {
      // 回来时关键词已经换了：这个标签不再对应
      if (label && props.keyword === value) {
        keywordOptions.value = [{ label, value }, ...keywordOptions.value];
      }
    },
  });

  function onKeywordSearch(query: string) {
    const search = props.keywordSearch;
    if (!search) return;
    void keywordSearchLoader.run(() => search.fetchOptions(query));
  }

  /** 已有 keyword 值但候选里没有对应项(路由参数钻取)时回查一次,避免搜索框显示原始 ID */
  function ensureKeywordLabel() {
    const search = props.keywordSearch;
    // 在途的旧回查不用作废：回来时按当前关键词核对，换了就不写
    if (!search?.resolveLabel) return;
    const value = props.keyword;
    if (!isActiveFilterValue(value)) return;
    if (keywordOptions.value.some((option) => option.value === value)) return;
    const resolveLabel = search.resolveLabel;
    void keywordLabelLoader.run(async () => ({ value, label: await resolveLabel(value) }));
  }

  watch(
    () => props.keyword,
    (value, previous) => {
      // 关键词换了：还没回来的候选搜索属于旧的输入，作废（否则晚到时会冲掉新值的标签）
      if (previous !== undefined && value !== previous) keywordSearchLoader.invalidate();
      ensureKeywordLabel();
    },
    { immediate: true },
  );

  /** 面板宽度随字段数走:单字段时收窄,不撑出一片空白 */
  const panelColumns = computed(() => (props.fields.length > 1 ? 2 : 1));
  const panelWidth = computed(() => (panelColumns.value === 2 ? 460 : 300));

  // remote-select 的候选与已选标签（面板里的选中 / 清空、应用后的值变化、重置、卸载都让在途取数作废）
  const remote = createRemoteFields((fieldKey) => props.filters[fieldKey]);
  const {
    loading: remoteLoading,
    labelCache: remoteLabelCache,
    fieldOptions: remoteFieldOptions,
    search: onRemoteSearch,
    change: onRemoteChange,
  } = remote;

  onBeforeUnmount(() => {
    keywordSearchLoader.invalidate();
    keywordLabelLoader.invalidate();
    remote.invalidateAll();
  });

  watch(
    () =>
      props.fields.map((field) =>
        field.type === 'remote-select' ? props.filters[field.key] : undefined,
      ),
    (values, previous) => {
      props.fields.forEach((field, index) => {
        // 这个字段的值换了：还没回来的候选搜索属于旧的输入，作废
        if (previous && values[index] !== previous[index]) remote.invalidateSearch(field.key);
        remote.ensureLabel(field);
      });
    },
    { immediate: true, deep: true },
  );
</script>

<template>
  <div class="filter-bar">
    <div class="filter-bar-row">
      <el-select
        v-if="!hideKeyword && keywordSearch"
        :model-value="keyword === '' ? undefined : keyword"
        :placeholder="keywordPlaceholder"
        class="filter-bar-keyword"
        clearable
        filterable
        remote
        :remote-method="onKeywordSearch"
        :loading="keywordLoading"
        @focus="onKeywordSearch('')"
        @update:model-value="onKeywordInput($event ?? '')"
        @change="emit('apply')"
      >
        <template #prefix>
          <AppIcon name="i-lucide:search" />
        </template>
        <el-option
          v-for="option in keywordOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <el-input
        v-else-if="!hideKeyword"
        :model-value="String(keyword)"
        :placeholder="keywordPlaceholder"
        clearable
        class="filter-bar-keyword"
        @update:model-value="onKeywordInput"
        @keyup.enter="emit('apply')"
        @clear="emit('apply')"
      >
        <template #prefix>
          <AppIcon name="i-lucide:search" />
        </template>
      </el-input>

      <el-popover
        v-model:visible="popoverVisible"
        placement="bottom"
        trigger="click"
        :width="panelWidth"
        @show="onPopoverShow"
      >
        <template #reference>
          <el-button
            class="filter-bar-trigger"
            :class="{ 'is-expanded': popoverVisible }"
            :aria-expanded="popoverVisible"
            :aria-label="activeCount ? `筛选，已选 ${activeCount} 项` : '筛选'"
          >
            <AppIcon name="i-lucide:list-filter" />
            筛选
            <span v-if="activeCount" class="filter-bar-badge" aria-hidden="true">
              {{ activeCount }}
            </span>
          </el-button>
        </template>

        <div
          ref="panelRef"
          class="filter-panel"
          :style="{ gridTemplateColumns: `repeat(${panelColumns}, minmax(0, 1fr))` }"
          @keydown.esc.stop="popoverVisible = false"
        >
          <template v-for="group in fieldGroups" :key="group.title">
            <div v-if="group.title" class="filter-panel-group">{{ group.title }}</div>
            <div
              v-for="field in group.fields"
              :key="field.key"
              class="filter-panel-field"
              :style="field.width ? { width: `${field.width}px` } : undefined"
            >
              <div class="filter-panel-label">{{ field.label }}</div>
              <el-input
                v-if="field.type === 'input'"
                v-model="draft[field.key]"
                :placeholder="field.placeholder || `请输入${field.label}`"
                clearable
                @keyup.enter="applyDraft"
              />
              <el-select
                v-else-if="field.type === 'select'"
                v-model="draft[field.key]"
                :placeholder="field.placeholder || `请选择${field.label}`"
                clearable
              >
                <el-option
                  v-for="option in field.options || []"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-select
                v-else-if="field.type === 'remote-select'"
                v-model="draft[field.key]"
                :placeholder="field.placeholder || `请选择${field.label}`"
                clearable
                filterable
                remote
                :remote-method="(query: string) => onRemoteSearch(field, query)"
                :loading="remoteLoading[field.key]"
                @focus="onRemoteSearch(field, '')"
                @change="(value: string | number) => onRemoteChange(field, value)"
              >
                <el-option
                  v-for="option in remoteFieldOptions(field)"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-date-picker
                v-else
                v-model="draft[field.key]"
                type="daterange"
                :placeholder="field.placeholder || `请选择${field.label}`"
                value-format="YYYY-MM-DD"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width: 100%"
              />
            </div>
          </template>
          <div class="filter-panel-footer">
            <el-button @click="resetDraft">重置</el-button>
            <el-button type="primary" @click="applyDraft">应用筛选</el-button>
          </div>
        </div>
      </el-popover>

      <div class="filter-bar-actions">
        <slot />
      </div>
    </div>

    <div v-if="activeCount" class="filter-bar-chips">
      <el-tag
        v-for="field in activeFields"
        :key="field.key"
        closable
        type="info"
        @close="removeChip(field)"
      >
        {{ field.label }}:{{ optionLabel(field) }}
      </el-tag>
    </div>
  </div>
</template>

<style scoped>
  .filter-bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .filter-bar-keyword {
    flex: 1;
    min-width: 180px;
    max-width: 320px;
  }

  .filter-bar-trigger {
    flex-shrink: 0;
  }

  /* 展开态用强调色描边 + 浅蓝底表达,与选中态同源 */
  .filter-bar-trigger:focus-visible,
  .filter-bar-trigger.is-expanded {
    color: var(--u-accent-text);
    background: var(--u-accent-soft);
    border-color: var(--u-accent);
  }

  .filter-bar-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    margin-left: 4px;
    font-size: 11px;
    line-height: 1;
    color: var(--el-color-white);
    background: var(--el-color-primary);
    border-radius: 999px;
  }

  .filter-bar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    white-space: nowrap;
  }

  .filter-bar-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .filter-panel {
    display: grid;
    gap: 12px 16px;
  }

  .filter-panel-group {
    grid-column: 1 / -1;
    padding-bottom: 2px;
    margin-bottom: -4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--u-text-primary);
    border-bottom: 1px solid var(--u-border-light);
  }

  .filter-panel-field {
    min-width: 0;
  }

  .filter-panel-field:has(.el-date-editor) {
    grid-column: 1 / -1;
  }

  .filter-panel-label {
    margin-bottom: 6px;
    font-size: 12px;
    color: var(--u-text-secondary);
  }

  .filter-panel-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    grid-column: 1 / -1;
    padding-top: 4px;
    border-top: 1px dashed var(--u-border-light);
  }
</style>
