<script setup lang="ts">
import { fetchGetGlobalNoticeAPI } from '@/api/global';
import type { ResData } from '@/api/types';
// import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAppStore, useGlobalStoreWithOut } from '@/store';
import { ss } from '@/utils/storage';
import { Close } from '@icon-park/vue-next';
import { MdPreview } from 'md-editor-v3';
import 'md-editor-v3/lib/preview.css';
import { computed, ref, watch } from 'vue';

interface Props {
  visible: boolean;
}

interface Notice {
  noticeInfo: string;
  noticeTitle: string;
}

const props = defineProps<Props>();

const notice = ref<Notice>({
  noticeInfo: '',
  noticeTitle: '',
});

const appStore = useAppStore();
const useGlobalStore = useGlobalStoreWithOut();
const loading = ref(true);
const darkMode = computed(() => appStore.theme === 'dark');
// const { isSmallLg } = useBasicLayout();
// const theme = computed(() => appStore.theme);

const html = computed(() => {
  if (!notice.value.noticeInfo) return '';
  return notice.value.noticeInfo;
});

const id = 'preview-only';

// function handleCloseDialog() {
//   loading.value = true;
// }

function handleClose() {
  useGlobalStore.updateNoticeDialog(false);
}

async function queryNotice() {
  const res: ResData = await fetchGetGlobalNoticeAPI();
  const { success, data } = res;
  if (success) notice.value = data;
}

async function openDrawerAfter() {
  loading.value = true;
  await queryNotice();
  loading.value = false;
}

function handleReminder() {
  useGlobalStore.updateNoticeDialog(false);
  ss.set('showNotice', Date.now() + 24 * 60 * 60 * 1000);
}

// 监听 visible 属性变化
watch(
  () => props.visible,
  (newValue) => {
    if (newValue) {
      openDrawerAfter();
    }
  }
);
</script>

<template>
  <div
    v-if="props.visible"
    class="fixed inset-0 z-50 px-2 flex items-center justify-center bg-black bg-opacity-50"
  >
    <div
      class="bg-white dark:bg-gray-900 p-4 rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col relative"
    >
      <Close
        size="18"
        class="absolute top-3 right-3 cursor-pointer z-30"
        @click="handleClose"
      />
      <div class="flex justify-between items-center mb-3">
        <div
          v-if="loading"
          class="w-1/3 bg-gray-300 dark:bg-gray-700 h-6 rounded"
        ></div>
        <template v-else>
          <span class="text-xl">{{ notice.noticeTitle }}</span>
        </template>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="space-y-2">
          <div
            v-for="i in 10"
            :key="i"
            class="bg-gray-300 dark:bg-gray-900 h-4 rounded"
          ></div>
        </div>
        <template v-else>
          <MdPreview
            :editorId="id"
            :modelValue="html"
            :theme="darkMode ? 'dark' : 'light'"
            class="dark:bg-gray-900"
          />
        </template>
      </div>
      <div class="flex justify-end mt-3">
        <button
          @click="handleReminder"
          class="px-4 py-2 shadow-sm bg-primary-600 text-white rounded-md hover:bg-primary-500"
        >
          <span>{{ t('notice.doNotRemind24h') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
