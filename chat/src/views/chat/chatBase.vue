<script setup lang="ts">
// ============== 组件导入 ==============
import { fetchChatAPIProcess } from '@/api'
import { fetchQueryOneCatAPI } from '@/api/appStore'
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { dialog } from '@/utils/dialog'
import { message } from '@/utils/message'
import { Close, DropDownList } from '@icon-park/vue-next'
import DownSmall from '@icon-park/vue-next/es/icons/DownSmall'
import Sider from './components/sider/index.vue'
// 导入DropdownMenu组件用于弹窗
import { DropdownMenu } from '@/components/common/DropdownMenu'
// 移除不再直接使用的异步组件导入
// const TextEditor = defineAsyncComponent(() => import('./components/Previewer/TextEditor.vue'))
// const ImagePreviewer = defineAsyncComponent(() => import('./components/Previewer/ImagePreviewer.vue'))
// const HtmlPreviewer = defineAsyncComponent(() => import('./components/Previewer/HtmlPreviewer.vue'))

// ============== 静态组件导入 ==============
import AiBotComponent from './components/AiBot/index.vue'
import AppList from './components/AppList/index.vue'
import AppTips from './components/AppTips/index.vue'
import FooterComponent from './components/Footer/index.vue'
import HeaderComponent from './components/Header/index.vue'
import Message from './components/Message/index.vue'
import PresetHints from './components/PresetHints/index.vue'
import WelcomeComponent from './components/Welcome/index.vue'

// ============== Composition API ==============
import { DIALOG_TABS } from '@/store/modules/global'
import { computed, inject, nextTick, onMounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'

// ============== 接口定义 ==============
// Type for the form schema field
interface FormField {
  type: 'input' | 'select'
  title: string
  placeholder: string
  options?: string[]
}

// ============== 组合式函数 ==============
const ms = message()
const { isMobile } = useBasicLayout()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom, isAtBottom, handleScroll } =
  useScroll()
const { addGroupChat, updateGroupChatSome } = useChat()

// 添加自定义的updateGroupChat函数
const updateGroupChat = (index: number, chat: Chat.Chat) => {
  chatStore.updateGroupChat(index, chat)
}

// ============== Store ==============
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()

// ============== 响应式状态 ==============
const route = useRoute()
const bottomContainer = ref()
const firstScroll = ref<boolean>(true)
const controller = ref(new AbortController())
const componentKey = ref(0)
const showAppListComponent = ref(false)
const currentAppDetail = ref<any>(null)

// ============== 弹窗相关状态 ==============
// Modal state
const showFormModal = ref(false)
const currentFormSchema = ref<FormField[]>([])
const selectedAppForModal = ref<any>(null)
const isSubmitting = ref(false)

// 添加Modal相关的状态和函数
const modalFormData = ref<Record<string, any>>({})
const isModalLoading = computed(() => isSubmitting.value)
const dropdownStates = ref<Record<string, boolean>>({})

// ============== 计算属性 ==============
const groupSources = computed(() => chatStore.groupList)
const tradeStatus = computed(() => {
  return route?.query?.trade_status ? String(route.query.trade_status) : ''
})
const token = computed(() => {
  return route?.query?.token ? String(route.query.token) : ''
})
const isLogin = computed(() => authStore?.isLogin ?? false)
const usingPlugin = computed(() => chatStore.currentPlugin)
const dataSources = computed(() => chatStore.chatList)
const activeGroupId = computed(() => chatStore.active)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const globalConfig = computed(() => authStore.globalConfig)
const isHideDefaultPreset = computed(
  () => Number(authStore.globalConfig?.isHideDefaultPreset) === 1
)
const sideDrawingEditModel = computed(() => authStore.globalConfig?.sideDrawingEditModel)
const isStreamCacheEnabled = computed(() => authStore.globalConfig.streamCacheEnabled === '1')

// 使用watch监听activeGroupInfo的变化
const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config
  if (!configString) {
    return {} // 提早返回一个空对象
  }

  try {
    return JSON.parse(configString)
  } catch (e) {
    return {} // 解析失败时返回一个空对象
  }
})

// Modified computed property for background image
const activeChatBackgroundImg = computed(() => {
  // Prioritize app detail if available
  if (currentAppDetail.value?.backgroundImg) {
    return currentAppDetail.value.backgroundImg
  }
  // Fallback to configObj
  return configObj.value?.backgroundImg || null
})

const isFlowith = computed(() => {
  return configObj?.value?.modelInfo?.isFlowith
})

const fileParsing = computed(() => {
  return String(configObj?.value?.fileInfo?.fileParsing || '')
})

// 获取模型
const activeModel = computed(() => {
  return String(
    usingPlugin?.value?.parameters !== 'mermaid'
      ? usingPlugin?.value?.parameters || configObj?.value?.modelInfo?.model || ''
      : configObj?.value?.modelInfo?.model || ''
  )
})

// 获取文件url
const activeFileUrl = computed(() => String(activeGroupInfo.value?.fileUrl || ''))

// 获取模型名称
const activeModelName = computed(() => {
  return String(usingPlugin?.value?.pluginName || configObj?.value.modelInfo.modelName || 'AI')
})

// 获取模型类型
const activeModelKeyType = computed(() => {
  return Number(configObj?.value.modelInfo.keyType || 1)
})

// 获取模型头像
const activeModelAvatar = computed(() => {
  return String(usingPlugin?.value?.pluginImg || configObj?.value.modelInfo?.modelAvatar || '')
})

/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

