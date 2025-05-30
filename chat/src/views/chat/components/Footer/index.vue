<script setup lang="ts">
import { fetchQueryAppsAPI, fetchQueryOneCatAPI } from '@/api/appStore'
import type { ResData } from '@/api/types'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import {
  AddPicture,
  FullScreen,
  LoadingFour,
  OffScreen,
  Plus,
  SendOne,
  Sphere,
  Square,
  TreeDiagram,
  TwoEllipses,
} from '@icon-park/vue-next'
import PinyinMatch from 'pinyin-match'

// import { getDocument } from 'pdfjs-dist';
import { uploadFile } from '@/api/upload'
import { message } from '@/utils/message'
import { computed, inject, nextTick, onMounted, onUnmounted, Ref, ref, watch } from 'vue'
import FilePreview from './components/FilePreview.vue'

interface Emit {
  (ev: 'pause-request'): void
}

interface Props {
  dataSourcesLength: number
}

const props = defineProps<Props>()

// 引入依赖
const onConversation = inject<any>('onConversation')
// 引用的 store
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()
const emit = defineEmits<Emit>()
const siteName = authStore.globalConfig?.siteName || 'AIWeb'
const ms = message()
const isFile = ref(true)
const fileInput = ref()
const imageInput = ref()
const isUploading = ref(false)
const searchResults = ref<any[]>([])
const inputRef = ref<Ref | null>(null)
const footerRef = ref<HTMLElement | null>(null) // 添加容器引用
const isDragging = ref(false) // 添加拖拽状态标志
const isFileDraggingOverPage = ref(false) // 添加文件拖到页面内(但未到输入框)的状态标志
const extraParam = ref<{
  size: string
  style: string
  quality?: string
  compression?: string
  background?: string
}>({ size: '', style: '' })

const showSuggestions = ref(false)
const selectedApp = ref()
const isSelectedApp = ref(false)
const appList = ref<App[]>([])
let searchTimeout: string | number | NodeJS.Timeout | null | undefined = null
const fileUploadConfig = ref({
  accept: '.pdf, .txt, .doc, .docx,.ppt,.pptx, .xlsx,.xls,.csv .md, .markdown',
  multiple: true,
})

interface App {
  id: number
  name: string
  des: string
  coverImg: string
  catId: number
  appCount: number
  demoData: string
  backgroundImg?: string
  prompt?: string
  loading?: boolean
  createdAt: string
  updatedAt: string
}

// 双向绑定 chatStore.prompt
const prompt = computed({
  get: () => chatStore.prompt,
  set: value => {
    chatStore.setPrompt(value || '')
  },
})

const usingNetwork = computed({
  get: () => chatStore.usingNetwork,
  set: value => {
    chatStore.setUsingNetwork(value)
  },
})

const usingDeepThinking = computed({
  get: () => chatStore.usingDeepThinking,
  set: value => {
    chatStore.setUsingDeepThinking(value)
  },
})
const { isMobile } = useBasicLayout()
const usingPlugin = computed(() => chatStore.currentPlugin)
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})
const dataSources = computed(() => chatStore.chatList)
const activeModelName = computed(() => String(configObj?.value.modelInfo.modelName))
const activeModelKeyType = computed(() => {
  return usingPlugin.value?.modelType || Number(configObj?.value.modelInfo.keyType)
})

const activeGroupId = computed(() => chatStore.active)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
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
const activeModelFileUpload = computed(() => Number(configObj?.value?.modelInfo?.isFileUpload))
const activeModelImageUpload = computed(() => Number(configObj?.value?.modelInfo?.isImageUpload))

const isFilesModel = computed(() => {
  // 如果不使用插件，则按照模型配置判断
  return activeModelFileUpload.value !== 0
})

const isImageModel = computed(() => {
  // 如果不使用插件，则按照模型配置判断
  return activeModelImageUpload.value !== 0
})

const isNetworkSearch = computed(() => configObj?.value?.modelInfo?.isNetworkSearch || false)

const isDeepThinking = computed(() => configObj?.value?.modelInfo?.deepThinkingType === 1 || false)

const clipboardText = computed(() => useGlobalStore.clipboardText)

const buttonDisabled = computed(
  () =>
    isStreamIn.value ||
    ((!prompt.value || prompt.value.trim() === '') && !(dataBase64List.value.length > 0))
)

const isExpanded = ref(false) // 控制输入框是否扩展
const shouldShowExpandButton = ref(false) // 控制是否显示扩展按钮

const autoResize = () => {
  if (inputRef.value) {
    const textarea = inputRef.value

    if (isExpanded.value) {
      // 展开模式下，使用固定高度
      textarea.style.height = '60vh'
      return
    }

    // 普通模式下，先重置高度，然后根据内容自适应
    textarea.style.height = 'auto' // 使用auto而不是固定的小值，让浏览器自动计算

    // 获取自动计算后的scrollHeight
    const contentHeight = textarea.scrollHeight

    // 获取行高
    const singleLineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20 // 默认行高 20px

    // 普通模式最大行数为8行
    const maxLines = 8
    const maxHeight = singleLineHeight * maxLines // 最大高度

    // 计算新高度，确保不超过最大高度
    const newHeight = Math.min(contentHeight, maxHeight)

    // 设置新高度
    textarea.style.height = `${newHeight}px`

    // 判断是否应该显示扩展按钮 - 当内容高度超过4行时显示
    shouldShowExpandButton.value = contentHeight > singleLineHeight * 4
  }
}

// 切换扩展模式
const toggleExpanded = () => {
  // 从展开到收起模式时，先获取当前高度
  const currentHeight = isExpanded.value ? inputRef.value.style.height : null

  // 切换状态
  isExpanded.value = !isExpanded.value

  nextTick(() => {
    if (isExpanded.value) {
      // 展开模式下，使用固定高度
      inputRef.value.style.height = '60vh'
    } else {
      // 收起模式时，先保持当前高度，然后在下一帧进行调整
      // 这样可以让过渡效果更平滑
      if (currentHeight) {
        // 先设置当前高度，避免立即收缩导致的视觉跳跃
        inputRef.value.style.height = currentHeight

        // 在下一帧进行实际的大小调整
        requestAnimationFrame(() => {
          autoResize()
        })
      } else {
        autoResize()
      }
    }
  })
}

