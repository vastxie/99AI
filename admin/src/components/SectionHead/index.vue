<script lang="ts" setup>
  /** 页签 / 片段内的小节标题:左标题 + 说明,右侧放操作(默认插槽) */
  defineProps<{
    title: string;
    description?: string;
  }>();
</script>

<template>
  <div class="section-head">
    <div class="section-head-text">
      <h3 class="section-head-title">{{ title }}</h3>
      <p v-if="description" class="section-head-desc">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="section-head-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
  .section-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    margin-bottom: 12px;
  }

  .section-head-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 22px;
    color: var(--u-text-primary);
  }

  .section-head-desc {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--u-text-secondary);
  }

  .section-head-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>
