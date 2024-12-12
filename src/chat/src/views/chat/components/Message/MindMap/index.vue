<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useChatStore } from '@/store';
import { Copy, Delete } from '@icon-park/vue-next';
import mdKatex from '@traptitech/markdown-it-katex';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import mila from 'markdown-it-link-attributes';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { onMounted, onUpdated, ref } from 'vue';
import FullScreenModal from './FullScreenModal.vue';
const { isMobile } = useBasicLayout();

interface Props {
  chatId?: number;
  inversion?: boolean;
  text: string;
  modelType?: number;
  status?: number;
  loading?: boolean;
  asRawText?: boolean;
  fileInfo?: string;
  ttsUrl?: string;
  model?: string;
}

interface Emit {
  (ev: 'delete'): void;
  (ev: 'copy'): void;
}

const transformer = new Transformer();

const props = defineProps<Props>();

const emit = defineEmits<Emit>();
const svgRef = ref();

const textRef = ref<HTMLElement>();
const modalVisible = ref(false);
const editableText = ref(props.text);
const chatStore = useChatStore();

let updateTimeout: string | number | NodeJS.Timeout | null | undefined = null;

onMounted(() => {
  mm = Markmap.create(svgRef.value);
  update();
});

const update = () => {
  if (updateTimeout) clearTimeout(updateTimeout);

  updateTimeout = setTimeout(() => {
    const { root } = transformer.transform(props.text);
    mm.setData(root);
    mm.fit();
  }, 200);
};

let mm: Markmap;

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

mdi.renderer.rules.image = function (tokens, idx) {
  const token = tokens[idx];
  const src = token.attrGet('src');
  const title = token.attrGet('title');
  const alt = token.content;

  return `<img src="${src}" alt="${alt}" title="${
    title || alt
  }" class="rounded-md" style=" max-width:100% ;max-height: 30vh; "/>`;
};

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } });
mdi.use(mdKatex, {
  blockClass: 'katexmath-block rounded-md p-[10px]',
  errorColor: ' #cc0000',
});

onUpdated(update);

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

async function handleEdit() {
  // await chatStore.queryActiveChatLogList();
  editableText.value = props.text;
  modalVisible.value = true;
}

function closeModal() {
  modalVisible.value = false;
}

defineExpose({ textRef });
</script>

<template>
  <div class="flex flex-col group max-w-full">
    <div class="text-wrap rounded-lg min-w-12 text-gray-800 dark:text-gray-400">
      <div class="flex w-full relative" @click="handleEdit">
        <svg
          ref="svgRef"
          class="box-border w-[600px] h-[400px] border rounded-md border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          style="pointer-events: none"
          draggable="false"
        />
      </div>
    </div>
    <div
      class="flex transition-opacity duration-300 text-gray-700 opacity-0 group-hover:opacity-100"
    >
      <div>
        <div class="mt-1 flex">
          <button
            class="flex items-center text-gray-400 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400 mr-3"
            text
            @click="handleCopy"
          >
            <Copy class="flex mr-1" />
            <span class="flex text-sm">复制</span>
          </button>

          <button
            class="flex ml-0 items-center text-gray-400 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400 mr-3"
            text
            @click="handleDelete"
          >
            <Delete class="mr-1" />
            <span class="flex text-sm">删除</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <FullScreenModal
    v-if="modalVisible"
    :text="editableText"
    :close="closeModal"
  />
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
</style>