// 监听 prompt 的变化（外部修改时调整高度）
watch(
  prompt,
  () => {
    nextTick(() => {
      autoResize()
    })
  },
  { immediate: true } // 初始化时立即调整
)

const handleInput = async (event: KeyboardEvent) => {
  const inputElement = event.target as HTMLTextAreaElement
  const inputValue = inputElement.value
  showSuggestions.value = inputValue.startsWith('@')

  // 清除之前的定时器，如果有的话
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  if (showSuggestions.value && !isSelectedApp.value) {
    const searchTerm = inputValue.slice(1) // 去掉'@'

    // 使用定时器来节流搜索请求
    searchTimeout = setTimeout(async () => {
      if (searchTerm.length > 0) {
        try {
          const keywordLower = searchTerm.toLowerCase()

          // 根据拼音匹配过滤符合的应用
          const filteredResults = appList.value.filter(item =>
            PinyinMatch.match(item.name, keywordLower)
          )

          searchResults.value = filteredResults.slice(0, 5)
        } catch (error) {
          console.error('Error fetching search results:', error)
          searchResults.value = []
        }
      } else {
        // 如果关键字为空，随机选取5个结果
        const randomResults = appList.value
          .sort(() => Math.random() - 0.5) // 随机打乱顺序
          .slice(0, 5) // 取前5个
        searchResults.value = randomResults
      }
    }, 100) // 设置1秒的延迟
  } else {
    searchResults.value = []
  }
}

async function queryApps() {
  const res: ResData = await fetchQueryAppsAPI()
  appList.value = res?.data?.rows.map((item: App) => {
    item.loading = false
    return item
  })
  // activeList.value = appList.value;
}

const activeModelAvatar = computed(() => {
  return String(usingPlugin?.value?.pluginImg || configObj?.value.modelInfo?.modelAvatar || '')
})

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

// 修改计算属性，直接从对话组获取fileUrl
const fileUrl = computed(() => activeGroupInfo.value?.fileUrl || '')

// 修改计算属性，解析fileUrl为对象数组
const savedFiles = computed(() => {
  if (!fileUrl.value) return []

  try {
    return JSON.parse(fileUrl.value) as { name: string; url: string; type?: string }[]
  } catch (e) {
    console.error('解析fileUrl失败:', e)
    return []
  }
})

const handleSubmit = async (index?: number) => {
  if (isStreamIn.value) {
    return
  }

  if (chatStore.groupList.length === 0) {
    await createNewChatGroup()
  }
  chatStore.setStreamIn(true)
  let action = ''

  let useModel =
    usingPlugin.value?.parameters === 'mermaid'
      ? selectedApp?.value?.model || chatStore?.activeModel
      : usingPlugin.value?.parameters || selectedApp?.value?.model || chatStore?.activeModel
  let useModelName =
    usingPlugin?.value?.pluginName || selectedApp?.value?.name || activeModelName.value

  const useModelType =
    usingPlugin.value?.parameters && usingPlugin.value?.parameters !== 'mermaid'
      ? 2
      : activeModelKeyType.value

  let modelAvatar = selectedApp?.value?.coverImg || activeModelAvatar.value
  let appId

  if (selectedApp?.value) {
    appId = selectedApp?.value?.id
  } else {
    appId = activeGroupInfo?.value?.appId
  }

  let imageUrl = ''
  let submittedFileUrl = fileUrl.value || ''
  let msg = prompt.value || ''

  // 处理图片文件上传（只有在提交时才上传图片）
  if (dataBase64List.value.length > 0) {
    // 获取所有图片文件
    const imageFiles = fileList.value.filter(file => file.type.startsWith('image/'))

    if (imageFiles.length > 0) {
      console.log('开始上传图片...')
      isUploading.value = true
      try {
        // 上传所有图片文件
        const uploadPromises = imageFiles.map(async file => {
          try {
            const response = await uploadFile(file)
            return response.data
          } catch (error) {
            console.error(`上传图片 ${file.name} 失败:`, error)
            return ''
          }
        })

        // 等待所有图片上传完成
        const results = await Promise.all(uploadPromises)
        imageUrl = results.filter(url => url).join(',')
        console.log('图片上传成功:', imageUrl)
      } catch (error) {
        console.error('上传图片过程中发生错误:', error)
        ms.error('图片上传失败')
      } finally {
        isUploading.value = false
      }
    }
  }

  if (appId) {
    try {
      const res: any = await fetchQueryOneCatAPI({ id: appId })
      modelAvatar = res.data.modelAvatar
    } catch (error) {}
  }

  await chatStore.setPrompt('')
  inputRef.value.style.height = '1rem' // 使用初始高度

  onConversation({
    msg: msg,
    action: action,
    model: useModel,
    modelName: useModelName,
    modelType: useModelType,
    modelAvatar: modelAvatar,
    appId: appId,
    extraParam: extraParam.value,
    fileUrl: submittedFileUrl,
    imageUrl: imageUrl,
    pluginParam: usingPlugin.value?.parameters,
  })

  // 清空所有上传的图片，确保imageUrl和fileUrl使用后立即销毁
  chatStore.setStreamIn(false)
  isUploading.value = false

  // 只清空图片文件，保留其他文件
  const nonImageFiles = fileList.value.filter(file => !file.type.startsWith('image/'))
  const nonImageData = dataBase64List.value.filter(
    (_, index) => !fileList.value[index]?.type.startsWith('image/') && index < fileList.value.length
  )

  fileList.value = nonImageFiles
  dataBase64List.value = nonImageData

  // 重要: 清空临时变量，确保不会被再次使用
  imageUrl = ''
}

