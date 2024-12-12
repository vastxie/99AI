<script setup lang="ts">
import { SvgIcon } from '@/components/common';
import { useBasicLayout } from '@/hooks/useBasicLayout';
// import { t } from '@/locales';
import defaultPdfPreset from '@/assets/defaultPdfPreset.json';
import defaultPreset from '@/assets/defaultPreset.json';
import { useAuthStore, useChatStore } from '@/store';
import { computed, inject, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const onConversation = inject<any>('onConversation');
const authStore = useAuthStore();
const chatStore = useChatStore();
const groupSources = computed(() => chatStore.groupList);
const { isMobile } = useBasicLayout();
const randomItems = ref();
const route = useRoute();

const isHideDefaultPreset = computed(
  () => Number(authStore.globalConfig?.isHideDefaultPreset) === 1
);
const getRandomItems = () => {
  if (route.path === '/pdf') {
    randomItems.value = defaultPdfPreset
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    return;
  } else {
    randomItems.value = defaultPreset
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
  }
};

onMounted(() => {
  getRandomItems();
});

onMounted(() => {
  getRandomItems();
});

const siteName = authStore.globalConfig?.siteName || 'AIWeb';
const isPdfRoute = computed(() => route.path === '/pdf');

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>;

async function handleClick(box: { appId?: number; prompt: any }) {
  if (groupSources.value.length === 0) {
    // await nextTick();
    await createNewChatGroup();
    // await chatStore.queryMyGroup();
  }
  const { appId, prompt } = box;
  if (appId && appId > 0) {
    try {
      await chatStore.addNewChatGroup(appId);
      await chatStore.queryMyGroup();
    } catch (error) {}
  } else {
    onConversation({
      msg: prompt,
    });
  }
}

const getRandomColorClass = () => {
  const colors = [
    'text-red-500',
    'text-blue-500',
    'text-green-500',
    'text-yellow-500',
    'text-purple-500',
    'text-pink-500',
    'text-indigo-500',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};
</script>

<template>
  <div
    :class="[isMobile ? 'mb-16' : 'mt-8']"
    class="px-4 select-none w-full flex flex-col items-center justify-center h-full"
  >
    <h1
      class="mb-10 rounded px-4 py-2 text-center text-3xl font-bold text-primary-500"
    >
      {{ siteName }}
    </h1>
    <div v-if="!isHideDefaultPreset" class="w-full md:max-w-[40rem]">
      <div
        :class="[
          isPdfRoute
            ? 'grid-cols-2 mx-2'
            : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4',
          'grid gap-4',
        ]"
      >
        <div v-for="item in randomItems" :key="item.title" class="space-y-4">
          <button
            @click="handleClick(item)"
            class="relative shadow-sm flex flex-col gap-2 rounded-xl ring-1 ring-gray-200 dark:ring-gray-700 px-3 pb-4 pt-3 text-start align-top text-sm transition dark:bg-gray-800 dark:hover:bg-gray-750 hover:bg-gray-50 w-full h-full min-h-[4rem] min-w-[8rem] flex-grow"
          >
            <SvgIcon
              :icon="item.icon"
              :class="[
                'mb-3 inline-block text-base absolute top-3 left-3',
                getRandomColorClass(),
              ]"
            />
            <div
              class="mt-8 line-clamp-2 break-all overflow-hidden text-gray-600 dark:text-gray-500 flex-grow text-sm"
            >
              {{ item.title }}
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
