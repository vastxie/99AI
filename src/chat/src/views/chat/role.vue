<script setup lang="ts">
import { computed } from 'vue';
import { NLayout, NLayoutContent } from 'naive-ui';
import Sider from './components/sider/index.vue';
import Role from './roleRepository/index.vue';
// import Apps from '../appStore/components/main/index.vue';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { useAppStore } from '@/store';
const appStore = useAppStore();

const { isMobile } = useBasicLayout();

const collapsed = computed(() => appStore.siderCollapsed);

const getMobileClass = computed(() => {
  if (isMobile.value) return ['rounded-none', 'shadow-none'];
  return ['rounded-md', 'shadow-md', 'dark:border-neutral-800'];
});

const getContainerClass = computed(() => {
  return ['h-full', { 'pl-[260px]': !isMobile.value && !collapsed.value }];
});
</script>

<template>
  <div class="h-full dark:bg-gray-900 transition-all">
    <div class="h-full overflow-hidden" :class="getMobileClass">
      <NLayout class="z-40 transition" :class="getContainerClass" has-sider>
        <Sider />
        <NLayoutContent class="h-full">
          <Role />
        </NLayoutContent>
      </NLayout>
    </div>
  </div>
</template>