// ============== 弹窗相关计算属性 ==============
// Computed property for background style
const backgroundStyle = computed(() => {
  if (selectedAppForModal.value?.backgroundImg) {
    return {
      backgroundImage: `url(${selectedAppForModal.value.backgroundImg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return {}
})

// ============== 监听器 ==============
watch(
  dataSources,
  val => {
    if (val.length === 0) return
    if (firstScroll.value) {
      firstScroll.value = false
      scrollToBottom()
    }
  },
  { immediate: true }
)

watch(dataSources, async () => {
  componentKey.value++
})

watch(
  () => activeGroupId.value,
  async () => {
    setTimeout(scrollToBottom, 100)
  }
)

// 在组件挂载时主动获取用户信息
onMounted(async () => {
  try {
    await authStore.getUserInfo()
    console.log('用户信息获取成功', authStore.userInfo)
  } catch (error) {
    console.error('获取用户信息失败:', error)
  }
})

// Watch activeAppId to fetch app details
watch(
  activeAppId,
  async (newAppId, oldAppId) => {
    if (newAppId && newAppId > 0) {
      await fetchCurrentAppDetail(newAppId)
    } else {
      currentAppDetail.value = null // Clear details if no app is active
    }
  },
  { immediate: false }
) // Don't run immediately, let onMounted handle initial load

// ============== 弹窗相关监听器 ==============
// Initialize formData when schema changes or modal becomes visible
watch(
  [() => currentFormSchema.value, () => showFormModal.value],
  ([newSchema, newVisible]) => {
    if (newVisible && newSchema && newSchema.length > 0) {
      const initialData: Record<string, any> = {}
      const initialDropdownStates: Record<string, boolean> = {}
      newSchema.forEach(field => {
        // Initialize with empty string or default for select if needed
        initialData[field.title] = ''
        // Initialize dropdown states for select fields
        if (field.type === 'select') {
          initialDropdownStates[field.title] = false
        }
      })
      modalFormData.value = initialData
      dropdownStates.value = initialDropdownStates
    }
  },
  { immediate: true }
)

// ============== 生命周期 ==============
onMounted(async () => {
  await chatStore.queryActiveChatLogList()

  await nextTick() // 等待下一个 tick，确保路由已经准备好

  if (token.value) {
    await otherLoginByToken(token.value)
  }

  if (tradeStatus.value) {
    await handleRefresh()
  }

  // Fetch initial app details if an app is active on mount
  if (activeAppId.value && activeAppId.value > 0) {
    await fetchCurrentAppDetail(activeAppId.value)
  }

  // 默认显示工作流预览器并清空旧内容
  useGlobalStore.clearWorkflowContent()
  // useGlobalStore.updateMarkdownPreviewer(false)
})

// ============== 弹窗相关方法 ==============
// Function to safely parse JSON
function tryParseJson(jsonString: string | undefined | null): FormField[] | null {
  if (!jsonString) return null
  try {
    const parsed = JSON.parse(jsonString)
    // Basic validation: Check if it's an array and elements have required keys
    if (
      Array.isArray(parsed) &&
      parsed.every(item => item.type && item.title && item.placeholder)
    ) {
      return parsed as FormField[]
    }
    return null
  } catch (error) {
    console.error('Failed to parse prompt JSON:', error)
    return null
  }
}

function selectOption(fieldTitle: string, option: string) {
  modalFormData.value[fieldTitle] = option
}

// Modal event handlers
function handleModalClose() {
  showFormModal.value = false
  currentFormSchema.value = []
  selectedAppForModal.value = null
}

async function handleModalSkip(app: any) {
  showFormModal.value = false
  // 直接执行应用，不带数据
  await handleAppExecution(app)
}

function handleModalSubmit() {
  if (!selectedAppForModal.value) return

  // 检查表单是否为空（排除系统生成字段）
  let hasUserInput = false
  for (const fieldTitle in modalFormData.value) {
    // 如果存在任何非空的用户输入字段，标记为有输入
    const field = currentFormSchema.value.find(f => f.title === fieldTitle)
    if (field && !field.placeholder.includes('(系统生成)') && modalFormData.value[fieldTitle]) {
      hasUserInput = true
      break
    }
  }

  // 如果用户没有填写任何内容，按跳过处理
  if (!hasUserInput) {
    showFormModal.value = false
    handleAppExecution(selectedAppForModal.value)
    return
  }

  isSubmitting.value = true
  // Filter out system-generated fields before submitting
  const submitData: Record<string, any> = {}
  currentFormSchema.value.forEach(field => {
    submitData[field.title] = modalFormData.value[field.title] || ''
    if (field.placeholder.includes('(系统生成)')) {
      delete submitData[field.title]
    }
  })

  // Format formData into a string for the first message
  let formattedData = ''
  for (const key in submitData) {
    if (Object.prototype.hasOwnProperty.call(submitData, key) && submitData[key]) {
      formattedData += `${key}: ${submitData[key]}\n`
    }
  }
  formattedData = formattedData.trim()

  // Execute app with data
  handleAppExecutionWithData(selectedAppForModal.value, formattedData)

  // Close modal and reset state after a short delay to show loading
  setTimeout(() => {
    showFormModal.value = false
    isSubmitting.value = false
  }, 300)
}

// Show app configuration modal
function showAppConfigModal(app: any, formSchema: FormField[]) {
  currentFormSchema.value = formSchema
  selectedAppForModal.value = app
  showFormModal.value = true
}

// Execute app without configuration data
async function handleAppExecution(app: any) {
  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }
  await chatStore.addNewChatGroup(Number(app.id))
}

// Execute app with configuration data
async function handleAppExecutionWithData(app: any, formattedData: string) {
  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }

  await chatStore.addNewChatGroup(Number(app.id))
  await nextTick()

  if (chatStore.active === Number(app.id)) {
    onConversation({ msg: formattedData, appId: Number(app.id) })
  } else {
    console.warn('Active chat group did not switch correctly after adding.')
    onConversation({ msg: formattedData })
  }
}

// ============== 方法定义 ==============
const handleScrollBtm = () => {
  scrollToBottom()
}

// 添加工作流内容更新函数
const updateWorkflowContent = (text: string, isFirst: boolean = false) => {
  if (!text) return

  // 确保工作流预览窗口是打开的
  // useGlobalStore.updateWorkflowPreviewer(true)

  // 如果是第一个回复或需要新的标题，添加带时间戳的标题
  if (isFirst) {
    const initialContent = `### AI响应 ${new Date().toLocaleTimeString()}\n${text}`
    useGlobalStore.addWorkflowContent(initialContent)
  } else {
    // 否则追加到现有内容
    useGlobalStore.updateWorkflowContentLast(text)
  }
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

const onConversation = async ({
  msg,
  action,
  drawId,
  customId,
  model,
  modelName,
  modelType,
  modelAvatar,
  appId,
  extraParam,
  fileUrl,
  chatId,
  taskId,
  imageUrl,
}: Chat.ConversationParams) => {
  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }
  // console.log(modelType)
  // return

  if (chatId) {
    await chatStore.deleteChatsAfterId(chatId)
    componentKey.value += 1
  }
  chatStore.setStreamIn(true)
  const useModelName = modelName || activeModelName.value
  const useModelType = modelType || activeModelKeyType.value || 1
  const useModelAvatar = modelAvatar || activeModelAvatar.value
  const useAppId = appId || activeAppId.value
  let message = msg || '提问'

  let useModel = model || activeModel.value
  controller.value = new AbortController()

  if (usingPlugin.value?.deductType && usingPlugin.value?.deductType !== 0) {
    useModel = usingPlugin.value?.parameters
  }

  /* 增加一条用户记录 */
  addGroupChat({
    content: message,
    model: useModel,
    modelName: modelName,
    modelType: useModelType,
    role: 'user',
    fileUrl: fileUrl || activeFileUrl.value || '',
    imageUrl: imageUrl || '',
  })

  let options: any = {
    groupId: +activeGroupId.value,
    fileParsing: fileParsing.value,
    usingNetwork: chatStore.usingNetwork,
    usingDeepThinking: chatStore.usingDeepThinking,
  }

  console.log(usingPlugin.value)

  console.log(useModel)

  /* 虚拟增加一条ai记录 */
  addGroupChat({
    content: '',
    model: useModel,
    action: action || '',
    loading: true,
    modelName: useModelName,
    modelType: useModelType,
    role: 'assistant',
    error: false,
    status: 1,
    useFileSearch: !!(fileUrl || activeFileUrl.value) || isFlowith.value,
    fileUrl: fileUrl || activeFileUrl.value || '',
    modelAvatar: useModelAvatar,
    pluginParam: usingPlugin.value?.parameters,
    usingNetwork: chatStore.usingNetwork,
    usingDeepThinking: chatStore.usingDeepThinking,
  })

  await scrollToBottom()
  const timer: any = null
  let data: any = null
  chatStore.setStreamIn(true)
  useGlobalStore.updateIsChatIn(true)

  let updatedExtraParam = extraParam

  const fetchChatAPIOnce = async () => {
    await handleStreamResponseModel()
  }

  const handleStreamResponseModel = async () => {
    // 响应数据存储变量
    let fullText = '' // 存储完整响应文本
    let fullContent = '' // 存储额外内容（如canvas内容）
    let networkSearchResult = ''
    let tool_calls = ''
    let promptReference = ''
    let assistantLogId = ''
    let mcpToolUse = ''
    let finishReason = '' // 完成原因标识
    let full_json = ''
    let fileVectorResult = ''
    // 工作流相关变量
    let nodeType = ''
    let stepName = ''
    let workflowProgress = 0

    // 缓冲区及显示控制变量
    let textBuffer = '' // 文本缓冲区
    let reasoningBuffer = '' // 推理文本缓冲区
    let displayedText = '' // 已显示的文本
    let displayedReasoningText = '' // 已显示的推理文本
    let fullReasoningText = '' // 完整推理文本
    let displayTimer: ReturnType<typeof setInterval> | null = null // 显示定时器
    let isStreamActive = true // 流是否活跃标记
    let lastUpdateTime = Date.now() // 最近一次数据更新时间

    // 检查是否启用了缓存和打字效果
    // const isCacheEnabled = useGlobalStore.isCacheEnabled
    const isCacheEnabled = isStreamCacheEnabled.value

    // 五档速度定义（单位：毫秒）
    const speedLevels = {
      // insane: 3, // 极速
      // ultraFast: 10, // 超超快速度
      veryFast: 20, // 超快速度
      fast: 30, // 快速
      normal: 40, // 正常速度
      slow: 50, // 慢速
      verySlow: 60, // 非常慢
      extremelySlow: 70, // 极慢（用于特殊情况）
    }

    // 五档速度定义（单位：毫秒）

    // 缓冲区大小阈值 - 基础值
    const baseBufferThresholds = {
      veryLarge: 50, // 非常大的缓冲区（超过200字符）
      large: 30, // 大缓冲区（100-200字符）
      medium: 8, // 中等缓冲区（50-100字符）
      small: 6, // 小缓冲区（20-50字符）
      verySmall: 3, // 非常小的缓冲区（5-20字符）
      // 少于5个字符视为几乎空
    }

    // 当前实际使用的缓冲区阈值
    let bufferThresholds = { ...baseBufferThresholds }

    // 用于平滑速度过渡的变量
    let targetSpeed = speedLevels.normal
    let currentSpeedTransition = speedLevels.normal
    const speedTransitionRate = 0.2 // 速度过渡系数：0-1之间，越大过渡越快

    // 更新缓冲区阈值 - 根据已接收的文本量动态调整
    const updateBufferThresholds = (receivedTextLength: number) => {
      // 根据已接收的文本长度动态调整阈值
      const scaleFactor = Math.min(Math.max(receivedTextLength / 500, 1), 3)

      bufferThresholds = {
        veryLarge: Math.round(baseBufferThresholds.veryLarge * scaleFactor),
        large: Math.round(baseBufferThresholds.large * scaleFactor),
        medium: Math.round(baseBufferThresholds.medium * scaleFactor),
        small: Math.round(baseBufferThresholds.small * scaleFactor),
        verySmall: baseBufferThresholds.verySmall, // 最小阈值保持不变
      }
    }

    // 启动显示定时器
    const startDisplayTimer = () => {
      if (!isCacheEnabled) return // 如果未启用缓存，则不启动定时器

      if (displayTimer) clearInterval(displayTimer)

      displayTimer = setInterval(() => {
        updateDisplay()
      }, currentSpeedTransition)
    }

    // 根据缓冲区状态自适应调整显示速度
    const adjustDisplaySpeed = () => {
      if (!isCacheEnabled) return // 如果未启用缓存，则不调整速度

      // 计算总缓冲区大小（text和reasoning共用一个缓冲池计算速度）
      const totalBufferLength = textBuffer.length + reasoningBuffer.length
      const totalReceivedLength = fullText.length + fullReasoningText.length
      const timeSinceLastUpdate = Date.now() - lastUpdateTime

      // 更新缓冲区阈值
      updateBufferThresholds(totalReceivedLength)

      // 根据总缓冲区大小选择目标速度档位
      // if (totalBufferLength >= bufferThresholds.veryLarge * 3) {
      //   targetSpeed = speedLevels.insane // 极速模式 3ms
      // } else if (totalBufferLength >= bufferThresholds.veryLarge * 2) {
      //   targetSpeed = speedLevels.ultraFast // 超超快 10ms
      // } else
      if (totalBufferLength >= bufferThresholds.veryLarge) {
        targetSpeed = speedLevels.veryFast
      } else if (totalBufferLength >= bufferThresholds.large) {
        targetSpeed = speedLevels.fast
      } else if (totalBufferLength >= bufferThresholds.medium) {
        targetSpeed = speedLevels.normal
      } else if (totalBufferLength >= bufferThresholds.small) {
        targetSpeed = speedLevels.slow
      } else if (totalBufferLength >= bufferThresholds.verySmall) {
        targetSpeed = speedLevels.verySlow
      } else {
        // 缓冲区几乎为空，检查是否长时间无更新
        if (timeSinceLastUpdate > 2000) {
          // 超过2秒无新数据，使用极慢速度
          targetSpeed = speedLevels.extremelySlow
        } else if (timeSinceLastUpdate > 1000) {
          // 超过1秒无新数据，使用非常慢的速度
          targetSpeed = speedLevels.verySlow
        }
      }

      // 如果已经收到promptReference，表示流已经完全结束，使用最快速度
      if (promptReference && (textBuffer.length > 0 || reasoningBuffer.length > 0)) {
        targetSpeed = speedLevels.veryFast // 改为使用极速模式
      }

      // 如果收到finishReason为stop，表示流已经结束，使用更快速度输出剩余内容
      if (finishReason === 'stop' && (textBuffer.length > 0 || reasoningBuffer.length > 0)) {
        targetSpeed = speedLevels.veryFast // 改为使用超超快速度
      }

      // 实现平滑速度过渡
      if (currentSpeedTransition !== targetSpeed) {
        // 使用线性插值实现平滑过渡
        currentSpeedTransition = Math.round(
          currentSpeedTransition * (1 - speedTransitionRate) + targetSpeed * speedTransitionRate
        )

        // 确保不低于3ms的最小显示间隔
        currentSpeedTransition = Math.max(currentSpeedTransition, 3)

        // 更新定时器间隔
        if (displayTimer) {
          clearInterval(displayTimer)
          displayTimer = setInterval(() => {
            updateDisplay()
          }, currentSpeedTransition)
        }
      }
    }

    // 更新显示内容
    const updateDisplay = () => {
      if (!isCacheEnabled) return // 如果未启用缓存，则不使用缓存更新显示

      // 检查是否有内容需要显示
      const hasTextToDisplay = textBuffer.length > 0
      const hasReasoningToDisplay = reasoningBuffer.length > 0

      if (!hasTextToDisplay && !hasReasoningToDisplay) {
        // 如果没有新内容且流结束，清除定时器
        if (!isStreamActive) {
          if (displayTimer) clearInterval(displayTimer)
          displayTimer = null
        }
        return
      }

      // 根据当前速度和缓冲区大小动态获取应显示的字符数
      let charsToDisplay = 1
      const totalBufferSize = textBuffer.length + reasoningBuffer.length

      // 基础显示量 - 根据速度调整
      // if (currentSpeedTransition <= speedLevels.insane) {
      //   charsToDisplay = 10 // 极速模式显示更多字符
      // } else if (currentSpeedTransition <= speedLevels.ultraFast) {
      //   charsToDisplay = 8 // 超超快速度
      // } else
      if (currentSpeedTransition <= speedLevels.veryFast) {
        charsToDisplay = 5
      } else if (currentSpeedTransition <= speedLevels.fast) {
        charsToDisplay = 4
      } else if (currentSpeedTransition <= speedLevels.normal) {
        charsToDisplay = 3
      } else if (currentSpeedTransition <= speedLevels.slow) {
        charsToDisplay = 2
      } else {
        charsToDisplay = 1
      }

      // 根据缓冲区大小额外增加显示字符数
      if (totalBufferSize >= bufferThresholds.veryLarge * 3) {
        charsToDisplay = charsToDisplay * 6 // 缓冲区极大时，显示6倍字符
      } else if (totalBufferSize >= bufferThresholds.veryLarge * 2) {
        charsToDisplay = charsToDisplay * 5 // 缓冲区特大时，显示5倍字符
      } else if (totalBufferSize >= bufferThresholds.veryLarge) {
        charsToDisplay = charsToDisplay * 3 // 缓冲区大时，显示3倍字符
      } else if (totalBufferSize >= bufferThresholds.large) {
        charsToDisplay = charsToDisplay * 2 // 缓冲区中等时，显示2倍字符
      }

      // 为了保持平滑，限制每次最多显示字符数
      charsToDisplay = Math.min(charsToDisplay, 60) // 提高最多显示字符数上限

      // 存储需要添加到工作流的内容
      let newTextForWorkflow = ''

      // 处理文本缓冲区
      if (hasTextToDisplay) {
        // 确保不超过缓冲区长度
        const textCharsToDisplay = Math.min(charsToDisplay, textBuffer.length)
        // 从缓冲区取出字符
        const nextTextChunk = textBuffer.substring(0, textCharsToDisplay)
        textBuffer = textBuffer.substring(textCharsToDisplay)

        displayedText += nextTextChunk
        newTextForWorkflow += nextTextChunk
      }

      // 处理推理文本缓冲区
      if (hasReasoningToDisplay) {
        // 确保不超过缓冲区长度
        const reasoningCharsToDisplay = Math.min(charsToDisplay, reasoningBuffer.length)
        // 从缓冲区取出字符
        const nextReasoningChunk = reasoningBuffer.substring(0, reasoningCharsToDisplay)
        reasoningBuffer = reasoningBuffer.substring(reasoningCharsToDisplay)

        displayedReasoningText += nextReasoningChunk
      }

      // 更新UI
      updateGroupChat(dataSources.value.length - 1, {
        chatId: Number(assistantLogId),
        content: displayedText,
        reasoningText: displayedReasoningText,
        mcpToolUse: mcpToolUse,
        networkSearchResult: networkSearchResult,
        fileVectorResult: fileVectorResult,
        tool_calls: tool_calls,
        modelType: 1,
        modelName: useModelName,
        error: false,
        loading: true,
        imageUrl: data?.imageUrl,
        promptReference: promptReference,
        nodeType: nodeType,
        stepName: stepName,
        workflowProgress: workflowProgress,
      })

      // 同步更新工作流预览的内容
      if (newTextForWorkflow) {
        // 判断是否是第一个字符
        const isFirstContent = displayedText.length === newTextForWorkflow.length
        updateWorkflowContent(newTextForWorkflow, isFirstContent)
      }

      // 滚动到底部（如果用户已经在底部）
      scrollToBottomIfAtBottom()

      // 根据缓冲区状态调整速度
      adjustDisplaySpeed()
    }

    // 如果启用了缓存打字效果，则启动显示定时器
    if (isCacheEnabled) {
      startDisplayTimer()
    }

    try {
      await fetchChatAPIProcess({
        model: useModel,
        modelName: useModelName,
        modelType: useModelType,
        prompt: msg,
        usingPluginId: usingPlugin.value?.parameters ? 999 : 0,
        imageUrl: imageUrl || '',
        fileUrl: fileUrl || activeFileUrl.value || '',
        appId: useAppId || 0,
        modelAvatar: useModelAvatar,
        options,
        signal: controller.value.signal,
        extraParam: updatedExtraParam,
        onDownloadProgress: ({ event }) => {
          // 使用新的fetch流式处理
          const responseText = event.target.responseText

          // 确保工作流预览窗口是打开的
          // useGlobalStore.updateWorkflowPreviewer(true)

          // 记录最后更新时间
          lastUpdateTime = Date.now()

          try {
            // 尝试解析整个响应文本中的JSON对象
            // 注意：这里假设每个chunk都是一个完整的JSON对象，如果不是，可能需要更复杂的解析逻辑
            const jsonLines = responseText.split('\n').filter((line: string) => line.trim())

            jsonLines.forEach((line: string) => {
              try {
                const jsonObj = JSON.parse(line)

                // 处理用户余额
                if (jsonObj.userBalance) authStore.updateUserBalance(jsonObj.userBalance)

                // 处理工作流节点信息
                if (jsonObj.nodeType) nodeType = jsonObj.nodeType
                if (jsonObj.stepName) stepName = jsonObj.stepName
                if (jsonObj.progress !== undefined) workflowProgress = jsonObj.progress

                // 处理内容
                if (jsonObj.content) {
                  fullContent += jsonObj.content
                  const newText = jsonObj.content[0].text
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')

                  if (isCacheEnabled) {
                    // 将新文本添加到缓冲区和完整文本
                    textBuffer += newText
                    fullText += newText
                  } else {
                    // 直接将文本添加到显示文本，不经过缓冲区
                    fullText += newText
                    displayedText += newText

                    // 实时更新UI
                    updateGroupChat(dataSources.value.length - 1, {
                      chatId: Number(assistantLogId),
                      content: displayedText,
                      reasoningText: displayedReasoningText,
                      mcpToolUse: mcpToolUse,
                      networkSearchResult: networkSearchResult,
                      fileVectorResult: fileVectorResult,
                      tool_calls: tool_calls,
                      modelType: 1,
                      modelName: useModelName,
                      error: false,
                      loading: true,
                      imageUrl: data?.imageUrl,
                      promptReference: promptReference,
                      nodeType: nodeType,
                      stepName: stepName,
                      workflowProgress: workflowProgress,
                    })

                    // 非缓存模式下也更新工作流内容
                    if (newText) {
                      // 判断是否是第一个字符
                      const isFirstContent = displayedText.length === newText.length
                      updateWorkflowContent(newText, isFirstContent)
                    }

                    // 滚动到底部
                    scrollToBottomIfAtBottom()
                  }
                }

                // 处理其他属性
                if (jsonObj.fileVectorResult) fileVectorResult = jsonObj.fileVectorResult

                if (jsonObj.reasoning_content) {
                  fullContent += jsonObj.reasoning_content
                  const newText = jsonObj.reasoning_content[0].text
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')

                  if (isCacheEnabled) {
                    reasoningBuffer += newText
                    fullReasoningText += newText
                  } else {
                    fullReasoningText += newText
                    displayedReasoningText += newText

                    // 实时更新UI
                    updateGroupChat(dataSources.value.length - 1, {
                      chatId: Number(assistantLogId),
                      content: displayedText,
                      reasoningText: displayedReasoningText,
                      mcpToolUse: mcpToolUse,
                      networkSearchResult: networkSearchResult,
                      fileVectorResult: fileVectorResult,
                      tool_calls: tool_calls,
                      modelType: 1,
                      modelName: useModelName,
                      error: false,
                      loading: true,
                      imageUrl: data?.imageUrl,
                      promptReference: promptReference,
                      nodeType: nodeType,
                      stepName: stepName,
                      workflowProgress: workflowProgress,
                    })

                    // 非缓存模式下也更新工作流内容
                    if (newText) {
                      // 判断是否是第一个字符
                      const isFirstContent = displayedText.length === newText.length
                      updateWorkflowContent(newText, isFirstContent)
                    }

                    // 滚动到底部
                    scrollToBottomIfAtBottom()
                  }
                }

                // 处理其他字段
                if (jsonObj.mcpToolUse) mcpToolUse = jsonObj.mcpToolUse
                if (jsonObj.networkSearchResult) networkSearchResult = jsonObj.networkSearchResult
                if (jsonObj.fileVectorResult) fileVectorResult = jsonObj.fileVectorResult
                if (jsonObj.tool_calls) tool_calls = jsonObj.tool_calls
                if (jsonObj.promptReference) promptReference = jsonObj.promptReference
                if (jsonObj.chatId) {
                  assistantLogId = jsonObj.chatId
                  console.log('assistantLogId', Number(assistantLogId))
                }
                if (jsonObj.finishReason) finishReason = jsonObj.finishReason

                // 滚动到底部
                scrollToBottomIfAtBottom()
              } catch (error) {
                // JSON解析错误，忽略该行
              }
            })
          } catch (error) {
            // 整体解析错误，忽略
          }
        },
      })
    } catch (error) {
      console.log('error', error)
      console.log('error.message', error)
      handleStreamError(error)
    } finally {
      // 标记流已结束
      isStreamActive = false

      // 处理缓存相关逻辑
      if (isCacheEnabled && (textBuffer.length > 0 || reasoningBuffer.length > 0)) {
        // 处理缓冲区剩余内容
        currentSpeedTransition = speedLevels.veryFast
        if (displayTimer) {
          clearInterval(displayTimer)
          displayTimer = setInterval(() => {
            updateDisplay()
          }, currentSpeedTransition)
        }

        // 等待缓冲区清空
        await new Promise(resolve => {
          const checkBuffer = setInterval(() => {
            if (textBuffer.length === 0 && reasoningBuffer.length === 0) {
              clearInterval(checkBuffer)
              resolve(null)
            }
          }, 100)
        })
      }

      // 确保显示完整文本
      displayedText = fullText
      displayedReasoningText = fullReasoningText

      updateGroupChat(dataSources.value.length - 1, {
        chatId: Number(assistantLogId),
        content: displayedText,
        reasoningText: displayedReasoningText,
        mcpToolUse: mcpToolUse,
        networkSearchResult: networkSearchResult,
        fileVectorResult: fileVectorResult,
        tool_calls: tool_calls,
        modelType: 1,
        modelName: useModelName,
        error: false,
        loading: true,
        imageUrl: data?.imageUrl,
        promptReference: promptReference,
        nodeType: nodeType,
        stepName: stepName,
        workflowProgress: workflowProgress,
      })

      // 延迟一段时间后再结束loading状态
      await new Promise(resolve => setTimeout(resolve, 300))

      // 清理工作
      useGlobalStore.updateIsChatIn(false)
      await chatStore.queryMyGroup()
      updateGroupChatSome(dataSources.value.length - 1, {
        loading: false,
      })
      updateGroupChatSome(dataSources.value.length - 2, {
        chatId: Number(assistantLogId) - 1,
      })
    }
  }

  const handleStreamError = (error: any) => {
    console.error('fetchChatAPIProcess error:', error)
    useGlobalStore.updateIsChatIn(false)
    // clearInterval已定义的timer变量，如果不存在则不执行
    if (timer) clearInterval(timer)
    chatStore.setStreamIn(false)

    // 获取错误信息，兼容新旧错误格式
    const errorMessage = error?.message || ''
    const errorStatus = error?.status || error?.message?.code || 0

    // 取消请求的情况特殊处理
    if (errorMessage.includes('canceled')) {
      updateGroupChatSome(dataSources.value.length - 1, { loading: false })
      scrollToBottomIfAtBottom()
      setTimeout(() => {
        authStore.getUserBalance()
      }, 200)
      return
    }

    // 其他错误情况的处理逻辑
    if (errorStatus === 402 || errorMessage.includes('不足') || errorMessage.includes('使用完毕')) {
      if (!isLogin.value) {
        ms.error('您的余额不足，请先充值~')
        authStore.setLoginDialog(true)
      } else {
        useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
      }
    }

    if (errorMessage.includes('手机号绑定')) {
      if (!isLogin.value) {
        ms.error('您的手机号未绑定，请先绑定手机号~')
        authStore.setLoginDialog(true)
      } else {
        useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
      }
    }

    if (errorMessage.includes('实名认证')) {
      if (!isLogin.value) {
        authStore.setLoginDialog(true)
      } else {
        useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
      }
    }

    if (errorMessage.includes('违规') || errorMessage.includes('合规')) {
      useGlobalStore.UpdateBadWordsDialog(true)
    }

    if (errorMessage.includes('会员专属')) {
      ms.error('您还不是会员，请先开通会员~')
      useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
    }

    // 获取当前对话并更新状态
    const currentChat = dataSources.value[dataSources.value.length - 1]
    if (currentChat) {
      updateGroupChat(dataSources.value.length - 1, {
        content: currentChat.content === '' ? '' : currentChat.content,
        role: 'assistant',
        loading: false,
      })
      scrollToBottomIfAtBottom()
    }
  }

  await fetchChatAPIOnce()
  chatStore.setStreamIn(false)

  // 延迟5秒
  await new Promise(resolve => setTimeout(resolve, 300))
  // await chatStore.queryActiveChatLogList();
  scrollToBottomIfAtBottom(300)
}

// 停止回复
const pauseRequest = () => {
  controller.value.abort()
  chatStore.setStreamIn(false)
  setTimeout(scrollToBottom, 1000)
}

// 其他登录方式
const otherLoginByToken = async (token: string) => {
  try {
    // 设置用户 token
    authStore.setToken(token)

    // 显示成功消息
    ms.success('账户登录成功、开始体验吧！')

    // 获取用户信息
    await authStore.getUserInfo()
  } catch (error) {
    // 错误处理
    console.error('登录过程中发生错误:', error)
  }
}

// 支付回调处理
const handleRefresh = async () => {
  // 检查交易状态是否成功
  if (tradeStatus.value.toLowerCase().includes('success')) {
    // 显示成功消息
    ms.success('感谢你的购买、祝您使用愉快~', { duration: 5000 })

    // 获取用户信息
    await authStore.getUserInfo()
  } else {
    // 显示错误消息
    ms.error('您还没有购买成功哦~')
  }
}

// 删除
const handleDelete = async ({ chatId }: Chat.Chat) => {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.deleteMessageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      await chatStore.deleteChatById(chatId)
      componentKey.value += 1
      ms.success(t('chat.deleteSuccess'))
    },
  })
}

