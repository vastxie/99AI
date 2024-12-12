<script lang="ts" setup>
import { useChatStore } from '@/store';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import {
  Close,
  Copy,
  Delete,
  DownloadOne,
  Pause,
  PlayOne,
} from '@icon-park/vue-next';
import mdKatex from '@traptitech/markdown-it-katex';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import mila from 'markdown-it-link-attributes';
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';

import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
interface Props {
  inversion?: boolean;
  text?: string;
  modelType?: number;
  status?: number;
  loading?: boolean;
  asRawText?: boolean;
  videoUrl?: string;
  audioUrl?: string;
  model?: string;
  drawId?: string;
  customId?: string;
  modelName?: string;
  action?: string;
  taskData?: string;
  fileInfo?: string;
  modelAvatar?: string;
}

interface Emit {
  (ev: 'delete'): void;
  (ev: 'copy'): void;
}

const isPlayingIndex = ref(-1);

const isInstrumental = ref(false);
const useMusicStyle = ref('');

const onConversation = inject<any>('onConversation');

const props = defineProps<Props>();

const emit = defineEmits<Emit>();

const { isMobile } = useBasicLayout();
let intervalId: number | undefined;

const isDialogVisible = ref(false);
const customIdData = ref({ title: '', text: '' });

const showEditDialog = () => {
  customIdData.value = JSON.parse(props.taskData || '{}');
  isDialogVisible.value = true;
};

// 定义一个方法来更新 customIdData
const updateCustomIdData = () => {
  customIdData.value = JSON.parse(props.taskData || '{}');
};

// 监听 props.taskData 的变化并更新 customIdData
watch(
  () => props.taskData,
  () => {
    updateCustomIdData();
  },
  { immediate: true } // 确保在组件加载时立即运行一次
);

// 在组件加载时立即更新 customIdData
onMounted(() => {
  updateCustomIdData();
});

const closeDialog = () => {
  isDialogVisible.value = false;
};

const musicModel = ref([
  {
    id: 'default',
    title: '普通歌曲',
    values: false,
  },
  {
    id: 'instrumental',
    title: '纯音乐',
    values: true,
  },
]);

const musicStyle = ref([
  {
    id: 'default',
    title: '默认',
    values: '',
  },
  {
    id: 'pop',
    title: '流行',
    values: 'pop',
  },
  {
    id: 'rock',
    title: '摇滚',
    values: 'rock',
  },
  {
    id: 'hiphop',
    title: '嘻哈/说唱',
    values: 'hiphop',
  },
  {
    id: 'jazz',
    title: '爵士',
    values: 'jazz',
  },
  {
    id: 'blues',
    title: '蓝调/灵魂',
    values: 'blues',
  },
  {
    id: 'country',
    title: '乡村',
    values: 'country',
  },
  {
    id: 'classical',
    title: '古典',
    values: 'classical',
  },
  {
    id: 'folk',
    title: '民谣',
    values: 'folk',
  },
  {
    id: 'latin',
    title: '拉丁',
    values: 'latin',
  },
  {
    id: 'world',
    title: '世界音乐',
    values: 'world',
  },
  {
    id: 'electronic',
    title: '电子',
    values: 'electronic',
  },
  {
    id: 'newage',
    title: '新世纪',
    values: 'newage',
  },
  {
    id: 'metal',
    title: '重金属',
    values: 'metal',
  },
  {
    id: 'punk',
    title: '朋克',
    values: 'punk',
  },
  {
    id: 'rnb',
    title: '节奏布鲁斯',
    values: 'rnb',
  },
]);

const selectedMusicModel = ref(musicModel.value[0]);

const selectedMusicStyle = ref(musicStyle.value[0]);

const switchInstrumental = (option: any) => {
  isInstrumental.value = option.values;
  selectedMusicModel.value = option;
};

const switchMusicStyle = (option: any) => {
  useMusicStyle.value = option.values;
  selectedMusicStyle.value = option;
};

const filteredLines = computed(() => {
  return customIdData.value.text
    .split('\n')
    .filter((line) => line.trim() !== '');
});

const submitEdit = async () => {
  isDialogVisible.value = false;

  try {
    const customId = JSON.stringify({
      title: customIdData.value.title,
      prompt: isInstrumental.value ? '' : filteredLines.value.join('\n'),
      mv: 'chirp-v4',
      make_instrumental: isInstrumental.value,
      tags: useMusicStyle.value,
    });
    await onConversation({
      msg: `${customIdData.value.title}`,
      action: 'MUSIC',
      customId: customId,
      modelType: 2,
      model: props.model || 'suno-music',
      modelName: props.modelName || 'AI音乐',
      modelAvatar: props.modelAvatar,
    });
  } catch (error) {}
};