const triggerUpload = () => {
  // 根据当前模型支持情况决定触发哪种上传
  const canUploadFiles = isFilesModel.value
  const canUploadImages = isImageModel.value

  if (canUploadFiles && canUploadImages) {
    // 两种类型都支持，使用综合配置
    fileUploadConfig.value = {
      accept: '.pdf, .txt, .doc, .docx,.ppt,.pptx, .xlsx,.xls,.csv .md, .markdown, image/*',
      multiple: true,
    }
  } else if (canUploadImages) {
    // 只支持图片
    fileUploadConfig.value = {
      accept: 'image/*',
      multiple: true,
    }
  } else if (canUploadFiles) {
    // 只支持文件
    fileUploadConfig.value = {
      accept: '.pdf, .txt, .doc, .docx, .ppt,.pptx, .xlsx,.xls,.csv .md, .markdown',
      multiple: true,
    }
  }

  // 重新设置 input 的属性
  if (fileInput.value) {
    fileInput.value.accept = fileUploadConfig.value.accept
    fileInput.value.multiple = fileUploadConfig.value.multiple
  }

  // 触发文件选择
  fileInput?.value?.click()
}

const fileList = ref<File[]>([]) // 使用 ref 来创建响应式的文件列表
const dataBase64List = ref<string[]>([]) // 使用 ref 来创建响应式的 Base64 数据列表

const handleSetFile = async (file: File) => {
  // 添加数量限制检查
  const isImageFile = file.type.startsWith('image/')

  // 获取当前已有文件数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length

  // 检查对话组中已有的文件数量
  let existingFiles = []
  try {
    if (fileUrl.value) {
      existingFiles = JSON.parse(fileUrl.value)
    }
  } catch (error) {
    existingFiles = []
  }

  const savedImageCount = Array.isArray(existingFiles)
    ? existingFiles.filter(f => f.type === 'image').length
    : 0
  const savedFileCount = Array.isArray(existingFiles)
    ? existingFiles.filter(f => f.type === 'document').length
    : 0

  // 图片数量限制为4张（缓存图片+已保存图片）
  if (isImageFile && currentImageCount + savedImageCount >= 4) {
    ms.warning('图片数量已达上限（最多4张）')
    return
  }

  // 文件数量限制为5个（已保存文件）
  if (!isImageFile && savedFileCount >= 5) {
    ms.warning('文件数量已达上限（最多5个）')
    return
  }

  fileList.value.push(file) // 使用 .value 访问 ref 对象并追加新文件

  const reader = new FileReader()

  reader.onload = (event: any) => {
    const base64Data = event.target?.result as string
    dataBase64List.value.push(base64Data) // 使用 .value 访问 ref 对象并追加 Base64 数据
    console.log(`文件 ${file.name} 的 Base64 数据已添加`)

    // 如果不是图片文件，立即上传文件并更新对话组
    if (!file.type.startsWith('image/')) {
      handleUploadFile(file)
    }
  }

  reader.readAsDataURL(file) // 读取文件并转换为 Base64

  fileInput.value = null
}

// 新增：处理单个文件上传
const handleUploadFile = async (file: File) => {
  if (file.type.startsWith('image/')) {
    // 图片文件不立即上传，只预览
    return
  }

  isUploading.value = true
  try {
    const response = await uploadFile(file)
    console.log(`文件 ${file.name} 上传成功:`, response.data)

    // 将文件信息添加到对话组
    const fileInfo = {
      name: file.name,
      url: response.data,
      type: 'document',
    }

    // 获取对话组当前已有文件
    let existingFiles = []
    try {
      if (fileUrl.value) {
        existingFiles = JSON.parse(fileUrl.value)
        if (!Array.isArray(existingFiles)) {
          existingFiles = []
        }
        // 数据验证和清理：过滤掉异常数据
        existingFiles = existingFiles.filter(
          file =>
            file &&
            typeof file === 'object' &&
            file.name &&
            file.url &&
            (file.type === 'image' || file.type === 'document')
        )
      }
    } catch (error) {
      existingFiles = []
    }

    // 将新文件添加到列表
    existingFiles.push(fileInfo)

    // 更新对话组的fileUrl字段
    await chatStore.updateGroupInfo({
      groupId: activeGroupId.value,
      fileUrl: JSON.stringify(existingFiles),
    })

    // 刷新数据以更新UI
    await chatStore.queryMyGroup()

    // ms.success(`文件"${file.name}"已上传`)
  } catch (error) {
    console.error(`上传文件 ${file.name} 失败:`, error)
    ms.error(`文件"${file.name}"上传失败`)
  } finally {
    isUploading.value = false
  }
}

const handlePaste = async (event: ClipboardEvent) => {
  const clipboardData = event.clipboardData || (window as any).clipboardData
  const items = clipboardData.items

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        if (file.type.startsWith('image/') && isImageModel.value) {
          await processImageFile(file)
        } else if (!file.type.startsWith('image/') && isFilesModel.value) {
          await processDocumentFile(file)
        } else {
          console.warn('文件类型不匹配当前模型支持的类型:', file.name)
        }
      }
    }
  }
}

