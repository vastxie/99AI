import { useEventListener } from '@vueuse/core'
import { hasOpenDialog } from '@/composables/useDialogA11y'
import { useGlobalStoreWithOut } from '@/store/modules/global'

/**
 * 新对话的 O：键盘打出的是拉丁字母时按字母认（Dvorak、Colemak 下 O 不在 QWERTY 的位置上，
 * 那个键位打出的 R / Y 是别的快捷键）；非拉丁布局（西里尔、希腊等）打不出拉丁字母，按键位认
 */
function isLetterO(event: KeyboardEvent) {
  return /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() === 'o' : event.code === 'KeyO'
}

/**
 * 对话页的全局快捷键：Shift+Esc 聚焦输入框，Ctrl / ⌘ + Shift + O 开始新对话。
 * 输入法组词中的按键不处理；弹窗、代码工作台开着时也不处理：焦点不该跑到被盖住的输入框，
 * 工作台里没保存的修改也不能随新对话丢掉。
 */
export function useChatShortcuts(actions: {
  focusComposer: () => boolean
  startNewConversation: () => void
}) {
  const globalStore = useGlobalStoreWithOut()
  const isCovered = () => hasOpenDialog() || globalStore.rightPreviewPanel?.type === 'code'

  useEventListener(document, 'keydown', (event: KeyboardEvent) => {
    if (event.isComposing || isCovered()) return
    if (event.key === 'Escape' && event.shiftKey) {
      if (actions.focusComposer()) event.preventDefault()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && isLetterO(event)) {
      event.preventDefault()
      actions.startNewConversation()
    }
  })
}
