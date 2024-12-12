<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
  >
    <Close
      size="18"
      class="absolute top-3 right-3 cursor-pointer z-30"
      @click="closeModal"
    />

    <div
      class="bg-white dark:bg-gray-900 w-full h-full p-4"
      :class="[isMobile ? 'flex-col' : 'flex']"
    >
      <div v-if="isMobile" class="p-2 w-full h-1/2">
        <iframe
          :srcDoc="localEditableText"
          class="box-border w-full h-full border rounded-md"
        ></iframe>
      </div>
      <div
        class="p-2 flex flex-col"
        :class="[isMobile ? 'w-full h-1/2' : 'w-1/4']"
      >
        <textarea
          v-model="localEditableText"
          class="w-full h-full p-2 border rounded-md resize-none text-base dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
        ></textarea>
        <div class="mt-2 flex justify-end">
          <button
            @click="closeModal"
            class="px-4 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
          >
            取消
          </button>
          <button
            @click="handleCopy"
            class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white dark rounded-md"
          >
            复制
          </button>
        </div>
      </div>
      <div v-if="!isMobile" class="w-3/4 p-2">
        <iframe
          :srcDoc="localEditableText"
          class="box-border w-full h-full border rounded-md"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { Close } from '@icon-park/vue-next';
import { ref, watch, watchEffect } from 'vue';

interface Props {
  text: string;
  close: () => void;
}

const props = defineProps<Props>();
const htmlPreviewRef = ref<HTMLIFrameElement | null>(null);
const localEditableText = ref(props.text);
const { isMobile } = useBasicLayout();

watch(localEditableText, () => {
  updatePreview();
});

watchEffect(() => {
  localEditableText.value = props.text;
});

const updatePreview = () => {
  if (htmlPreviewRef.value) {
    const iframeDocument = htmlPreviewRef.value.contentDocument;
    if (iframeDocument) {
      iframeDocument.body.innerHTML = localEditableText.value;
    }
  }
};

const closeModal = () => {
  props.close();
};

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(localEditableText.value);
    window.$message?.success('内容已复制到剪贴板');
  } catch (err) {
    window.$message?.error('复制失败');
  }
};
</script>

<style lang="less" scoped>
/* Add your custom styles here */
</style>
