import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { getFileLimitMessage, getSelectedFilesLimitMessage } from './footer.helpers'

/**
 * 往输入框加文件的三条路：选择、粘贴、拖放。能否添加（disabled，与上传按钮同一条件）与数量上限统一在这里检查
 * （超出时只收前面能放下的），单个文件的类型与大小由 add 负责。拖着文件经过页面时输入框换成放置提示。
 */
export function useComposerFiles(options: {
  fileInput: Ref<HTMLInputElement | null>
  count: () => number
  limit: () => number
  add: (file: File) => void
  /** 现在不能添加附件（生成中、正在发送）：三条路都只提示，不上传 */
  disabled?: () => boolean
}) {
  const ms = message()
  /** 文件拖到了输入框上 */
  const isDragging = ref(false)
  /** 文件拖进了页面（还没到输入框） */
  const isDraggingOverPage = ref(false)

  function addFiles(files: File[], overLimitMessage = getSelectedFilesLimitMessage) {
    if (files.length === 0) return
    // 文件选择框可能在生成开始前打开、之后才选好：选好时再判断一次
    if (options.disabled?.()) {
      ms.warning(t('chat.attachmentsUnavailableWhileRunning'))
      return
    }
    const count = options.count()
    const limit = options.limit()
    if (count >= limit) {
      ms.warning(getFileLimitMessage(count, limit))
      return
    }
    const remaining = limit - count
    if (files.length > remaining) ms.warning(overLimitMessage(files.length, remaining))
    files.slice(0, remaining).forEach(options.add)
  }

  function pick() {
    if (options.disabled?.()) {
      ms.warning(t('chat.attachmentsUnavailableWhileRunning'))
      return
    }
    const count = options.count()
    if (count >= options.limit()) {
      ms.warning(getFileLimitMessage(count, options.limit(), true))
      return
    }
    const input = options.fileInput.value
    if (!input) return
    input.value = ''
    input.click()
  }

  function onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    addFiles(Array.from(input.files || []))
    input.value = ''
  }

  function onPaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.items || [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    addFiles(files, (selected, remaining) => t('chat.pastedFilesLimit', { selected, remaining }))
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    isDragging.value = true
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    isDragging.value = false
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    isDragging.value = false
    isDraggingOverPage.value = false
    addFiles(Array.from(event.dataTransfer?.files || []))
  }

  function onPageDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer?.types.includes('Files')) isDraggingOverPage.value = true
  }

  /** 只有拖出窗口时才算离开页面 */
  function onPageDragLeave(event: DragEvent) {
    const { clientX, clientY } = event
    if (clientX <= 0 || clientY <= 0 || clientX >= innerWidth || clientY >= innerHeight) {
      isDraggingOverPage.value = false
    }
  }

  /** 没放到输入框上的文件不让浏览器直接打开 */
  function onPageDrop(event: DragEvent) {
    isDraggingOverPage.value = false
    if (!isDragging.value) event.preventDefault()
  }

  onMounted(() => {
    document.addEventListener('dragover', onPageDragOver)
    document.addEventListener('dragleave', onPageDragLeave)
    document.addEventListener('drop', onPageDrop)
  })
  onUnmounted(() => {
    document.removeEventListener('dragover', onPageDragOver)
    document.removeEventListener('dragleave', onPageDragLeave)
    document.removeEventListener('drop', onPageDrop)
  })

  return {
    isDragging,
    isDraggingOverPage,
    pick,
    onFileSelect,
    onPaste,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}
