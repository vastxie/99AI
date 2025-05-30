<script lang="ts" setup>
import { fetchTtsAPIProcess } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import {
  ArrowRight,
  Close,
  Copy,
  Delete,
  Down,
  Edit,
  LoadingOne,
  PauseOne,
  Refresh,
  Rotation,
  Send,
  Sound,
  Sphere,
  TwoEllipses,
  Up,
  VoiceMessage,
} from '@icon-park/vue-next'
import mdKatex from '@traptitech/markdown-it-katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css' // 更现代的深色主题
import 'highlight.js/styles/atom-one-light.css' // 更现代的浅色主题
import MarkdownIt from 'markdown-it'
import mila from 'markdown-it-link-attributes'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

// 注册mermaid语言到highlight.js
hljs.registerLanguage('mermaid', () => ({
  name: 'mermaid',
  contains: [],
  keywords: {
    keyword: 'graph flowchart sequenceDiagram classDiagram stateDiagram gitGraph pie gantt',
    built_in: 'TD TB BT RL LR',
  },
  case_insensitive: true,
}))

// 注册样式覆盖，确保主题切换时正确应用对应样式
const injectThemeStyles = () => {
  // 检查是否已存在样式元素
  const existingStyle = document.getElementById('highlight-theme-overrides')
  if (existingStyle) return

  // 创建新的样式元素
  const style = document.createElement('style')
  style.id = 'highlight-theme-overrides'
  style.textContent = `
    /* 浅色模式覆盖 */
    html:not(.dark) .hljs {
      background: transparent !important;
      color: #383a42 !important;
    }
    
    /* 深色模式覆盖 */
    html.dark .hljs {
      background: transparent !important;
      color: #abb2bf !important;
    }
    
    /* 容器背景 */
    html:not(.dark) .code-block-wrapper {
      background-color: #fafafa;
    }
    
    html.dark .code-block-wrapper {
      background-color: #2f2f2f;
    }
  `
  document.head.appendChild(style)
}

interface Props {
  chatId?: number
  index: number
  isUserMessage?: boolean
  content?: string
  modelType?: number
  status?: number
  loading?: boolean
  imageUrl?: string
  fileUrl?: string
  ttsUrl?: string
  model?: string
  promptReference?: string
  networkSearchResult?: string
  fileVectorResult?: string
  tool_calls?: string
  isLast?: boolean
  usingNetwork?: boolean
  usingDeepThinking?: boolean
  usingMcpTool?: boolean
  reasoningText?: string
  fileAnalysisProgress?: number
  useFileSearch?: boolean
}

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
  (ev: 'copy'): void
}

interface TtsResponse {
  ttsUrl: string
}

const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const onConversation = inject<any>('onConversation')
const handleRegenerate = inject<any>('handleRegenerate')
const globalStore = useGlobalStoreWithOut()

const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const showThinking = ref(true)
const showSearchResult = ref(false)
const textRef = ref<HTMLElement>()
const localTtsUrl = ref(props.ttsUrl)
const playbackState = ref('paused')
const browserTtsState = ref('paused')
const editableContent = ref(props.content)
const isEditable = ref(false)
const textarea = ref<HTMLTextAreaElement | null>(null)

let currentAudio: HTMLAudioElement | null = null
let speechSynthesisUtterance: SpeechSynthesisUtterance | null = null

const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, extraData?: any) => void>(
    'onOpenImagePreviewer'
  )

const isHideTts = computed(() => Number(authStore.globalConfig?.isHideTts) === 1)
const enableHtmlRender = computed(() => Number(authStore.globalConfig?.enableHtmlRender) !== 0)

const searchResult = computed(() => {
  if (props.networkSearchResult) {
    try {
      const parsedData = JSON.parse(props.networkSearchResult)
      return parsedData?.slice(0, 50) || parsedData?.searchResults?.slice(0, 50) || []
    } catch (e) {
      console.error('解析 networkSearchResult 时出错', e)
      return []
    }
  }
  return []
})

const buttonGroupClass = computed(() => {
  return playbackState.value !== 'paused' || isEditable.value
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100'
})

const handlePlay = async () => {
  if (playbackState.value === 'loading' || playbackState.value === 'playing') return
  if (localTtsUrl.value) {
    playAudio(localTtsUrl.value)
    return
  }

  playbackState.value = 'loading'
  try {
    if (!props.chatId || !props.content) return

    const res = (await fetchTtsAPIProcess({
      chatId: props.chatId,
      prompt: props.content,
    })) as TtsResponse

    const ttsUrl = res.ttsUrl
    if (ttsUrl) {
      localTtsUrl.value = ttsUrl
      playAudio(ttsUrl)
    } else {
      throw new Error('TTS URL is undefined')
    }
  } catch (error) {
    playbackState.value = 'paused'
  }
}