// 处理文档类型文件
const processDocumentFile = async (file: File) => {
  if (file.type.startsWith('image/')) {
    console.warn('图片文件应使用图片上传功能:', file.name)
    return
  }

  // 检查文件类型
  const acceptedTypes = [
    '.pdf',
    '.txt',
    '.doc',
    '.docx',
    '.pptx',
    '.xlsx',
    '.md',
    '.markdown',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/markdown',
  ]

  const isAcceptedType = acceptedTypes.some(type => {
    if (type.startsWith('.')) {
      return file.name.toLowerCase().endsWith(type.toLowerCase())
    } else {
      return file.type === type
    }
  })

  if (!isAcceptedType) {
    ms.warning(`不支持的文件类型: ${file.name}`)
    return
  }

  // 检查文件大小限制（20MB）
  const maxSize = 20 * 1024 * 1024 // 20MB
  if (file.size > maxSize) {
    ms.warning(`文件过大: ${file.name}，最大支持20MB`)
    return
  }

  // 获取当前已有文件数量
  let existingFiles = []
  try {
    if (fileUrl.value) {
      existingFiles = JSON.parse(fileUrl.value)
      if (!Array.isArray(existingFiles)) {
        existingFiles = []
      }
    }
  } catch (error) {
    existingFiles = []
  }

  const savedFileCount = existingFiles.filter(f => f.type === 'document').length
  const currentFileCount = fileList.value.filter(f => !f.type.startsWith('image/')).length

  // 检查文件总数是否超过限制
  if (savedFileCount + currentFileCount >= 5) {
    ms.warning('文件数量已达上限')
    return
  }

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理非图片文件，支持多文件
  isFile.value = true
  handleSetFile(file)
}

// 处理图片类型文件
const processImageFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    console.warn('非图片文件应使用文件上传功能:', file.name)
    return
  }

  // 检查图片类型
  const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']

  if (!acceptedTypes.includes(file.type)) {
    ms.warning(`不支持的图片类型: ${file.name}，请使用jpg、png、gif、webp或bmp格式`)
    return
  }

  // 检查图片大小限制（10MB）
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    ms.warning(`图片过大: ${file.name}，最大支持10MB`)
    return
  }

  // 检查当前已有图片数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length

  // 计算已保存的图片数量
  let existingFiles = []
  try {
    if (fileUrl.value) {
      existingFiles = JSON.parse(fileUrl.value)
      if (!Array.isArray(existingFiles)) {
        existingFiles = []
      }
    }
  } catch (error) {
    existingFiles = []
  }

  const savedImageCount = existingFiles.filter(f => f.type === 'image').length

  // 检查图片总数是否超过限制
  if (currentImageCount + savedImageCount >= 4) {
    ms.warning('图片数量已达上限')
    return
  }

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理图片文件，支持多图片
  isFile.value = false
  handleSetFile(file)
}

const handleFileSelect = async (event: Event) => {
  console.log('文件选择事件触发')
  const input = event.target as HTMLInputElement
  const files = input?.files
  if (!files || files.length === 0) return

  // 分类文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
  const documentFiles = Array.from(files).filter(file => !file.type.startsWith('image/'))

  // 处理图片文件
  if (imageFiles.length > 0 && isImageModel.value) {
    // 获取当前已有图片数量
    const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length
    // 计算已保存的图片数量
    let existingFiles = []
    try {
      if (fileUrl.value) {
        existingFiles = JSON.parse(fileUrl.value)
      }
    } catch (error) {
      existingFiles = []
    }
    if (!Array.isArray(existingFiles)) {
      existingFiles = []
    }
    const savedImageCount = existingFiles.filter(f => f.type === 'image').length
    // 限制只处理允许范围内的图片数量
    const remainingImageSlots = 4 - currentImageCount - savedImageCount

    // 如果图片数量超过限制
    if (imageFiles.length > remainingImageSlots && remainingImageSlots > 0) {
      ms.warning(
        `已选择${imageFiles.length}张图片，但只能再添加${remainingImageSlots}张图片。将只处理前${remainingImageSlots}张图片。`
      )
    } else if (remainingImageSlots <= 0) {
      ms.warning('图片数量已达上限（最多4张）')
    }

    // 处理允许范围内的图片
    const imagesToProcess = imageFiles.slice(0, Math.max(0, remainingImageSlots))
    for (const file of imagesToProcess) {
      await processImageFile(file)
    }
  } else if (imageFiles.length > 0 && !isImageModel.value) {
    ms.warning('当前模型不支持图片上传')
  }

  // 处理文档文件
  if (documentFiles.length > 0 && isFilesModel.value) {
    // 获取当前已有文件数量
    let existingFiles = []
    try {
      if (fileUrl.value) {
        existingFiles = JSON.parse(fileUrl.value)
      }
    } catch (error) {
      existingFiles = []
    }
    if (!Array.isArray(existingFiles)) {
      existingFiles = []
    }
    const savedFileCount = existingFiles.filter(f => f.type === 'document').length
    // 限制只处理允许范围内的文件数量
    const remainingFileSlots = 5 - savedFileCount

    // 如果文件数量超过限制
    if (documentFiles.length > remainingFileSlots && remainingFileSlots > 0) {
      ms.warning(
        `已选择${documentFiles.length}个文件，但只能再添加${remainingFileSlots}个文件。将只处理前${remainingFileSlots}个文件。`
      )
    } else if (remainingFileSlots <= 0) {
      ms.warning('文件数量已达上限（最多5个）')
    }

    // 处理允许范围内的文件
    const filesToProcess = documentFiles.slice(0, Math.max(0, remainingFileSlots))
    // 显示上传进行中提示
    if (filesToProcess.length > 0) {
      isUploading.value = true
    }

    // 并行上传所有文件
    try {
      await Promise.all(
        filesToProcess.map(async file => {
          // 获取Base64预览
          await new Promise<void>(resolve => {
            const reader = new FileReader()
            reader.onload = e => {
              const base64Data = e.target?.result as string
              fileList.value.push(file)
              dataBase64List.value.push(base64Data)
              resolve()
            }
            reader.readAsDataURL(file)
          })

          // 直接上传文件并添加到对话组
          await handleUploadFile(file)
        })
      )
    } catch (error) {
      console.error('批量上传文件失败:', error)
    } finally {
      isUploading.value = false
    }
  } else if (documentFiles.length > 0 && !isFilesModel.value) {
    ms.warning('当前模型不支持文件上传')
  }

  // 清空input的值，允许再次选择相同文件
  input.value = ''
}

