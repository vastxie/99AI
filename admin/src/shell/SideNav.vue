<script setup lang="ts">
  import { useIntersectionObserver } from '@vueuse/core';
  import { groupRoutes } from '@/router/groups';
  import type { NavGroup } from '@/router/navigation';
  import { activeNavPath, buildNavGroups } from '@/router/navigation';
  import useShellStore from '@/store/modules/shell';
  import useUserStore from '@/store/modules/user';
  import BrandLink from './BrandLink.vue';
  import IconButton from './IconButton.vue';

  /**
   * 侧栏：品牌区 + 导航 + 收起按钮。
   * 展开时按分组平铺（分组名作小标题，页面常驻显示）；rail 时收成一列分组图标，悬停弹出该组的页面。
   */
  defineProps<{
    rail: boolean;
  }>();

  const route = useRoute();
  const shell = useShellStore();
  const user = useUserStore();

  const groups = computed(() => buildNavGroups(groupRoutes, user.hasRole));
  const activePath = computed(() => activeNavPath(route));

  function isGroupActive(group: NavGroup) {
    return group.links.some((link) => link.path === activePath.value);
  }

  // 图标轨的弹出层：点了其中的页面就收起
  const flyouts = new Map<string, { hide: () => void }>();
  function bindFlyout(path: string, instance: unknown) {
    if (instance) flyouts.set(path, instance as { hide: () => void });
    else flyouts.delete(path);
  }
  function closeFlyout(path: string) {
    flyouts.get(path)?.hide();
  }

  // 导航列表放不下时，还能继续滚动的那一端渐隐：列表首尾各放一个哨兵，哨兵移出可视区就说明那一端还有内容
  const scrollerRef = ref<HTMLElement>();
  const headSentinel = ref<HTMLElement>();
  const tailSentinel = ref<HTMLElement>();
  const moreAbove = ref(false);
  const moreBelow = ref(false);
  useIntersectionObserver(
    headSentinel,
    (entries) => {
      moreAbove.value = !entries.at(-1)?.isIntersecting;
    },
    { root: scrollerRef },
  );
  useIntersectionObserver(
    tailSentinel,
    (entries) => {
      moreBelow.value = !entries.at(-1)?.isIntersecting;
    },
    { root: scrollerRef },
  );
</script>

<template>
  <div class="side-nav" :class="{ 'is-rail': rail }">
    <BrandLink :compact="rail" />
    <div
      ref="scrollerRef"
      class="side-nav__scroller"
      :class="{ 'more-above': moreAbove, 'more-below': moreBelow }"
    >
      <nav class="side-nav__list" aria-label="主导航">
        <span ref="headSentinel" class="side-nav__sentinel" aria-hidden="true" />
        <template v-if="!rail">
          <section v-for="group in groups" :key="group.path" class="nav-group">
            <h2 class="nav-group__title">{{ group.title }}</h2>
            <RouterLink
              v-for="link in group.links"
              :key="link.path"
              :to="link.path"
              class="nav-link"
              :class="{ 'is-active': link.path === activePath }"
            >
              <AppIcon v-if="link.icon" :name="link.icon" :size="16" class="nav-link__icon" />
              <span class="nav-link__text">{{ link.title }}</span>
            </RouterLink>
          </section>
        </template>
        <template v-else>
          <el-popover
            v-for="group in groups"
            :key="group.path"
            :ref="(instance: unknown) => bindFlyout(group.path, instance)"
            trigger="hover"
            placement="right-start"
            :width="220"
            :offset="8"
            :show-after="100"
            :hide-after="150"
            :show-arrow="false"
            popper-class="side-nav-flyout"
          >
            <template #reference>
              <button
                type="button"
                class="nav-rail-item"
                :class="{ 'is-active': isGroupActive(group) }"
                :aria-label="group.title"
              >
                <AppIcon v-if="group.icon" :name="group.icon" :size="20" class="nav-link__icon" />
              </button>
            </template>
            <div class="nav-flyout">
              <div class="nav-flyout__title">{{ group.title }}</div>
              <RouterLink
                v-for="link in group.links"
                :key="link.path"
                :to="link.path"
                class="nav-link"
                :class="{ 'is-active': link.path === activePath }"
                @click="closeFlyout(group.path)"
              >
                <AppIcon v-if="link.icon" :name="link.icon" :size="16" class="nav-link__icon" />
                <span class="nav-link__text">{{ link.title }}</span>
              </RouterLink>
            </div>
          </el-popover>
        </template>
        <span ref="tailSentinel" class="side-nav__sentinel" aria-hidden="true" />
      </nav>
    </div>
    <div v-if="!shell.isCompact" class="side-nav__footer">
      <IconButton
        :icon="rail ? 'i-lucide:panel-left-open' : 'i-lucide:panel-left-close'"
        :label="rail ? '展开侧栏' : '收起侧栏'"
        @click="shell.toggleNav()"
      />
    </div>
  </div>
