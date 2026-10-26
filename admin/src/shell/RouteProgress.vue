<script setup lang="ts">
  import useShellStore from '@/store/modules/shell';

  /** 路由切换时贴在页面最上沿的细进度条：进行中缓慢推进到约八成，结束时补满再淡出 */
  const shell = useShellStore();
  const barRef = ref<HTMLElement>();
  const phase = ref<'idle' | 'loading' | 'finishing'>('idle');
  let settleTimer: number | undefined;

  watch(
    () => shell.navigating,
    async (active) => {
      window.clearTimeout(settleTimer);
      if (!active) {
        if (phase.value !== 'loading') return;
        phase.value = 'finishing';
        settleTimer = window.setTimeout(() => {
          phase.value = 'idle';
        }, 400);
        return;
      }
      if (phase.value === 'finishing') {
        // 上一次还在收尾：先无过渡地归零，再从头推进，避免从满格缩回去
        phase.value = 'idle';
        await nextTick();
        void barRef.value?.offsetWidth;
        if (!shell.navigating) return;
      }
      phase.value = 'loading';
    },
  );

  onBeforeUnmount(() => window.clearTimeout(settleTimer));
</script>

<template>
  <div ref="barRef" class="route-progress" :class="`is-${phase}`" aria-hidden="true" />
</template>

<style scoped>
  .route-progress {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2000;
    width: 0;
    height: 2px;
    pointer-events: none;
    background: var(--el-color-primary);
    opacity: 0;
  }

  .route-progress.is-loading {
    width: 80%;
    opacity: 1;
    transition:
      width 2s cubic-bezier(0.1, 0.6, 0.3, 1),
      opacity 0.1s;
  }

  .route-progress.is-finishing {
    width: 100%;
    opacity: 0;
    transition:
      width 0.2s ease-out,
      opacity 0.3s ease 0.1s;
  }

  @media (prefers-reduced-motion: reduce) {
    .route-progress.is-loading,
    .route-progress.is-finishing {
      transition: opacity 0.2s;
    }
  }
</style>
