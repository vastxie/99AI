<script setup lang="ts">
  import type { ThemePreference } from '@/store/modules/theme';
  import useThemeStore from '@/store/modules/theme';
  import IconButton from './IconButton.vue';

  /**
   * 明暗模式：点图标在浅色与深色之间切换，新画面从点击位置以圆形展开；
   * 悬停弹出三个选项（含跟随系统）。
   */
  const theme = useThemeStore();

  const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'light', label: '浅色', icon: 'i-lucide:sun' },
    { value: 'dark', label: '深色', icon: 'i-lucide:moon' },
    { value: 'system', label: '跟随系统', icon: 'i-lucide:sun-moon' },
  ];

  const currentIcon = computed(
    () => OPTIONS.find((option) => option.value === theme.preference)?.icon ?? 'i-lucide:sun',
  );

  function switchTo(next: ThemePreference, origin?: { x: number; y: number }) {
    if (next === theme.preference) return;
    const root = document.documentElement;
    // 切换期间冻结过渡，揭开的新画面里各元素不再各自渐变
    root.classList.add('is-theme-switching');
    const release = () => root.classList.remove('is-theme-switching');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!origin || reduceMotion || !document.startViewTransition) {
      theme.setPreference(next);
      requestAnimationFrame(() => requestAnimationFrame(release));
      return;
    }

    const transition = document.startViewTransition(async () => {
      theme.setPreference(next);
      await nextTick();
    });
    transition.finished.then(release, release);
    transition.ready
      .then(() => {
        const { x, y } = origin;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 320, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {
        // 过渡被跳过时新画面已经直接生效
      });
  }

  function toggle(event: MouseEvent) {
    switchTo(theme.scheme === 'dark' ? 'light' : 'dark', { x: event.clientX, y: event.clientY });
  }

  function onSelect(command: unknown) {
    const option = OPTIONS.find((item) => item.value === command);
    if (option) switchTo(option.value);
  }
</script>

<template>
  <el-dropdown trigger="hover" placement="bottom" :show-timeout="150" @command="onSelect">
    <IconButton :icon="currentIcon" label="切换明暗模式" @click="toggle" />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="option in OPTIONS" :key="option.value" :command="option.value">
          <span class="theme-option" :class="{ 'is-current': option.value === theme.preference }">
            <AppIcon :name="option.icon" />
            <span class="theme-option__label">{{ option.label }}</span>
            <AppIcon
              v-if="option.value === theme.preference"
              name="i-lucide:check"
              class="theme-option__check"
            />
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
  .theme-option {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 108px;
  }

  .theme-option__label {
    flex: 1;
  }

  .theme-option.is-current {
    color: var(--u-accent-text);
  }

  .theme-option__check {
    flex: none;
  }
</style>
