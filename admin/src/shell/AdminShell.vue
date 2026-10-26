<script setup lang="ts">
  import { useEventListener } from '@vueuse/core';
  import useShellStore from '@/store/modules/shell';
  import { isEditableTarget } from './keyboard';
  import PageSearch from './PageSearch.vue';
  import ScrollTopButton from './ScrollTopButton.vue';
  import SideNav from './SideNav.vue';
  import TopBar from './TopBar.vue';

  /**
   * 管理后台的布局外壳：左侧导航，右侧是顶栏与页面内容，整页跟随文档滚动（顶栏随页面滚走）。
   * 宽屏时侧栏停靠在视口左侧、可收成图标轨；窄屏时侧栏改成从左侧滑出的抽屉。
   */
  const route = useRoute();
  const shell = useShellStore();
  const showRail = computed(() => !shell.isCompact && shell.navCollapsed);

  // 窄屏下点了导航里的页面就收起抽屉
  watch(
    () => route.path,
    () => shell.closeDrawer(),
  );

  // F5 只重建当前页面、重新拉取数据，不整页刷新；焦点在输入框里时照常交给浏览器
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const withModifier = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
    if (event.key !== 'F5' || withModifier || isEditableTarget(event.target)) return;
    event.preventDefault();
    shell.reloadView();
  });

  onBeforeUnmount(() => shell.resetOverlays());
</script>

<template>
  <div class="admin-shell" :class="{ 'is-compact': shell.isCompact, 'is-rail': showRail }">
    <aside class="admin-shell__nav" :class="{ 'is-open': shell.drawerOpen }">
      <SideNav :rail="showRail" />
    </aside>
    <div
      v-if="shell.isCompact"
      class="admin-shell__scrim"
      :class="{ 'is-visible': shell.drawerOpen }"
      @click="shell.closeDrawer()"
    />
    <div class="admin-shell__main">
      <TopBar />
      <main class="admin-shell__content">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition name="view-fade" mode="out-in" appear>
            <component :is="Component" :key="`${viewRoute.fullPath}#${shell.viewKey}`" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <PageSearch />
    <ScrollTopButton />
  </div>
</template>

<style scoped>
  .admin-shell {
    display: flex;
    min-height: 100%;
  }

  /* 宽屏：侧栏在文档流里占一列，贴住视口左侧不随页面滚动 */
  .admin-shell__nav {
    position: sticky;
    top: 0;
    z-index: 20;
    flex: none;
    width: var(--shell-nav-width);
    height: 100vh;
    height: 100dvh;
    box-shadow: 1px 0 0 0 var(--u-border);
    transition: width 0.25s ease;
  }

  .admin-shell.is-rail .admin-shell__nav {
    width: var(--shell-rail-width);
  }

  /* 窄屏：侧栏移出文档流，平时藏在左侧外面，打开时滑进来盖在页面上 */
  .admin-shell.is-compact .admin-shell__nav {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 1300;
    height: auto;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }

  .admin-shell.is-compact .admin-shell__nav.is-open {
    transform: none;
  }

  .admin-shell__scrim {
    position: fixed;
    inset: 0;
    z-index: 1250;
    pointer-events: none;
    background: var(--u-overlay);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .admin-shell__scrim.is-visible {
    pointer-events: auto;
    opacity: 1;
  }

  .admin-shell__main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    background-color: var(--u-bg-page);
    transition: background-color 0.3s;
  }

  /* 横向裁掉超宽内容但不形成滚动容器，页面里的 sticky 仍相对视口生效 */
  .admin-shell__content {
    position: relative;
    flex: 1;
    overflow-x: clip;
  }

  /*
   * 页面里的对话框与抽屉默认就渲染在内容区里（z-index 2001 起），要盖住侧栏与回到顶部按钮，所以内容区不能自成层叠上下文。
   * 只把 Element Plus 的局部加载遮罩（默认 2000）压到窄屏抽屉（1300）与它的遮罩（1250）之下；
   * 1200 仍高于页面内组件自己用到的层级（Element Plus 最高 1001）。
   */
  .admin-shell__content :deep(.el-loading-mask) {
    z-index: 1200;
  }

  .view-fade-enter-active {
    transition:
      opacity 0.16s ease-out,
      transform 0.16s ease-out;
  }

  .view-fade-leave-active {
    transition: opacity 0.1s ease-in;
  }

  .view-fade-enter-from {
    opacity: 0;
    transform: translateY(4px);
  }

  .view-fade-leave-to {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .view-fade-enter-from {
      transform: none;
    }
  }
</style>
