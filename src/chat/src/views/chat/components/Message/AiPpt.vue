<script lang="ts" setup>
import { fetchPptCoverAPIProcess } from '@/api';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useChatStore } from '@/store';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { Copy, Delete, LoadingFour } from '@icon-park/vue-next';
import mdKatex from '@traptitech/markdown-it-katex';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import mila from 'markdown-it-link-attributes';
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
interface Props {
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

const loading = ref(false);

const onConversation = inject<any>('onConversation');

const customIdData = ref({
  title: '',
  catalogs: [
    {
      catalog: '',
      sub_catalog: [''],
    },
  ],
});

const customImageUrls = ref(['']);

const fileInfoArray = computed(() => {
  return props.fileInfo ? props.fileInfo.split(',') : [];
});

const props = defineProps<Props>();

const emit = defineEmits<Emit>();

const { isMobile } = useBasicLayout();
let intervalId: number | undefined;

const isDialogVisible = ref(false);
const isPreviewVisible = ref(false);
const currentImageIndex = ref(0);

const showEditDialog = () => {
  customIdData.value = JSON.parse(props.customId);
  isDialogVisible.value = true;
};

const showPreviewDialog = () => {
  if (props.customId) {
    customImageUrls.value = JSON.parse(props.customId);
  }
  console.log('customImageUrls:', customImageUrls.value);
  isPreviewVisible.value = true;
};

const closePreviewDialog = () => {
  isPreviewVisible.value = false;
};

const closeDialog = () => {
  isDialogVisible.value = false;
};

const submitEdit = async () => {
  // 将编辑后的customIdData传给props.customId
  isDialogVisible.value = false;

  try {
    await onConversation({
      msg: '使用大纲生成 PPT', // 具体的消息内容根据需要调整
      action: 'PPTCREATE',
      customId: customIdData.value,
      modelType: 2,
      model: 'ai-ppt',
      modelName: 'AiPPT',
      extraParam: {
        color: selectedColor.value,
        style: selectedStyle.value,
        cover_id: selectedCover.value,
        complex: selectedComplexity.value,
      },
    });
    console.log('PPT生成请求已发送');
  } catch (error) {
    console.error('PPT生成请求失败:', error);
  }
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
        // console.log('定期执行操作');
        await chatStore.queryActiveChatLogList();

        if (props.customId) {
          customImageUrls.value = JSON.parse(props.customId);
        }
      }, 5000); // 每5秒执行一次
    }
  },
  { immediate: true }
);

watch(
  () => props.text,
  (newText) => {
    if (newText && newText.length > 20) {
      handelGeneratePPTCover();
    }
  }
);

onMounted(() => {
  if (props.text && props.text.length > 20) {
    handelGeneratePPTCover();
  }
  if (props.customId) {
    customImageUrls.value = JSON.parse(props.customId);
  }
});

// 组件卸载时清除定时器
onUnmounted(() => {
  if (intervalId !== undefined) {
    clearInterval(intervalId);
  }
});

// 组件卸载时清除定时器，避免内存泄露
onUnmounted(() => {
  clearInterval(intervalId);
});

const downloadPPT = () => {
  const link = document.createElement('a');
  link.href = fileInfoArray.value[0]; // Assuming the first item in fileInfoArray is the PPT file
  link.download = 'PPT文件.ppt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const selectImage = (index: number) => {
  currentImageIndex.value = index;
};

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

const selectedColor = ref('');
const selectedStyle = ref('');
const selectedCover = ref('');
const selectedComplexity = ref('');
// const colors = ['紫色', '红色', '橙色', '黄色', '绿色', '青色', '蓝色', '粉色'];
// const styles = ['科技', '商务', '小清新', '极简', '中国风', '可爱卡通'];
const complexities = [
  { label: '简单', value: '1' },
  { label: '中等', value: '2' },
  { label: '复杂', value: '3' },
];
const selectColor = (color: string) => {
  selectedColor.value = color;
};

const selectStyle = (style: string) => {
  selectedStyle.value = style;
};

const selectComplexity = (complexity: { label: string; value: string }) => {
  // selectedComplexity.label = complexity.label;
  selectedComplexity.value = complexity.value;
};

const handleGeneratePPT = async () => {
  try {
    await onConversation({
      msg: '生成 PPT', // 具体的消息内容根据需要调整
      action: 'PPTCREATE',
      customId: props.customId,
      modelType: 2,
      model: 'ai-ppt',
      modelName: 'AiPPT',
      extraParam: {
        color: '',
        style: '',
        complex: '',
      },
    });
    console.log('PPT生成请求已发送');
  } catch (error) {
    console.error('PPT生成请求失败:', error);
  }
};

const PPTCover = ref('');

const handelGeneratePPTCover = async () => {
  try {
    loading.value = true;
    selectedCover.value = '';
    console.log('PPT封面生成请求已发送', props.customId);
    const res = await fetchPptCoverAPIProcess({
      title: JSON.parse(props.customId).title,
      color: '',
      style: '',
    });
    PPTCover.value = res.data;
    console.log('PPT封面生成请求已发送', res.data);
    loading.value = false;
  } catch (error) {
    console.error('PPT封面生成请求失败:', error);
    loading.value = false;
  }
};

