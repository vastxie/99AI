<script lang="ts" setup>
import { fetchQueryOneCatAPI } from '@/api/appStore';
import { fetchUpdateGroupAPI } from '@/api/group';
import { fetchQueryModelsListAPI } from '@/api/models';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { useAppStore, useChatStore } from '@/store';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import {
  CheckOne,
  EditTwo,
  HamburgerButton,
  Left,
  Right,
} from '@icon-park/vue-next';
import { computed, inject, onMounted, ref, Ref, watch } from 'vue';

// defineProps<Props>();

// interface Props {
//   usingContext: boolean;
// }

interface ModelOption {
  label: string;
  value: string;
  modelDescription: string;
  modelAvatar: string;
}

interface Model {
  isFileUpload: any;
  modelName: string;
  model: string;
  deductType: number;
  keyType: number;
  deduct: number;
  modelAvatar: string;
  modelDescription: string;
}

interface Emit {
  (ev: 'export'): void;
  (ev: 'toggleUsingContext'): void;
  (ev: 'clear'): void;
  (ev: 'scrollBtn'): void;
}
const emit = defineEmits<Emit>();

const appStore = useAppStore();
const chatStore = useChatStore();
const modelOptions: Ref<ModelOption[]> = ref([]);
const appDetail: any = ref(null);
const dataSources = computed(() => chatStore.groupList);
const collapsed = computed(() => appStore.siderCollapsed);
const chatGroupId = computed(() => chatStore.active);
const usingPlugin = computed(() => chatStore.currentPlugin);

const { isMobile } = useBasicLayout();
const isHovering = ref(false);
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo());
const listSources = computed(() => chatStore.chatList);

const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config;
  if (!configString) {
    return {}; // 提早返回一个空对象
  }

  try {
    return JSON.parse(configString);
  } catch (e) {
    return {}; // 解析失败时返回一个空对象
  }
});

const activeModel = computed(() =>
  String(configObj?.value?.modelInfo?.model ?? '')
);
/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0);

let modelMapsCache: any = ref({});
let modelTypeListCache: any = ref([]);

// const menuItemsPosition = computed(() => {
//   return isMobile ? 'left-1/2  top-full' : 'left-0 top-full';
// });

watch(
  activeAppId,
  (val) => {
    if (val) queryAppDetail(val);
    else appDetail.value = null;
  },
  { immediate: true }
);

/* 查询当前app详情提示用户使用 */
async function queryAppDetail(id: number) {
  const res: any = await fetchQueryOneCatAPI({ id });
  appDetail.value = res.data;
}

const notSwitchModel = computed(() => {
  return (
    (activeGroupInfo?.value?.appId &&
      (configObj.value.modelInfo?.isFixedModel === 1 ||
        configObj.value.modelInfo?.isGPTs === 1)) ||
    (usingPlugin.value && usingPlugin?.value?.deductType !== 0)
  );
});

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>;

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value);
}

/* 修改对话组模型配置 */
async function switchModel(option: any) {
  const { modelInfo, fileInfo } = chatStore.activeConfig;

  const { isGPTs, isFixedModel, modelName } = modelInfo;

  const config = {
    modelInfo: {
      keyType: option.keyType,
      modelName:
        (activeGroupInfo?.value?.appId ? modelName : option.label) || '', // 更明确的条件
      model: option.value,
      deductType: option.deductType,
      deduct: option.deduct,
      isFileUpload: option.isFileUpload,
      modelAvatar: option.modelAvatar || '',
      isGPTs, // 简化赋值
      isFixedModel, // 简化赋值
    },
    fileInfo: fileInfo || {}, // 确保 fileInfo 为空时不出错
  };

  const params = {
    groupId: chatGroupId.value,
    config: JSON.stringify(config),
  };
  await fetchUpdateGroupAPI(params);
  await chatStore.queryMyGroup();
  // useGlobalStore.updateModelDialog(false);
}

async function queryModelsList() {
  try {
    const res: any = await fetchQueryModelsListAPI();
    if (!res.success) return;
    const { modelMaps, modelTypeList } = res.data;
    modelMapsCache.value = modelMaps;
    modelTypeListCache.value = modelTypeList;
    // 使用类型断言来告诉 TypeScript flatModelArray 是 Model[] 类型
    const flatModelArray = Object.values(modelMaps).flat() as Model[];
    const filteredModelArray = flatModelArray.filter(
      (model) => model.keyType === 1
    );
    modelOptions.value = filteredModelArray.map((model) => ({
      label: model.modelName,
      value: model.model,
      deductType: model.deductType,
      keyType: model.keyType,
      deduct: model.deduct,
      isFileUpload: model.isFileUpload,
      modelAvatar: model.modelAvatar,
      modelDescription: model.modelDescription,
    }));
  } catch (error) {}
}

