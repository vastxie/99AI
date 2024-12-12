<script setup lang="ts">
import {
  fetchCollectAppAPI,
  fetchQueryAppCatsAPI,
  fetchQueryAppsAPI,
} from '@/api/appStore';
// import { fetchQueryMenuAPI } from '@/api/config';
import type { ResData } from '@/api/types';
import { t } from '@/locales';
import { useAppCatStore, useGlobalStoreWithOut } from '@/store';
import { Close, Left, Right, Search, Star } from '@icon-park/vue-next';
import { useMessage } from 'naive-ui';
import PinyinMatch from 'pinyin-match';
import { computed, onMounted, ref, watch } from 'vue';

interface Props {
  visible: boolean;
}

interface App {
  id: number;
  name: string;
  des: string;
  coverImg: string;
  catId: number;
  appCount: number;
  demoData: string;
  loading?: boolean;
  createdAt: string;
  updatedAt: string;
}

const props = defineProps<Props>();

const { isMobile } = useBasicLayout();
const useGlobalStore = useGlobalStoreWithOut();

function handleClose() {
  useGlobalStore.updateAppDialog(false);
}

import { useBasicLayout } from '@/hooks/useBasicLayout';
import { router } from '@/router';

const ms = useMessage();
const appCatStore = useAppCatStore();
const keyword = ref('');

interface AppCat {
  id: number;
  name: string;
  coverImg: string;
  des: string;
}

const catId = computed(() => appCatStore.catId);
const appList = ref<App[]>([]);
const activeList = ref<App[]>([]);
const mineApps = computed(() => appCatStore.mineApps);
const catList = ref<AppCat[]>([]);
const activeCatId = ref(0);

function isMineApp(app: App) {
  return mineApps.value.some((item: any) => item.appId === app.id);
}

async function queryApps() {
  const res: ResData = await fetchQueryAppsAPI();
  appList.value = res?.data?.rows.map((item: App) => {
    item.loading = false;
    return item;
  });
  activeList.value = appList.value;
}

const list = computed(() => {
  if (keyword.value) {
    // 使用拼音模糊搜索，支持中文和拼音
    const keywordLower = keyword.value.toLowerCase();
    return appList.value.filter((item) =>
      PinyinMatch.match(item.name, keywordLower)
    );
  }
  // if (activeCatId.value === -1) {
  //   // 返回我的收藏列表
  //   appCatStore.queryMineApps();
  //   return mineApps.value.filter((item) => item.catId === activeCatId.value);
  // }
  if (activeCatId.value === 0) return appList.value;
  return appList.value.filter((item) => item.catId === activeCatId.value);
});

/* 加入取消收藏 */
async function handleCollect(app: App) {
  app.loading = true;
  try {
    const res: ResData = await fetchCollectAppAPI({ appId: app.id });
    ms.success(res.data);
    await appCatStore.queryMineApps();
    app.loading = false;
  } catch (error) {
    app.loading = false;
  }
}

async function handleRunApp(app: App) {
  const appIdAsNumber = Number(app.id);
  handleClose();
  router.replace({ path: '/chat', query: { appId: appIdAsNumber } });
}

async function queryCats() {
  const res: ResData = await fetchQueryAppCatsAPI();
  const defaultCat = {
    id: 0,
    name: t('app.allCategories'),
  };
  // const myCollectionCat = { id: -1, name: '我的收藏' };
  catList.value = [defaultCat, ...res?.data?.rows];
}

function handleChangeCatId(id: number) {
  activeCatId.value = id;
}

watch(catId, (val) => {
  if (!val) activeList.value = appList.value;
  else
    activeList.value = appList.value.filter((item: App) => item.catId === val);
});

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

// 确保scrollContainer是一个HTMLElement
const scrollContainer = ref<HTMLElement | null>(null);

function scrollLeft() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollBy({ left: -100, behavior: 'smooth' });
  }
}

function scrollRight() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollBy({ left: 100, behavior: 'smooth' });
  }
}

onMounted(() => {
  queryCats();
  queryApps();
  // queryMenu();
});
</script>

