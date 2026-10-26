<script setup lang="ts">
  import { useEventListener } from '@vueuse/core';

  /** 页面往下滚过大约一屏后出现在右下角，点击回到顶部 */
  const SHOW_AFTER = 400;
  const visible = ref(false);

  function update() {
    visible.value = window.scrollY > SHOW_AFTER;
  }

  function scrollToTop() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  useEventListener(window, 'scroll', update, { passive: true });
  onMounted(update);
</script>

<template>
  <Transition name="scroll-top">
    <button
      v-if="visible"
      type="button"
      class="scroll-top"
      aria-label="回到顶部"
      title="回到顶部"
      @click="scrollToTop"
    >
      <AppIcon name="i-lucide:arrow-up" :size="18" />
    </button>
  </Transition>
</template>

<style scoped>
  .scroll-top {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    color: var(--u-text-secondary);
    cursor: pointer;
    background: var(--u-bg-elevated);
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-m);
    box-shadow: var(--u-shadow-s);
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .scroll-top:hover {
    color: var(--u-accent);
    border-color: var(--u-accent);
  }

  .scroll-top-enter-active,
  .scroll-top-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .scroll-top-enter-from,
  .scroll-top-leave-to {
    opacity: 0;
    transform: translateY(8px);
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-top-enter-from,
    .scroll-top-leave-to {
      transform: none;
    }
  }
</style>
