<script setup lang="ts">
  import { HOME_PATH } from '@/router/routes';
  import useBrandStore from '@/store/modules/brand';

  /** 侧栏顶部的站点标识与名称，点击回首页；compact 时只留标识（侧栏收成图标轨） */
  defineProps<{
    compact?: boolean;
  }>();

  const brand = useBrandStore();
  void brand.load();

  // 记住加载失败的那个地址：失败时退回默认图标，换了新地址自然会再试
  const brokenLogo = ref('');
</script>

<template>
  <RouterLink
    :to="HOME_PATH"
    class="brand-link"
    :class="{ 'is-compact': compact }"
    :title="brand.displayName"
  >
    <span class="brand-link__mark">
      <img
        v-if="brand.logoUrl && brand.logoUrl !== brokenLogo"
        :src="brand.logoUrl"
        alt=""
        @error="brokenLogo = brand.logoUrl"
      />
      <AppIcon v-else name="i-lucide:bot" :size="16" />
    </span>
    <span v-if="!compact" class="brand-link__name">{{ brand.displayName }}</span>
  </RouterLink>
</template>

<style scoped>
  .brand-link {
    display: flex;
    flex: none;
    gap: 10px;
    align-items: center;
    height: var(--shell-bar-height);
    padding: 0 16px;
    color: var(--u-text-primary);
    text-decoration: none;
    background-color: var(--u-bg-container);
    /* 分隔线用阴影画，不占高度，与顶栏底边对齐 */
    box-shadow: 0 1px 0 0 var(--u-border);
    transition: background-color 0.3s;
  }

  .brand-link.is-compact {
    justify-content: center;
    padding: 0;
  }

  .brand-link__mark {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    overflow: hidden;
    color: var(--u-on-accent);
    background-color: var(--u-accent);
    border-radius: var(--u-radius-m);
  }

  .brand-link__mark img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .brand-link__name {
    overflow: hidden;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