const handleRegenerate = async (index: number, chatId: number) => {
  if (chatStore.groupList.length === 0 || index === 0) return
  let message = ''
  let imageUrl = ''
  let fileUrl = ''
  /* 如果有index就是重新生成 */
  if (index && typeof index === 'number') {
    const { content, role } = dataSources.value[index - 1]
    imageUrl = dataSources.value[index - 1].imageUrl || ''
    fileUrl = dataSources.value[index - 1].fileUrl || ''
    if (content) {
      message = content
    }
    if (role === 'assistant') {
      return
    }
  }
  onConversation({
    msg: message,
    chatId: chatId - 1,
    imageUrl: imageUrl,
    fileUrl: fileUrl,
  })
  scrollToBottom()
}

async function handleClick(box: { appId?: number; prompt: any }) {
  if (groupSources.value.length === 0) {
    // await nextTick();
    await createNewChatGroup()
    // await chatStore.queryMyGroup();
  }
  const { appId, prompt } = box
  if (appId && appId > 0) {
    try {
      await chatStore.addNewChatGroup(appId)
      await chatStore.queryMyGroup()
    } catch (error) {}
  } else {
    onConversation({
      msg: prompt,
    })
  }
}

// ============== 方法定义 ==============

// Toggle AppList visibility
const toggleAppList = () => {
  useGlobalStore.updateShowAppListComponent(!useGlobalStore.showAppListComponent)
}

