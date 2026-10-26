<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, ref } from 'vue'
import { t } from '@/locales'
import MediaOutput from './MediaOutput.vue'
import type { PresentedFileItem } from './replyPresentation'

/**
 * agent 选了成果文件时回答后面的文件区：成果按清单顺序（带说明），其余产物收进可展开的「过程文件」。
 */
const props = defineProps<{
  presented: PresentedFileItem[]
  processOutputs: any[]
}>()

const processExpanded = ref(false)
const processFileCount = computed(() =>
  props.processOutputs.reduce(
    (count, output) =>
      count +
      (Array.isArray(output?.files) ? output.files.length : 0) +
      (Array.isArray(output?.filePreview)
        ? output.filePreview.length
        : output?.filePreview
          ? 1
          : 0),
    0
  )
)
</script>

<template>
  <div
    v-if="presented.length > 0 || processFileCount > 0"
    class="assistant-content-width flex flex-col gap-2"
  >
    <div v-for="item in presented" :key="item.key" class="flex max-w-full flex-col gap-1">
      <MediaOutput :output="item.output" file-mode="inline" />
      <p
        v-if="item.caption"
        class="type-caption m-0 break-words text-text-secondary [overflow-wrap:anywhere]"
      >
        {{ item.caption }}
      </p>
    </div>

    <div v-if="processFileCount > 0" class="flex max-w-full flex-col gap-1">
      <button
        type="button"
        class="reply-files-toggle type-control inline-flex h-7 max-w-full items-center gap-1 self-start fg-quiet ds-focus-ring"
        :aria-expanded="processExpanded"
        @click="processExpanded = !processExpanded"
      >
        <ChevronRight
          :size="14"
          class="reply-files-chevron shrink-0"
          :class="{ 'reply-files-chevron-open': processExpanded }"
          aria-hidden="true"
        />
        <span class="truncate">{{ t('chat.processFiles', { count: processFileCount }) }}</span>
      </button>
      <div v-if="processExpanded" class="flex max-w-full flex-col gap-1">
        <MediaOutput
          v-for="(output, index) in processOutputs"
          :key="`process-file-${index}`"
          :output="output"
          file-mode="inline"
          inline-size="sm"
          inline-tone="muted"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.reply-files-toggle {
  border-radius: var(--radius-control-sm);
}
.reply-files-chevron {
  transition: transform var(--motion-duration-sm) var(--motion-easing);
}
.reply-files-chevron-open {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .reply-files-chevron {
    transition: none;
  }
}
</style>
