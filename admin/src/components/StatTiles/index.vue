<script lang="ts" setup>
  /**
   * 指标磁贴(设计准则:详情页与扩展包片段里的统计数字统一用它,不再各自画卡片)。
   * 紧凑单行:标签 12px、数值 20px 等宽数字、辅助说明 12px。
   */
  export interface StatTileItem {
    label: string;
    value: string | number;
    helper?: string;
  }

  withDefaults(
    defineProps<{
      items: StatTileItem[];
      /** 每个磁贴的最小宽度,自动换行 */
      minWidth?: number;
    }>(),
    { minWidth: 150 },
  );
</script>

<template>
  <div class="stat-tiles" :style="{ '--stat-tile-min': `${minWidth}px` }">
    <div v-for="item in items" :key="item.label" class="stat-tile">
      <span class="stat-tile-label">{{ item.label }}</span>
      <strong class="stat-tile-value">{{ item.value }}</strong>
      <span v-if="item.helper" class="stat-tile-helper">{{ item.helper }}</span>
    </div>
  </div>
</template>

<style scoped>
  .stat-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--stat-tile-min), 1fr));
    gap: 10px;
  }

  .stat-tile {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: var(--u-bg-subtle);
    border: 1px solid var(--u-border-light);
    border-radius: var(--u-radius-m);
  }

  .stat-tile-label,
  .stat-tile-helper {
    overflow: hidden;
    font-size: 12px;
    color: var(--u-text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat-tile-helper {
    color: var(--u-text-placeholder);
  }

  .stat-tile-value {
    overflow: hidden;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--u-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
