<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, watch } from 'vue'
import { useHistoryLayer } from '@/composables/useHistoryLayer'
import { useViewport } from '@/hooks/useViewport'
import { slotByKey } from '@/packs'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import CodePanelLite from './CodePanelLite.vue'
// sheet 外壳保持同步导入：Transition 直接包裹异步组件会让首次打开丢失入场动画
import MobileContextSheet from './MobileContextSheet.vue'

const UnifiedSidePanel = defineAsyncComponent(() => import('./UnifiedSidePanel.vue'))
// 代码面板可由扩展包提供（side.panel 挂载点）；没有登记时退化为只读高亮
const codePanelContribution = slotByKey('side.panel', 'code')
const CodePanel = codePanelContribution
  ? defineAsyncComponent(codePanelContribution.component)
  : CodePanelLite

/**
 * 盖在对话区上的面板：手机上活动、文件、代码都用底部面板（打开时锁住页面滚动）；
 * 桌面上代码面板铺满对话区当工作台。桌面的活动、文件面板在右侧，见 SidePanelDock。
 */
const globalStore = useGlobalStoreWithOut()
const { isMobile } = useViewport()
const panel = computed(() => globalStore.rightPreviewPanel)
const isSheetVisible = computed(() => {
  const type = panel.value?.type
  return isMobile.value && (type === 'activity' || type === 'file' || type === 'code')
})
const codeWorkspace = computed(() =>
  !isMobile.value && panel.value?.type === 'code' ? panel.value : null
)

let scrollLocked = false
function setPageScrollLocked(locked: boolean) {
  if (locked === scrollLocked) return
  document.documentElement.classList.toggle('overflow-hidden', locked)
  document.body.classList.toggle('overflow-hidden', locked)
  scrollLocked = locked
}
watch(isSheetVisible, setPageScrollLocked, { immediate: true })
onBeforeUnmount(() => setPageScrollLocked(false))

function close() {
  globalStore.closePanel()
}

// 返回键只关掉面板，不离开当前会话
useHistoryLayer(() => isSheetVisible.value || Boolean(codeWorkspace.value), close)
</script>

<template>
  <Transition name="mobile-context-sheet">
    <MobileContextSheet v-if="isSheetVisible" @close="close">
      <!-- 面板在抓手下面占剩下的高度：内容长时在自己里面滚动，底部不被裁掉 -->
      <UnifiedSidePanel class="ds-workspace-surface min-h-0 w-full flex-1" presentation="sheet" />
    </MobileContextSheet>
  </Transition>

  <Transition name="code-workspace-overlay">
    <div
      v-if="codeWorkspace"
      class="ds-workspace-surface absolute inset-0 z-workspace h-full w-full min-w-0 overflow-hidden"
    >
      <CodePanel
        class="h-full w-full min-w-0"
        variant="workspace"
        :content="codeWorkspace.content"
        :content-type="codeWorkspace.contentType"
        :title="codeWorkspace.title"
        :close="close"
      />
    </div>
  </Transition>
</template>
