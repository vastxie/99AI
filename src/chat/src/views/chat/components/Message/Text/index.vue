<script lang="ts" setup>
import { fetchTtsAPIProces } from '@/api';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore } from '@/store';
import {
  ArrowRight,
  Close,
  Copy,
  Delete,
  Down,
  Edit,
  LoadingOne,
  PauseOne,
  Refresh,
  Rotation,
  Send,
  Up,
  VoiceMessage,
} from '@icon-park/vue-next';
import mdKatex from '@traptitech/markdown-it-katex';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import mila from 'markdown-it-link-attributes';
import { NImage } from 'naive-ui';
import { computed, inject, nextTick, onMounted, ref } from 'vue';
import HtmlModal from './htmlModal.vue';

interface Props {
  chatId?: number;
  index: number;
  inversion?: boolean;
  text: string;
  modelType?: number;
  status?: number;
  loading?: boolean;
  asRawText?: boolean;
  fileInfo?: string;
  ttsUrl?: string;
  model?: string;
  promptReference?: string;
  isLast?: boolean;
}

interface Emit {
  (ev: 'regenerate'): void;
  (ev: 'delete'): void;
  (ev: 'copy'): void;
}

interface TtsResponse {
  ttsUrl: string;
}

const authStore = useAuthStore();
const { isMobile } = useBasicLayout();
const onConversation = inject<any>('onConversation');
const handleRegenerate = inject<any>('handleRegenerate');

const props = defineProps<Props>();
const emit = defineEmits<Emit>();

const modalVisible = ref(false);
const editableText = ref(props.text);
const showThinking = ref(true);
const textRef = ref<HTMLElement>();
const localTtsUrl = ref(props.ttsUrl);
const htmlContent = ref<string>('');
const isHtml = ref(false);
const playbackState = ref('paused');
const editableContent = ref(props.text);
const isEditable = ref(false);
const textarea = ref<HTMLTextAreaElement | null>(null);

let currentAudio: HTMLAudioElement | null = null;

const isHideTts = computed(
  () => Number(authStore.globalConfig?.isHideTts) === 1
);

const buttonGroupClass = computed(() => {
  return playbackState.value !== 'paused' || isEditable.value
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100';
});

const handlePlay = async () => {
  if (playbackState.value === 'loading' || playbackState.value === 'playing')
    return;
  if (localTtsUrl.value) {
    playAudio(localTtsUrl.value);
    return;
  }

  playbackState.value = 'loading';
  try {
    if (!props.chatId) return;

    const res = (await fetchTtsAPIProces({
      chatId: props.chatId,
      prompt: props.text,
    })) as TtsResponse;

    const ttsUrl = res.ttsUrl;
    if (ttsUrl) {
      localTtsUrl.value = ttsUrl;
      playAudio(ttsUrl);
    } else {
      throw new Error('TTS URL is undefined');
    }
  } catch (error) {
    playbackState.value = 'paused';
  }
};

function playAudio(audioSrc: string | undefined) {
  if (currentAudio) {
    currentAudio.pause();
  }
  currentAudio = new Audio(audioSrc);
  currentAudio
    .play()
    .then(() => {
      playbackState.value = 'playing';
    })
    .catch((error) => {
      playbackState.value = 'paused';
    });

  currentAudio.onended = () => {
    playbackState.value = 'paused';
    currentAudio = null;
  };
}

function pauseAudio() {
  if (currentAudio) {
    currentAudio.pause();
    playbackState.value = 'paused';
  }
}

function playOrPause() {
  if (playbackState.value === 'playing') {
    pauseAudio();
  } else {
    handlePlay();
  }
}

const mdi = new MarkdownIt({
  linkify: true,
  html: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language));
    if (validLang) {
      const lang = language ?? '';
      console.log('language', language);
      if (language === 'html') {
        htmlContent.value = code;
        isHtml.value = true;
        console.log('htmlContent', htmlContent.value);
      }
      return highlightBlock(
        hljs.highlight(code, { language: lang }).value,
        lang
      );
    }

    return highlightBlock(hljs.highlightAuto(code).value, '');
  },
});

