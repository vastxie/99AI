<script setup lang="ts">
import { useDialogA11y } from '@/composables/useDialogA11y'

// Keep complete class names visible to Tailwind's source scanner.
const layerClasses = {
  dialog: 'z-dialog',
  'dialog-elevated': 'z-dialog-elevated',
  notification: 'z-notification',
  critical: 'z-critical',
} as const

/**
 * 居中弹窗外壳：modal-fade 过渡 + 遮罩 + dialog-surface 面板，并接入 useDialogA11y
 * （Esc、焦点陷阱、关闭后焦点返回）。
 *
 * 未声明为 prop 的属性（class、id、aria-labelledby 等）落在面板上而不是遮罩上。
 * Esc 与遮罩点击只发 close 事件，真正的关闭仍由调用方把 open 置为 false。
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 层级档位，对应 styles/z-index.css */
    layer?: keyof typeof layerClasses
    /** 面板元素的标签名 */
    as?: string
    /** 点击遮罩空白处是否请求关闭 */
    closeOnBackdrop?: boolean
    /** Esc 是否请求关闭；强制阅读类弹窗传 false */
    closeOnEsc?: boolean
    /** 打开时优先聚焦的元素 */
    initialFocus?: () => HTMLElement | null | undefined
    /** 追加到遮罩层的 class */
    overlayClass?: string
  }>(),
  { layer: 'dialog', as: 'div', closeOnBackdrop: true, closeOnEsc: true }
)

const emit = defineEmits<{
  close: []
}>()

const { setDialogRef, dialogAttrs } = useDialogA11y(() => props.open, {
  onClose: () => emit('close'),
  initialFocus: () => props.initialFocus?.(),
  // useDialogA11y 在每次打开时读取，用 getter 让它跟随 prop
  get closeOnEsc() {
    return props.closeOnEsc
  },
})

function handleBackdropClick() {
  if (props.closeOnBackdrop) emit('close')
}
</script>

<template>
  <!-- appear：第一次挂载时就是打开的（按需挂载的弹窗）也有入场动效 -->
  <Transition name="modal-fade" appear>
    <div
      v-if="open"
      class="fixed inset-0 flex items-center justify-center modal-backdrop"
      :class="[layerClasses[layer], overlayClass]"
      @click.self="handleBackdropClick"
    >
      <component
        :is="as"
        :ref="setDialogRef"
        class="dialog-surface"
        v-bind="{ ...$attrs, ...dialogAttrs }"
      >
        <slot />
      </component>
    </div>
  </Transition>
</template>
