import { onUnmounted, ref } from 'vue'
import { t } from '@/locales'
import { copyText } from '@/utils/clipboard'
import { message } from '@/utils/message'

const COPIED_FEEDBACK_MS = 3000

/**
 * 复制按钮的反馈：复制成功后 copied 保持 3 秒（交给 CopyFeedbackIcon 显示对勾），失败提示一次。
 * 消息、代码块、代码面板共用，反馈时长一致。
 */
export function useCopyFeedback() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  async function copy(text: string) {
    if (!(await copyText(text))) {
      message().error(t('chat.copyFailed'))
      return false
    }
    copied.value = true
    clearTimer()
    timer = setTimeout(() => {
      copied.value = false
      timer = null
    }, COPIED_FEEDBACK_MS)
    return true
  }

  onUnmounted(clearTimer)
  return { copied, copy }
}
