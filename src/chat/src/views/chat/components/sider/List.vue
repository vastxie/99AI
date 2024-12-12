<script setup lang="ts">
import { fetchCollectAppAPI } from '@/api/appStore';
import type { ResData } from '@/api/types';
import { SvgIcon } from '@/components/common';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import {
  useAppCatStore,
  useAppStore,
  useAuthStore,
  useChatStore,
  useGlobalStoreWithOut,
} from '@/store';
import { ApplicationTwo, Down, Up } from '@icon-park/vue-next';
import { NScrollbar, useMessage } from 'naive-ui';
import { computed, inject, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ListItem from './ListItem.vue';

const { isMobile } = useBasicLayout();
const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const chatStore = useChatStore();
const authStore = useAuthStore();
const ms = useMessage();

const customKeyId = ref(100);
const appCatStore = useAppCatStore();
const showMoreSticky = ref(false);
const showMoreMineApps = ref(false);

// const catId = computed(() => appCatStore.catId);

const dataSources = computed(() => chatStore.groupList);
const groupKeyWord = computed(() => chatStore.groupKeyWord);
watch(dataSources, () => (customKeyId.value = customKeyId.value + 1));
watch(groupKeyWord, () => (customKeyId.value = customKeyId.value + 1));
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false;
});
const isLogin = computed(() => authStore.isLogin);

const createNewChatGroup = inject(
  'createNewChatGroup',
  async (appId?: number) => {
    // 默认逻辑或简单的提示信息
  }
) as (appId?: number) => Promise<void>;

const mineApps = computed(() => {
  return appCatStore.mineApps;
});

// utc格式转换
function formatUtcTime(utcTime: Date | string) {
  const date = new Date(utcTime);
  const shanghaiTime = date.getTime() + 8 * 60 * 60 * 1000;
  const shanghaiDate = new Date(shanghaiTime).getTime();
  return shanghaiDate;
}

const today = new Date().setHours(0, 0, 0, 0);

const stickyList = computed(() =>
  dataSources.value.filter((item) =>
    groupKeyWord.value
      ? item.title.includes(groupKeyWord.value) && item.isSticky && !item.params
      : item.isSticky && !item.params
  )
);

const todayList = computed(() =>
  dataSources.value.filter((item: any) => {
    if (groupKeyWord.value)
      return (
        item.title.includes(groupKeyWord.value) &&
        !item.isSticky &&
        formatUtcTime(item.updatedAt) >= today &&
        !item.params
      );
    else
      return (
        !item.isSticky && formatUtcTime(item.updatedAt) >= today && !item.params
      );
  })
);

const otherList = computed(() =>
  dataSources.value.filter((item: any) => {
    if (groupKeyWord.value)
      return (
        item.title.includes(groupKeyWord.value) &&
        !item.isSticky &&
        formatUtcTime(item.updatedAt) < today &&
        !item.params
      );
    else
      return (
        !item.isSticky && formatUtcTime(item.updatedAt) < today && !item.params
      );
  })
);

/* 选中切换对话 */
async function handleSelect(group: Chat.History) {
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试');
    return;
  }
  const { uuid } = group;
  if (isActive(uuid)) return;

  await chatStore.setActiveGroup(uuid);
  if (route.name !== 'Chat') router.replace('/chat');

  if (isMobile.value) appStore.setSiderCollapsed(true);
}

async function addNewChatGroupFromApp(appId: number) {
  appCatStore.queryMineApps();
  createNewChatGroup(appId);
  // router.replace({ path: '/chat', query: { appId: appId } });
}

/* 删除对话组 */
async function handleDelete(params: Chat.History) {
  event?.stopPropagation();
  await chatStore.deleteGroup(params);
  await chatStore.queryMyGroup();
  if (isMobile.value) appStore.setSiderCollapsed(true);
}

const useGlobalStore = useGlobalStoreWithOut();

/* 判断是不是当前选中 */
function isActive(uuid: number) {
  return chatStore.active === uuid;
}

function handleOpenApp() {
  // router.replace('/chatStore');
  useGlobalStore.updateAppDialog(true);
}

async function handleCollect(appId?) {
  // app.loading = true;
  try {
    const res: ResData = await fetchCollectAppAPI({ appId: appId });
    // ms.success(res.data);
    await appCatStore.queryMineApps();
    // app.loading = false;
  } catch (error) {
    // app.loading = false;
  }
}

// 监听登录状态的变化
watch(
  () => authStore.isLogin,
  (newValue, oldValue) => {
    if (newValue === true) {
      // 如果登录了，则查询我的应用
      appCatStore.queryMineApps();
      chatStore.queryMyGroup();
    }
  },
  { immediate: true } // 立即执行，以处理组件加载时的逻辑
);
</script>

