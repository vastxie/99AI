<script setup lang="ts">
import type { ResData } from '@/api/types';
import {
  fetchBindWxBySceneStrAPI,
  fetchGetQRCodeAPI,
  fetchGetQRSceneStrByBindAPI,
} from '@/api/user';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { CloseOutline } from '@vicons/ionicons5';
import type { CountdownInst } from 'naive-ui';
import {
  NCountdown,
  NIcon,
  NImage,
  NModal,
  NSkeleton,
  NSpin,
  useMessage,
} from 'naive-ui';
import { ref } from 'vue';

defineProps<Props>();

const useGlobalStore = useGlobalStoreWithOut();
let timer: any;
const countdownRef = ref<CountdownInst | null>();
const authStore = useAuthStore();
const activeCount = ref(false);
const wxLoginUrl = ref('');
const sceneStr = ref('');

interface Props {
  visible: boolean;
}
const Nmessage = useMessage();

async function getSeneStr() {
  const res: ResData = await fetchGetQRSceneStrByBindAPI();
  if (res.success) {
    sceneStr.value = res.data;
    getQrCodeUrl();
  }
}

async function getQrCodeUrl() {
  const res: ResData = await fetchGetQRCodeAPI({ sceneStr: sceneStr.value });
  if (res.success) {
    activeCount.value = true;
    wxLoginUrl.value = res.data;
    timer = setInterval(() => {
      bindWxBySnece();
    }, 1000);
  }
}

async function bindWxBySnece() {
  if (!sceneStr.value) return;
  const res: ResData = await fetchBindWxBySceneStrAPI({
    sceneStr: sceneStr.value,
  });
  if (res.data) {
    clearInterval(timer);
    const { status, msg } = res.data;
    if (status) Nmessage.success(msg);
    else Nmessage.error(msg);

    authStore.getUserInfo();
    useGlobalStore.updateBindwxDialog(false);
  }
}

function handleTimeDown() {
  clearInterval(timer);
  getSeneStr();
  countdownRef.value?.reset();
}

function openDialog() {
  getSeneStr();
}

function handleCloseDialog() {
  clearInterval(timer);
  wxLoginUrl.value = '';
  sceneStr.value = '';
  activeCount.value = false;
}
</script>

<template>
  <NModal
    :show="visible"
    style="width: 90%; max-width: 700px"
    :on-after-enter="openDialog"
    :on-after-leave="handleCloseDialog"
  >
    <div class="p-5 bg-white rounded-lg shadow-md dark:bg-slate-800 relative">
      <!-- 关闭按钮 -->
      <div
        class="absolute top-3 right-3 cursor-pointer"
        @click="useGlobalStore.updateBindwxDialog(false)"
      >
        <NIcon size="20" color="#0e7a0d">
          <CloseOutline />
        </NIcon>
      </div>

      <!-- 弹窗标题 -->
      <div
        class="flex items-start justify-start text-xl font-bold mb-5 dark:text-gray-300"
      >
        <!-- <NIcon size="25" color="#0e7a0d">
          <PaperPlaneOutline />
        </NIcon> -->
        <span class="ml-2">绑定微信账户</span>
      </div>

      <!-- 绑定提示 -->
      <div class="text-center font-bold text-sm py-5 dark:text-gray-400">
        <p>
          请在
          <span class="inline-block text-red-500">
            <NCountdown
              ref="countdownRef"
              :active="activeCount"
              :duration="120 * 1000"
              :on-finish="handleTimeDown"
            />
          </span>
          时间内完成绑定
        </p>
      </div>

      <!-- 微信二维码区域 -->
      <div class="my-4 flex justify-center relative">
        <NImage
          v-if="wxLoginUrl"
          preview-disabled
          width="230"
          :src="wxLoginUrl"
        />
        <NSkeleton v-else height="230px" width="230px" />
        <NSpin
          v-if="!wxLoginUrl"
          size="large"
          class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
        />
      </div>

      <!-- 提示文字 -->
      <span class="block text-center text-base py-4 dark:text-gray-400">
        打开微信扫码绑定账户
      </span>
    </div>
  </NModal>
</template>