const handleImageSelect = async (event: Event) => {
  console.log('图片选择事件触发')
  const input = event.target as HTMLInputElement
  const files = input?.files
  if (!files || files.length === 0) return

  // 计算当前已有图片数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length

  // 计算已保存的图片数量
  let existingFiles = []
  try {
    if (fileUrl.value) {
      existingFiles = JSON.parse(fileUrl.value)
    }
  } catch (error) {
    existingFiles = []
  }

  if (!Array.isArray(existingFiles)) {
    existingFiles = []
  }

  const savedImageCount = existingFiles.filter(f => f.type === 'image').length

  // 检查图片总数是否超过限制
  if (currentImageCount + savedImageCount >= 4) {
    ms.warning('图片数量已达上限（最多4张）')
    input.value = ''
    return
  }

  // 限制只处理允许范围内的图片数量
  const remainingSlots = 4 - currentImageCount - savedImageCount

  // 先收集所有图片文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))

  // 如果图片文件数量超过剩余槽位，进行提示
  if (imageFiles.length > remainingSlots) {
    ms.warning(
      `已选择${imageFiles.length}张图片，但只能再添加${remainingSlots}张图片。将只预览前${remainingSlots}张图片。`
    )
  }

  // 只处理剩余槽位数量的图片
  const imagesToProcess = imageFiles.slice(0, remainingSlots)

  // 并行处理所有图片（只预览，不上传）
  try {
    await Promise.all(
      imagesToProcess.map(async file => {
        // 获取Base64预览
        await new Promise<void>(resolve => {
          const reader = new FileReader()
          reader.onload = e => {
            const base64Data = e.target?.result as string
            fileList.value.push(file)
            dataBase64List.value.push(base64Data)
            resolve()
          }
          reader.readAsDataURL(file)
        })
      })
    )
  } catch (error) {
    console.error('批量处理图片失败:', error)
  } finally {
    input.value = ''
  }
}

const clearSelectApp = async () => {
  searchResults.value = []
  showSuggestions.value = false
  isSelectedApp.value = false
  selectedApp.value = null
  chatStore.setUsingPlugin(null)
}

const handleEnter = (event: KeyboardEvent) => {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  } else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

const selectApp = async (app: any) => {
  // 这里可以设置选中的应用程序的逻辑
  selectedApp.value = app
  isSelectedApp.value = true
  await chatStore.setPrompt('')
  // prompt.value = '';
  inputRef.value?.focus()
}

const handleStop = () => {
  emit('pause-request')
  chatStore.setStreamIn(false)
}

watch(clipboardText, async val => {
  await chatStore.setPrompt(val)
  // prompt.value = val;
  inputRef.value?.focus()
  inputRef.value.scrollTop = inputRef.value.scrollHeight
})

watch(
  dataSources,
  val => {
    if (val.length === 0) return
  },
  { immediate: true }
)

// 监听 activeModelFileUpload 和 activeModelImageUpload 的变化
watch(
  [activeModelFileUpload, activeModelImageUpload],
  async ([newFileUpload, newImageUpload], [oldFileUpload, oldImageUpload]) => {
    if (oldFileUpload !== 0 && newFileUpload === 0) {
      // 文件上传支持从有变为无，清空所有文件
      // 先清空本地文件列表
      fileList.value = fileList.value.filter(file => file.type.startsWith('image/'))
      dataBase64List.value = dataBase64List.value.filter((_, index) =>
        fileList.value[index]?.type.startsWith('image/')
      )

      // 清空对话组中的文件（保留图片）
      if (fileUrl.value) {
        try {
          const files = JSON.parse(fileUrl.value)
          if (Array.isArray(files)) {
            const imageFiles = files.filter(file => file.type === 'image')
            // 更新对话组文件信息
            await chatStore.updateGroupInfo({
              groupId: activeGroupId.value,
              fileUrl: imageFiles.length > 0 ? JSON.stringify(imageFiles) : '',
            })
            // 刷新数据以更新UI
            await chatStore.queryMyGroup()
          }
        } catch (error) {
          console.error('清空文件失败：', error)
        }
      }
    }

    if (oldImageUpload !== 0 && newImageUpload === 0) {
      // 图片上传支持从有变为无，清空所有图片
      // 先清空本地图片列表
      fileList.value = fileList.value.filter(file => !file.type.startsWith('image/'))
      dataBase64List.value = dataBase64List.value.filter(
        (_, index) => !fileList.value[index]?.type.startsWith('image/')
      )

      // 清空对话组中的图片（保留文件）
      if (fileUrl.value) {
        try {
          const files = JSON.parse(fileUrl.value)
          if (Array.isArray(files)) {
            const nonImageFiles = files.filter(file => file.type === 'document')
            // 更新对话组文件信息
            await chatStore.updateGroupInfo({
              groupId: activeGroupId.value,
              fileUrl: nonImageFiles.length > 0 ? JSON.stringify(nonImageFiles) : '',
            })
            // 刷新数据以更新UI
            await chatStore.queryMyGroup()
          }
        } catch (error) {
          console.error('清空图片失败：', error)
        }
      }
    }
  }
)

// 修改clearData方法，统一使用JSON处理
const clearData = async (index: number, isSavedFile = false) => {
  if (isSavedFile) {
    // 处理已保存的文件，从对话组中删除文件
    try {
      if (fileUrl.value) {
        const files = JSON.parse(fileUrl.value)
        if (Array.isArray(files) && index >= 0 && index < files.length) {
          files.splice(index, 1)
          // 更新对话组文件信息
          await chatStore.updateGroupInfo({
            groupId: activeGroupId.value,
            fileUrl: files.length > 0 ? JSON.stringify(files) : '',
          })
          // 刷新数据以更新UI
          await chatStore.queryMyGroup()
        }
      }
    } catch (error) {
      console.error('删除文件失败：', error)
    }
  } else {
    // 处理新上传的文件，从本地列表中移除
    if (index >= 0 && index < dataBase64List.value.length) {
      dataBase64List.value.splice(index, 1)
      fileList.value.splice(index, 1)
    }
  }
}