<template>
  <NScrollbar class="px-4">
    <div class="flex flex-col gap-3 text-sm">
      <template v-if="!dataSources.length">
        <div
          class="flex flex-col items-center mt-4 text-center text-neutral-300"
        >
          <SvgIcon icon="ri:inbox-line" class="mb-2 text-3xl" />
          <span>{{ $t('common.noData') }}</span>
        </div>
      </template>
      <template v-else>
        <p class="mt-3 mb-1 text-xs font-bold">
          {{ t('chat.myApps') }}
          <!-- <span class="ml-1">({{ dataSources?.length }})</span> -->
        </p>
        <div
          v-for="app in showMoreMineApps ? mineApps : mineApps.slice(0, 4)"
          :key="app.appId"
          @click="addNewChatGroupFromApp(app.appId)"
          class="relative flex items-center gap-3 px-3 py-1 break-all rounded-md cursor-pointer hover:bg-white group dark:hover:bg-gray-800 font-medium text-sm 'text-gray-700', 'dark:bg-gray-900', 'dark:text-gray-400'"
        >
          <div
            class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden"
          >
            <img
              v-if="app.coverImg"
              :src="app.coverImg"
              alt="app cover"
              class="w-full h-full object-cover"
            />
            <span v-else class="text-sm font-medium">
              {{ app.appName.charAt(0) }}
            </span>
          </div>

          <button>
            {{ app.appName }}
            <!-- <Star
              :theme="'filled'"
              size="24"
              :fill="'#fde68a'"
              class="cursor-pointer"
              @click.stop="handleCollect(app.appId)"
            /> -->
          </button>
          <!-- <div
            class="absolute right-2 top-1/2 transform -translate-y-1/2 hidden group-hover:block"
          >
            <Menu as="div" class="relative inline-block text-left">
              <MenuButton
                class="flex justify-center items-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
              >

                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 6h16M4 12h16m-7 6h7"
                  ></path>
                </svg>
              </MenuButton>
              <transition
                enter-active-class="transition ease-out duration-100"
                enter-from-class="transform opacity-0 scale-95"
                enter-to-class="transform opacity-100 scale-100"
                leave-active-class="transition ease-in duration-75"
                leave-from-class="transform opacity-100 scale-100"
                leave-to-class="transform opacity-0 scale-95"
              >
                <MenuItems
                  class="absolute right-0 mt-2 origin-top-right bg-white dark:bg-gray-800 divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                >
                  <MenuItem as="template" v-slot="{ active }">
                    <button
                      :class="{
                        'bg-gray-100': active,
                        'text-gray-900': !active,
                      }"
                      class="group flex rounded-md items-center w-full p-2 text-sm"
                    >
                      选项 1
                    </button>
                  </MenuItem>
                  <MenuItem as="template" v-slot="{ active }">
                    <button
                      :class="{
                        'bg-gray-100': active,
                        'text-gray-900': !active,
                      }"
                      class="group flex rounded-md items-center w-full p-2 text-sm"
                    >
                      选项 2
                    </button>
                  </MenuItem>
                </MenuItems>
              </transition>
            </Menu>
          </div> -->
        </div>
        <button
          class="relative flex items-center gap-3 px-3 break-all rounded-md cursor-pointer text-gray-900 dark:text-gray-400 text-xs font-bold"
          v-if="mineApps.length > 4"
          @click="showMoreMineApps = !showMoreMineApps"
        >
          {{ showMoreMineApps ? t('chat.collapse') : t('chat.more') }}
          <Down v-if="!showMoreMineApps" theme="outline" size="20" />
          <Up v-else theme="outline" size="20" />
        </button>
        <div
          class="relative flex items-center gap-3 px-3 py-1 break-all rounded-md cursor-pointer hover:bg-white group dark:hover:bg-gray-800 font-medium text-sm 'text-gray-700', 'dark:bg-gray-900', 'dark:text-gray-400'"
          @click="handleOpenApp"
        >
          <ApplicationTwo
            theme="outline"
            size="25"
            class="ml-1 mr-1 text-sm my-1 text-gray-600"
          />
          {{ t('chat.appSquare') }}
        </div>

        <ListItem
          v-if="stickyList.length"
          :key="`stickyList-${showMoreSticky}-${stickyList}`"
          :title="t('chat.favorites')"
          :data-sources="showMoreSticky ? stickyList : stickyList.slice(0, 5)"
          @select="handleSelect"
          @delete="handleDelete"
        />

        <button
          class="relative flex items-center gap-3 px-3 break-all rounded-md cursor-pointer text-gray-900 dark:text-gray-400 text-xs font-bold"
          v-if="stickyList.length > 5"
          @click="showMoreSticky = !showMoreSticky"
        >
          {{ showMoreSticky ? t('chat.collapse') : t('chat.more') }}
          <Down v-if="!showMoreSticky" theme="outline" size="20" />
          <Up v-else theme="outline" size="20" />
        </button>

        <ListItem
          v-if="todayList.length"
          :key="3000 + customKeyId"
          :title="t('chat.todayConversations')"
          :data-sources="todayList"
          @select="handleSelect"
          @delete="handleDelete"
        />
        <ListItem
          v-if="otherList.length"
          :key="4000 + customKeyId"
          :title="t('chat.historyConversations')"
          :data-sources="otherList"
          @select="handleSelect"
          @delete="handleDelete"
        />
      </template>
    </div>
  </NScrollbar>
</template>
