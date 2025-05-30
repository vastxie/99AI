<script setup lang="ts">
import { Close } from '@icon-park/vue-next'
import { ref, watch } from 'vue'

interface FileItem {
  name: string
  url: string
  type?: string
}

interface Props {
  dataBase64List: string[] // 上传文件的base64预览列表
  fileList: File[] // 上传的文件列表
  savedFiles: FileItem[] // 已保存的文件列表
  isSelectedApp: boolean // 是否选中了应用
  selectedApp: any // 选中的应用
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'clearData', index: number, isSavedFile: boolean): void
  (e: 'clearSelectApp'): void
}>()

// 记录正在转换的文件索引（PDF、Excel、Word或PPTX）
const convertingFileIndex = ref<number | null>(null)
// 记录已处理过的文件数量，用于检测新文件
const processedFileCount = ref(0)

const handleClearData = (index: number, isSavedFile: boolean) => {
  emit('clearData', index, isSavedFile)
}

const handleClearSelectApp = () => {
  emit('clearSelectApp')
}

// 监听savedFiles变化，自动处理新上传的文件
watch(
  () => props.savedFiles,
  newFiles => {
    processedFileCount.value = newFiles.length
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <div
    v-if="dataBase64List.length > 0 || savedFiles.length > 0 || isSelectedApp"
    class="self-start w-full select-none"
  >
    <!-- 上传的文件和图片显示区域 -->
    <div class="self-start w-full rounded-t-2xl mt-2">
      <!-- 选中的应用 -->
      <div v-if="isSelectedApp" class="relative w-full mb-2">
        <div
          v-if="isSelectedApp"
          class="flex px-2 bg-opacity dark:bg-gray-750 rounded-b-md rounded-t-2xl items-center justify-start h-12 text-gray-700 dark:text-gray-400 shadow-sm"
        >
          <div
            class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
          >
            <img
              v-if="selectedApp.coverImg"
              :src="selectedApp.coverImg"
              alt="Cover Image"
              class="w-8 h-8 rounded-full flex justify-start"
            />
            <span
              v-else
              class="w-8 h-8 text-base font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
            >
              {{ selectedApp.name.charAt(0) }}
            </span>
          </div>

          <h3
            class="text-md font-bold text-gray-600 dark:text-gray-400 mr-3 flex-shrink-0 flex justify-start"
          >
            {{ selectedApp.name }}
          </h3>
          <p class="text-base text-gray-400 dark:text-gray-400 truncate pr-10">
            {{ selectedApp.des }}
          </p>

          <div
            class="absolute top-1/2 right-4 transform -translate-y-1/2 cursor-pointer text-gray-300 hover:text-gray-500"
            @click="handleClearSelectApp()"
          >
            <Close size="18" class="rounded-full" />
          </div>
        </div>
      </div>

      <div class="flex flex-wrap px-2">
        <!-- 已保存的文件显示 -->
        <template v-if="savedFiles.length > 0">
          <!-- 先显示图片 -->
          <div
            class="relative inline-block mr-2 mb-2"
            v-for="(file, index) in savedFiles.filter((f: FileItem) => f.type === 'image')"
            :key="'saved-img-' + index"
          >
            <img
              :src="file.url"
              class="max-h-16 border border-gray-100 shadow-sm dark:border-gray-700 rounded-md"
              alt="预览图片"
            />
            <div
              class="absolute top-1 right-1 cursor-pointer bg-white dark:bg-gray-700 rounded-full p-1 shadow-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="handleClearData(savedFiles.indexOf(file), true)"
            >
              <Close class="w-3 h-3" />
            </div>
          </div>

          <!-- 再显示文件 -->
          <div
            class="relative inline-block mr-2 mb-2"
            v-for="(file, index) in savedFiles.filter((f: FileItem) => f.type === 'document')"
            :key="'saved-file-' + index"
          >
            <div
              class="px-3 flex items-center justify-start rounded-xl h-10 text-gray-700 dark:text-gray-400 border border-gray-100 shadow-sm dark:border-gray-700 transition-colors relative"
            >
              <!-- 统一加载指示器 - 处理文件转换加载状态 -->
              <div
                v-if="convertingFileIndex === savedFiles.indexOf(file)"
                class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 dark:bg-gray-800 dark:bg-opacity-80 rounded-xl z-10"
              >
                <div class="loading-animation">
                  <span></span>
                </div>
              </div>

              <span class="text-gray-500 max-w-48 truncate mr-4">{{ file.name }}</span>
            </div>
            <!-- 删除按钮 -->
            <div
              v-if="convertingFileIndex !== savedFiles.indexOf(file)"
              class="absolute top-1 right-1 cursor-pointer bg-opacity dark:bg-gray-750 rounded-full p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="handleClearData(savedFiles.indexOf(file), true)"
            >
              <Close class="w-3 h-3" />
            </div>
          </div>
        </template>

        <!-- 只显示图片预览，不显示文件预览（因为文件已立即上传） -->
        <template
          v-if="dataBase64List.length > 0"
          v-for="(base64, index) in dataBase64List"
          :key="'item-' + index"
        >
          <div
            v-if="fileList[index]?.type.startsWith('image/')"
            class="relative inline-block mr-2 mb-2"
          >
            <img
              :src="base64"
              class="max-h-16 border border-gray-100 shadow-sm dark:border-gray-700 rounded-xl"
              alt="预览图片"
            />
            <div
              class="absolute top-1 right-1 cursor-pointer bg-white dark:bg-gray-700 rounded-full p-1 shadow-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="handleClearData(index, false)"
            >
              <Close class="w-3 h-3" />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