const buttonContainerRef = ref<HTMLElement | null>(null)
const availableWidth = ref(0)
const containerResizeObserver = ref<ResizeObserver | null>(null)

// 计算输入框占位符文本，根据不同工具状态显示不同提示
const placeholderText = computed(() => {
  const activeFeatures = []

  // 根据工具状态添加提示
  if (usingDeepThinking.value) {
    activeFeatures.push('使用AI推理寻找深层次答案')
  }

  if (usingNetwork.value) {
    activeFeatures.push('使用网络搜索获取最新信息')
  }

  // 拖拽状态提示
  if (isDragging.value) {
    return '松开鼠标上传文件'
  }

  // 如果有特殊功能激活，则显示功能描述
  if (activeFeatures.length > 0) {
    return activeFeatures.join('，')
  }

  // 默认提示
  return `向 ${siteName} 发消息，使用 @ 搜索应用`
})

const shouldShowNetworkSearch = computed(() => {
  // 只检查是否支持网络搜索且没有使用插件
  return isNetworkSearch.value
})

const shouldShowDeepThinking = computed(() => {
  // 只检查是否支持深度思考且没有使用插件
  return isDeepThinking.value
})

// 添加流程图按钮显示控制
const shouldShowMermaidTool = computed(() => {
  // 当没有使用其他插件时显示流程图按钮
  return !usingPlugin.value || usingPlugin.value?.parameters === 'mermaid'
})

// 添加mermaid插件状态控制
const usingMermaid = computed({
  get: () => usingPlugin.value?.parameters === 'mermaid',
  set: value => {
    if (value) {
      // 启用mermaid插件
      chatStore.setUsingPlugin({
        pluginName: 'Mermaid流程图',
        description: '支持Mermaid流程图的创建、编辑和查看，轻松可视化流程和关系',
        parameters: 'mermaid',
      })
    } else {
      // 禁用mermaid插件
      chatStore.setUsingPlugin(null)
    }
  },
})

// 添加拖拽相关的处理函数
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
}

const handleDrop = (event: DragEvent) => {
  handleUnifiedFileDrop(event, 'area')
}

// 添加全局拖拽相关的处理函数
const handleDocumentDragOver = (event: DragEvent) => {
  event.preventDefault()
  // 检查是否有文件被拖动
  if (event.dataTransfer?.types.includes('Files')) {
    isFileDraggingOverPage.value = true
  }
}

const handleDocumentDragLeave = (event: DragEvent) => {
  // 只有当拖动到viewport外部时才重置状态
  if (
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight
  ) {
    isFileDraggingOverPage.value = false
  }
}

const handleDocumentDrop = (event: DragEvent) => {
  // 重置拖拽状态
  isFileDraggingOverPage.value = false
  // 如果不是拖到了指定的上传区域，阻止默认行为
  if (!isDragging.value) {
    event.preventDefault()
  }
}

// 添加文件处理的新函数，对特定按钮区域的拖放文件进行处理
const handleFileDropOnButton = async (event: DragEvent, fileType: 'image' | 'document') => {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  const fileArray = Array.from(files)
  const filteredFiles =
    fileType === 'image'
      ? fileArray.filter(file => file.type.startsWith('image/'))
      : fileArray.filter(file => !file.type.startsWith('image/'))

  if (filteredFiles.length === 0) {
    // 提示用户拖放的文件类型与目标不匹配
    if (fileType === 'image') {
      ms.warning('请拖放图片文件到图片上传按钮')
    } else {
      ms.warning('请拖放文档文件到文件上传按钮')
    }
    return
  }

  // 处理符合条件的文件
  for (const file of filteredFiles) {
    if (fileType === 'image') {
      await processImageFile(file)
    } else {
      await processDocumentFile(file)
    }
  }
}

onMounted(async () => {
  chatStore.setPrompt('')

  // 设置焦点
  nextTick(() => {
    if (inputRef.value && !isMobile.value) {
      inputRef.value.focus()
    }
  })
  await queryApps()

  // 添加全局拖拽事件监听
  document.addEventListener('dragover', handleDocumentDragOver)
  document.addEventListener('dragleave', handleDocumentDragLeave)
  document.addEventListener('drop', handleDocumentDrop)

  // 初始化调整宽度
  nextTick(() => {
    if (buttonContainerRef.value) {
      availableWidth.value = buttonContainerRef.value.offsetWidth
    }

    // 创建ResizeObserver来监听容器宽度变化
    containerResizeObserver.value = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === buttonContainerRef.value) {
          availableWidth.value = entry.contentRect.width
        }
      }
    })

    if (buttonContainerRef.value) {
      containerResizeObserver.value.observe(buttonContainerRef.value)
    }
  })
})

onUnmounted(() => {
  // 移除全局拖拽事件监听
  document.removeEventListener('dragover', handleDocumentDragOver)
  document.removeEventListener('dragleave', handleDocumentDragLeave)
  document.removeEventListener('drop', handleDocumentDrop)

  // 组件卸载时取消观察
  if (containerResizeObserver.value && buttonContainerRef.value) {
    containerResizeObserver.value.unobserve(buttonContainerRef.value)
    containerResizeObserver.value.disconnect()
  }
})