function playAudio(audioSrc: string | undefined) {
  if (currentAudio) {
    currentAudio.pause()
  }
  currentAudio = new Audio(audioSrc)
  currentAudio
    .play()
    .then(() => {
      playbackState.value = 'playing'
    })
    .catch(error => {
      playbackState.value = 'paused'
    })

  currentAudio.onended = () => {
    playbackState.value = 'paused'
    currentAudio = null
  }
}

function pauseAudio() {
  if (currentAudio) {
    currentAudio.pause()
    playbackState.value = 'paused'
  }
}

function playOrPause() {
  if (playbackState.value === 'playing') {
    pauseAudio()
  } else {
    handlePlay()
  }
}

function handleBrowserTts() {
  if (browserTtsState.value === 'playing') {
    stopBrowserTts()
  } else {
    playBrowserTts()
  }
}

function playBrowserTts() {
  if (!('speechSynthesis' in window)) {
    console.error('浏览器不支持语音合成API')
    return
  }

  stopBrowserTts()

  speechSynthesisUtterance = new SpeechSynthesisUtterance(props.content)

  speechSynthesisUtterance.lang = 'zh-CN'
  speechSynthesisUtterance.rate = 1.0
  speechSynthesisUtterance.pitch = 1.0

  speechSynthesisUtterance.onstart = () => {
    browserTtsState.value = 'playing'
  }

  speechSynthesisUtterance.onend = () => {
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }

  speechSynthesisUtterance.onerror = () => {
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }

  window.speechSynthesis.speak(speechSynthesisUtterance)
}

function stopBrowserTts() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }
}

const mdi = new MarkdownIt({
  linkify: true,
  html: enableHtmlRender.value,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }

    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

// 用于存储代码块复制按钮的定时器
const copyTimeoutsMap = new Map()

// 复制代码的处理函数
function handleCodeCopy(blockId: string, element: HTMLElement) {
  console.log('复制开始，blockId:', blockId)
  // 如果已经是"已复制"状态，则不重复处理
  const copiedText = element.querySelector('.copied-text')
  if (copiedText && getComputedStyle(copiedText).display !== 'none') return

  const codeBlock = document.getElementById(blockId)
  if (!codeBlock) {
    console.error('未找到代码块:', blockId)
    return
  }

  const codeElement = codeBlock.querySelector('code')
  if (!codeElement || !codeElement.textContent) {
    console.error('未找到代码内容')
    return
  }

  // 复制代码内容
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(codeElement.textContent)
        .then(() => {
          console.log('使用navigator.clipboard成功复制')
          // 成功复制后更新UI
          updateCopyButtonState(element, blockId)
        })
        .catch(err => {
          console.error('navigator.clipboard复制失败:', err)
          // 尝试回退方法
          fallbackCopy(codeElement.textContent, element, blockId)
        })
    } else {
      // 回退到传统方法
      fallbackCopy(codeElement.textContent, element, blockId)
    }
  } catch (error) {
    console.error('复制过程出错:', error)
    message()?.error('复制失败!')
  }
}

// 回退复制方法
function fallbackCopy(text: string | null, element: HTMLElement, blockId: string) {
  if (!text) {
    console.error('复制内容为空')
    message()?.error('复制失败!')
    return
  }

  try {
    copyText({ text: text, origin: true })
    console.log('使用fallback方法复制成功')
    updateCopyButtonState(element, blockId)
  } catch (error) {
    console.error('fallback复制失败:', error)
    message()?.error('复制失败!')
  }
}

// 更新复制按钮状态
function updateCopyButtonState(element: HTMLElement, blockId: string) {
  // 防止重复处理
  if (element.getAttribute('data-copying') === 'true') return
  element.setAttribute('data-copying', 'true')

  // 查找按钮中的图标和文本元素
  const copyIcon = element.querySelector('.copy-icon')
  const checkIcon = element.querySelector('.check-icon')
  const copyText = element.querySelector('.copy-text')
  const copiedText = element.querySelector('.copied-text')

  if (copyIcon && checkIcon && copyText && copiedText) {
    // 隐藏复制图标和文本，显示勾图标和已复制文本
    copyIcon.classList.add('hidden')
    copyText.classList.add('hidden')
    checkIcon.classList.remove('hidden')
    copiedText.classList.remove('hidden')
  }

  // 成功提示
  message()?.success('复制成功!')

  // 清除之前的定时器
  if (copyTimeoutsMap.has(blockId)) {
    clearTimeout(copyTimeoutsMap.get(blockId))
  }

  // 设置新的定时器，3秒后恢复原始状态
  const timeoutId = setTimeout(() => {
    console.log('恢复原始按钮内容')
    if (element) {
      const copyIcon = element.querySelector('.copy-icon')
      const checkIcon = element.querySelector('.check-icon')
      const copyText = element.querySelector('.copy-text')
      const copiedText = element.querySelector('.copied-text')

      if (copyIcon && checkIcon && copyText && copiedText) {
        // 恢复原状
        copyIcon.classList.remove('hidden')
        copyText.classList.remove('hidden')
        checkIcon.classList.add('hidden')
        copiedText.classList.add('hidden')
      }

      // 清除处理标记
      element.removeAttribute('data-copying')
    }
  }, 3000)

  // 存储定时器ID以便后续清理
  copyTimeoutsMap.set(blockId, timeoutId)
}