watch(
  () => props.status,
  (currentStatus) => {
    // 清除可能已经存在的定时器
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }

    // 当status为2时，启动定时器
    if (currentStatus === 2) {
      intervalId = window.setInterval(async () => {
        // 这里替换为你想要定期执行的操作

        await chatStore.queryActiveChatLogList();
        // 例如，可以在这里调用 chatStore.queryActiveChatLogList();
      }, 5000); // 每5秒执行一次
    }
  },
  { immediate: true }
);

// 组件卸载时清除定时器
onUnmounted(() => {
  if (intervalId !== undefined) {
    clearInterval(intervalId);
  }
});

const imageInfo = computed(() => {
  return props.fileInfo
    ? props.fileInfo.split(',').map((url) => ({ type: 'image', url }))
    : [];
});

const videoInfo = computed(() => {
  return props.videoUrl
    ? props.videoUrl.split(',').map((url) => ({ type: 'video', url }))
    : [];
});

const audioInfo = computed(() => {
  return props.audioUrl
    ? props.audioUrl.split(',').map((url) => ({ type: 'audio', url }))
    : [];
});

const mediaInfo = computed(() => {
  customIdData.value = JSON.parse(props.taskData || '{}');

  return imageInfo.value.map((image, index) => ({
    image,
    video: videoInfo.value[index] || { type: 'video', url: '' },
    audio: audioInfo.value[index] || { type: 'audio', url: '' },
    title: '标题', // 根据需要调整标题
    subtitle: '媒体风格', // 根据需要调整副标题
  }));
});

// const progress = ref<number[]>([]);
const progress = ref(new Array(mediaInfo.value.length).fill(0));
const updateTime = (index: number) => {
  const audio = audioRefs.value[index];
  if (audio) {
    currentTime.value[index] = audio.currentTime;
    if (audio.duration) {
      duration.value[index] = audio.duration;
    }
    progress.value[index] = (audio.currentTime / audio.duration) * 100;
  }
};

const updateProgress = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement;
  progress.value[index] = Number(input.value);
};

const seek = (index: number, event: Event) => {
  const audio = audioRefs.value[index];
  const input = event.target as HTMLInputElement;
  if (audio) {
    const seekTime = (Number(input.value) / 100) * audio.duration;
    audio.currentTime = seekTime;
  }
};

const audioRefs = ref<HTMLAudioElement[]>([]);

const togglePlay = (index: number) => {
  const currentAudio = audioRefs.value[index];

  if (currentAudio) {
    // 暂停所有其他音频
    audioRefs.value.forEach((audio, idx) => {
      if (audio && idx !== index) {
        audio.pause();
        audio.currentTime = 0; // 可选：重置音频到起始位置
      }
    });

    if (currentAudio.paused) {
      currentAudio.play();

      isPlayingIndex.value = index;
    } else {
      currentAudio.pause();

      isPlayingIndex.value = -1;
    }
  } else {
  }
};
const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) {
    return '';
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

const currentTime = ref<number[]>([]);
const duration = ref<number[]>([]);

const textRef = ref<HTMLElement>();
const chatStore = useChatStore();
const mdi = new MarkdownIt({
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language));
    if (validLang) {
      const lang = language ?? '';
      return highlightBlock(
        hljs.highlight(code, { language: lang }).value,
        lang
      );
    }
    return highlightBlock(hljs.highlightAuto(code).value, '');
  },
});

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } });
mdi.use(mdKatex, {
  blockClass: 'katexmath-block rounded-md p-[10px]',
  errorColor: ' #cc0000',
});

const text = computed(() => {
  const value = props.text ?? '';
  if (!props.asRawText) return mdi.render(value);
  return value;
});

