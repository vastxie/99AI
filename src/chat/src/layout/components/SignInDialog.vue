<template>
  <transition name="modal-fade">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div
        class="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-xl max-h-[80vh] overflow-y-auto"
      >
        <div class="flex justify-between items-center mb-4">
          <span class="text-base">
            签到奖励
            <span
              >（已连续签到<b class="text-[red]">{{ consecutiveDays }}</b
              >天）</span
            >
          </span>
          <button
            @click="handleClose"
            class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <span class="sr-only">Close</span>
            <svg
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>
        <div
          class="bg-gray-50 mb-5 p-2 rounded-md border border-gray-200 dark:border-gray-700 dark:bg-gray-700"
        >
          每日签到赠送：
          <span v-if="signInModel3Count > 0 && !isHideModel3Point"
            ><b class="mx-2 text-primary-500">{{ signInModel3Count }}</b
            >{{ model3Name }}</span
          >
          <span v-if="signInModel4Count > 0 && !isHideModel4Point"
            ><b class="mx-2 text-primary-500">{{ signInModel4Count }}</b
            >{{ model4Name }}</span
          >
          <span v-if="signInMjDrawToken > 0 && !isHideDrawMjPoint"
            ><b class="mx-2 text-primary-500">{{ signInMjDrawToken }}</b
            >{{ drawMjName }}</span
          >
        </div>
        <NSpin :show="loading">
          <div
            class="mt-10 grid grid-cols-7 text-center text-xs leading-6 text-gray-500 dark:text-gray-400"
          >
            <div>日</div>
            <div>一</div>
            <div>二</div>
            <div>三</div>
            <div>四</div>
            <div>五</div>
            <div>六</div>
          </div>
          <div class="mt-2 grid grid-cols-7 text-sm">
            <div
              v-for="n in getFirstDayOfMonth(
                new Date().getFullYear(),
                new Date().getMonth()
              )"
              :key="'empty-' + n"
              class="py-2"
            ></div>
            <div v-for="day in days" :key="day.signInDate" class="py-2">
              <button
                type="button"
                :class="[
                  day.isToday
                    ? 'bg-primary-600 text-white'
                    : day.isSigned
                    ? 'text-primary-600'
                    : 'text-gray-900 dark:text-gray-100',
                  'hover:bg-gray-200 dark:hover:bg-gray-700 mx-auto flex h-8 w-8 items-center justify-center rounded-full',
                ]"
              >
                <time :datetime="day.signInDate">{{ day.day }}</time>
              </button>
            </div>
          </div>
        </NSpin>
        <div class="flex mt-3 w-full">
          <button
            :class="[
              'w-full py-2 px-4 rounded text-white',
              hasSignedInToday
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600',
            ]"
            :disabled="hasSignedInToday"
            @click="handleSignIn"
          >
            签到
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { fetchSignInAPI, fetchSignLogAPI } from '@/api/signin';
import type { ResData } from '@/api/types';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { NSpin, useMessage } from 'naive-ui';
import { computed, ref, watch } from 'vue';

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();
const authStore = useAuthStore();
const useGlobalStore = useGlobalStoreWithOut();
const loading = ref(false);
const { isMobile } = useBasicLayout();
const signInData = ref<{ signInDate: string; isSigned: boolean }[]>([]);
const ms = useMessage();
const signInLoading = ref(false);

const today = new Date().toISOString().split('T')[0];

const days = computed(() => {
  return signInData.value.map((item) => ({
    ...item,
    day: item.signInDate.split('-').pop()?.replace(/^0/, ''),
    isToday: item.signInDate === today,
  }));
});

const model3Name = computed(
  () => authStore.globalConfig.model3Name || t('pay.baseModelQuota')
);
const model4Name =
  computed(() => authStore.globalConfig.model4Name) ||
  t('pay.advancedModelQuota');
const drawMjName =
  computed(() => authStore.globalConfig.drawMjName) || t('pay.MJDrawingQuota');

const isHideModel3Point = computed(
  () => Number(authStore.globalConfig.isHideModel3Point) === 1
);
const isHideModel4Point = computed(
  () => Number(authStore.globalConfig.isHideModel4Point) === 1
);
const isHideDrawMjPoint = computed(
  () => Number(authStore.globalConfig.isHideDrawMjPoint) === 1
);

function handleCloseDialog() {
  loading.value = false;
}

function handleClose() {
  useGlobalStore.updateSignInDialog(false);
}

const consecutiveDays = computed(() => authStore.userInfo.consecutiveDays);
const signInModel3Count = computed(
  () => Number(authStore.globalConfig?.signInModel3Count) || 0
);
const signInModel4Count = computed(
  () => Number(authStore.globalConfig?.signInModel4Count) || 0
);
const signInMjDrawToken = computed(
  () => Number(authStore.globalConfig?.signInMjDrawToken) || 0
);

const hasSignedInToday = computed(() => {
  return signInData.value.some(
    (item) => item.signInDate === today && item.isSigned
  );
});

async function getSigninLog() {
  try {
    loading.value = true;
    const res: ResData = await fetchSignLogAPI();
    console.log('fetchSignLogAPI response:', res);
    if (res.success) {
      signInData.value = res.data || [];
      console.log('signInData:', signInData.value);
    }
    loading.value = false;
  } catch (error) {
    loading.value = false;
    console.error('Error fetching sign-in log:', error);
  }
}

async function handleSignIn() {
  try {
    signInLoading.value = true;
    const res: ResData = await fetchSignInAPI();
    console.log('fetchSignInAPI response:', res);
    if (res.success) {
      ms.success('签到成功！');
      await getSigninLog();
      authStore.getUserInfo();
    }
    signInLoading.value = false;
  } catch (error) {
    signInLoading.value = false;
    console.error('Error during sign-in:', error);
  }
}

async function openDrawerAfter() {
  loading.value = true;
  await getSigninLog();
  loading.value = false;
}

watch(
  () => props.visible,
  (newValue) => {
    if (newValue) {
      openDrawerAfter();
    }
  }
);

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.5s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