// 整合文件拖放处理逻辑
const handleUnifiedFileDrop = async (event: DragEvent, source: 'button' | 'area') => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
  isFileDraggingOverPage.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  // 将FileList转换为数组以便处理
  const fileArray = Array.from(files)

  // 分类文件
  const imageFiles = fileArray.filter(file => file.type.startsWith('image/'))
  const documentFiles = fileArray.filter(file => !file.type.startsWith('image/'))

  // 检查文件类型支持情况
  const canUploadImages = isImageModel.value
  const canUploadDocuments = isFilesModel.value

  // 准备处理的文件数组
  const filesToProcess = []
  const unsupportedFiles = []

  // 检查图片文件
  if (imageFiles.length > 0) {
    if (canUploadImages) {
      filesToProcess.push(...imageFiles)
    } else {
      unsupportedFiles.push(
        ...imageFiles.map(f => ({
          name: f.name,
          reason: '当前模型不支持图片上传',
        }))
      )
    }
  }

  // 检查文档文件
  if (documentFiles.length > 0) {
    if (canUploadDocuments) {
      filesToProcess.push(...documentFiles)
    } else {
      unsupportedFiles.push(
        ...documentFiles.map(f => ({
          name: f.name,
          reason: '当前模型不支持文档上传',
        }))
      )
    }
  }

  // 处理不支持的文件提示
  if (unsupportedFiles.length > 0) {
    // 按类型分组
    const imageCount = unsupportedFiles.filter(f =>
      f.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
    ).length
    const docCount = unsupportedFiles.length - imageCount

    // 生成提示消息
    let message = ''
    if (imageCount > 0 && docCount > 0) {
      message = `无法上传 ${imageCount} 张图片和 ${docCount} 个文档，当前模型不支持`
    } else if (imageCount > 0) {
      message = `无法上传 ${imageCount} 张图片，当前模型不支持图片上传`
    } else if (docCount > 0) {
      message = `无法上传 ${docCount} 个文档，当前模型不支持文档上传`
    }

    if (message) {
      ms.warning(message)
    }
  }

  // 处理可以上传的文件
  for (const file of filesToProcess) {
    if (file.type.startsWith('image/')) {
      await processImageFile(file)
    } else {
      await processDocumentFile(file)
    }
  }
}

// 添加一个计算属性来判断是否显示上传按钮
const showUploadButton = computed(() => {
  return isFilesModel.value || isImageModel.value
})

// 计算上传按钮的提示文本
const uploadButtonTooltip = computed(() => {
  if (isFilesModel.value && isImageModel.value) {
    return '上传文件或图片'
  } else if (isImageModel.value) {
    return '上传图片'
  } else if (isFilesModel.value) {
    return '上传文件'
  }
  return '上传'
})

// 添加计算属性来控制按钮文字的显示
const shouldShowButtonText = computed(() => {
  return availableWidth.value > 300 // 当宽度大于300px时显示按钮文字
})
</script>