</template>

<style scoped>
  .side-nav {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--u-bg-container);
    transition: background-color 0.3s;
  }

  .side-nav__scroller {
    flex: 1;
    min-height: 0;
    overflow: hidden auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .side-nav__scroller::-webkit-scrollbar {
    display: none;
  }

  .side-nav__scroller.more-above {
    mask-image: linear-gradient(to bottom, transparent, black 24px);
  }

  .side-nav__scroller.more-below {
    mask-image: linear-gradient(to top, transparent, black 24px);
  }

  .side-nav__scroller.more-above.more-below {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      black 24px,
      black calc(100% - 24px),
      transparent
    );
  }

  .side-nav__sentinel {
    flex: none;
    height: 1px;
  }

  .side-nav__list {
    display: flex;
    flex-direction: column;
    padding-bottom: 8px;
  }

  .is-rail .side-nav__list {
    padding-top: 8px;
  }

  .nav-group__title {
    margin: 16px 8px 4px;
    padding: 0 12px;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    letter-spacing: 0.025em;
    color: var(--u-text-placeholder);
  }

  /* 列表开头是哨兵元素，按类型取第一个分组 */
  .nav-group:first-of-type .nav-group__title {
    margin-top: 4px;
  }

  .nav-link,
  .nav-rail-item {
    display: flex;
    gap: 10px;
    align-items: center;
    width: calc(100% - 16px);
    margin: 0 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--u-nav-text);
    text-decoration: none;
    cursor: pointer;
    border-radius: var(--u-radius-m);
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .nav-link + .nav-link,
  .nav-rail-item + .nav-rail-item {
    margin-top: 2px;
  }

  .nav-link:hover,
  .nav-rail-item:hover {
    color: var(--u-text-primary);
    background-color: var(--u-nav-hover-bg);
  }

  .nav-link.is-active,
  .nav-rail-item.is-active {
    font-weight: 500;
    color: var(--u-accent-text);
    background-color: var(--u-accent-soft);
  }

  .nav-link__icon {
    flex: none;
    color: var(--u-text-secondary);
    transition: color 0.15s ease;
  }

  .nav-link:hover .nav-link__icon,
  .nav-rail-item:hover .nav-link__icon,
  .is-active .nav-link__icon {
    color: currentcolor;
  }

  .nav-link__text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-rail-item {
    justify-content: center;
    padding: 8px;
    background: transparent;
    border: 0;
  }

  .nav-flyout {
    display: flex;
    flex-direction: column;
  }

  .nav-flyout__title {
    padding: 4px 20px 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--u-text-placeholder);
  }

  .side-nav__footer {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: flex-end;
    padding: 12px 16px;
  }

  .is-rail .side-nav__footer {
    justify-content: center;
  }
</style>

<style>
  /* 图标轨弹出层（挂在 body 下，不能用 scoped） */
  .el-popover.el-popper.side-nav-flyout {
    padding: 8px 0;
    background: var(--u-bg-elevated);
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-l);
    box-shadow: var(--u-shadow-m);
  }
</style>
