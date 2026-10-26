<script setup lang="ts">
  import { buildBreadcrumbs } from '@/router/navigation';
  import { HOME_PATH, HOME_TITLE } from '@/router/routes';

  const route = useRoute();
  const crumbs = computed(() =>
    buildBreadcrumbs(route.matched, { path: HOME_PATH, title: HOME_TITLE }),
  );
</script>

<template>
  <nav class="breadcrumb-trail" aria-label="当前位置">
    <TransitionGroup name="crumb">
      <span v-for="(crumb, index) in crumbs" :key="`${index}:${crumb.title}`" class="crumb">
        <AppIcon
          v-if="index > 0"
          name="i-lucide:chevron-right"
          :size="14"
          class="crumb__separator"
        />
        <RouterLink v-if="crumb.path" :to="crumb.path" class="crumb__link">
          {{ crumb.title }}
        </RouterLink>
        <span v-else class="crumb__current" aria-current="page">{{ crumb.title }}</span>
      </span>
    </TransitionGroup>
  </nav>
</template>

<style scoped>
  .breadcrumb-trail {
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 13px;
    white-space: nowrap;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
  }

  .crumb__separator {
    flex: none;
    margin: 0 4px;
    color: var(--u-text-placeholder);
  }

  .crumb__link {
    color: var(--u-text-secondary);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .crumb__link:hover {
    color: var(--u-text-primary);
  }

  .crumb__current {
    font-weight: 500;
    color: var(--u-text-primary);
  }

  .crumb-enter-active {
    transition:
      opacity 0.25s ease,
      transform 0.25s ease;
  }

  .crumb-enter-from {
    opacity: 0;
    transform: translateX(8px);
  }

  @media (prefers-reduced-motion: reduce) {
    .crumb-enter-from {
      transform: none;
    }
  }
</style>