// Toggle TextEditor visibility
const toggleTextEditor = () => {
  useGlobalStore.updateTextEditor(!useGlobalStore.showTextEditor)
}

// Handle the 'run-app' event from AppList
async function handleRunAppFromList(app: any) {
  showAppListComponent.value = false // Hide AppList
  await chatStore.addNewChatGroup(Number(app.id))
  // No need to check membership here, AppList handled it
}

// Handle the 'show-member-dialog' event from AppList
function handleShowMemberDialogFromList() {
  useGlobalStore.updateShowAppListComponent(false) // Hide AppList
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
}

// Handle the 'run-app-with-data' event from AppList (via Modal)
async function handleRunAppWithData({ app, formattedData }: { app: any; formattedData: string }) {
  // Ensure AppList is hidden (might already be hidden by modal logic)
  useGlobalStore.updateShowAppListComponent(false)

  // 1. Add the new chat group
  await chatStore.addNewChatGroup(Number(app.id))
  console.log('app.id', app.id)

  // 2. Wait for the chat store to update and potentially the UI to reflect the new group
  //    (Using nextTick might be sufficient, but depends on store logic timing)
  await nextTick()

  // 3. Send the formatted data as the first message in the new chat
  //    Make sure the active group ID is correctly set by addNewChatGroup
  if (chatStore.active === Number(app.id)) {
    // Double-check if active group is the new one
    onConversation({ msg: formattedData, appId: Number(app.id) })
  } else {
    console.warn('Active chat group did not switch correctly after adding.')
    // Fallback or error handling if needed
    // Maybe force switch or just send to the current active (might be wrong)
    onConversation({ msg: formattedData })
  }
}