<template>
  <transition name="modal-fade">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div
        class="bg-white dark:bg-gray-900 shadow-lg flex flex-col"
        :class="[
          isMobile
            ? 'w-full h-full px-2 py-5'
            : 'w-[80vw] min-h-[60vh] max-h-[80vh] p-6 rounded-lg',
        ]"
      >
        <div class="flex justify-between items-start mb-2">
          <div
            class="mx-1 flex rounded-xl shadow-sm ring-1 ring-gray-300 focus-within:ring-2 focus-within:ring-primary-500 text-gray-900 placeholder:text-gray-400 border-0 bg-transparent resize-none dark:focus:ring-gray-600 dark:ring-gray-600 dark:bg-gray-800"
            :class="[isMobile ? 'w-full mr-8' : 'w-[40%]']"
          >
            <div class="relative flex flex-1 w-full">
              <label for="search-field" class="sr-only">
                {{ t('app.searchAppNameQuickFind') }}
              </label>

              <div
                class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
              >
                <Search theme="outline" size="24" class="text-gray-400" />
              </div>
              <input
                id="search-field"
                v-model="keyword"
                class="z-1 w-full rounded-xl dark:bg-gray-800 pr-3 py-2 font-normal outline-0 delay-100 text-base pl-12 dark:text-gray-400"
                :placeholder="t('app.searchAppNameQuickFind')"
                type="search"
                name="search"
              />
            </div>
          </div>
          <Left
            v-if="!isMobile"
            size="18"
            class="text-gray-500 py-3 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            @click="scrollLeft"
          />

          <div
            v-if="!isMobile"
            class="relative"
            style="max-width: 60%; margin: auto"
          >
            <div
              ref="scrollContainer"
              class="flex justify-between items-center scrollbar-hide overflow-x-auto"
              style="max-width: 95%; margin: auto"
            >
              <div
                v-for="(item, index) in catList"
                :key="index"
                @click="handleChangeCatId(item.id)"
                :class="{
                  'bg-gray-100 dark:bg-gray-700 text-primary-600 dark:text-gray-400':
                    activeCatId === item.id,
                  'text-gray-500': activeCatId !== item.id,
                }"
                class="cursor-pointer whitespace-nowrap rounded-full px-4 py-2 flex-none"
              >
                {{ item.name }}
              </div>
            </div>
          </div>
          <Right
            v-if="!isMobile"
            size="18"
            class="text-gray-500 py-3 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            @click="scrollRight"
          />
          <Close
            size="18"
            class="text-gray-500 py-3 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 ml-3"
            @click="handleClose"
          />
        </div>
        <!-- <div class="flex bg-custom-gradient dark:bg-gray-900 my-2"> -->
        <div
          v-if="isMobile"
          class="flex justify-between items-start my-1 h-14"
          style="max-width: 100%"
        >
          <div
            ref="scrollContainer"
            class="flex justify-between items-center overflow-x-auto scrollbar-hide"
          >
            <div
              v-for="(item, index) in catList"
              :key="index"
              @click="handleChangeCatId(item.id)"
              :class="{
                'bg-gray-100 dark:bg-gray-700 text-primary-600 dark:text-gray-400':
                  activeCatId === item.id,
                'text-gray-500': activeCatId !== item.id,
              }"
              class="cursor-pointer whitespace-nowrap rounded-full px-4 py-2 flex-none"
            >
              {{ item.name }}
            </div>
          </div>
        </div>
        <div class="w-full flex flex-grow my-2 items-start">
          <transition-group
            name="list"
            tag="div"
            class="w-full grid overflow-y-auto"
            :class="[
              isMobile
                ? 'grid-cols-1  max-h-[85vh]'
                : 'h-[60vh] grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-3',
            ]"
            style="align-content: start"
          >
            <div
              v-for="item in list"
              :key="item.id"
              @click="handleRunApp(item)"
              class="custom-card cursor-pointer h-[7rem] flex items-center gap-5 rounded-xl bg-gray-50 px-3 py-3 mx-2 mb-3 hover:shadow-md dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <div
                v-if="item.coverImg"
                class="flex-shrink-0 dark:ring-gray-400 rounded-full"
              >
                <img
                  :src="item.coverImg"
                  class="rounded-full w-16 h-16"
                  alt="app-image"
                />
              </div>
              <div
                v-else
                :class="[
                  bgRandomColor(),
                  'flex-shrink-0  dark:ring-gray-400 rounded-full w-16 h-16 flex items-center justify-center',
                ]"
              >
                <span class="text-white text-sm">{{
                  item.name.slice(0, 3)
                }}</span>
              </div>
              <div class="flex-grow flex flex-col">
                <div
                  class="flex items-center font-medium text-base text-gray-600 dark:text-gray-400 my-1"
                >
                  <span
                    class="line-clamp-1 overflow-hidden text-ellipsis block flex-grow whitespace-nowrap"
                  >
                    {{ item.name }}
                  </span>
                  <Star
                    :theme="isMineApp(item) ? 'filled' : 'outline'"
                    size="20"
                    :fill="isMineApp(item) ? '#fde68a' : '#e5e7eb'"
                    class="cursor-pointer"
                    @click.stop="handleCollect(item)"
                  />
                </div>

                <span
                  class="text-xs line-clamp-2 text-gray-500 dark:text-gray-400 my-1"
                >
                  {{ item.des }}
                </span>
              </div>
            </div>
          </transition-group>
        </div>
        <!-- </div> -->
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.5s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
/* 隐藏滚动条的样式 */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
/* 动画移动时增强流畅度 */
.list-move {
  transition: transform 0.5s cubic-bezier(0.5, 0, 0.5, 1);
}

/* 元素进入和离开时的动画 */
.list-enter-active,
.list-leave-active {
  transition: opacity 0.5s, transform 0.5s cubic-bezier(0.5, 0, 0.5, 1);
}

/* 元素开始进入时的状态 */
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* 元素进入结束时的状态 */
.list-enter-to {
  opacity: 1;
  transform: scale(1);
}

/* 元素离开开始时的状态 */
.list-leave-from {
  opacity: 1;
  transform: scale(1);
}

/* 元素离开结束时的状态 */
.list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* 应用自定义样式 */
.custom-card {
  transition: all 0.5s cubic-bezier(0.5, 0, 0.5, 1);
}

.custom-card:hover {
  transform: scale(1.05);
  transition: all 0.3s ease; /* 加快悬停放大的动画速度 */
}

.custom-card .run-icon {
  opacity: 1;
  transition: all 0.3s ease; /* 加快图标动画速度 */
}

.custom-card .run-icon:hover {
  transform: scale(1.5);
}
</style>
