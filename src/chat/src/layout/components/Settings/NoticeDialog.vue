<script setup lang="ts">
import { useAppStore, useAuthStore } from '@/store';
import { MdPreview } from 'md-editor-v3';
import 'md-editor-v3/lib/preview.css';
import { computed } from 'vue';

const authStore = useAuthStore();
const appStore = useAppStore();
const darkMode = computed(() => appStore.theme === 'dark');

const { noticeInfo } = authStore.globalConfig;
</script>

<template>
  <div class="bg-white dark:bg-gray-900 flex overflow-y-auto h-[55vh]">
    <MdPreview
      editorId="preview-only"
      :modelValue="noticeInfo"
      :theme="darkMode ? 'dark' : 'light'"
      class="dark:bg-gray-900"
    />
  </div>
</template>
