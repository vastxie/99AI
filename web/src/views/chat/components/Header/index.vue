<script lang="ts" setup>
import { CircleUser, PanelRight, RefreshCw, SquarePen } from '@lucide/vue'
import { computed } from 'vue'
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import AccountMenu from '../Sider/AccountMenu.vue'
import { useConversationNavigator } from '../../composables/useConversationNavigator'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    conversationTitle?: string
    showHomeBrand?: boolean
  }>(),
  {
    conversationTitle: '',
    showHomeBrand: false,
  }
)

const globalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const authStore = useAuthStore()
const { isMobile } = useViewport()

const collapsed = computed(() => appStore.siderCollapsed)
const isPreviewerVisible = computed(() => globalStore.rightPreviewPanel !== null)
const showMobileSidebarToggle = computed(
  () => isMobile.value && collapsed.value && !isPreviewerVisible.value
)
const siteName = computed(() => authStore.globalConfig?.siteName || '')
// 首页品牌补位仅限桌面侧栏收起场景；移动端欢迎区标题自带 logo，页头不再重复展示
const showHomeBrandMark = computed(
  () =>
    props.showHomeBrand &&
    !props.conversationTitle &&
    Boolean(siteName.value) &&
    !isMobile.value &&
    collapsed.value
)

function openMobileSidebar() {
  appStore.setSiderCollapsed(false)
}

// 手机上在会话里时，页头给出新对话入口，不用先打开侧栏
const navigation = useConversationNavigator()
const showMobileNewChat = computed(() => isMobile.value && Boolean(props.conversationTitle))

// 移动端右上角头像菜单：设置 / 会员 / 文件的快捷入口
const authIdentityPending = computed(
  () => authStore.isLogin && !String(authStore.userInfo?.id || '') && !authStore.userInfoResolved
)
const authIdentityFailed = computed(
  () =>
    authStore.isLogin &&
    !String(authStore.userInfo?.id || '') &&
    authStore.userInfoResolved &&
    authStore.userInfoLoadFailed
)
const isLoggedInUser = computed(() => authStore.isLogin && authStore.userInfo?.role !== 'visitor')

function openLoginDialog() {
  authStore.setLoginDialog(true)
}

async function retryAuthIdentity() {
  try {
    await authStore.getUserInfo()
  } catch {
    // 保留可重试入口；请求层已经呈现当前网络 / 服务错误。
  }
}
</script>

<template>
  <header
    class="chat-header sticky top-0 left-0 right-0 z-header text-text-primary"
    v-bind="$attrs"
  >
    <div class="relative flex h-full min-w-0 items-center">
      <div
        class="flex h-full w-full items-center justify-between"
        :class="{ 'px-4': !isMobile, 'px-2': isMobile }"
      >
        <div class="flex h-full min-w-0 flex-1 items-center gap-2">
          <!-- v-show 而不是 v-if：抽屉关闭后焦点要还给这个按钮，它得一直在 -->
          <Transition name="sidebar-header-toggle">
            <div v-show="showMobileSidebarToggle" class="relative group mx-1">
              <ActionIcon
                :label="t('common.expandSidebar')"
                :tooltip="t('common.expandSidebar')"
                aria-controls="chat-sidebar"
                :aria-expanded="!collapsed"
                tooltip-placement="bottom"
                @click="openMobileSidebar"
              >
                <PanelRight :size="22" aria-hidden="true" />
              </ActionIcon>
            </div>
          </Transition>

          <!-- 对话中：标题作为页头锚点 -->
          <div v-if="conversationTitle" class="min-w-0 flex-1">
            <span class="type-control block truncate text-text-secondary">
              {{ conversationTitle }}
            </span>
          </div>

          <!-- 首页且桌面侧栏收起：品牌补位 -->
          <div v-else-if="showHomeBrandMark" class="flex min-w-0 items-center gap-2">
            <span class="truncate text-lg font-semibold text-text-primary">
              {{ siteName }}
            </span>
          </div>
        </div>
        <div class="ml-auto flex h-full flex-shrink-0 items-center gap-1.5">
          <ActionIcon
            v-if="showMobileNewChat"
            :label="t('common.newConversation')"
            @click="navigation.startNewConversation()"
          >
            <SquarePen :size="20" aria-hidden="true" />
          </ActionIcon>
          <!-- 移动端：头像菜单（未登录时点头像直接拉起登录） -->
          <template v-if="isMobile">
            <button
              v-if="authIdentityPending"
              type="button"
              class="avatar avatar-md avatar-bordered avatar-primary"
              :aria-label="t('common.loading')"
              aria-busy="true"
              disabled
            >
              <CircleUser :size="20" class="animate-pulse text-inherit" aria-hidden="true" />
            </button>

            <button
              v-else-if="authIdentityFailed"
              type="button"
              class="avatar avatar-md avatar-bordered avatar-primary"
              :aria-label="t('common.retry')"
              @click="retryAuthIdentity"
            >
              <RefreshCw :size="19" class="text-inherit" aria-hidden="true" />
            </button>

            <button
              v-else-if="!isLoggedInUser"
              type="button"
              class="avatar avatar-md avatar-bordered avatar-primary"
              :aria-label="t('common.accountManagement')"
              @click="openLoginDialog"
            >
              <CircleUser :size="20" class="text-inherit" aria-hidden="true" />
            </button>

            <AccountMenu v-else compact menu-position="auto" />
          </template>
        </div>
      </div>
    </div>
  </header>
</template>