mdi.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const src = token.attrGet('src')
  const title = token.attrGet('title')
  const alt = token.content

  if (!src) return ''

  return `<img src="${src}" alt="${alt || ''}" title="${title || alt || ''}" class="rounded-md max-h-[30vh] cursor-pointer hover:opacity-90 transition-opacity" 
    onclick="(function(event) { 
      event.stopPropagation();
      const customEvent = new CustomEvent('previewMdImage', { detail: { src: '${src}' } });
      document.dispatchEvent(customEvent);
    })(event)"
  />`
}

const imageUrlArray = computed(() => {
  const val = props.imageUrl
  if (!val) return []
  // 支持 JSON 字符串格式 {"imageUrls":[...]}
  if (typeof val === 'string' && val.trim().startsWith('{') && val.includes('imageUrls')) {
    try {
      const parsed = JSON.parse(val)
      if (parsed && Array.isArray(parsed.imageUrls)) {
        return parsed.imageUrls.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }
  // 新增：支持 JSON 数组字符串格式
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(val)
      if (Array.isArray(arr)) {
        return arr.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }
  if (typeof val === 'string') {
    // 兼容逗号分隔
    return val
      .split(',')
      .map(url => url.trim())
      .filter(Boolean)
  }
  if (Array.isArray(val)) return val
  return []
})

const isImageUrl = computed(() => {
  if (!props.imageUrl) return false

  // 如果已经成功提取了URLs，则认为是图片
  if (imageUrlArray.value.length > 0) {
    return true
  }

  // 如果没有提取出来，检查原始值
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(props.imageUrl)
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, {
  blockClass: 'katexmath-block p-0 flex h-full items-center justify-start',
  inlineClass: 'katexmath-inline',
  errorColor: ' #cc0000',
})

const text = computed(() => {
  let value = props.content || ''

  let modifiedValue = value
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$')
    .replace(/\\\[\s*/g, '$$')
    .replace(/\s*\\\]/g, '$$')
    .replace(
      /\[\[(\d+)\]\((https?:\/\/[^\)]+)\)\]/g,
      '<button class="bg-gray-500 text-white rounded-full w-4 h-4 mx-1 flex justify-center items-center text-sm hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 inline-flex" onclick="window.open(\'$2\', \'_blank\')">$1</button>'
    )

  if (!props.isUserMessage) {
    return mdi.render(modifiedValue)
  }

  return modifiedValue
})

const reasoningText = computed<string>(() => {
  let value = props.reasoningText || ''

  let modifiedValue = value
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$')
    .replace(/\\\[\s*/g, '$$')
    .replace(/\s*\\\]/g, '$$')
    .replace(
      /\[\[(\d+)\]\((https?:\/\/[^\)]+)\)\]/g,
      '<button class="bg-gray-500 text-white rounded-full w-4 h-4 mx-1 flex justify-center items-center text-sm hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 inline-flex" onclick="window.open(\'$2\', \'_blank\')">$1</button>'
    )

  if (!props.isUserMessage) {
    return mdi.render(modifiedValue)
  }

  return modifiedValue
})

function highlightBlock(str: string, lang?: string) {
  const blockId = `code-block-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  // 直接返回带样式的HTML
  return `<pre
    class="max-w-full border border-gray-200 bg-[#AFB8C133] dark:border-gray-700 dark:bg-gray-750 transition-colors"
    id="${blockId}"
    style="line-height: normal; margin: 0 !important; padding: 0 !important; border-radius: 0.75rem !important; width: 100% !important; overflow: hidden !important;"
  ><div class="code-block-header sticky w-full h-10 flex justify-between items-center px-3 border-b border-gray-100 dark:border-gray-700 z-10">
    <span class="text-gray-600 dark:text-gray-400 text-sm font-medium flex items-center">${lang || 'text'}</span>
    <div class="flex gap-2">
      <button class="h-7 gap-1 btn-pill btn-copy" data-block-id="${blockId}">
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="copy-icon text-current"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="check-icon text-current hidden"><path d="M10 24L20 34L40 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="copy-text">${t('chat.copyCode')}</span>
        <span class="copied-text hidden">已复制</span>
      </button>
    </div>
  </div><code
    class="hljs code-content-scrollable custom-scrollbar px-4 py-3 text-base bg-white dark:bg-[#282c34] rounded-b-2xl leading-normal code-container"
    style="margin-top: 0; padding-right: 0.75rem !important; padding-left: 0.75rem !important; display: block !important; white-space: pre !important; max-width: 100% !important; width: 100% !important; overflow-x: auto !important;"
  >${str}</code></pre>`
}

async function handleEditMessage() {
  if (isEditable.value) {
    const tempEditableContent = editableContent.value
    await onConversation({
      msg: tempEditableContent,
      imageUrl: props.imageUrl,
      fileUrl: props.fileUrl,
      chatId: props.chatId,
    })

    isEditable.value = false
  } else {
    editableContent.value = props.content
    isEditable.value = true
    await nextTick()
    adjustTextareaHeight()
  }
}

async function handleMessage(item: string) {
  await onConversation({
    msg: item,
  })
}

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

const cancelEdit = () => {
  isEditable.value = false
  editableContent.value = props.content
}

const adjustTextareaHeight = () => {
  if (textarea.value) {
    textarea.value.style.height = 'auto'
    textarea.value.style.height = `${textarea.value.scrollHeight}px`
  }
}

// 新增：监听 loading 状态改变以控制代码块高度
watch(
  () => props.loading,
  isLoading => {
    // 仅处理非用户消息
    if (props.isUserMessage) return

    nextTick(() => {
      const container = textRef.value
      if (container) {
        const codeElements = container.querySelectorAll('code.code-content-scrollable')
        codeElements.forEach(element => {
          const codeEl = element as HTMLElement
          const parentDiv = codeEl.parentElement

          if (!isLoading) {
            // 加载完成: 设置最大高度和滚动
            codeEl.style.maxHeight = '50vh'
            codeEl.style.overflowY = 'auto'
            codeEl.style.display = 'block !important' // 确保 code 是块级元素以应用高度和滚动
            codeEl.style.whiteSpace = 'pre !important'
            codeEl.style.minWidth = 'fit-content !important'

            if (parentDiv && parentDiv.classList.contains('custom-scrollbar')) {
              parentDiv.style.overflowX = 'auto !important'
              parentDiv.style.maxWidth = '100% !important'
            }

            // 确保滚动条可见
            setTimeout(() => {
              // 强制重新计算布局，确保滚动条显示
              codeEl.style.overflow = 'hidden'
              void codeEl.offsetHeight // 触发回流
              codeEl.style.overflowY = 'auto'

              if (parentDiv) {
                void parentDiv.offsetHeight
                parentDiv.style.overflowX = 'auto !important'
              }
            }, 100)
          } else {
            // 正在加载: 移除限制，允许内容扩展
            codeEl.style.maxHeight = 'none'
            codeEl.style.overflowY = 'visible' // 或者 hidden，取决于是否希望看到溢出
            // display: block 可以在 CSS 中设置或在这里保留
            codeEl.style.display = 'block !important'
            codeEl.style.whiteSpace = 'pre !important'
          }
        })
      }
    })
  },
  { immediate: true } // 初始渲染时也根据 loading 状态设置一次
)

// 在watch中监听editableContent的变化
watch(editableContent, () => {
  if (isEditable.value) {
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
})

// 监听isEditable状态变化，确保切换到编辑模式时调整高度
watch(isEditable, newVal => {
  if (newVal) {
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
})

// 监听深度思考状态，自动折叠完成的深度思考内容
// watch(
//   [
//     () => props.reasoningText,
//     () => props.content,
//     () => props.loading,
//     () => props.usingDeepThinking,
//   ],
//   (
//     [newReasoningText, newContent, newLoading, newUsingDeepThinking],
//     [oldReasoningText, oldContent, oldLoading, oldUsingDeepThinking]
//   ) => {
//     // 如果有深度思考内容且当前是展开状态
//     if (newReasoningText && showThinking.value && !props.isUserMessage) {
//       // 情况1：深度思考完成（loading从true变为false）
//       // 情况2：开始有正文内容（从无到有）
//       // 情况3：不再使用深度思考且有正文内容
//       if (
//         (oldLoading && !newLoading && newReasoningText) ||
//         (!oldContent && newContent && newReasoningText) ||
//         (oldUsingDeepThinking && !newUsingDeepThinking && newContent)
//       ) {
//         // 延迟2秒后自动折叠，给用户时间看到完成状态
//         setTimeout(() => {
//           showThinking.value = false
//         }, 1000)
//       }
//     }
//   },
//   { immediate: false }
// )

defineExpose({ textRef })

onMounted(() => {
  // 注入主题覆盖样式
  injectThemeStyles()

  // 添加复制功能
  const setupCodeCopy = () => {
    console.log('设置代码复制功能')
    // 选择包含btn-copy类的按钮
    const copyButtons = document.querySelectorAll('.btn-copy[data-block-id]')
    copyButtons.forEach(button => {
      const blockId = button.getAttribute('data-block-id')
      if (!blockId) return

      // 检查按钮是否已经绑定了事件（添加自定义属性标记）
      if (button.getAttribute('data-listener-attached') === 'true') {
        return
      }

      // 添加新的事件处理程序
      button.addEventListener('click', event => {
        event.stopPropagation()
        event.preventDefault()
        console.log('复制按钮被点击, blockId:', blockId)
        handleCodeCopy(blockId, button as HTMLElement)
      })

      // 标记按钮已绑定事件
      button.setAttribute('data-listener-attached', 'true')
    })
  }

  // 初始设置和DOM更新后重新设置
  setupCodeCopy()

  // 监听DOM变化，当新的代码块出现时设置复制功能
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的代码块按钮被添加
    let hasNewButtons = false
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // 元素节点
            const element = node as HTMLElement
            // 检查是否包含未绑定事件的复制按钮
            const newButtons = element.querySelectorAll(
              '.btn-copy:not([data-listener-attached="true"])'
            )
            if (newButtons.length > 0) {
              hasNewButtons = true
            }
          }
        })
      }
    })

    // 只有在确实有新按钮时才执行设置
    if (hasNewButtons) {
      setupCodeCopy()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // 卸载时清理
  onUnmounted(() => {
    observer.disconnect()
    // 清理所有定时器
    copyTimeoutsMap.forEach(timeoutId => clearTimeout(timeoutId))
    copyTimeoutsMap.clear()
  })

  const handlePreviewClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    // 查找包含btn-preview类的按钮或其父元素
    const previewButton = target.classList?.contains('btn-preview')
      ? target
      : target.closest('.btn-preview')

    if (previewButton && previewButton.getAttribute('data-block-id')) {
      event.stopPropagation()
      event.preventDefault()

      const blockId = previewButton.getAttribute('data-block-id')
      if (blockId) {
        const codeBlock = document.getElementById(blockId)
        if (codeBlock) {
          const codeElement = codeBlock.querySelector('code')
          if (codeElement && codeElement.textContent) {
            // 检查是否是Mermaid图表
            const isMermaid = previewButton.classList.contains('preview-mermaid')
            // 更新当前点击的内容到全局存储，标记类型
            globalStore.updateHtmlContent(
              codeElement.textContent || '',
              isMermaid ? 'mermaid' : 'html'
            )
            // 打开预览器，由预览器自动收集所有代码块
            globalStore.updateHtmlPreviewer(true)
          }
        }
      }
    }
  }

  document.addEventListener('click', handlePreviewClick)

  // 添加对markdown图片的预览监听
  const handleMdImagePreview = (event: CustomEvent) => {
    const { src } = event.detail
    openSingleImagePreview(src)
  }

  document.addEventListener('previewMdImage', handleMdImagePreview as EventListener)

  onUnmounted(() => {
    document.removeEventListener('click', handlePreviewClick)
    document.removeEventListener('previewMdImage', handleMdImagePreview as EventListener)
  })

  // 初始化代码块样式
  nextTick(() => {
    const container = textRef.value
    if (container) {
      const codeElements = container.querySelectorAll('code.code-content-scrollable')
      codeElements.forEach(element => {
        const codeEl = element as HTMLElement
        const parentDiv = codeEl.parentElement

        // 设置样式
        codeEl.style.maxHeight = '50vh'
        codeEl.style.overflowY = 'auto'
        codeEl.style.display = 'block !important'
        codeEl.style.whiteSpace = 'pre !important'
        codeEl.style.minWidth = 'fit-content !important'

        if (parentDiv && parentDiv.classList.contains('custom-scrollbar')) {
          parentDiv.style.overflowX = 'auto !important'
          parentDiv.style.maxWidth = '100% !important'
        }

        // 确保滚动条可见
        setTimeout(() => {
          // 强制重新计算布局，确保滚动条显示
          codeEl.style.overflow = 'hidden'
          void codeEl.offsetHeight // 触发回流
          codeEl.style.overflowY = 'auto'

          if (parentDiv) {
            void parentDiv.offsetHeight
            parentDiv.style.overflowX = 'auto !important'
          }
        }, 100)
      })
    }
  })

  // 停止音频播放并清理资源
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (speechSynthesisUtterance) {
    window.speechSynthesis.cancel()
  }

  // 监听 code button 点击事件
  setTimeout(() => {
    // 预览按钮
    const htmlPreviewBtns = document.querySelectorAll(
      '.btn-preview:not(.preview-mermaid):not(.preview-markmap)'
    )
    const mermaidPreviewBtns = document.querySelectorAll('.preview-mermaid')
    const markmapPreviewBtns = document.querySelectorAll('.preview-markmap')
    const copyBtns = document.querySelectorAll('.btn-copy')

    // HTML预览按钮点击处理
    htmlPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'html')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Mermaid预览按钮点击处理
    mermaidPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'mermaid')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Markmap预览按钮点击处理
    markmapPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'markmap')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Copy button click handlers
    copyBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          // 复制代码到剪贴板
          navigator.clipboard.writeText(code).then(() => {
            const copyBtn = e.currentTarget as HTMLElement
            // const copyIcon = copyBtn.querySelector('.copy-icon')
            const originalHTML = copyBtn.innerHTML

            // 显示成功状态
            copyBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-green-500">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M4 24L9 19L19 29L39 9L44 14L19 39L4 24Z" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                已复制
              `

            // 2秒后恢复原样
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML
            }, 2000)
          })
          // .catch(() => {
          //   // 复制失败处理
          //   alert('复制失败，请手动复制')
          // })
        }
      })
    })
  }, 100)
})

