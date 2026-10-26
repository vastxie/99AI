<script setup lang="ts">
  /** 顶栏与侧栏里的图标按钮：32px 点击区，悬停浅底 */
  defineProps<{
    icon: string;
    label: string;
  }>();
</script>

<template>
  <button type="button" class="icon-button" :aria-label="label" :title="label">
    <AppIcon :name="icon" />
  </button>
</template>

<style scoped>
  .icon-button {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 16px;
    color: var(--u-text-secondary);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--u-radius-m);
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .icon-button:hover {
    color: var(--u-text-primary);
    background-color: var(--u-bg-fill);
  }

  .icon-button:focus-visible {
    outline: 2px solid var(--u-accent-soft-hover);
    outline-offset: 0;
  }
</style>
