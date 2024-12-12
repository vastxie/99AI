<script lang="ts" setup>
import { fetchQueryOneCatAPI } from '@/api/appStore';
import { SvgIcon } from '@/components/common';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { inject, onMounted, ref, watch } from 'vue';
const { isMobile } = useBasicLayout();

const appDetail: any = ref(null);

const props = defineProps<{
  appId: number;
}>();

const onConversation = inject<any>('onConversation');

const queryAppInfo = async (appId: number) => {
  try {
    const res: any = await fetchQueryOneCatAPI({ id: appId });
    appDetail.value = res.data;
  } catch (error) {}
};

function useDemo(item: string) {
  onConversation({
    msg: item,
    model: appDetail?.value?.model,
    modelAvatar: appDetail.value.modelAvatar,
  });
}

function bgRandomColor() {
  const hues = [
    'bg-blue-300',
    'bg-red-300',
    'bg-green-300',
    'bg-yellow-300',
    'bg-purple-300',
    'bg-pink-300',
  ];
  return hues[Math.floor(Math.random() * hues.length)];
}

onMounted(() => {
  if (props.appId) {
    queryAppInfo(props.appId);
  }
});

watch(
  () => props.appId,
  (newVal) => {
    if (newVal) {
      queryAppInfo(newVal);
    }
  }
);
</script>

<template>
  <div
    v-if="appDetail"
    :class="[isMobile ? 'mb-16' : 'mt-8']"
    class="px-4 select-none w-full flex flex-col items-center justify-center h-full"
  >
    <!-- 头像和名称 -->
    <div class="w-full md:max-w-[40rem] mb-4">
      <div class="flex items-center justify-center">
        <div
          v-if="appDetail.coverImg"
          class="flex-shrink-0 dark:ring-gray-400 rounded-lg"
        >
          <img
            :src="appDetail.coverImg"
            class="rounded-full w-10 h-10 mr-4"
            alt="app-image"
          />
        </div>
        <div
          v-else
          :class="[
            bgRandomColor(),
            'flex-shrink-0 dark:ring-gray-400 rounded-full w-10 h-10 flex items-center justify-center mr-4',
          ]"
        >
          <span class="text-white text-sm md:text-lg">{{
            appDetail.name.slice(0, 1)
          }}</span>
        </div>
        <h1 class="rounded px-4 py-2 text-3xl font-bold text-primary-500">
          {{ appDetail?.name }}
        </h1>
      </div>
    </div>

    <!-- 描述 -->
    <div class="w-full md:max-w-[40rem] mb-5">
      <div class="flex items-center justify-center">
        <p>{{ appDetail?.des }}</p>
      </div>
    </div>

    <!-- 按钮部分 -->
    <div class="w-full md:max-w-[40rem] mt-2">
      <div
        class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 justify-center"
      >
        <div
          v-for="(item, index) in appDetail?.demoData"
          :key="index"
          class="space-y-4"
        >
          <button
            @click="useDemo(item)"
            class="relative flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-gray-800 px-3 pb-4 pt-3 text-start align-top text-sm shadow-sm transition dark:bg-gray-800 dark:hover:bg-gray-700 hover:bg-gray-50 w-full h-full min-h-[4rem] min-w-[8rem] flex-grow"
          >
            <SvgIcon
              class="mb-3 inline-block text-base absolute top-3 left-3"
              icon="material-symbols:tips-and-updates-outline"
            />
            <div
              class="mt-8 line-clamp-2 break-all overflow-hidden text-gray-600 dark:text-gray-500 flex-grow text-sm"
            >
              {{ item }}
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
