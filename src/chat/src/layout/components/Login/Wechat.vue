<script setup lang="ts">
import type { ResData } from '@/api/types';
import {
  fetchGetQRCodeAPI,
  fetchGetQRSceneStrAPI,
  fetchLoginBySceneStrAPI,
} from '@/api/user';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { CountdownInst, NImage, NSkeleton, NSpin, useMessage } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
// import Send from './send.vue';
// let timer: any;
const timer = ref();
const countdownTimer = ref();

interface Emit {
  (ev: 'changeLoginType', val: string): void;
}
const emit = defineEmits<Emit>();

const wxLoginUrl = ref('');
const sceneStr = ref('');
const activeCount = ref(false);
const Nmessage = useMessage();
const authStore = useAuthStore();
const countdownRef = ref<CountdownInst | null>();
const { isMobile } = useBasicLayout();
const phoneLoginStatus = computed(
  () => Number(authStore.globalConfig.phoneLoginStatus) === 1
);
// 使用 ref 来管理全局参数的状态
const agreedToUserAgreement = ref(true); // 读取初始状态并转换为布尔类型
const useGlobalStore = useGlobalStoreWithOut();

// 点击“用户协议及隐私政策”时，自动同意
function handleClick() {
  agreedToUserAgreement.value = true; // 设置为同意
  useGlobalStore.updateUserAgreementDialog(true);
}
const globalConfig = computed(() => authStore.globalConfig);

const emailLoginStatus = computed(
  () => Number(authStore.globalConfig.emailLoginStatus) === 1
);

const loginTypeText = computed(() => {
  if (emailLoginStatus.value && phoneLoginStatus.value) {
    return t('login.emailPhone');
  } else if (emailLoginStatus.value) {
    return t('login.email');
  } else if (phoneLoginStatus.value) {
    return t('login.phone');
  }
});

function loadImage(src: string) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getSeneStr() {
  const params = {};
  const res: ResData = await fetchGetQRSceneStrAPI(params);
  if (res.success) {
    sceneStr.value = res.data;
    getQrCodeUrl();
  }
}

async function loginBySnece() {
  if (!sceneStr.value) return;
  const res: ResData = await fetchLoginBySceneStrAPI({
    sceneStr: sceneStr.value,
  });
  if (res.data) {
    clearInterval(timer.value);
    Nmessage.success(t('login.loginSuccess'));
    authStore.setToken(res.data);
    authStore.getUserInfo();
    authStore.setLoginDialog(false);
  }
}

async function getQrCodeUrl() {
  const res: ResData = await fetchGetQRCodeAPI({ sceneStr: sceneStr.value });
  if (res.success) {
    activeCount.value = true;
    await loadImage(res.data);
    wxLoginUrl.value = res.data;
    timer.value = setInterval(() => {
      loginBySnece();
    }, 1000);
  }
}

function handleTimeDown() {
  // clearInterval(timer.value);
  getSeneStr();
  countdownRef.value?.reset();
}

onMounted(() => {
  handleTimeDown();
  if (countdownTimer.value !== null) {
    clearInterval(countdownTimer.value);
  }
  countdownTimer.value = setInterval(handleTimeDown, 60000);
  // getSeneStr();
});

onBeforeUnmount(() => {
  // 清除用于检测的timer
  if (timer.value !== null) {
    clearInterval(timer.value);
  }
  // 组件卸载时，也清除handleTimeDown的countdownTimer
  if (countdownTimer.value !== null) {
    clearInterval(countdownTimer.value);
  }
});
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center"
    :class="isMobile ? 'px-10 py-10' : ' py-10'"
  >
    <!-- <div class="text-[#374151] dark:text-white font-bold text-[20px] mt-[50px]">

    </div> -->
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <h2
        class="pt-5 pb-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900 dark:text-gray-300"
      >
        {{ t('login.wechatLogin') }}
      </h2>
    </div>

    <NImage
      v-if="
        wxLoginUrl &&
        (agreedToUserAgreement || globalConfig.isAutoOpenAgreement !== '1')
      "
      preview-disabled
      class="w-[220px] h-[220px] select-none"
      :src="wxLoginUrl"
    />
    <NSkeleton v-else height="220px" width="220px" animated />
    <NSpin
      v-if="!wxLoginUrl"
      size="large"
      class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
    />
    <div
      v-if="globalConfig.isAutoOpenAgreement === '1'"
      class="flex items-center justify-between mt-5"
    >
      <div class="flex items-center">
        <input
          v-model="agreedToUserAgreement"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
        />
        <p class="ml-1 text-center text-sm text-gray-500 dark:text-gray-400">
          扫码登录及代表同意
          <a
            href="#"
            class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
            @click="handleClick"
            >《{{ globalConfig.agreementTitle }}》</a
          >
        </p>
      </div>
    </div>
    <p
      v-if="emailLoginStatus || phoneLoginStatus"
      class="mt-3 mb-5 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      {{ t('login.wechatScanFailed') }}
      <a
        href="#"
        class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
        @click="emit('changeLoginType', 'email')"
        >{{ loginTypeText }}</a
      >
    </p>
    <p
      v-else
      class="mt-10 mb-5 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      {{ t('login.useWechatScan') }}
    </p>

    <!-- <p class="mt-10 text-center text-sm text-gray-500">
      登录即代表同意
      {{ ' ' }}
      <a
        href="#"
        class="font-semibold leading-6 text-indigo-600 hover:text-indigo-500"
        >用户协议</a
      >
    </p> -->
  </div>
</template>

<style>
.wechat-shadow {
  box-shadow: 0px 8px 10px 1px rgba(0, 0, 0, 0.1608);
}
</style>