mdi.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const src = token.attrGet('src');
  const title = token.attrGet('title');
  const alt = token.content;

  if (isMobile.value) {
    return `<img src="${src}" alt="${alt}" title="${
      title || alt
    }" class="rounded-md"
      style=" max-width:100% "
      onclick="(function() {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = 0;
        modal.style.left = 0;
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0, 0, 0, 1)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = 1000;
        modal.style.overflow = 'hidden';

        modal.onclick = (event) => {
            document.body.removeChild(modal);
        };

        const img = document.createElement('img');
        img.src = '${src}';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '95%';
        img.style.transform = 'scale(1) translate(0px, 0px)';
        img.style.transition = 'transform 0.2s';

        let scale = 1;
        let posX = 0, posY = 0;
        let isDragging = false;
        let startX, startY;

        let initialDistance = null;
        modal.addEventListener('touchmove', (event) => {
          if (event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            const currentDistance = Math.sqrt(
              (touch2.clientX - touch1.clientX) ** 2 +
              (touch2.clientY - touch1.clientY) ** 2
            );

            if (initialDistance === null) {
              initialDistance = currentDistance;
            } else {
              const scaleChange = currentDistance / initialDistance;
              scale = Math.max(0.5, Math.min(scale * scaleChange, 3));
              img.style.transform = \`scale(\${scale}) translate(\${posX}px, \${posY}px)\`;
              initialDistance = currentDistance;
            }
          }
        });

        modal.addEventListener('touchend', () => {
          initialDistance = null;
        });

        modal.appendChild(img);
        document.body.appendChild(modal);
      })()"
  />`;
  } else {
    return `<img src="${src}" alt="${alt}" title="${
      title || alt
    }" class="rounded-md"
      style="max-width:100% ;max-height: 30vh;"
      onclick="(function() {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = 0;
        modal.style.left = 0;
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0, 0, 0, 0.5)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = 1000;
        modal.style.overflow = 'hidden';

        modal.onclick = (event) => {
          if (event.target === modal) {
            document.body.removeChild(modal);
          }
        };

        const img = document.createElement('img');
        img.src = '${src}';
        img.style.maxWidth = '95%';
        img.style.maxHeight = '95%';
        img.style.borderRadius = '8px';
        img.style.transform = 'scale(1) translate(0px, 0px)';
        img.style.transition = 'transform 0.2s';

        let scale = 1;
        let posX = 0, posY = 0;
        let isDragging = false;
        let startX, startY;

        modal.addEventListener('wheel', (event) => {
          event.preventDefault();
          const zoomFactor = 0.1;
          if (event.deltaY < 0) {
            scale = Math.min(scale + zoomFactor, 3);
          } else {
            scale = Math.max(scale - zoomFactor, 0.5);
          }
          img.style.transform = \`scale(\${scale}) translate(\${posX}px, \${posY}px)\`;
        });

        let initialDistance = null;
        modal.addEventListener('touchmove', (event) => {
          if (event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            const currentDistance = Math.sqrt(
              (touch2.clientX - touch1.clientX) ** 2 +
              (touch2.clientY - touch1.clientY) ** 2
            );

            if (initialDistance === null) {
              initialDistance = currentDistance;
            } else {
              const scaleChange = currentDistance / initialDistance;
              scale = Math.max(0.5, Math.min(scale * scaleChange, 3));
              img.style.transform = \`scale(\${scale}) translate(\${posX}px, \${posY}px)\`;
              initialDistance = currentDistance;
            }
          }
        });

        modal.addEventListener('touchend', () => {
          initialDistance = null;
        });

        const close = document.createElement('span');
        close.innerText = '×';
        close.style.position = 'absolute';
        close.style.top = '24px';
        close.style.right = '24px';
        close.style.color = 'white';
        close.style.fontSize = '1.5rem';
        close.style.cursor = 'pointer';
        close.onclick = () => document.body.removeChild(modal);

        modal.appendChild(img);
        modal.appendChild(close);
        document.body.appendChild(modal);
      })()"
  />`;
  }
};