function openImagePreview(index: number) {
  // 通知父组件打开预览器
  if (onOpenImagePreviewer && imageUrlArray.value.length > 0) {
    onOpenImagePreviewer(imageUrlArray.value, index)
  }
}

// 打开单张图片预览
function openSingleImagePreview(src: string) {
  if (onOpenImagePreviewer) {
    onOpenImagePreviewer([src], 0)
  }
}
</script>

<template>
  <div class="text-wrap flex w-full flex-col px-1 group">
    <!-- 网页搜索结果 -->
    <div v-if="!isUserMessage && (searchResult.length || (loading && usingNetwork))" class="mb-2">
      <div
        @click="showSearchResult = !showSearchResult"
        class="text-gray-600 mb-1 cursor-pointer items-center btn-pill glow-container"
      >
        <Sphere theme="outline" size="18" class="mr-1 flex" />
        <span v-if="searchResult.length">已浏览 {{ searchResult.length }} 个网页</span>
        <span v-else-if="loading && usingNetwork">联网搜索中</span>
        <LoadingOne v-if="loading && usingNetwork" class="rotate-icon flex mx-1" />
        <Down v-if="!showSearchResult && searchResult.length" size="18" class="ml-1 flex" />
        <Up v-else-if="searchResult.length" size="18" class="ml-1 flex" />
        <div v-if="loading && usingNetwork && !searchResult.length" class="glow-band"></div>
      </div>

      <transition name="fold">
        <div
          v-if="showSearchResult && searchResult.length"
          class="text-gray-600 dark:text-gray-400 border-l-2 pl-5 mt-2"
        >
          <div class="flex flex-col gap-2 text-base">
            <a
              v-for="(item, index) in searchResult"
              :key="index"
              :href="item.link"
              target="_blank"
              class="hover:underline mr-2 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {{ index + 1 }}. {{ item.title.slice(0, 80)
              }}{{ item.title.length > 80 ? '...' : '' }}
              <span v-if="item.media">[{{ item.media }}]</span>
            </a>
          </div>
        </div>
      </transition>
    </div>

    <!-- 深度思考内容 -->
    <div v-if="!isUserMessage && (reasoningText || (loading && usingDeepThinking))" class="mb-2">
      <div
        @click="showThinking = !showThinking"
        class="text-gray-600 mb-1 cursor-pointer items-center btn-pill glow-container"
      >
        <TwoEllipses theme="outline" size="18" class="mr-1 flex" />
        <span v-if="reasoningText">{{ text || !loading ? '已深度思考' : '深度思考中' }}</span>
        <span v-else-if="loading && usingDeepThinking">深度思考</span>
        <LoadingOne
          v-if="
            (loading && usingDeepThinking && !reasoningText) || (!text && loading && reasoningText)
          "
          class="rotate-icon flex mx-1"
        />
        <Down v-if="!showThinking && reasoningText" size="18" class="ml-1 flex" />
        <Up v-else-if="reasoningText" size="18" class="ml-1 flex" />
        <div
          v-if="
            (loading && usingDeepThinking && !reasoningText) || (!text && loading && reasoningText)
          "
          class="glow-band"
        ></div>
      </div>

      <transition name="fold">
        <div
          v-if="showThinking && reasoningText"
          :class="[
            'markdown-body text-gray-600 dark:text-gray-400 pl-5 mt-2 border-l-2 border-gray-300 dark:border-gray-600 overflow-hidden transition-opacity duration-500 ease-in-out',
            { 'markdown-body-generate': loading && !text },
          ]"
          v-html="reasoningText"
        ></div>
      </transition>
    </div>

    <!-- 主文本内容 -->
    <div ref="textRef" class="flex w-full">
      <!-- AI回复内容 -->
      <div v-if="!isUserMessage" class="w-full">
        <span
          v-if="loading && !text && !reasoningText"
          class="inline-block w-3.5 h-3.5 ml-0.5 align-middle rounded-full animate-breathe dark:bg-gray-100 bg-gray-950"
        ></span>
        <div
          :class="[
            'markdown-body text-gray-950 dark:text-gray-100',
            { 'markdown-body-generate': loading || !text },
          ]"
          v-html="text"
        ></div>
      </div>

      <!-- 用户消息内容 -->
      <div
        v-else
        class="flex justify-end w-full"
        :class="[isMobile ? 'pl-20' : 'pl-28']"
        style="max-width: 100%"
      >
        <!-- 编辑模式 -->
        <div
          v-if="isEditable"
          class="p-3 rounded-2xl w-full bg-opacity dark:bg-gray-750 break-words"
          style="max-width: 100%"
        >
          <textarea
            v-model="editableContent"
            class="min-w-full text-base resize-none overflow-y-auto bg-transparent whitespace-pre-wrap text-gray-950 dark:text-gray-100"
            style="max-height: 60vh"
            @input="adjustTextareaHeight"
            ref="textarea"
          ></textarea>
          <div class="flex justify-end mt-3">
            <!-- 取消按钮 -->
            <div class="group relative">
              <button
                type="button"
                class="btn-floating btn-md mx-3"
                :class="{
                  'h-8 w-8': isMobile,
                  'bg-[#F4F4F4] border-[#F4F4F4] dark:bg-[#2f2f2f] dark:border-[#2f2f2f]': isMobile,
                }"
                @click="cancelEdit"
                aria-label="取消"
              >
                <Close size="16" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-top">取消</div>
            </div>
            <!-- 发送按钮 -->
            <div class="group relative">
              <button
                type="button"
                class="btn-send"
                :class="{ 'h-8 w-8': isMobile }"
                @click="handleEditMessage"
                aria-label="发送"
              >
                <Send size="16" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-top">发送</div>
            </div>
          </div>
        </div>
        <!-- 只读模式 -->
        <div
          v-else
          class="p-3 rounded-2xl text-base bg-opacity dark:bg-gray-750 break-words whitespace-pre-wrap text-gray-950 dark:text-gray-100"
          v-text="text"
          style="max-width: 100%"
        />
      </div>
    </div>

    <!-- 图片显示部分 -->
    <div
      v-if="imageUrlArray && imageUrlArray.length > 0 && isImageUrl"
      :class="['my-2 w-full flex', isUserMessage ? 'justify-end' : 'justify-start']"
    >
      <div
        class="gap-2"
        :style="{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(imageUrlArray.length, 4)}, 1fr)`,
          gridAutoRows: '1fr',
          maxWidth: isUserMessage ? (isMobile ? '60vw' : '40vw') : '80vw',
          width: 'auto',
        }"
      >
        <img
          v-for="(file, index) in imageUrlArray"
          :key="index"
          :src="file"
          alt="图片"
          @click="openImagePreview(index)"
          class="rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity w-auto h-auto max-h-[30vh] object-cover"
          :style="{
            aspectRatio: '1/1',
            width: '160px',
            height: '160px',
          }"
        />
      </div>
    </div>

    <!-- 后续提问建议 -->
    <div
      v-if="promptReference && !isUserMessage && isLast"
      class="flex-row transition-opacity duration-500"
    >
      <button
        v-for="(item, index) in promptReference
          ? promptReference
              .match(/{(.*?)}/g)
              ?.map((str: string | any[]) => str.slice(1, -1))
              .slice(0, 3)
          : []"
        :key="index"
        @click="handleMessage(item as string)"
        class="flex items-center overflow-hidden btn-pill py-4 px-4 mt-3"
      >
        {{ item }}
        <ArrowRight class="ml-1" />
      </button>
    </div>

    <!-- 操作按钮区域 -->
    <div
      :class="[
        'flex transition-opacity duration-300 text-gray-700',
        buttonGroupClass,
        { 'justify-end': isUserMessage },
      ]"
    >
      <div class="mt-2 flex group">
        <!-- 复制按钮 -->
        <div v-if="!isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleCopy"
            aria-label="复制"
          >
            <Copy />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.copy') }}</div>
        </div>

        <!-- 删除按钮 -->
        <div v-if="!isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleDelete"
            aria-label="删除"
          >
            <Delete />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.delete') }}</div>
        </div>

        <!-- 编辑按钮 -->
        <div v-if="isUserMessage && !isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleEditMessage"
            aria-label="编辑"
          >
            <Edit />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">编辑</div>
        </div>

        <!-- 重新生成按钮 -->
        <div v-if="!isUserMessage" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleRegenerate(index, chatId)"
            aria-label="重新生成"
          >
            <Refresh />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">重新生成</div>
        </div>

        <!-- 朗读按钮 -->
        <div v-if="!isUserMessage && !isHideTts" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="playOrPause"
            aria-label="朗读"
          >
            <VoiceMessage v-if="playbackState === 'paused'" />
            <Rotation v-if="playbackState === 'loading'" class="rotate-icon" />
            <PauseOne v-else-if="playbackState === 'playing'" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">
            {{
              playbackState === 'playing'
                ? t('chat.pause')
                : playbackState === 'loading'
                  ? t('chat.loading')
                  : t('chat.readAloud')
            }}
          </div>
        </div>

        <!-- 浏览器朗读按钮 -->
        <div v-if="!isUserMessage && isHideTts" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleBrowserTts"
            aria-label="浏览器朗读"
          >
            <Sound v-if="browserTtsState === 'paused'" />
            <PauseOne v-else-if="browserTtsState === 'playing'" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">
            {{ browserTtsState === 'playing' ? '停止' : '朗读' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less">
/* 
  注意：主要的highlight.js主题覆盖已移至 injectThemeStyles 函数
  此处只保留动画和其他非主题相关样式
*/

@keyframes rotateAnimation {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rotate-icon {
  animation: rotateAnimation 3s linear infinite;
  transform-origin: center;
}

.hidden {
  display: none !important;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.new-text-fade-in {
  animation: fadeIn 0.5s ease-in;
  animation-fill-mode: forwards;
  display: inline;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    /* 原始尺寸 */
    opacity: 1;
    /* 完全不透明 */
  }

  50% {
    transform: scale(0.5);
    /* 缩小到50%的尺寸 */
    opacity: 0.5;
    /* 半透明 */
  }
}

.animate-breathe {
  animation: breathe 2s infinite ease-in-out;
}

/* 折叠/展开动画 */
.fold-enter-active,
.fold-leave-active {
  transition: all 0.3s ease;
  max-height: 1000px;
  opacity: 1;
  overflow: hidden;
}

.fold-enter-from,
.fold-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

/* 为响应结果折叠添加特殊处理 */
pre.fold-enter-active,
pre.fold-leave-active {
  transition: all 0.25s ease;
  max-height: 500px;
  opacity: 1;
  margin-top: 0.5rem;
}

pre.fold-enter-from,
pre.fold-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

/* 使用全局样式配置，在global.less中定义 */

/* Markdown样式 */
.markdown-body {
  background-color: transparent;
  // font-size: 1rem;
  max-width: min(50rem, 100%);

  // p {
  //   white-space: pre-wrap;
  // }

  // ol {
  //   list-style-type: decimal;
  // }

  // ul {
  //   list-style-type: disc;
  // }

  pre code,
  pre tt {
    line-height: 1.65;
  }
}

/* 深色模式滚动条 */
.dark .custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(107, 114, 128, 0.9);
}

/* 代码容器高度控制 */
.code-container {
  transition:
    max-height 0.3s ease,
    overflow 0.3s ease;
  overflow: auto;
  max-width: 100% !important;
  overflow-x: auto !important;
  width: 100% !important;
}

/* 生成完成状态下的代码容器限制高度 */
.markdown-body:not(.markdown-body-generate) .code-container {
  max-height: 50vh;
  overflow-y: auto;
}

/* 生成中状态下的代码容器不限制高度 */
.markdown-body-generate .code-container {
  max-height: none;
  overflow-y: visible;
}

/* 加载动画样式 */
</style>
