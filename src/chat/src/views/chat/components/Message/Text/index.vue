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
  Edit,
  PauseOne,
  Refresh,
  Rotation,
  Send,
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

const authStore = useAuthStore();
const onConversation = inject<any>('onConversation');
const handleRegenerate = inject<any>('handleRegenerate');

const props = defineProps<Props>();

const modalVisible = ref(false);
const editableText = ref(props.text);
const isHideTts = computed(
  () => Number(authStore.globalConfig?.isHideTts) === 1
);

const emit = defineEmits<Emit>();

const { isMobile } = useBasicLayout();

const textRef = ref<HTMLElement>();

const localTtsUrl = ref(props.ttsUrl);
const htmlContent = ref<string>('');
const isHtml = ref(false);

const playbackState = ref('paused');
let currentAudio: HTMLAudioElement | null = null;

const editableContent = ref(props.text); // 新增一个引用来存储编辑后的内容
const isEditable = ref(false); // 定义一个状态变量控制是否进入编辑模式

const textarea = ref<HTMLTextAreaElement | null>(null);

function adjustTextareaHeight() {
  if (textarea.value) {
    textarea.value.style.height = 'auto';
    textarea.value.style.height = textarea.value.scrollHeight + 'px';
  }
}

function cancelEdit() {
  editableContent.value = props.text; // 重置已编辑的内容
  isEditable.value = false; // 退出编辑模式
}

// 创建一个响应式引用来存储音频URL

const buttonGroupClass = computed(() => {
  return playbackState.value !== 'paused' || isEditable.value
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100';
});

// 这个函数用于获取音频URL并播放音频
async function handlePlay() {
  if (playbackState.value === 'loading' || playbackState.value === 'playing') {
    return;
  }
  // 使用localTtsUrl的值进行判断
  if (localTtsUrl.value) {
    playAudio(localTtsUrl.value);
    return;
  }
  // 这里可以加入你的文本提示，或者根据组件内部的状态来确定
  playbackState.value = 'loading';
  try {
    const res = await fetchTtsAPIProces({
      chatId: props.chatId,
      prompt: props.text,
    });
    const ttsUrl = res.ttsUrl; // 假设响应中包含ttsUrl
    if (ttsUrl) {
      localTtsUrl.value = ttsUrl; // 更新本地ttsUrl
      playAudio(ttsUrl);
    } else {
      throw new Error('TTS URL is undefined');
    }
  } catch (error) {
    playbackState.value = 'paused';
  }
}

function playAudio(audioSrc: string | undefined) {
  // 如果之前已经有音频在播放，先停止它
  if (currentAudio) {
    currentAudio.pause();
  }
  // 创建新的音频对象并播放
  currentAudio = new Audio(audioSrc);
  currentAudio
    .play()
    .then(() => {
      playbackState.value = 'playing'; // 更新状态为播放中
    })
    .catch((error) => {
      playbackState.value = 'paused'; // 出错时更新状态为暂停
    });

  // 当音频播放结束时更新状态
  currentAudio.onended = () => {
    playbackState.value = 'paused'; // 音频结束时更新状态为暂停
    currentAudio = null; // 清除引用
  };
}

function pauseAudio() {
  if (currentAudio) {
    currentAudio.pause(); // 暂停音频
    playbackState.value = 'paused'; // 更新状态为暂停
  }
}

function playOrPause() {
  if (playbackState.value === 'playing') {
    pauseAudio(); // 如果当前是播放状态，则暂停
  } else {
    handlePlay(); // 否则，尝试播放音频
  }
}

const mdi = new MarkdownIt({
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language));
    if (validLang) {
      const lang = language ?? '';
      // 检测到HTML代码块时，直接返回原始内容
      console.log('language', language);
      if (language === 'html') {
        htmlContent.value = code; // 存储HTML内容
        isHtml.value = true; // 标记为HTML内容
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

// 添加自定义渲染规则来处理图片
mdi.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const src = token.attrGet('src');
  const title = token.attrGet('title');
  const alt = token.content;

  // 使用普通的<img>标签，你可以根据需要添加或调整属性
  return `<img src="${src}" alt="${alt}" title="${
    title || alt
  }" class="rounded-md" style=" max-width:100% ;max-height: 30vh; "/>`;
};

const fileInfo = computed(() => props.fileInfo);
// 将 fileInfo 转换为数组
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

const text = computed(() => {
  const value = props.text ?? '';

  // 使用正则表达式替换 \( 后面的空格和 \) 前面的空格，以及 \[ 和 \] 的情况
  const modifiedValue = value
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$')
    .replace(/\\\[\s*/g, '$$')
    .replace(/\s*\\\]/g, '$$');

  if (!props.asRawText) {
    const renderedValue = mdi.render(modifiedValue);
    return renderedValue;
  }

  return modifiedValue;
});

function highlightBlock(str: string, lang?: string) {
  return `<pre style=" max-width:100% " class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t(
    'chat.copyCode'
  )}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`;
}

async function handleEdit() {
  // await chatStore.queryActiveChatLogList();
  editableText.value = props.text;
  modalVisible.value = true;
}

function closeModal() {
  modalVisible.value = false;
}

async function handleEditMessage() {
  if (isEditable.value) {
    const tempEditableContent = editableContent.value; // 存储编辑后的内容到临时变量
    await onConversation({
      msg: tempEditableContent, // 使用临时变量中的编辑后的内容
      chatId: props.chatId,
    });

    isEditable.value = false; // 提交后退出编辑模式
  } else {
    editableContent.value = props.text;
    isEditable.value = true; // 进入编辑模式
    await nextTick(); // 确保 DOM 更新完成
    adjustTextareaHeight(); // 调整高度
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
      <div ref="textRef" class="flex w-full">
        <div
          v-if="!inversion"
          class="flex flex-col items-start"
          style="max-width: 100%"
        >
          <div class="w-full">
            <span v-if="loading && !text" class="loading-anchor"></span>
            <div
              :class="[
                'markdown-body text-gray-950 dark:text-gray-100',
                { 'markdown-body-generate': loading || !text },
              ]"
              v-html="text"
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
            class="p-3 rounded-lg w-full bg-opacity dark:bg-gray-750 break-words"
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
            class="p-3 rounded-lg text-base bg-opacity dark:bg-gray-750 break-words whitespace-pre-wrap text-gray-950 dark:text-gray-100"
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
          class="px-4 py-1 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
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
              ?.map((str) => str.slice(1, -1))
              .slice(0, 3)
          : []"
        :key="index"
        @click="handleMessage(item)"
        class="flex flex-row items-center my-3 px-2 py-2 shadow-sm bg-opacity hover:bg-gray-50 text-left text-gray-900 rounded-md overflow-hidden dark:bg-gray-750 dark:text-gray-400"
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

.loading-anchor::after {
  content: '';
  /* 不使用文本内容 */
  display: inline-block;
  width: 0.875em;
  /* 控制原点的大小 */
  height: 0.875em;
  /* 保持原点为圆形 */
  margin-left: 2px;
  background-color: #000;
  /* 原点颜色 */
  border-radius: 50%;
  /* 使其成为圆形 */
  animation: breathe 2s infinite ease-in-out;
  /* 应用呼吸效果动画 */
  vertical-align: middle;
  /* 根据需要调整垂直对齐 */
}
</style>