const fileInfo = computed(() => props.fileInfo);
const fileInfoArray = computed(() =>
  fileInfo?.value?.split(',').map((file) => file.trim())
);

const isVideoUrl = computed(() => {
  if (!fileInfo.value) return false;
  return /\.(mp4|avi|mov|wmv|flv)$/i.test(fileInfo.value);
});

const isImageUrl = computed(() => {
  if (!fileInfo.value) return false;
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileInfo.value);
});

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } });
mdi.use(mdKatex, {
  blockClass: 'katexmath-block p-0 flex h-full items-center justify-start',
  inlineClass: 'katexmath-inline',
  errorColor: ' #cc0000',
});

const mainContent = computed(() => {
  let value = props.text || '';

  if (value.startsWith('<think>')) {
    const endThinkTagIndex = value.indexOf('</think>');
    if (endThinkTagIndex !== -1) {
      value =
        value.slice(0, value.indexOf('<think>')) +
        value.slice(endThinkTagIndex + 8);
    } else {
      value = '';
    }
  }

  let modifiedValue = value
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$')
    .replace(/\\\[\s*/g, '$$')
    .replace(/\s*\\\]/g, '$$')
    .replace(
      /\[\[(\d+)\]\((https?:\/\/[^\)]+)\)\]/g,
      '<button class="bg-gray-500 text-white rounded-full w-4 h-4 mx-1 flex justify-center items-center text-sm hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 inline-flex" onclick="window.open(\'$2\', \'_blank\')">$1</button>'
    );

  if (!props.asRawText) {
    return mdi.render(modifiedValue);
  }

  return modifiedValue;
});

const thinkingContent = computed<string>(() => {
  let content = '';

  if (props.text?.includes('<think>') && !props.text.includes('</think>')) {
    content = props.text.replace(/<think>/g, '').trim();
  } else {
    const match = props.text?.match(/<think>([\s\S]*?)<\/think>/);
    if (match) {
      content = match[1];
    }
  }

  const modifiedContent = content
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$')
    .replace(/\\\[\s*/g, '$$')
    .replace(/\s*\\\]/g, '$$');

  if (!props.asRawText) {
    return mdi.render(modifiedContent);
  }

  return modifiedContent;
});

function highlightBlock(str: string, lang?: string) {
  return `<pre
    style=" max-width:100%; background-color: #212121; "
    class="code-block-wrapper"
  ><div class="code-block-header "><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t(
    'chat.copyCode'
  )}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`;
}

async function handleEdit() {
  editableText.value = props.text;
  modalVisible.value = true;
}

function closeModal() {
  modalVisible.value = false;
}

async function handleEditMessage() {
  if (isEditable.value) {
    const tempEditableContent = editableContent.value;
    await onConversation({
      msg: tempEditableContent,
      chatId: props.chatId,
    });

    isEditable.value = false;
  } else {
    editableContent.value = props.text;
    isEditable.value = true;
    await nextTick();
    adjustTextareaHeight();
  }
}

async function handleMessage(item: string) {
  await onConversation({
    msg: item,
  });
}

function handleCopy() {
  emit('copy');
}

function handleDelete() {
  emit('delete');
}

const cancelEdit = () => {
  isEditable.value = false;
  editableContent.value = props.text;
};

const adjustTextareaHeight = () => {
  if (textarea.value) {
    textarea.value.style.height = 'auto';
    textarea.value.style.height = `${textarea.value.scrollHeight}px`;
  }
};

defineExpose({ textRef });

onMounted(() => {
  const uniqueId = document.querySelector('.preview-button')?.id;
  const previewButton = uniqueId ? document.getElementById(uniqueId) : null;
  if (previewButton) {
    previewButton.addEventListener('click', handleEdit);
  }
});
</script>

