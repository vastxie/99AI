/**
 * 布局外壳的界面状态：窄屏判定、侧栏收起与抽屉、页面搜索、路由切换进度、刷新当前页。
 */

/**
 * 窄屏：宽度不足 1024px，或没有悬停能力的触屏设备（手机、平板），
 * 侧栏改成抽屉。用媒体查询判断，不读 User-Agent。
 */
const COMPACT_QUERY = '(max-width: 1023.98px), (hover: none) and (pointer: coarse)';

const useShellStore = defineStore('shell', () => {
  const compactQuery = window.matchMedia(COMPACT_QUERY);
  const isCompact = ref(compactQuery.matches);
  compactQuery.addEventListener('change', (event) => {
    isCompact.value = event.matches;
  });

  /** 宽屏下侧栏是否收成图标轨 */
  const navCollapsed = ref(false);
  /** 窄屏下侧栏抽屉是否打开 */
  const drawerOpen = ref(false);
  const searchOpen = ref(false);
  /** 路由切换进行中（顶部进度条） */
  const navigating = ref(false);
  /** 当前页面的渲染代号：递增后页面按新 key 重新创建（顶栏的「刷新」与 F5） */
  const viewKey = ref(0);

  // 全局样式里的窄屏规则按 body[data-viewport] 生效
  watch(
    isCompact,
    (compact) => {
      document.body.dataset.viewport = compact ? 'compact' : 'wide';
      if (!compact) drawerOpen.value = false;
    },
    { immediate: true },
  );
  watch(
    () => isCompact.value && drawerOpen.value,
    (locked) => {
      document.body.classList.toggle('is-scroll-locked', locked);
    },
  );

  function toggleNav() {
    if (isCompact.value) drawerOpen.value = !drawerOpen.value;
    else navCollapsed.value = !navCollapsed.value;
  }

  function closeDrawer() {
    drawerOpen.value = false;
  }

  function reloadView() {
    viewKey.value += 1;
  }

  /** 外壳卸载（退出登录、会话过期）时收起抽屉与搜索，下次进来是干净的界面 */
  function resetOverlays() {
    drawerOpen.value = false;
    searchOpen.value = false;
  }

  return {
    isCompact,
    navCollapsed,
    drawerOpen,
    searchOpen,
    navigating,
    viewKey,
    toggleNav,
    closeDrawer,
    reloadView,
    resetOverlays,
  };
});

export default useShellStore;
