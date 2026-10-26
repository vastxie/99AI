<script setup lang="ts">
import { X } from '@lucide/vue'
import { ref, useId, watch } from 'vue'
import SafeMarkdownPreview from '@/components/common/SafeMarkdownPreview.vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiDialog from '@/components/common/UiDialog.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'

/**
 * 后台配置类 Markdown 文档弹窗（平台公告 / 用户协议共用）：
 * 标题 + 只读 Markdown 正文（SafeMarkdownPreview）+ 确认按钮，可选「7 天不再提醒」复选框。
 * 缓存、刷新配置等副作用由调用方在 close 事件里处理，组件本身不碰存储与 store。
 */
const props = withDefaults(
  defineProps<{
    visible: boolean
    title: string
    content: string
    confirmText: string
    /** 显示「7 天不再提醒」复选框；勾选状态随 close 事件返回 */
    showDoNotRemind?: boolean
  }>(),
  { showDoNotRemind: false }
)

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  close: [payload: { doNotRemind: boolean }]
}>()

const { isMobile } = useViewport()
const titleId = useId()
const doNotRemind = ref(false)

// Esc、遮罩点击、关闭按钮与确认按钮同走 handleClose
function handleClose() {
  emit('close', { doNotRemind: props.showDoNotRemind && doNotRemind.value })
  emit('update:visible', false)
}

// 每次打开重置复选框
watch(
  () => props.visible,
  visible => {
    if (visible) doNotRemind.value = false
  }
)
</script>

<template>
  <UiDialog
    :open="visible"
    layer="notification"
    class="relative flex flex-col overflow-hidden"
    :class="isMobile ? 'dialog-shell-fullscreen' : 'dialog-shell-wide'"
    :aria-labelledby="titleId"
    @close="handleClose"
  >
    <!-- 标题栏 -->
    <header
      class="flex shrink-0 items-center justify-between gap-4 border-b border-app-divider px-5 pb-4 pt-[max(1rem,var(--safe-top))] md:px-6"
    >
      <h3 :id="titleId" class="type-dialog-title min-w-0 break-words">{{ title }}</h3>
      <UiTooltip class="shrink-0" :text="t('common.close')" placement="bottom">
        <UiButton icon :aria-label="t('common.close')" @click="handleClose">
          <X :size="20" />
        </UiButton>
      </UiTooltip>
    </header>

    <!-- 正文独立滚动，标题和底部操作始终可见 -->
    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
      <SafeMarkdownPreview :content="content" class="settings-markdown-preview w-full" />
    </div>

    <footer
      class="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-app-divider px-5 pb-[max(1rem,var(--safe-bottom))] pt-4 md:px-6"
    >
      <label v-if="showDoNotRemind" class="flex min-h-9 cursor-pointer items-center gap-2">
        <input
          v-model="doNotRemind"
          type="checkbox"
          class="h-4 w-4 shrink-0 rounded border-app-border bg-app-surface text-text-link hover:border-app-border-strong focus:ring-0 focus:ring-offset-0"
        />
        <span class="type-control text-text-muted">
          {{ t('common.doNotRemind7d') }}
        </span>
      </label>

      <UiButton variant="primary" class="ml-auto shrink-0" @click="handleClose">
        {{ confirmText }}
      </UiButton>
    </footer>
  </UiDialog>
</template>
