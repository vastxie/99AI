<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useChatStore } from '@/store';
import { Copy, Delete } from '@icon-park/vue-next';
import mdKatex from '@traptitech/markdown-it-katex';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import mila from 'markdown-it-link-attributes';
import { computed, onUnmounted, ref, watch } from 'vue';
interface Props {
  inversion?: boolean;
  error?: boolean;
  text?: string;
  modelType?: number;
  status?: number;
  loading?: boolean;
  asRawText?: boolean;
  fileInfo?: string;
  model?: string;
  drawId?: string;
  customId?: string;
  modelName?: string;
}

interface Emit {
  (ev: 'regenerate'): void;
  (ev: 'delete'): void;
  (ev: 'copy'): void;
}

const props = defineProps<Props>();

const emit = defineEmits<Emit>();

const { isMobile } = useBasicLayout();
let intervalId: number | undefined;

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
        // console.log('定期执行操作');
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

const videoFileInfo = computed(() => props.fileInfo);

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

// const isVideoUrl = computed(() => {
//   if (!fileInfo.value) return false;
//   return /\.(mp4|avi|mov|wmv|flv)$/i.test(fileInfo.value);
// });

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t(
    'chat.copyCode'
  )}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`;
}

function handleRegenerate() {
  emit('regenerate');
}

function handleCopy() {
  emit('copy');
}

function handleDelete() {
  emit('delete');
}

defineExpose({ textRef });

const playbackState = ref('paused'); // 默认状态为'paused'

// 创建一个响应式引用来存储音频URL

const buttonGroupClass = computed(() => {
  // console.log(props.isLastMessage);
  return playbackState.value !== 'paused'
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100';
});
</script>

<template>
  <div class="flex flex-col group max-w-full">
    <div ref="textRef" class="leading-relaxed break-words">
      <div class="flex flex-col items-start">
        <div class="w-full">
          <span v-if="status === 2 && !text" class="loading-anchor"></span>
          <div
            :class="[
              'w-full markdown-body text-gray-800 dark:text-gray-400 ',
              { 'markdown-body-generate': status === 2 || !text },
            ]"
            v-html="text"
          ></div>
        </div>
        <div>
          <div v-show="videoFileInfo" :key="videoFileInfo">
            <video
              :src="videoFileInfo"
              controls
              class="rounded-md flex"
              :style="{
                maxWidth: isMobile ? '90%' : '30vw',
                maxHeight: isMobile ? '' : '30vh',
              }"
            >
              您的浏览器不支持视频标签。
            </video>
          </div>
        </div>
      </div>
    </div>
    <div class="text-wrap rounded-lg min-w-12 text-gray-800 dark:text-gray-400">
      <div>
        <div>
          <div
            class="my-1 flex w-auto"
            :style="{
              maxWidth: isMobile ? '100%' : '25rem',
            }"
          ></div>
        </div>
      </div>
    </div>
    <div
      :class="[
        'flex transition-opacity duration-300 text-gray-700',
        buttonGroupClass,
      ]"
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
          <!-- <button
            v-if="inversion"
            class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
            text
            @click="handleRegenerate"
          >
            <Refresh class="mr-1" />
            <span class="flex text-sm">{{ t('chat.regenerate') }} </span>
          </button> -->
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
</template>

<style lang="less">
@import url(./style.less);

@keyframes rotateAnimation {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rotate-icon {
  animation: rotateAnimation 3s linear infinite;
  transform-origin: center;
}
</style>