<template>
  <div>
    <!-- 移除全屏蒙版 -->

    <!-- before-footer slot -->
    <slot name="before-footer"></slot>

    <!-- Main footer content -->
    <div
      class="flex flex-col items-center justify-center w-full"
      :class="[isMobile ? 'px-3 pb-3' : 'px-2']"
    >
      <footer
        ref="footerRef"
        class="flex flex-col items-center justify-center w-full bg-transparent"
        :class="[dataSources.length > 0 ? 'max-w-4xl' : 'max-w-3xl']"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div
          class="flex w-full border border-gray-400 dark:border-gray-700 hover:ring-1 hover:ring-primary-500 dark:hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:focus-within:ring-primary-500 justify-center items-center flex-col rounded-3xl resize-none px-2 transition-all duration-200"
          :class="{
            'ring-1 ring-primary-500 dark:ring-primary-500': isDragging,
            'bg-gray-50 dark:bg-gray-700/80': isFileDraggingOverPage,
          }"
          :style="{ minHeight: '1.5rem', position: 'relative' }"
        >
          <!-- 移除多余的内部提示层 -->

          <div
            v-if="showSuggestions && !isSelectedApp && searchResults.length !== 0"
            class="w-full z-50 bg-white my-2 px-1 py-1 justify-center items-center flex-col rounded-2xl resize-none dark:bg-gray-800 border border-gray-400 dark:border-gray-700"
            :style="{
              minHeight: '1.5rem',
              position: 'absolute',
              top: props.dataSourcesLength || isMobile ? 'auto' : '100%',
              bottom: props.dataSourcesLength || isMobile ? '100%' : 'auto',
              left: '50%',
              transform: 'translateX(-50%)',
            }"
          >
            <div
              v-if="searchResults.length !== 0"
              v-for="app in searchResults"
              :key="app.id"
              @click="selectApp(app)"
              class="flex items-center bg-white dark:bg-gray-800 hover:bg-opacity py-2 px-2 dark:hover:bg-gray-700 rounded-2xl w-full cursor-pointer duration-150 ease-in-out"
            >
              <div
                class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
              >
                <img
                  v-if="app.coverImg"
                  :src="app.coverImg"
                  alt="Cover Image"
                  class="w-8 h-8 rounded-full flex justify-start"
                />
                <span
                  v-else
                  class="w-8 h-8 text-base font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
                >
                  {{ app.name.charAt(0) }}
                </span>
              </div>

              <h3 class="text-md font-bold text-gray-600 dark:text-primary-500 mr-3 flex-shrink-0">
                {{ app.name }}
              </h3>
              <p class="text-base text-gray-400 dark:text-gray-400 flex-grow truncate">
                {{ app.des }}
              </p>
            </div>
          </div>

          <FilePreview
            :data-base64-list="dataBase64List"
            :file-list="fileList"
            :saved-files="savedFiles"
            :is-selected-app="isSelectedApp"
            :selected-app="selectedApp"
            @clear-data="clearData"
            @clear-select-app="clearSelectApp"
          />
          <!-- 渐变阴影效果 -->

          <div class="relative w-full">
            <!-- 扩展按钮 - 只在内容高度超过阈值时显示 -->
            <div v-if="shouldShowExpandButton" class="absolute right-1 top-2 z-10 group">
              <button
                @click="toggleExpanded"
                class="btn-pill btn-sm"
                :aria-label="isExpanded ? '收起输入框' : '展开输入框'"
              >
                <OffScreen v-if="isExpanded" size="15" />
                <FullScreen v-else size="15" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                {{ isExpanded ? '收起' : '展开' }}
              </div>
            </div>

            <!-- 拖拽提示覆盖层 - 替代文本区域 -->
            <div
              v-if="isFileDraggingOverPage"
              class="h-20 flex items-center justify-center my-2 w-full"
            >
              <div class="flex flex-col items-center justify-center">
                <AddPicture
                  size="28"
                  class="mb-2"
                  :class="
                    isDragging
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                />
                <p
                  class="text-center text-sm"
                  :class="
                    isDragging
                      ? 'text-primary-600 dark:text-primary-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                >
                  {{ isDragging ? '松开鼠标开始上传' : '拖放文件到这里上传' }}
                </p>
              </div>
            </div>

            <!-- 文本区域 - 非拖拽状态显示 -->
            <textarea
              v-show="!isFileDraggingOverPage"
              ref="inputRef"
              v-model="prompt"
              :placeholder="placeholderText"
              class="flex flex-grow items-center justify-center mt-3 mb-2 w-full placeholder:text-gray-400 dark:placeholder:text-gray-500 text-base resize-none dark:text-gray-400 px-2 bg-transparent custom-scrollbar transition-all duration-300 ease-in-out"
              @input="autoResize"
              @keypress="handleEnter"
              @keyup="handleInput"
              @paste="handlePaste"
              :style="{
                maxHeight: isExpanded ? 'none' : '30vh',
                minHeight: '4rem',
              }"
              aria-label="聊天消息输入框"
              role="textbox"
            ></textarea>
          </div>

          <!-- 按钮容器 -->
          <div ref="buttonContainerRef" class="flex justify-between flex-grow w-full pb-2">
            <!-- 文件上传按钮区域 -->
            <div class="flex justify-start items-center">
              <!-- 统一的文件/图片上传按钮 -->
              <div
                v-if="showUploadButton && !isUploading"
                class="group relative"
                @dragover.prevent="
                  e => {
                    e.stopPropagation()
                    isDragging = true
                  }
                "
                @dragleave.prevent="
                  e => {
                    e.stopPropagation()
                    isDragging = false
                  }
                "
                @drop.prevent="
                  e => {
                    e.stopPropagation()
                    isDragging = false
                    isFileDraggingOverPage = false
                    handleUnifiedFileDrop(e, 'button')
                  }
                "
              >
                <button
                  type="button"
                  class="btn-pill mx-1"
                  @click="triggerUpload"
                  :aria-label="uploadButtonTooltip"
                >
                  <Plus size="15" />
                </button>
                <div v-if="!isMobile" class="tooltip tooltip-top">{{ uploadButtonTooltip }}</div>
              </div>

              <LoadingFour
                v-if="isUploading"
                size="15"
                class="p-1 mx-2 animate-rotate text-gray-500 dark:text-gray-500"
              />

              <!-- 隐藏的文件输入框 - 保持原有的两个input，但共用同一个按钮触发 -->
              <input ref="fileInput" type="file" class="hidden" @change="handleFileSelect" />
              <input
                ref="imageInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleImageSelect"
              />

              <div v-if="shouldShowDeepThinking" class="group relative">
                <div
                  class="btn-pill btn-md mx-1"
                  :class="[usingDeepThinking ? 'btn-pill-active' : '']"
                  @click="usingDeepThinking = !usingDeepThinking"
                  role="button"
                  :aria-pressed="usingDeepThinking"
                  aria-label="启用或禁用推理功能"
                  tabindex="0"
                >
                  <TwoEllipses size="15" />
                  <span v-if="shouldShowButtonText" class="ml-1">推理</span>
                </div>
                <div v-if="!isMobile" class="tooltip tooltip-top">
                  AI 推理能力，帮助寻找更深层次的答案
                </div>
              </div>

              <div v-if="shouldShowNetworkSearch" class="group relative">
                <div
                  class="btn-pill btn-md mx-1"
                  :class="[usingNetwork ? 'btn-pill-active' : '']"
                  @click="usingNetwork = !usingNetwork"
                  role="button"
                  :aria-pressed="usingNetwork"
                  aria-label="启用或禁用网络搜索"
                  tabindex="0"
                >
                  <Sphere size="15" />
                  <span v-if="shouldShowButtonText" class="ml-1">搜索</span>
                </div>
                <div v-if="!isMobile" class="tooltip tooltip-top">启用网络搜索，获取最新信息</div>
              </div>

              <div v-if="shouldShowMermaidTool" class="group relative">
                <div
                  class="btn-pill btn-md mx-1"
                  :class="[usingMermaid ? 'btn-pill-active' : '']"
                  @click="usingMermaid = !usingMermaid"
                  role="button"
                  :aria-pressed="usingMermaid"
                  aria-label="启用或禁用流程图功能"
                  tabindex="0"
                >
                  <TreeDiagram size="15" />
                  <span v-if="shouldShowButtonText" class="ml-1">图表</span>
                </div>
                <div v-if="!isMobile" class="tooltip tooltip-top">
                  启用图表功能，支持Mermaid图表绘制
                </div>
              </div>
            </div>

            <div class="flex justify-end items-center mr-1">
              <!-- 当不在加载状态时显示这个按钮，用于提交 -->
              <div v-if="!isStreamIn" class="group relative">
                <button
                  type="button"
                  class="btn-send"
                  :class="{ 'opacity-60 cursor-not-allowed': buttonDisabled, 'h-8 w-8': isMobile }"
                  :disabled="buttonDisabled"
                  @click="handleSubmit()"
                  aria-label="发送消息"
                >
                  <SendOne size="15" />
                </button>
                <div v-if="!isMobile" class="tooltip tooltip-top">发送</div>
              </div>

              <!-- 当在加载状态时显示这个按钮，用于停止 -->
              <div v-if="isStreamIn" class="group relative">
                <button
                  type="button"
                  class="btn-stop"
                  :class="{ 'h-8 w-8': isMobile }"
                  @click="handleStop()"
                  aria-label="停止生成"
                >
                  <Square size="16" />
                </button>
                <div v-if="!isMobile" class="tooltip tooltip-top">停止生成</div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>

    <!-- after-footer slot -->
    <slot name="after-footer"></slot>
  </div>
</template>
