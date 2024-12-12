<script setup lang="ts">
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { ss } from '@/utils/storage';
import { Close } from '@icon-park/vue-next';
import 'md-editor-v3/lib/preview.css';
import { computed } from 'vue';

interface Props {
  visible: boolean;
}
const authStore = useAuthStore();

const props = defineProps<Props>();

const useGlobalStore = useGlobalStoreWithOut();
const globalConfig = computed(() => authStore.globalConfig);

// const agreementTitle = authStore.globalConfig.siteName;
// const agreementInfo = authStore.globalConfig.agreementInfo;

function handleClose() {
  useGlobalStore.updateUserAgreementDialog(false); // 假设你有一个类似的状态管理方法
}

function handleAgree() {
  useGlobalStore.updateUserAgreementDialog(false); // 假设你有一个类似的状态管理方法
  ss.set('agreedToUserAgreement', 'true'); // 标记用户已经同意
}
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
        <span class="text-xl">{{ globalConfig.agreementTitle }}</span>
      </div>
      <div class="flex-1 overflow-y-auto">
        <!-- <div v-if="loading" class="space-y-2">
          <div
            v-for="i in 10"
            :key="i"
            class="bg-gray-300 dark:bg-gray-900 h-4 rounded"
          ></div>
        </div> -->
        <div
          v-html="globalConfig.agreementInfo"
          class="dark:bg-gray-900 p-1"
        ></div>
      </div>
      <div class="flex justify-end mt-3">
        <button
          @click="handleAgree"
          class="px-4 py-2 shadow-sm bg-primary-600 text-white rounded-md hover:bg-primary-500"
        >
          <span>已阅读</span>
        </button>
      </div>
    </div>
  </div>
</template>
