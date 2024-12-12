<script setup lang="ts">
import { useChatStore } from '@/store';
import { Switch } from '@headlessui/vue';
import { computed, onMounted, ref, watch } from 'vue';

const chatStore = useChatStore();
const customKeyId = ref(100);
const dataSources = computed(() => chatStore.groupList);
const groupKeyWord = computed(() => chatStore.groupKeyWord);

// 默认插件列表
const defaultPlugins: any[] = [
  // {
  //   pluginId: '1',
  //   pluginName: '思维导图',
  //   description: '支持思维导图的创建、编辑、分享、查看等功能',
  //   pluginImg: mindmap,
  //   parameters: 'usingMindMap',
  // },
  // {
  //   pluginName: 'Midjourney',
  //   description: '使用 Midjourney 绘图, 为你的创意添加更多可能性',
  //   pluginImg: midjourney,
  //   parameters: 'midjourney',
  // },
];

// 计算属性插件列表
const pluginList = computed(() =>
  chatStore.pluginList?.length ? chatStore.pluginList : defaultPlugins
);

watch(dataSources, () => (customKeyId.value = customKeyId.value + 1));
watch(groupKeyWord, () => (customKeyId.value = customKeyId.value + 1));
const usingPlugin = computed(() => chatStore.currentPlugin);

dataSources.value.filter((item) =>
  groupKeyWord.value
    ? item.title.includes(groupKeyWord.value) && item.isSticky
    : item.isSticky
);

function toggleSelection(plugin: any) {
  if (usingPlugin.value?.parameters === plugin.parameters) {
    // Clear the current plugin because it is already selected
    chatStore.setUsingPlugin(null); // Clear the selection
  } else {
    // Set the current plugin to the selected plugin
    chatStore.setUsingPlugin(plugin);
  }
}

onMounted(() => {
  chatStore.queryPlugins();
  chatStore.queryMyGroup();
});
</script>

<template>
  <div
    class="flex flex-col gap-3 px-4 py-1 overflow-y-auto max-h-full noScrollbar"
    style="-ms-overflow-style: none; scrollbar-width: none"
  >
    <div
      v-for="plugin in pluginList"
      :key="plugin.parameters"
      class="select-none relative h-26 bg-white shadow flex flex-col items-start gap-3 px-3 py-1 break-all rounded-lg cursor-pointer group font-medium dark:bg-gray-800"
    >
      <div class="flex items-center justify-between w-full my-1">
        <div class="flex items-center space-x-2">
          <!-- 头像部分 -->
          <div
            class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-500 flex items-center justify-center overflow-hidden shadow-sm border border-gray-300"
          >
            <img
              v-if="plugin.pluginImg"
              :src="plugin.pluginImg"
              alt="App cover"
              class="w-full h-full object-cover"
            />

            <span v-else class="text-sm font-medium">
              {{ plugin.pluginName.charAt(0) }}
            </span>
          </div>

          <!-- 名称部分 -->
          <span
            class="line-clamp-1 overflow-hidden text-ellipsis w-32 block whitespace-nowrap font-medium text-base text-gray-700 dark:text-gray-100"
          >
            {{ plugin.pluginName }}
          </span>
        </div>

        <!-- 开关控件部分，已应用 Tailwind 类以正确布局 -->
        <Switch
          :class="[
            'group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none',
            // usingPlugin?.parameters === plugin.parameters
            //   ? 'bg-indigo-600'
            //   : 'bg-gray-200 ',
          ]"
          @click.prevent="toggleSelection(plugin)"
        >
          <span
            aria-hidden="true"
            class="pointer-events-none absolute h-full w-full rounded-full bg-white dark:bg-transparent"
          ></span>
          <span
            aria-hidden="true"
            :class="[
              usingPlugin?.parameters === plugin.parameters
                ? 'bg-indigo-600'
                : 'bg-gray-200 dark:bg-gray-700',
              'pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out',
            ]"
          ></span>
          <span
            aria-hidden="true"
            :class="[
              usingPlugin?.parameters === plugin.parameters
                ? 'translate-x-5'
                : 'translate-x-0',
              'pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-500 shadow ring-0 transition-transform duration-200 ease-in-out',
            ]"
          ></span>
        </Switch>
      </div>

      <div>
        <span
          class="min-h-[2rem] text-xs line-clamp-2 text-gray-600 dark:text-gray-400 mb-2"
        >
          {{ plugin.description }}
        </span>
      </div>
    </div>
  </div>
</template>
