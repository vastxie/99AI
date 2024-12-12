<script lang="ts" setup>
import { useAuthStore, useChatStore } from '@/store';
import { computed } from 'vue';

import logo360 from '@/assets/aiavatar/360logo.png';
import ali from '@/assets/aiavatar/alilogo.png';
import baidu from '@/assets/aiavatar/baidulogo.png';
import claude from '@/assets/aiavatar/claudelogo.png';
import dalle from '@/assets/aiavatar/dalle.png';
import gemini from '@/assets/aiavatar/google.gif';
import gpt4logo from '@/assets/aiavatar/gpt4logo.png';
import midjourney from '@/assets/aiavatar/midjourney.png';
import mindmap from '@/assets/aiavatar/mindmap.png';
import network from '@/assets/aiavatar/network.png';
import sdxl from '@/assets/aiavatar/sdxl.png';
import suno from '@/assets/aiavatar/suno.ico';
import tencent from '@/assets/aiavatar/tencentlogo.png';
import xunfei from '@/assets/aiavatar/xunfeilogo.png';
import zhipu from '@/assets/aiavatar/zhipulogo.png';
import { isString } from '@/utils/is';

const props = defineProps<Props>();

const chatStore = useChatStore();

const robotAvatarSrc = computed(() => {
  if (props.model?.includes('gpt')) {
    return gpt4logo;
  } else if (props.model?.includes('dall-e')) {
    return dalle;
  } else if (props.model?.includes('midjourney')) {
    return midjourney;
  } else if (props.model?.includes('gemini')) {
    return gemini;
  } else if (props.model?.includes('360')) {
    return logo360;
  } else if (props.model?.includes('qwen')) {
    return ali;
  } else if (props.model?.includes('ERNIE')) {
    return baidu;
  } else if (props.model?.includes('claude')) {
    return claude;
  } else if (props.model?.includes('hunyuan')) {
    return tencent;
  } else if (props.model?.includes('SparkDesk')) {
    return xunfei;
  } else if (props.model?.includes('glm')) {
    return zhipu;
  } else if (props.model?.includes('suno')) {
    return suno;
  } else if (props.model?.includes('network')) {
    return network;
  } else if (props.model?.includes('mindmap')) {
    return mindmap;
  } else if (props.model?.includes('stable-diffusion')) {
    return sdxl;
  }
  // 没有匹配到模型时返回undefined
  return undefined;
});

interface Props {
  image?: boolean;
  model?: string;
  modelAvatar?: string;
}
const authStore = useAuthStore();

// const userAvatar = computed(() => {
//   const userAvatar = authStore.userInfo.avatar;
//   return userAvatar;
// });

const robotAvatar = computed(() => {
  const avatar =
    activeGroupInfo.value?.appLogo || authStore.globalConfig.robotAvatar;
  return avatar;
});

const activeGroupInfo = computed(() =>
  chatStore.groupList.find((item: any) => item.uuid === chatStore.active)
);
</script>

<template>
  <!-- 机器人头像逻辑 -->
  <img
    v-if="isString(modelAvatar) && modelAvatar.length > 0"
    class="inline-flex h-7 w-7 items-center justify-center rounded-full border da r border-gray-100 dark:border-gray-750 border-solid shadow-sm"
    :src="modelAvatar"
    alt="Robot Avatar"
  />
  <img
    v-else-if="isString(robotAvatar) && robotAvatar.length > 0"
    class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 dark:border-gray-750 border-solid shadow-sm"
    :src="robotAvatar"
    alt="Robot Avatar"
  />
  <img
    v-else-if="robotAvatarSrc"
    class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 dark:border-gray-750 border-solid shadow-sm"
    :src="robotAvatarSrc"
    alt="Robot Avatar"
  />

  <img
    v-else-if="isString(robotAvatar) && robotAvatar.length > 0"
    class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 dark:border-gray-750 border-solid shadow-sm"
    :src="robotAvatar"
    alt="Robot Avatar"
  />
  <span
    v-else
    class="select-none inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 border-solid dark:bg-gray-500 text-gray-600 dark:text-white font-semibold text-base"
  >
    <span class="flex items-center justify-center w-full h-full"> AI </span>
  </span>
</template>