const handleCoverClick = (cover: any) => {
  selectedCover.value = cover.cover_id;
  console.log('点击了封面:', cover);
};

const addCatalog = () => {
  customIdData.value.catalogs.push({
    catalog: '小标题',
    sub_catalog: [' ', ' '],
  });
};

const addSubCatalog = (index) => {
  // 确保在指定的章节中添加一个新小节
  customIdData.value.catalogs[index].sub_catalog.push(' ');
};

const removeSubCatalog = (catalogIndex, subIndex) => {
  const subCatalogs = customIdData.value.catalogs[catalogIndex].sub_catalog;
  // 确保我们不会尝试删除不存在的小节
  if (subCatalogs.length > subIndex) {
    subCatalogs.splice(subIndex, 1);
    // 触发 Vue 的响应式更新
    customIdData.value.catalogs[catalogIndex].sub_catalog = [...subCatalogs];
  }
};

const removeCatalog = (index: number) => {
  customIdData.value.catalogs.splice(index, 1);
};

defineExpose({ textRef });
</script>

<template>
  <div
    v-if="isDialogVisible"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50 py-6"
  >
    <div
      class="bg-white p-6 rounded-lg shadow-lg w-3/4 max-w-3xl max-h-[80vh] flex flex-col"
    >
      <div class="flex-none">
        <h2 class="text-2xl mb-4 font-semibold">PPT大纲编辑调整</h2>
        <p class="mb-4">您可以点击标题或章节进行大纲的编辑修改</p>
      </div>
      <div class="flex-1 overflow-y-auto p-4 rounded-lg border">
        <div class="bg-white">
          <div class="flex items-center mb-4">
            <label class="w-16 text-gray-500 font-semibold">主标题</label>
            <input
              type="text"
              v-model="customIdData.title"
              class="flex-1 p-2 text-lg font-semibold"
            />
          </div>
          <div
            v-for="(catalog, index) in customIdData.catalogs"
            :key="index"
            class="mb-4 p-4 border rounded-md shadow-sm relative"
          >
            <div class="flex items-center mb-2">
              <label class="w-12 font-semibold text-gray-500"
                >章节 {{ index + 1 }}</label
              >
              <input
                type="text"
                v-model="catalog.catalog"
                class="flex-1 p-2 border rounded-md"
              />
              <button
                @click="removeCatalog(index)"
                class="ml-2 px-3 py-1 bg-red-500 hover:bg-red-700 text-white rounded-md"
              >
                删除
              </button>
              <button
                @click="addSubCatalog(index)"
                class="ml-2 px-3 py-1 bg-blue-500 hover:bg-blue-700 text-white rounded-md"
              >
                添加小节
              </button>
            </div>
            <div class="pl-8">
              <div
                v-for="(sub, subIndex) in catalog.sub_catalog"
                :key="subIndex"
                class="flex items-center mb-2"
              >
                <input
                  type="text"
                  v-model="catalog.sub_catalog[subIndex]"
                  class="flex-1 p-2 border rounded-md"
                />
                <button
                  @click="removeSubCatalog(index, subIndex)"
                  class="ml-2 px-3 py-1 bg-red-500 hover:bg-red-700 text-white rounded-md"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex-none mt-4">
        <div class="flex justify-between items-center">
          <div class="flex items-center">
            <Menu as="div" class="relative ml-4">
              <div>
                <MenuButton
                  class="inline-flex w-full justify-center gap-x-1.5 rounded-md px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-400 text-gray-500"
                >
                  {{
                    complexities.find((c) => c.value === selectedComplexity)
                      ?.label || '选择复杂度'
                  }}
                  <Down size="18" />
                </MenuButton>
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
                  class="absolute left-0 bottom-full w-20 z-10 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:text-gray-400 text-gray-900 overflow-y-auto"
                  :style="{ maxHeight: '60vh' }"
                >
                  <div class="py-1">
                    <MenuItem
                      v-for="(complexity, index) in complexities"
                      :key="index"
                    >
                      <div class="group" @click="selectComplexity(complexity)">
                        <a
                          href="#"
                          class="flex items-center px-4 py-2 text-sm group-hover:bg-gray-100 dark:group-hover:bg-gray-700"
                        >
                          {{ complexity.label }}
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
              class="px-4 py-2 bg-gray-500 hover:bg-gray-700 text-white rounded-md mr-4"
            >
              取消
            </button>
            <button
              @click="addCatalog"
              class="px-4 py-2 bg-primary-500 hover:bg-primary-700 text-white rounded-md mr-4"
            >
              插入章节
            </button>
            <button
              @click="submitEdit"
              class="px-4 py-2 bg-primary-500 hover:bg-primary-700 text-white rounded-md"
            >
              生成PPT
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="isPreviewVisible"
    class="fixed inset-0 z-50 flex flex-col bg-black bg-opacity-50"
  >
    <div class="flex flex-1 h-full">
      <div class="w-1/5 bg-white p-4 overflow-y-auto">
        <div
          v-for="(image, index) in customImageUrls"
          :key="index"
          class="mb-4 cursor-pointer"
          @click="selectImage(index)"
        >
          <img
            :src="image.url"
            class="w-full h-auto border-2"
            :class="{ 'border-primary-500': currentImageIndex === index }"
          />
        </div>
      </div>
      <div class="flex-1 flex items-center justify-center bg-gray-200 h-full">
        <img
          :src="customImageUrls[currentImageIndex].url"
          class="max-h-full max-w-full px-6"
        />
      </div>
    </div>
    <div class="absolute top-4 right-4 h-10">
      <button
        @click="closePreviewDialog"
        class="px-4 py-1 mr-4 h-8 rounded-md border border-1 border-primary-500 text-primary-500"
      >
        关闭
      </button>
      <button
        @click="downloadPPT"
        class="px-4 py-1 mr-2 bg-primary-500 h-8 border-1 border-primary-500 text-white rounded-md"
      >
        下载PPT
      </button>
    </div>
  </div>

  <div class="flex flex-col group max-w-full">
    <div ref="textRef" class="leading-relaxed break-words">
      <div class="flex flex-col items-start bg-primary-gradient rounded-lg">
        <div class="w-full">
          <span v-if="status === 2 && !text" class="loading-anchor"></span>
          <div class="flex flex-col items-start">
            <div class="w-full">
              <div
                :class="[
                  'w-full markdown-body text-gray-800 dark:text-gray-400 ',
                  {
                    'markdown-body-generate':
                      status === 1 || status === 2 || !text,
                  },
                ]"
                v-html="text"
              ></div>
            </div>
          </div>
          <!-- <div v-else class="w-full whitespace-pre-wrap" v-text="text" /> -->
        </div>
        <!-- PPT封面展示区域 -->
        <div class="flex flex-wrap mt-4">
          <div
            v-for="(cover, index) in PPTCover"
            :key="index"
            class="p-2 w-1/2 sm:w-1/2 md:w-1/3"
          >
            <img
              :src="cover.cover_image"
              :alt="'封面' + (index + 1)"
              :class="{
                'w-full h-auto object-cover cursor-pointer border-4 rounded-lg': true,
                'border-primary-500': selectedCover === cover.cover_id,
                'hover:border-primary-500': selectedCover !== cover.cover_id,
              }"
              @click="handleCoverClick(cover)"
            />
          </div>
        </div>
        <!-- 按钮和图标区域 -->
        <div class="mb-1 mt-2 flex items-center justify-between w-full">
          <div class="flex items-center">
            <LoadingFour
              size="24"
              v-if="loading"
              class="rotate-icon text-primary-500 ml-3"
            />
            <button
              v-if="status === 3 && text.length > 20 && !loading"
              @click="handelGeneratePPTCover"
              class="ml-2 rounded-md py-2 px-3 text-primary-500"
            >
              <div>换一组</div>
            </button>
          </div>
          <div class="flex items-center">
            <button
              v-if="status === 3 && text.length > 20"
              @click="showEditDialog"
              :class="{
                'shadow rounded-md py-2 px-5 mr-2': true,
                'bg-primary-500 text-white cursor-pointer': selectedCover,
                'bg-gray-300 text-gray-500 cursor-not-allowed': !selectedCover,
              }"
              :disabled="!selectedCover"
            >
              使用
            </button>
            <img
              v-if="status === 3 && fileInfo"
              :src="customImageUrls[0].url"
              class="rounded-md shadow"
              :style="{ maxWidth: '100%', maxHeight: '30vh' }"
              @click="showPreviewDialog"
            />
            <!-- <button
              v-if="status === 3 && fileInfo"
              @click="showPreviewDialog"
              class="shadow rounded-md py-2 px-5 text-sm bg-primary-500 text-white"
            >
              在线预览
            </button> -->
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex opacity-0 transition-opacity duration-300 group-hover:opacity-100 text-gray-700"
    >
      <div>
        <div class="mt-1 flex">
          <Button
            class="flex items-center text-gray-400 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400 mr-3"
            text
            type="primary"
            @click="handleCopy"
          >
            <Copy class="flex mr-1" />
            <span class="flex text-sm">{{ t('chat.copy') }}</span>
          </Button>
          <Button
            class="flex ml-0 items-center text-gray-400 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400 mr-3"
            text
            type="primary"
            @click="handleDelete"
          >
            <Delete class="mr-1" />
            <span class="flex text-sm">{{ t('chat.delete') }} </span>
          </Button>
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

@keyframes breathe {
  0%,
  100% {
    transform: scale(1); /* 原始尺寸 */
    opacity: 1; /* 完全不透明 */
  }
  50% {
    transform: scale(0.5); /* 缩小到50%的尺寸 */
    opacity: 0.5; /* 半透明 */
  }
}

.breathing-dot {
  display: inline-block;
  width: 10px; /* 圆点的基础宽度 */
  height: 10px; /* 圆点的基础高度 */
  border-radius: 50%; /* 使其成为圆形 */
  background-color: black; /* 圆点的颜色 */
  animation: breathe 2s infinite; /* 应用动画，无限循环 */
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
@keyframes rotateAnimation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
