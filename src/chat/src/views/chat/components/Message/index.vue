<script setup lang="ts">
import { NTooltip, useMessage } from 'naive-ui';
import { ref } from 'vue';
import AvatarComponent from './Avatar.vue';
import ImageComponent from './Image.vue';
import MindMapComponent from './MindMap/index.vue';
import MusicComponent from './Music.vue';
import TextComponent from './Text/index.vue';
import VideoComponent from './Video.vue';
import AiPpt from './AiPpt.vue';

import { copyText } from '@/utils/format';

interface Props {
  chatId?: number;
  dateTime?: string;
  text: string;
  model?: string;
  modelName?: string;
  modelType?: number;
  status?: number;
  inversion?: boolean;
  loading?: boolean;
  fileInfo?: string;
  ttsUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  drawId?: string;
  extend?: string;
  customId?: string;
  modelAvatar?: string;
  action?: string;
  taskData?: string;
  pluginParam?: string;
  index: number;
  promptReference?: string;
  isLast?: boolean;
}

interface Emit {
  (ev: 'regenerate'): void;
  (ev: 'delete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emit>();
const ms = useMessage();

const textRef = ref<HTMLElement>();

const asRawText = ref(props.inversion);

const messageRef = ref<HTMLElement>();

function handleDetele() {
  emit('delete');
}

function handleCopy() {
  copyText({ text: props.text ?? '' });
  props.text && ms.success('复制成功！');
}

function handleRegenerate() {
  messageRef.value?.scrollIntoView();
  emit('regenerate');
}
</script>

<template>
  <div
    ref="messageRef"
    class="flex w-full my-2 overflow-hidden items-start flex-row"
  >
    <n-tooltip trigger="hover" placement="top-start">
      <template #trigger>
        <div class="flex items-center justify-center flex-shrink-0 mr-2">
          <AvatarComponent
            v-if="!inversion"
            :image="inversion"
            :model="model"
            :modelAvatar="modelAvatar"
          />
        </div>
      </template>
      {{ modelName }}
    </n-tooltip>

    <div class="overflow-hidden text-sm items-start w-full">
      <div class="flex items-end gap-1 flex-row">
        <MindMapComponent
          v-if="pluginParam === 'mind-map' && !inversion"
          ref="textRef"
          :inversion="inversion"
          :drawId="drawId"
          :extend="extend"
          :customId="customId"
          :text="text"
          :modelType="modelType"
          :fileInfo="fileInfo"
          :ttsUrl="ttsUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :as-raw-text="asRawText"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
        <VideoComponent
          v-else-if="
            (model === 'luma-video' || model === 'cog-video') && !inversion
          "
          ref="textRef"
          :inversion="inversion"
          :drawId="drawId"
          :extend="extend"
          :customId="customId"
          :text="text"
          :modelType="modelType"
          :fileInfo="fileInfo"
          :ttsUrl="ttsUrl"
          :audioUrl="audioUrl"
          :videoUrl="videoUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :as-raw-text="asRawText"
          :action="action"
          :taskData="taskData"
          :modelAvatar="modelAvatar"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
        <MusicComponent
          v-else-if="model === 'suno-music' && !inversion"
          ref="textRef"
          :inversion="inversion"
          :drawId="drawId"
          :extend="extend"
          :customId="customId"
          :text="text"
          :modelType="modelType"
          :fileInfo="fileInfo"
          :ttsUrl="ttsUrl"
          :audioUrl="audioUrl"
          :videoUrl="videoUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :as-raw-text="asRawText"
          :action="action"
          :taskData="taskData"
          :modelAvatar="modelAvatar"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
        <AiPpt
          v-else-if="model === 'ai-ppt' && !inversion"
          ref="textRef"
          :inversion="inversion"
          :drawId="drawId"
          :extend="extend"
          :customId="customId"
          :text="text"
          :modelType="modelType"
          :fileInfo="fileInfo"
          :ttsUrl="ttsUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :as-raw-text="asRawText"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
        <ImageComponent
          v-else-if="modelType === 2 && !inversion"
          ref="textRef"
          :inversion="inversion"
          :drawId="drawId"
          :extend="extend"
          :customId="customId"
          :text="text"
          :modelType="modelType"
          :fileInfo="fileInfo"
          :ttsUrl="ttsUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :as-raw-text="asRawText"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
        <TextComponent
          v-else
          ref="textRef"
          :index="index"
          :modelName="modelName"
          :chatId="chatId"
          :inversion="inversion"
          :text="text"
          :modelType="modelType"
          :fileInfo="fileInfo"
          :ttsUrl="ttsUrl"
          :model="model"
          :loading="loading"
          :as-raw-text="asRawText"
          :promptReference="promptReference"
          :isLast="isLast"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
      </div>
    </div>
  </div>
</template>