onMounted(() => {
  queryModelsList();
});
</script>

<template>
  <header
    class="sticky top-0 left-0 right-0 z-30 dark:border-neutral-800 h-14 select-none"
  >
    <div class="relative flex items-center justify-center min-w-0 h-full">
      <div class="flex w-full h-full items-center px-4">
        <div class="flex items-center pr-2">
          <button
            class="flex items-center justify-center w-5 h-full dark:text-gray-400 text-gray-500"
            @click="handleUpdateCollapsed"
          >
            <div v-if="!isMobile">
              <Right v-if="collapsed" theme="outline" size="24" />
              <Left v-else theme="outline" size="24" />
            </div>

            <HamburgerButton v-else size="24" />
          </button>
        </div>

        <!-- pc -->
        <div class="flex justify-between items-center h-full w-full">
          <Menu
            v-if="notSwitchModel"
            as="div"
            class="relative flex-1 flex ele-drag items-center justify-between h-full"
          >
            <div>
              <div class="py-1">
                <MenuButton
                  class="inline-flex w-full justify-center gap-x-1.5 rounded-md px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-400 text-gray-700"
                >
                  {{
                    usingPlugin?.pluginName ||
                    activeGroupInfo?.title ||
                    '新对话'
                  }}
                  <!-- <ChevronRightIcon class="h-4 w-4 align-middle" /> -->
                </MenuButton>
              </div>
            </div>
            <!-- <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute left-0 top-full z-10 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:text-gray-400 text-gray-900"
              >
                <div class="py-1">
                  <MenuItem
                    v-for="(option, index) in modelOptions"
                    :key="index"
                  >
                    <div class="group" @click="switchModel(option)">
                      <a
                        href="#"
                        class="flex items-center px-4 py-2 text-sm group-hover:bg-gray-100 dark:group-hover:bg-gray-700"
                      >
                        {{ option.label }}
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition> -->
          </Menu>
          <Menu
            v-else
            as="div"
            class="relative flex-1 flex ele-drag items-center h-full justify-between"
          >
            <div>
              <div class="py-1">
                <MenuButton
                  class="inline-flex w-full justify-center gap-x-1.5 rounded-md px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-750 dark:text-gray-400 text-gray-500"
                  @mouseover="isHovering = true"
                  @mouseleave="isHovering = false"
                >
                  {{ configObj?.modelInfo?.modelName || '新对话' }}
                  <Right
                    v-if="isHovering || isMobile"
                    size="20"
                    class="justify-center items-center"
                    :class="{
                      'text-base font-bold': isMobile,
                      'text-sm': !isMobile,
                    }"
                  />
                </MenuButton>
              </div>
            </div>
            <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute top-full z-10 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-750 dark:text-gray-400 text-gray-900 overflow-y-auto"
                :style="{ maxHeight: '60vh' }"
              >
                <div class="py-1">
                  <MenuItem
                    v-for="(option, index) in modelOptions"
                    :key="index"
                  >
                    <div
                      class="flex items-center space-x-4 mx-2 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-md select-none"
                      @click="switchModel(option)"
                    >
                      <div
                        class="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden select-none"
                      >
                        <img
                          v-if="option.modelAvatar"
                          :src="option.modelAvatar"
                          alt="app cover"
                          class="w-full h-full object-cover"
                        />
                        <span v-else class="text-sm font-medium select-none">
                          {{ option.label.charAt(0) }}
                        </span>
                      </div>
                      <div class="flex flex-col flex-1 select-none">
                        <a href="#" class="text-sm select-none">
                          {{ option.label }}
                        </a>
                        <div
                          v-if="option.modelDescription"
                          class="text-xs text-gray-400 line-clamp-1 max-w-60 mr-2 select-none"
                        >
                          {{ option.modelDescription }}
                        </div>
                      </div>
                      <div class="ml-auto">
                        <CheckOne
                          v-if="activeModel === option.value"
                          theme="filled"
                          size="16"
                          class="dark:text-gray-500"
                        />
                        <div v-else class="w-4 h-4"></div>
                        <!-- 占位符 -->
                      </div>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>

          <button
            type="button"
            class="rounded-md py-2 px-3 text-sm focus-visible:outline-none text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 hover:bg-gray-50 flex items-center dark:hover:bg-gray-750 font-semibold"
            @click="createNewChatGroup()"
            :disabled="
              listSources.length === 0 &&
              !activeAppId &&
              dataSources.length !== 0
            "
          >
            <div class="mr-2">新对话</div>
            <EditTwo size="20" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
