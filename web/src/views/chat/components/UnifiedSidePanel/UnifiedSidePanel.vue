<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useGlobalStore } from '@/store/modules/global'
import type { PreviewPanelState } from '@/types/preview-panel'
import { slotByKey } from '@/packs'
import CodePanelLite from './CodePanelLite.vue'
import FilePreviewLite from './FilePreviewLite.vue'

// 代码 / 文件面板可由扩展包提供（side.panel 挂载点）；没有登记时退化为只读高亮与下载入口
const codePanelContribution = slotByKey('side.panel', 'code')
const CodePanel = codePanelContribution
  ? defineAsyncComponent(codePanelContribution.component)
  : CodePanelLite
const ActivityPanel = defineAsyncComponent(() => import('./ActivityPanel.vue'))
const filePanelContribution = slotByKey('side.panel', 'file')
const FilePreviewPanel = filePanelContribution
  ? defineAsyncComponent(filePanelContribution.component)
  : FilePreviewLite

const props = withDefaults(
  defineProps<{
    presentation?: 'side' | 'sheet'
    inputDisabled?: boolean
  }>(),
  {
    presentation: 'side',
    inputDisabled: false,
  }
)

const globalStore = useGlobalStore()

const panel = computed<PreviewPanelState>(() => globalStore.rightPreviewPanel)

const isOpen = computed(() => panel.value !== null)

function handleClose() {
  globalStore.closePanel()
}
</script>

<template>
  <div v-if="isOpen" class="ds-workspace-surface h-full flex flex-col bg-panel text-text-primary">
    <!-- Code panel -->
    <CodePanel
      v-if="panel?.type === 'code'"
      :content="panel.content"
      :content-type="panel.contentType"
      :title="panel.title"
      :close="handleClose"
      :lock-body-scroll="props.presentation !== 'sheet'"
      :manage-sidebar="props.presentation !== 'sheet'"
    />

    <!-- Activity panel -->
    <ActivityPanel
      v-else-if="panel?.type === 'activity'"
      :activity="panel.activity"
      :close="handleClose"
      :presentation="props.presentation"
    />

    <!-- File preview panel -->
    <FilePreviewPanel
      v-else-if="panel?.type === 'file'"
      :file="panel.file"
      :close="handleClose"
      :quote-disabled="props.inputDisabled"
    />
  </div>
</template>