<template>
  <div class="flex flex-col group w-full">
    <div class="text-wrap rounded-lg min-w-12 flex w-full flex-col">
      <div
        v-if="thinkingContent && !inversion"
        @click="showThinking = !showThinking"
        class="text-gray-600 flex items-center mb-1 text-base hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 cursor-pointer"
      >
        <span>{{ mainContent || !loading ? '已深度思考' : '深度思考中' }}</span>
        <LoadingOne
          v-if="!mainContent && loading"
          class="rotate-icon flex mx-1"
        />
        <Down v-if="!showThinking" size="20" class="mr-1 flex" />
        <Up v-else size="20" class="mr-1 flex" />
      </div>
      <div
        v-else-if="loading && thinkingContent && !inversion"
        class="text-gray-600 flex items-center mb-1 text-base hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 cursor-pointer"
      >
        <span>深度思考</span>
        <LoadingOne class="rotate-icon flex mx-1" />
      </div>

      <div ref="textRef" class="flex w-full">
        <div
          v-if="!inversion"
          class="flex flex-col items-start"
          style="max-width: 100%"
        >
          <div class="w-full">
            <span
              v-if="loading && !text"
              class="inline-block w-3.5 h-3.5 ml-0.5 align-middle rounded-full animate-breathe dark:bg-gray-100 bg-gray-950"
            ></span>
            <div
              v-if="thinkingContent && showThinking"
              :class="[
                'markdown-body text-gray-600 dark:text-gray-400 pl-5 mt-2 mb-4 border-l-2 border-gray-300 dark:border-gray-600 overflow-hidden transition-opacity duration-500 ease-in-out',
                {
                  'markdown-body-generate': loading && !mainContent,
                },
              ]"
              v-html="thinkingContent"
            ></div>
            <div
              :class="[
                'markdown-body text-gray-950 dark:text-gray-100',
                { 'markdown-body-generate': loading || !mainContent },
              ]"
              v-html="mainContent"
            ></div>
          </div>
        </div>

        <div
          v-else
          class="flex justify-end w-full"
          :class="[isMobile ? 'pl-20' : 'pl-28 ']"
          style="max-width: 100%"
        >
          <div
            v-if="isEditable"
            class="p-3 rounded-2xl w-full bg-opacity dark:bg-gray-750 break-words"
            style="max-width: 100%"
          >
            <textarea
              v-model="editableContent"
              class="min-w-full text-base resize-none overflow-hidden bg-transparent whitespace-pre-wrap text-gray-950 dark:text-gray-100"
              @input="adjustTextareaHeight"
              @keydown.enter="handleEditMessage"
              ref="textarea"
            ></textarea>
          </div>
          <div
            v-else
            class="p-3 rounded-2xl text-base bg-opacity dark:bg-gray-750 break-words whitespace-pre-wrap text-gray-950 dark:text-gray-100"
            v-text="text"
            style="max-width: 100%"
          />
        </div>
      </div>

      <div
        v-if="fileInfo && !isImageUrl && !isVideoUrl"
        class="my-1 flex w-full"
        :class="[{ 'justify-end': inversion }]"
      >
        <div
          class="flex p-3 items-center justify-center ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-lg hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <span>{{ t('chat.fileAnalysis') }} </span>
        </div>
      </div>

      <div
        v-if="fileInfoArray && isImageUrl"
        class="my-2 w-full flex"
        :class="[isMobile ? 'pl-20' : 'pl-28', { 'justify-end': inversion }]"
        :style="{
          maxHeight: isMobile ? '' : '30vh',
          maxWidth: isMobile ? '100%' : '100%',
        }"
      >
        <NImage
          v-for="(file, index) in fileInfoArray"
          :key="index"
          :src="file"
          :preview-src="file"
          alt="图片"
          class="rounded-md flex ml-2"
          :class="[{ 'justify-end': inversion }]"
          :style="{
            maxHeight: '100%',
            height: 'auto',
            objectFit: 'contain',
          }"
        />
      </div>
    </div>

    <div v-if="isHtml && !inversion" class="flex-none mt-2 mb-1">
      <div class="flex justify-start">
        <button
          @click="handleEdit"
          class="px-4 py-1 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-lg mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
        >
          预览代码
        </button>
      </div>
    </div>

    <div
      v-if="promptReference && !inversion && isLast"
      class="flex-none transition-opacity duration-500"
    >
      <button
        v-for="(item, index) in promptReference
          ? promptReference
              .match(/{(.*?)}/g)
              ?.map((str: string | any[]) => str.slice(1, -1))
              .slice(0, 3)
          : []"
        :key="index"
        @click="handleMessage(item as string)"
        class="flex flex-row items-center my-3 px-3 py-2 shadow-sm bg-opacity hover:bg-gray-50 text-left text-gray-900 rounded-full overflow-hidden dark:bg-gray-750 dark:text-gray-400"
      >
        {{ item }}
        <ArrowRight class="ml-1" />
      </button>
    </div>

    <div
      :class="[
        'flex transition-opacity duration-300 text-gray-700  ',
        buttonGroupClass,
        { 'justify-end': inversion },
      ]"
    >
      <div class="mt-2 flex">
        <button
          v-if="!isEditable"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="handleCopy"
        >
          <Copy class="flex mr-1" />
          <span class="flex text-sm">{{ t('chat.copy') }}</span>
        </button>

        <button
          v-if="!isEditable"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="handleDelete"
        >
          <Delete class="mr-1" />
          <span class="flex text-sm">{{ t('chat.delete') }} </span>
        </button>
        <button
          v-if="isEditable"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="cancelEdit"
        >
          <Close class="mr-1" />
          <span class="flex text-sm">取消</span>
        </button>
        <button
          v-if="isEditable"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="handleEditMessage"
        >
          <Send class="mr-1" />
          <span class="flex text-sm">提交</span>
        </button>
        <button
          v-if="inversion && !isEditable && modelType === 1"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="handleEditMessage"
        >
          <Edit class="mr-1" />
          <span class="flex text-sm">编辑</span>
        </button>
        <button
          v-if="!inversion && modelType === 1"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="handleRegenerate(index, chatId)"
        >
          <Refresh class="mr-1" />
          <span class="flex text-sm">重新生成</span>
        </button>
        <button
          v-if="!inversion && !isHideTts"
          class="flex ml-0 items-center text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 mr-3"
          text
          @click="playOrPause"
        >
          <VoiceMessage v-if="playbackState === 'paused'" class="flex mr-1" />
          <Rotation
            v-if="playbackState === 'loading'"
            class="rotate-icon flex mr-1"
          />
          <PauseOne v-else-if="playbackState === 'playing'" class="flex mr-1" />
          <span class="flex text-sm">
            {{
              playbackState === 'playing'
                ? t('chat.pause')
                : playbackState === 'loading'
                ? t('chat.loading')
                : t('chat.readAloud')
            }}
          </span>
        </button>
      </div>
    </div>
    <HtmlModal v-if="modalVisible" :text="htmlContent" :close="closeModal" />
  </div>
</template>

<style lang="less">
@import url(../style.less);

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

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    /* 原始尺寸 */
    opacity: 1;
    /* 完全不透明 */
  }

  50% {
    transform: scale(0.5);
    /* 缩小到50%的尺寸 */
    opacity: 0.5;
    /* 半透明 */
  }
}

.breathing-dot {
  display: inline-block;
  width: 10px;
  /* 圆点的基础宽度 */
  height: 10px;
  /* 圆点的基础高度 */
  border-radius: 50%;
  /* 使其成为圆形 */
  background-color: black;
  /* 圆点的颜色 */
  animation: breathe 2s infinite;
  /* 应用动画，无限循环 */
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
    /* 开始和结束时完全不透明 */
  }

  50% {
    transform: scale(0.75);
    /* 中间缩小到75% */
    opacity: 0.75;
    /* 中间透明度降低，增加平滑感 */
  }
}

.animate-breathe {
  animation: breathe 2s infinite ease-in-out;
}
</style>