// Function to fetch app details
async function fetchCurrentAppDetail(appId: number) {
  if (!appId) return
  try {
    const res: any = await fetchQueryOneCatAPI({ id: appId })
    currentAppDetail.value = res.data
  } catch (error) {
    console.error('Error fetching app details:', error)
    currentAppDetail.value = null // Clear on error
  }
}

// ============== 依赖注入 ==============
provide('onConversation', onConversation)
provide('handleRegenerate', handleRegenerate)

// Potentially expose toggleAppList if needed by other children
// defineExpose({ toggleAppList })
// Expose the toggleAppList function
defineExpose({ toggleAppList, toggleTextEditor })

// 打开图片预览器
function openImagePreviewer(imageUrls: string[], initialIndex: number, mjData?: any) {
  openImageViewer({
    imageUrl: imageUrls[0],
    fileName: imageUrls[0],
  })
}
// 提供打开图片预览器方法给子组件
provide('onOpenImagePreviewer', openImagePreviewer)
// 提供弹窗相关方法给子组件
provide('showAppConfigModal', showAppConfigModal)
provide('tryParseJson', tryParseJson)
</script>

<template>
  <Sider class="h-full" />
  <div class="flex h-full w-full">
    <!-- Main container flex -->
    <div
      class="relative overflow-hidden h-full w-full flex flex-col transition-all duration-300 ease-in-out transform"
    >
      <!-- Background Image Layer -->
      <div
        v-if="activeChatBackgroundImg"
        class="absolute inset-0 z-0 opacity-30"
        :style="{
          backgroundImage: `url(${activeChatBackgroundImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        }"
      ></div>

      <!-- Header - Conditional Background with 50% opacity on image -->
      <HeaderComponent
        :class="[
          'relative z-10 flex-shrink-0',
          activeChatBackgroundImg && !useGlobalStore.showAppListComponent
            ? 'bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm' // 50% opacity when image exists
            : 'bg-white dark:bg-gray-800 backdrop-blur-sm', // Default opacity otherwise
        ]"
        @toggle-app-list="toggleAppList"
      />

      <!-- Conditional Content - Keep original non-transparent backgrounds for these -->
      <template v-if="useGlobalStore.externalLinkDialog">
        <ExternalLinkComponent class="relative z-10 flex-1 bg-white dark:bg-gray-900" />
      </template>
      <template v-else-if="useGlobalStore.showAppListComponent">
        <AppList
          class="relative z-10 flex-1 overflow-hidden bg-white dark:bg-gray-900"
          @run-app="handleRunAppFromList"
          @show-member-dialog="handleShowMemberDialogFromList"
          @run-app-with-data="handleRunAppWithData"
        />
      </template>
      <template v-else>
        <!-- Main Chat Area - Add relative z-10 -->
        <main v-if="dataSources.length || isMobile" class="relative z-10 flex-1 overflow-hidden">
          <div
            id="scrollRef"
            ref="scrollRef"
            class="relative h-full overflow-y-auto scroll-smooth custom-scrollbar"
            style="background-color: transparent; position: relative; z-index: 5"
            @scroll="handleScroll"
          >
            <div
              id="image-wrapper"
              class="w-full m-auto h-full mx-auto pb-10"
              :class="[isMobile ? 'p-3' : 'p-3 w-full max-w-4xl']"
            >
              <!-- Welcome/Tips/Messages - These inherit the transparent background -->
              <template v-if="!dataSources.length && !activeAppId">
                <div
                  class="flex justify-center items-center text-center"
                  :class="[isMobile ? 'h-full' : 'h-4/5 ']"
                >
                  <AiBotComponent />
                </div>
              </template>
              <template v-if="!dataSources.length && activeAppId">
                <div
                  class="flex justify-center items-center"
                  :class="[isMobile ? 'h-full' : 'h-4/5 ']"
                >
                  <AppTips :appId="activeAppId" />
                </div>
              </template>
              <template v-if="dataSources.length">
                <div
                  :key="componentKey"
                  :class="{
                    'px-2': isMobile,
                  }"
                >
                  <Message
                    v-for="(item, index) of dataSources"
                    :index="index"
                    :chatId="item.chatId"
                    :content="item.content"
                    :reasoningText="item.reasoningText"
                    :model="item.model"
                    :modelType="item.modelType"
                    :modelName="item.modelName"
                    :modelAvatar="item.modelAvatar"
                    :status="item.status"
                    :imageUrl="item.imageUrl"
                    :ttsUrl="item.ttsUrl"
                    :taskId="item.taskId"
                    :taskData="item.taskData"
                    :videoUrl="item.videoUrl"
                    :audioUrl="item.audioUrl"
                    :action="item.action"
                    :role="item.role"
                    :loading="item.loading"
                    :drawId="item.drawId"
                    :customId="item.customId"
                    :pluginParam="item.pluginParam"
                    :promptReference="item.promptReference"
                    :progress="item.progress"
                    :networkSearchResult="item.networkSearchResult"
                    :fileVectorResult="item.fileVectorResult"
                    :isLast="index === dataSources.length - 1"
                    :usingNetwork="item.usingNetwork"
                    :usingDeepThinking="false"
                    :useFileSearch="item.useFileSearch"
                    :tool_calls="item.tool_calls"
                    @delete="handleDelete(item)"
                  />
                  <div class="sticky bottom-2 flex justify-center p-1 z-20">
                    <!-- Removed the inner bg-white for DownSmall to let parent bg show through -->
                    <DownSmall
                      v-show="!isAtBottom"
                      size="24"
                      class="p-1 bg-white dark:bg-gray-600 shadow-sm rounded-full border text-gray-700 border-gray-400 dark:border-gray-600 dark:text-gray-500 cursor-pointer transition-all duration-300 ease-in-out"
                      :class="[isAtBottom ? 'opacity-0' : 'opacity-100']"
                      @click="handleScrollBtm"
                      theme="outline"
                      :strokeWidth="2"
                      aria-label="滚动到底部"
                      role="button"
                      tabindex="0"
                    />
                  </div>
                </div>
              </template>
              <div ref="bottomContainer" class="bottom" />
            </div>
          </div>
        </main>

        <!-- Footer - 调整垂直居中位置 -->
        <div
          :class="[
            'z-20',
            !dataSources.length && !isMobile
              ? 'absolute left-0 right-0 top-1/2 transform -translate-y-1/2'
              : 'relative',
          ]"
        >
          <FooterComponent
            :class="['z-20 pb-3 relative', isMobile ? 'pb-safe' : '']"
            @pause-request="pauseRequest"
            :dataSourcesLength="dataSources.length"
          >
            <!-- WelcomeComponent 放在 Footer 上方 -->
            <template #before-footer>
              <div v-if="!dataSources.length && !isMobile" class="absolute bottom-full mb-4 w-full">
                <WelcomeComponent :appId="activeAppId" />
              </div>
            </template>

            <!-- PresetHints 放在 Footer 下方 -->
            <template #after-footer>
              <PresetHints
                v-if="!dataSources.length && !isMobile"
                :is-hide-default-preset="isHideDefaultPreset"
                @click="handleClick"
                class="absolute top-full mt-4 w-full"
              />
            </template>
          </FooterComponent>
        </div>

        <!-- 底部Copyright Area -->
        <div
          v-if="!isMobile && !dataSources.length"
          class="fixed z-50 h-8 flex items-center justify-center bottom-0 left-0 w-full backdrop-blur-sm"
        >
          <div
            class="text-sm text-gray-600 dark:text-gray-400 max-h-6 flex justify-center items-center"
          >
            AI 生成内容仅供参考，不代表本平台立场。
            <span v-if="globalConfig?.companyName">
              版权所有 @ {{ globalConfig?.companyName }}
            </span>
            <span class="ml-2">
              <a
                class="transition-all text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
                href="https://beian.miit.gov.cn"
                target="_blank"
              >
                {{ globalConfig?.filingNumber }}
              </a>
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- 通用应用配置弹窗 -->
    <transition name="modal-fade">
      <!-- Backdrop and Centering Container -->
      <div
        v-if="showFormModal && selectedAppForModal"
        class="fixed inset-0 z-[9000] flex items-center justify-center bg-gray-900 bg-opacity-50"
        @click.self="handleModalClose"
      >
        <!-- Modal Content Container -->
        <div
          class="relative overflow-hidden bg-white dark:bg-gray-750 rounded-lg shadow-lg flex flex-col w-full max-w-3xl max-h-[85vh] m-4"
        >
          <!-- Background Image Layer -->
          <div
            v-if="selectedAppForModal?.backgroundImg"
            class="absolute inset-0 z-0 opacity-10"
            :style="backgroundStyle"
          ></div>

          <!-- Header -->
          <div
            class="relative z-10 flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
          >
            <span class="text-xl font-bold dark:text-white"
              >预设配置: {{ selectedAppForModal?.name || '' }}</span
            >
            <button
              @click="handleModalClose"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Close size="18" />
            </button>
          </div>

          <!-- Scrollable Content Area with native scroll -->
          <div
            class="relative z-10 flex-grow overflow-y-auto p-4 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
          >
            <!-- Form Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <!-- Form Field -->
              <div v-for="(field, index) in currentFormSchema" :key="index">
                <!-- Label -->
                <label
                  class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300 mb-1"
                >
                  {{ field.title }}
                </label>

                <!-- Native Input -->
                <input
                  v-if="field.type === 'input'"
                  type="text"
                  v-model="modalFormData[field.title]"
                  :placeholder="field.placeholder"
                  :disabled="field.placeholder.includes('(系统生成)') || isModalLoading"
                  class="input input-md w-full disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <!-- DropdownMenu替换原有的Menu -->
                <DropdownMenu
                  v-if="field.type === 'select'"
                  v-model="dropdownStates[field.title]"
                  position="bottom-left"
                  min-width="100%"
                  class="relative block w-full"
                  :disabled="isModalLoading"
                >
                  <template #trigger>
                    <div
                      :class="[
                        'input input-md w-full relative cursor-pointer',
                        isModalLoading ? 'disabled:opacity-50 disabled:cursor-not-allowed' : '',
                      ]"
                    >
                      <span class="block text-left truncate">{{
                        modalFormData[field.title] || field.placeholder
                      }}</span>
                      <span
                        class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
                      >
                        <DropDownList class="text-gray-400" size="16" aria-hidden="true" />
                      </span>
                    </div>
                  </template>

                  <template #menu="{ close }">
                    <div>
                      <div
                        v-for="option in field.options"
                        :key="option"
                        @click="
                          () => {
                            selectOption(field.title, option)
                            close()
                          }
                        "
                        class="menu-item menu-item-md"
                      >
                        {{ option }}
                      </div>
                    </div>
                  </template>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <!-- Footer with native buttons -->
          <div
            class="relative z-10 flex justify-end p-4 border-t border-gray-200 dark:border-gray-600 flex-shrink-0 space-x-2 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
          >
            <button
              type="button"
              @click="handleModalSkip(selectedAppForModal)"
              :disabled="isModalLoading"
              class="btn btn-secondary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              跳过
            </button>
            <button
              type="button"
              @click="handleModalSubmit"
              :disabled="isModalLoading"
              class="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style>
/* 全局过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 宽度变化动画效果 */
.transform {
  transition-property: transform, width, opacity;
}

/* 缩放动画 */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.3s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* 滑动动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 添加安全区域适配 */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.mb-safe {
  margin-bottom: env(safe-area-inset-bottom);
}

/* Modal animation */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
