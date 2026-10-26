<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useViewport } from '@/hooks/useViewport'
import { useGlobalStoreWithOut } from '@/store/modules/global'

const UnifiedSidePanel = defineAsyncComponent(() => import('./UnifiedSidePanel.vue'))

/** 桌面右侧的活动 / 文件面板：跟着面板状态滑入滑出（手机上改用底部面板，见 PanelOverlays） */
const globalStore = useGlobalStoreWithOut()
const { isMobile } = useViewport()
const isVisible = computed(() => {
  const type = globalStore.rightPreviewPanel?.type
  return !isMobile.value && (type === 'activity' || type === 'file')
})
</script>

<template>
  <Transition name="right-panel-shell">
    <div
      v-if="isVisible"
      class="right-panel-shell-frame ds-workspace-surface h-full flex-shrink-0 overflow-hidden"
      :style="{ width: 'min(34rem, 38vw)' }"
    >
      <UnifiedSidePanel
        class="right-panel-content ds-workspace-surface h-full w-full"
        presentation="side"
      />
    </div>
  </Transition>
</template>
