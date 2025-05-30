<script lang="ts" setup>
import { fetchQueryOneCatAPI } from '@/api/appStore'
import { fetchUpdateGroupAPI } from '@/api/group'
import { fetchQueryModelsListAPI } from '@/api/models'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import {
  Brightness,
  CheckOne,
  Close,
  DarkMode,
  EditTwo,
  ExpandLeft,
  Right,
} from '@icon-park/vue-next'
import { computed, inject, onMounted, ref, Ref, watch } from 'vue'

interface ModelOption {
  label: string
  value: string
  modelDescription: string
  modelAvatar: string
}

interface Model {
  isFileUpload: any
  isImageUpload: any
  modelName: string
  model: string
  deductType: number
  keyType: number
  deduct: number
  modelAvatar: string
  modelDescription: string
  isNetworkSearch: any
  isMcpTool: any
  deepThinkingType: any
}

interface ExternalLink {
  icon?: string
  name?: string
  [key: string]: any
}

const useGlobalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const chatStore = useChatStore()
const modelOptions: Ref<ModelOption[]> = ref([])
const appDetail: any = ref(null)
const dataSources = computed(() => chatStore.groupList)
const collapsed = computed(() => appStore.siderCollapsed)
const chatGroupId = computed(() => chatStore.active)
const darkMode = computed(() => appStore.theme === 'dark')

const { isMobile } = useBasicLayout()
const isHovering = ref(false)
const isMenuOpen = ref(false)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const listSources = computed(() => chatStore.chatList)

// 计算预览器状态
const isPreviewerVisible = computed(
  () =>
    useGlobalStore.showHtmlPreviewer ||
    useGlobalStore.showTextEditor ||
    useGlobalStore.showImagePreviewer
)

// 计算应用广场状态
const isAppListVisible = computed(() => useGlobalStore.showAppListComponent)
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

function checkMode() {
  const mode = darkMode.value ? 'light' : 'dark'
  appStore.setTheme(mode)
}

const activeModel = computed(() => String(configObj?.value?.modelInfo?.model ?? ''))
/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

let modelMapsCache: any = ref({})
let modelTypeListCache: any = ref([])

watch(
  activeAppId,
  val => {
    if (val) queryAppDetail(val)
    else appDetail.value = null
  },
  { immediate: true }
)

/* 查询当前app详情提示用户使用 */
async function queryAppDetail(id: number) {
  const res: any = await fetchQueryOneCatAPI({ id })
  appDetail.value = res.data
}

const notSwitchModel = computed(() => {
  return (
    activeGroupInfo?.value?.appId &&
    (configObj.value.modelInfo?.isFixedModel === 1 ||
      configObj.value.modelInfo?.isGPTs === 1 ||
      configObj.value.modelInfo?.isFlowith === 1)
  )
})

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

async function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

// 关闭应用广场
function closeAppList() {
  useGlobalStore.updateShowAppListComponent(false)
  // 在移动端不自动展开侧边栏
  if (!isMobile.value) {
    appStore.setSiderCollapsed(false)
  }
}

/* 修改对话组模型配置 */
async function switchModel(option: any) {
  chatStore.setUsingDeepThinking(false)
  chatStore.setUsingNetwork(false)
  chatStore.setUsingPlugin(null)
  const { modelInfo, fileInfo } = chatStore.activeConfig

  const { isGPTs, isFixedModel, modelName, isFlowith } = modelInfo

  const config = {
    modelInfo: {
      keyType: option.keyType,
      modelName: (activeGroupInfo?.value?.appId ? modelName : option.label) || '', // 更明确的条件
      model: option.value,
      deductType: option.deductType,
      deduct: option.deduct,
      isFileUpload: option.isFileUpload,
      isImageUpload: option.isImageUpload,
      isNetworkSearch: option.isNetworkSearch,
      deepThinkingType: option.deepThinkingType,
      isMcpTool: option.isMcpTool,
      modelAvatar: option.modelAvatar || '',
      isGPTs, // 简化赋值
      isFlowith, // 简化赋值
      isFixedModel, // 简化赋值
    },
    fileInfo: fileInfo || {}, // 确保 fileInfo 为空时不出错
  }

  const params = {
    groupId: chatGroupId.value,
    config: JSON.stringify(config),
  }
  await fetchUpdateGroupAPI(params)
  await chatStore.queryMyGroup()
  // useGlobalStore.updateModelDialog(false);
}

