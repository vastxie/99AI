<script setup lang="ts">
  import useShellStore from '@/store/modules/shell';
  import { usePageDocUrl } from '@/utils/composables/usePageDoc';
  import BreadcrumbTrail from './BreadcrumbTrail.vue';
  import IconButton from './IconButton.vue';
  import ThemeToggle from './ThemeToggle.vue';
  import UserMenu from './UserMenu.vue';

  /** 顶栏：左侧是面包屑（窄屏换成打开导航的按钮），右侧是帮助文档、页面搜索、刷新、明暗切换与账号菜单 */
  const shell = useShellStore();
  const pageDocUrl = usePageDocUrl();

  /** 搜索快捷键的说明：苹果设备上 Alt 键印的是 ⌥ */
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  const searchHint = `搜索页面（快捷键 ${/mac|iphone|ipad/iu.test(platform) ? '⌥' : 'Alt'} + S）`;
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__start">
      <IconButton
        v-if="shell.isCompact"
        icon="i-lucide:panel-left"
        label="打开导航"
        @click="shell.toggleNav()"
      />
      <BreadcrumbTrail v-else />
    </div>
    <div class="top-bar__end">
      <a
        v-if="pageDocUrl && !shell.isCompact"
        :href="pageDocUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="top-bar__doc"
      >
        帮助文档
      </a>
      <IconButton
        v-if="shell.isCompact"
        icon="i-lucide:search"
        label="搜索页面"
        aria-keyshortcuts="Alt+S"
        @click="shell.searchOpen = true"
      />
      <button
        v-else
        type="button"
        class="search-field"
        :title="searchHint"
        aria-keyshortcuts="Alt+S"
        @click="shell.searchOpen = true"
      >
        <AppIcon name="i-lucide:search" :size="15" />
        <span>搜索页面…</span>
      </button>
      <IconButton icon="i-lucide:refresh-cw" label="刷新当前页" @click="shell.reloadView()" />
      <ThemeToggle />
      <UserMenu />
    </div>
  </header>
</template>

<style scoped>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--shell-bar-height);
    background-color: var(--u-bg-container);
    box-shadow: 0 1px 0 0 var(--u-border);
    transition: background-color 0.3s;
  }

  /* 面包屑放不下时在右端渐隐，不和右侧按钮挤在一起 */
  .top-bar__start {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding: 0 40px 0 12px;
    overflow: hidden;
    mask-image: linear-gradient(to right, black calc(100% - 32px), transparent);
  }

  .top-bar__end {
    display: flex;
    flex: none;
    gap: 2px;
    align-items: center;
    height: 100%;
    padding: 0 12px;
  }

  .top-bar__doc {
    padding: 0 10px;
    font-size: 13px;
    color: var(--u-text-secondary);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .top-bar__doc:hover {
    color: var(--u-accent);
  }

  /* 宽屏的搜索入口做成一条输入框样子的按钮，点开页面搜索 */
  .search-field {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    width: 200px;
    height: 32px;
    margin: 0 6px;
    padding: 0 12px;
    font-family: inherit;
    font-size: 13px;
    color: var(--u-text-placeholder);
    white-space: nowrap;
    cursor: text;
    background-color: var(--u-bg-container);
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-round);
    transition:
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .search-field:hover {
    color: var(--u-text-secondary);
    border-color: var(--u-accent);
  }
</style>