function downloadAudio(url: string) {
  fetch(url)
    .then((response) => response.blob())
    .then((blob) => {
      const link = document.createElement('a');
      const objectURL = URL.createObjectURL(blob);
      link.href = objectURL;
      const title = props.text || '音频文件';
      link.setAttribute('download', `${title}.mp3`); // 可以根据需要修改文件名
      link.style.display = 'none'; // 隐藏链接
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectURL); // 释放URL对象
    })
    .catch((error) => {});
}

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t(
    'chat.copyCode'
  )}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`;
}

function handleCopy() {
  emit('copy');
}

function handleDelete() {
  emit('delete');
}

defineExpose({ textRef });

const handleGenerateMusic = async () => {
  try {
    customIdData.value = JSON.parse(props.taskData || '{}');

    const customId = JSON.stringify({
      title: customIdData.value.title,
      prompt: customIdData.value.text,
      mv: 'chirp-v3-5',
      make_instrumental: isInstrumental.value,
    });
    await onConversation({
      msg: `${customIdData.value.title}`,
      action: 'MUSIC',
      customId: customId,
      modelType: 2,
      model: props.model || 'suno-music',
      modelName: props.modelName || 'AI音乐',
      modelAvatar: props.modelAvatar,
    });
  } catch (error) {}
};

const isVideoDialogVisible = ref(false);
const currentVideoUrl = ref('');

const showVideoDialog = (videoUrl: string) => {
  if (!videoUrl) {
    chatStore.queryActiveChatLogList();
    return;
  }
  currentVideoUrl.value = videoUrl;
  isVideoDialogVisible.value = true;
};

const closeVideoDialog = () => {
  isVideoDialogVisible.value = false;
};
</script>

<template>
  <div class="flex flex-col group max-w-full">
    <div ref="textRef" class="leading-relaxed break-words">
      <div class="pr-12 w-full flex flex-col items-start">
        <div
          v-for="(item, index) in mediaInfo"
          :key="index"
          class="flex justify-between items-center p-2 bg-gray-800 rounded-md mb-2"
          :class="isMobile ? 'w-[80vw]' : 'min-w-[35vw]'"
        >
          <div
            v-if="item.audio.url"
            class="relative flex items-center justify-center group hover:opacity-80 transition-opacity duration-300"
          >
            <img
              :src="item.image.url"
              @click="togglePlay(index)"
              class="rounded-md cursor-pointer transition-opacity duration-300"
              :style="{
                maxWidth: isMobile ? '80px' : '100px',
                maxHeight: isMobile ? '80px' : '100px',
              }"
              :class="{
                'opacity-80': isPlayingIndex === index,
              }"
            />
            <component
              :is="isPlayingIndex === index ? Pause : PlayOne"
              class="absolute text-white text-3xl opacity-80 cursor-pointer transition-opacity duration-300"
              @click="togglePlay(index)"
              :class="{
                'opacity-100': isPlayingIndex === index,
              }"
            />
          </div>
          <div class="flex flex-col ml-4 w-full">
            <div class="flex justify-between items-center">
              <h3
                class="text-white text-sm hover:underline cursor-pointer"
                @click="showVideoDialog(item.video.url)"
              >
                {{ props.text }}
              </h3>
              <button
                @click="downloadAudio(item.audio.url)"
                class="w-8 h-8 text-white text-sm rounded-full hover:bg-gray-700 px-2 py-1 mr-2"
              >
                <DownloadOne size="16" />
              </button>
            </div>
            <div
              v-if="item.audio.url"
              class="flex items-center justify-start mt-8 w-full"
            >
              <span
                class="text-white text-sm mr-2 w-8 text-right flex items-center"
                >{{ formatTime(currentTime[index] || 0) }}</span
              >

              <div class="flex-grow flex items-center min-w-0">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  v-model="progress[index]"
                  @input="updateProgress(index, $event)"
                  @change="seek(index, $event)"
                  class="flex-grow flex max-w-full"
                />
              </div>
              <span class="text-white text-sm ml-4 mr-2 flex items-center">{{
                formatTime(duration[index] || 0)
              }}</span>
            </div>
          </div>
          <audio
            ref="audioRefs"
            :src="item.audio.url"
            @timeupdate="updateTime(index)"
            hidden
          ></audio>
        </div>
        <div v-if="!fileInfo" class="w-full">
          <span v-if="status === 2 && !text" class="loading-anchor"></span>
          <div
            :class="[
              'w-full markdown-body text-gray-800 dark:text-gray-400 ',
              { 'markdown-body-generate': status === 2 || !text },
            ]"
            v-html="text"
          ></div>
        </div>
      </div>
      <div
        v-if="status === 3 && action === 'LYRICS'"
        class="flex-none mt-2 mb-1"
      >
        <div class="flex justify-start">
          <button
            @click="showEditDialog"
            class="px-4 py-1 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
          >
            编辑
          </button>
          <button
            @click="handleGenerateMusic"
            class="px-4 py-1 shadow-sm bg-primary-600 hover:bg-primary-500 text-white dark rounded-md"
          >
            一键创作音乐
          </button>
        </div>
      </div>
    </div>

    <div
      class="flex transition-opacity duration-300 text-gray-700 opacity-0 group-hover:opacity-100"
    >
      <div>
        <div class="mt-1 flex">
          <button
            class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
            text
            @click="handleCopy"
          >
            <Copy class="flex mr-1" />
            <span class="flex text-sm">{{ t('chat.copy') }}</span>
          </button>
          <button
            class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
            text
            @click="handleDelete"
          >
            <Delete class="mr-1" />
            <span class="flex text-sm">{{ t('chat.delete') }} </span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 新增的视频弹窗 -->
  <div
    v-if="isVideoDialogVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    @click="closeVideoDialog"
  >
    <div
      class="relative p-0 rounded-md shadow-md max-w-full max-h-full"
      @click.stop
    >
      <Close
        @click="closeVideoDialog"
        class="absolute top-2 -right-8 text-gray-500 hover:text-gray-600"
        size="26"
      />
      <video
        :src="currentVideoUrl"
        controls
        class="w-full h-full rounded-md"
      ></video>
    </div>
  </div>

  <div
    v-if="isDialogVisible"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50"
  >
    <div
      class="bg-white p-6 w-full flex flex-col dark:bg-gray-900 dark:text-gray-400 relative"
      :class="[
        isMobile
          ? 'w-full h-full'
          : 'max-h-[80vh] max-w-3xl rounded-lg shadow-lg',
      ]"
    >
      <Close
        size="18"
        class="absolute top-3 right-3 cursor-pointer z-30"
        @click="closeDialog"
      />
      <div class="flex-none">
        <h2 class="text-2xl mb-4 font-semibold">歌词编辑</h2>
        <p class="mb-4">您可以点击内容进行编辑修改</p>
      </div>
      <div
        class="flex-1 overflow-y-auto p-4 rounded-lg border-2 dark:border-gray-700"
      >
        <div>
          <div class="flex items-center mb-4">
            <label class="w-12 text-gray-500 font-semibold">标题</label>
            <input
              type="text"
              v-model="customIdData.title"
              class="flex-1 p-2 text-lg font-semibold dark:bg-gray-900 dark:text-gray-400"
            />
          </div>
          <div class="mb-4">
            <!-- <label class="text-gray-500 font-semibold">歌词</label> -->
            <div class="flex flex-col">
              <div
                v-for="(line, index) in filteredLines"
                :key="index"
                class="py-2"
              >
                <span
                  v-if="line.startsWith('[') && line.endsWith(']')"
                  class="text-gray-500 font-semibold"
                  >{{ line }}</span
                >
                <textarea
                  v-else
                  v-model="filteredLines[index]"
                  class="ml-3 flex-1 py-1 w-full dark:bg-gray-900 dark:text-gray-400"
                  rows="1"
                  style="resize: none"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex mt-4">
        <div class="flex-1 justify-start">
          <Menu
            as="div"
            class="relative inline-block text-left shadow-sm rounded-md group mr-4"
          >
            <MenuButton
              class="px-4 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600 inline-flex w-full justify-center text-sm group-hover:bg-gray-50 dark:group-hover:bg-gray-700 group-hover:text-gray-900 dark:group-hover:text-gray-400 whitespace-nowrap"
            >
              {{ selectedMusicModel.title }}
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
                class="absolute left-0 bottom-full mb-2 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:text-gray-400 text-gray-900 overflow-y-auto"
              >
                <div class="py-1">
                  <MenuItem v-for="(option, index) in musicModel" :key="index">
                    <div
                      class="group flex items-center"
                      @click="switchInstrumental(option)"
                    >
                      <a
                        href="#"
                        class="flex w-full items-center pl-3 pr-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div class="w-28">
                          {{ option.title }}
                        </div>
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>

          <Menu
            as="div"
            class="relative inline-block text-left shadow-sm rounded-md group"
          >
            <MenuButton
              class="px-3 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600 inline-flex w-full justify-center text-sm group-hover:bg-gray-50 dark:group-hover:bg-gray-700 group-hover:text-gray-900 dark:group-hover:text-gray-400 whitespace-nowrap"
            >
              风格：{{ selectedMusicStyle.title }}
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
                class="absolute left-0 bottom-full mb-2 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:text-gray-400 text-gray-900 overflow-y-auto max-h-[60vh]"
              >
                <div class="py-1">
                  <MenuItem v-for="(option, index) in musicStyle" :key="index">
                    <div
                      class="group flex items-center"
                      @click="switchMusicStyle(option)"
                    >
                      <a
                        href="#"
                        class="flex w-full items-center pl-3 pr-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div class="w-28">
                          {{ option.title }}
                        </div>
                      </a>
                    </div>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>
        </div>
        <div class="flex justify-end">
          <button
            @click="closeDialog"
            class="px-4 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
          >
            取消
          </button>
          <button
            @click="submitEdit"
            class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white rounded-md"
          >
            提交
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