async function queryModelsList() {
  try {
    const res: any = await fetchQueryModelsListAPI()
    if (!res.success) return
    const { modelMaps, modelTypeList } = res.data
    modelMapsCache.value = modelMaps
    modelTypeListCache.value = modelTypeList
    // 使用类型断言来告诉 TypeScript flatModelArray 是 Model[] 类型
    const flatModelArray = Object.values(modelMaps).flat() as Model[]
    const filteredModelArray = flatModelArray.filter(model => model.keyType === 1)
    modelOptions.value = filteredModelArray.map(model => ({
      label: model.modelName,
      value: model.model,
      deductType: model.deductType,
      keyType: model.keyType,
      deduct: model.deduct,
      isFileUpload: model.isFileUpload,
      isImageUpload: model.isImageUpload,
      isNetworkSearch: model.isNetworkSearch,
      deepThinkingType: model.deepThinkingType,
      isMcpTool: model.isMcpTool,
      modelAvatar: model.modelAvatar,
      modelDescription: model.modelDescription,
    }))
  } catch (error) {}
}

// 在mounted时查询模型列表
onMounted(() => {
  queryModelsList()
})

const externalLinkActive = computed(
  () => useGlobalStore.externalLinkDialog && useGlobalStore.currentExternalLink
)
const currentExternalLink = computed(() => {
  const link = useGlobalStore.currentExternalLink
  return (typeof link === 'object' ? link : {}) as ExternalLink
})

// 打开文本编辑器
const openTextEditor = () => {
  useGlobalStore.updateTextEditor(true)
}

// 添加一个新的方法来处理模型选择
function handleModelSelect(option: any) {
  switchModel(option)
}

function openSettings(tab?: number) {
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, tab)
    appStore.setSiderCollapsed(true)
  } else {
    useGlobalStore.updateSettingsDialog(true, tab)
  }
}
</script>

