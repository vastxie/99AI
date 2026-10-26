<template>
  <transition name="modal-fade">
    <div v-if="visible" class="modal-confirm-layer fixed inset-0 z-confirm">
      <!-- 遮罩层 -->
      <div
        class="modal-backdrop modal-backdrop-soft absolute inset-0"
        aria-hidden="true"
        @click="handleCancel"
      ></div>

      <!-- 对话框 -->
      <div class="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 px-4">
        <div
          :ref="setDialogRef"
          class="dialog-surface mx-auto w-[min(400px,100%)] overflow-hidden"
          v-bind="dialogAttrs"
          :aria-labelledby="titleId"
          :aria-describedby="contentId"
          @click.stop
        >
          <!-- 标题 -->
          <div class="p-4 border-b border-app-divider">
            <h3 :id="titleId" class="type-dialog-title">
              {{ options.title }}
            </h3>
          </div>

          <!-- 内容 -->
          <div :id="contentId" class="type-control p-4 text-text-secondary">
            {{ options.content }}
          </div>

          <!-- 按钮 -->
          <div class="flex justify-end gap-2 px-4 py-3">
            <UiButton
              variant="secondary"
              type="button"
              :disabled="confirming"
              @click="handleCancel"
            >
              {{ options.negativeText }}
            </UiButton>
            <UiButton
              ref="confirmButton"
              :variant="options.tone === 'danger' ? 'danger' : 'primary'"
              type="button"
              :disabled="confirming"
              :aria-busy="confirming || undefined"
              @click="handleConfirm"
            >
              {{ options.positiveText }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'

import type { DialogOptions } from '@/utils/dialog'
import { nextTick, ref } from 'vue'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { t } from '@/locales'

const visible = ref(false)
const resolvePromise: any = ref(null)
const titleId = 'confirm-dialog-title'
const contentId = 'confirm-dialog-content'
/** 每次打开都从默认值重建：上一次的按钮文案与确认回调不能带进下一次弹窗 */
function defaultOptions(): DialogOptions {
  return {
    title: '',
    content: '',
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
  }
}

const options = ref<DialogOptions>(defaultOptions())
/** 确认回调执行中：两个按钮都不可用，Esc 与点遮罩也不关闭（请求已经发出，取消不了） */
const confirming = ref(false)
/** 每次打开递增；确认回调返回时核对还是不是同一次打开，旧的回调不能关掉或确认新的弹窗 */
let openCount = 0

const showDialog = (dialogOptions: DialogOptions) => {
  // 上一个弹窗还没有结果就被新的替换：还没确认的按取消结束，等它的调用方不会一直挂着；
  // 确认回调已在执行的留给回调返回时按实际结果结束（动作可能已经完成）
  if (!confirming.value) resolvePromise.value?.(false)
  openCount += 1
  options.value = { ...defaultOptions(), ...dialogOptions }
  confirming.value = false
  visible.value = true
  return new Promise(resolve => {
    resolvePromise.value = resolve
  })
}

const confirmButton = ref<InstanceType<typeof UiButton>>()

const handleConfirm = async () => {
  // 关闭动画期间按钮还在，再点不能把动作重复执行一次
  if (confirming.value || !visible.value) return
  const opening = openCount
  const settle = resolvePromise.value
  confirming.value = true
  let done = false
  try {
    await options.value.onPositiveClick?.()
    done = true
  } catch {
    // 回调失败：调用方收到 false，弹窗留着，可以重试或取消
  }
  settle(done)
  // 弹窗已经被新的顶替时不再动它
  if (opening !== openCount) return
  confirming.value = false
  if (done) {
    visible.value = false
    return
  }
  // 执行期间按钮不可用，浏览器会把焦点丢到 body 上：还给确认按钮，键盘可以直接重试
  await nextTick()
  const button = confirmButton.value?.$el as HTMLElement | undefined
  if (opening === openCount && document.activeElement === document.body) button?.focus()
}

const handleCancel = () => {
  if (confirming.value) return
  visible.value = false
  resolvePromise.value(false)
}

// Esc 关闭与遮罩点击同走取消路径；焦点陷阱 + 关闭后焦点返回由 composable 承载
const { setDialogRef, dialogAttrs } = useDialogA11y(visible, { onClose: handleCancel })

defineExpose({
  showDialog,
})
</script>
