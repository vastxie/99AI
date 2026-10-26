<script setup lang="ts">
  /** 页面内容卡片：可选的标题栏加内容区；窄屏下的留白收紧见 styles/base.scss */
  defineProps<{
    title?: string;
  }>();
</script>

<template>
  <section class="page-panel">
    <header v-if="title || $slots.title" class="page-panel__header">
      <slot name="title">{{ title }}</slot>
    </header>
    <div class="page-panel__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
  .page-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    margin: 16px;
    background-color: var(--u-bg-container);
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-l);
    box-shadow: var(--u-shadow-s);
    transition: background-color 0.3s;
  }

  .page-panel__header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--u-border-light);
    transition: border-color 0.3s;
  }

  .page-panel__body {
    padding: 20px;
  }
</style>