<template>
  <header class="sticky top-0 left-0 right-0 z-30 dark:border-neutral-800 h-16 select-none">
    <div class="relative flex items-center justify-center min-w-0 h-full">
      <div class="flex w-full h-full items-center" :class="{ 'px-4': !isMobile, 'px-2': isMobile }">
        <div
          v-if="collapsed && !externalLinkActive && !isPreviewerVisible"
          class="relative group mx-1"
        >
          <button
            type="button"
            class="btn-icon btn-md"
            @click="handleUpdateCollapsed"
            aria-label="展开侧边栏"
          >
            <ExpandLeft size="22" />
          </button>
          <!-- 悬停提示 - 展开侧边栏 -->
          <div v-if="!isMobile" class="tooltip tooltip-right">展开侧栏</div>
        </div>

        <!-- pc -->
        <div class="flex justify-between items-center h-full w-full">
          <!-- 当外部链接激活时显示链接信息，否则显示模型选择 -->
          <div
            v-if="externalLinkActive"
            class="relative flex-1 flex ele-drag items-center justify-between h-full"
          >
            <div class="py-1 flex items-center space-x-2">
              <img
                v-if="currentExternalLink && currentExternalLink.icon"
                :src="currentExternalLink.icon"
                alt="网站图标"
                class="w-6 h-6 rounded-lg object-cover"
              />
              <div v-else class="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center">
                <span class="text-xs">{{ currentExternalLink?.name?.charAt(0) || '?' }}</span>
              </div>
              <span
                class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate whitespace-nowrap overflow-hidden max-w-[30vw]"
              >
                {{ currentExternalLink?.name || '外部链接' }}
              </span>
            </div>
          </div>

          <!-- 不可切换模型状态，使用与可切换模型相同的样式 -->
          <div v-else-if="notSwitchModel" class="flex-1 flex items-center">
            <div class="menu menu-md relative">
              <button class="menu-trigger" aria-label="当前对话" disabled>
                <span class="truncate whitespace-nowrap overflow-hidden max-w-[30vw]">
                  {{ activeGroupInfo?.title || '新对话' }}
                </span>
              </button>
            </div>
          </div>

          <!-- 使用通用下拉菜单组件 -->
          <div v-else class="flex-1 flex items-center">
            <DropdownMenu v-model="isMenuOpen" position="bottom-left" max-height="40vh">
              <template #trigger>
                <button
                  class="menu-trigger"
                  @mouseover="isHovering = true"
                  @mouseleave="isHovering = false"
                  aria-label="选择模型"
                >
                  <span class="truncate whitespace-nowrap overflow-hidden max-w-[50vw]">
                    {{ configObj?.modelInfo?.modelName || '新对话' }}
                  </span>
                  <Right
                    v-if="isHovering || isMobile || isMenuOpen"
                    size="20"
                    class="ml-2 justify-center items-center flex-shrink-0"
                    :class="{
                      'text-base font-bold': isMobile,
                      'text-sm': !isMobile,
                    }"
                    aria-hidden="true"
                  />
                </button>
              </template>
              <template #menu="{ close }">
                <div>
                  <div
                    v-for="(option, index) in modelOptions"
                    :key="index"
                    class="menu-item menu-item-md"
                    :class="{ 'menu-item-active': activeModel === option.value }"
                    @click="
                      () => {
                        handleModelSelect(option)
                        close()
                      }
                    "
                    role="menuitem"
                    tabindex="0"
                    :aria-label="`选择${option.label}模型`"
                  >
                    <div class="avatar avatar-md">
                      <img
                        v-if="option.modelAvatar"
                        :src="option.modelAvatar"
                        :alt="`${option.label}模型图标`"
                        class="w-full h-full object-cover"
                      />
                      <span v-else>
                        {{ option.label.charAt(0) }}
                      </span>
                    </div>
                    <div class="menu-item-content">
                      <div class="menu-item-title">
                        {{ option.label }}
                      </div>
                      <div v-if="option.modelDescription" class="menu-item-description">
                        {{ option.modelDescription }}
                      </div>
                    </div>
                    <div class="flex-shrink-0" v-if="activeModel === option.value">
                      <CheckOne
                        theme="filled"
                        size="16"
                        class="text-gray-500 dark:text-gray-400"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </DropdownMenu>
          </div>

          <div class="flex items-center">
            <!-- 主题切换按钮，仅在非外部链接和非预览器状态下显示 -->
            <div v-if="!externalLinkActive && !isPreviewerVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="checkMode()"
                aria-label="切换主题"
              >
                <Brightness v-if="!darkMode" size="20" aria-hidden="true" />
                <DarkMode v-else size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 切换主题 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">切换主题</div>
            </div>

            <!-- 工具链接组件，在非预览器状态、非外部链接状态、非应用广场状态下显示 -->
            <ToolLinks v-if="!externalLinkActive && !isPreviewerVisible && !isAppListVisible" />

            <!-- 文本编辑器按钮 -->
            <div v-if="false" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="openTextEditor"
                aria-label="文本编辑器"
              >
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 文本编辑器 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">文本编辑器</div>
            </div>

            <!-- 外部链接状态下显示关闭按钮，应用广场状态下显示关闭按钮，否则显示新对话按钮 -->
            <div v-if="externalLinkActive" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="
                  () => {
                    useGlobalStore.updateExternalLinkDialog(false)
                    if (!isMobile) {
                      appStore.setSiderCollapsed(false)
                    }
                  }
                "
                aria-label="关闭外部链接"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 关闭 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭</div>
            </div>
            <div v-else-if="isAppListVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="closeAppList"
                aria-label="关闭应用广场"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 关闭 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭</div>
            </div>
            <div v-else-if="!isPreviewerVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="createNewChatGroup()"
                :disabled="listSources.length === 0 && !activeAppId && dataSources.length !== 0"
                aria-label="新建对话"
              >
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 新对话 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">新建对话</div>
            </div>

            <!-- 登录用户 - 直接点击打开设置对话框 -->
            <!-- <div
              v-if="isLogin"
              @click="openSettings(undefined)"
              class="flex items-center cursor-pointer group relative mr-3"
              role="button"
              aria-label="打开设置中心"
              tabindex="0"
            >
              <div
                class="w-8 h-8 ml-1 rounded-full bg-primary-500 overflow-hidden flex items-center justify-center shadow-sm"
              >
                <img
                  v-if="avatar"
                  :src="avatar"
                  class="w-full h-full object-cover"
                  alt="用户头像"
                />
                <User
                  v-if="!avatar"
                  theme="outline"
                  size="18"
                  class="text-white"
                  aria-hidden="true"
                />
              </div>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">设置</div>
            </div> -->
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
