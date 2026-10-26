<script setup lang="ts">
// Login 保持静态导入：未登录强制弹出属首屏关键路径，不允许懒加载延迟
import Login from '@/components/Login/Login.vue'
import PackSlot from '@/components/common/PackSlot.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import { localStore } from '@/utils/storage'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import ChatBase from './chatBase.vue'
import { useOverlayHashState } from './composables/useOverlayHashState'

// 弹窗 / 工作台异步组件化：移出聊天主 chunk，首次渲染时再拉取对应 chunk。
// 全部仅经 props / v-model 控制（无模板 ref / expose 依赖），异步化安全；
// 均为遮罩层弹窗，无需 loading 占位。
// chunk 拉取失败（弱网 / 资源缺失）时给用户可见提示，弹窗保持未打开状态不影响主界面
function reportDialogChunkError(error: unknown): never {
  ms.error(t('common.genericErrorRetry'))
  throw error
}
const ContentViolationDialog = defineAsyncComponent(() =>
  import('@/components/Dialog/ContentViolationDialog.vue').catch(reportDialogChunkError)
)
const MarkdownDialog = defineAsyncComponent(() =>
  import('@/components/common/MarkdownDialog.vue').catch(reportDialogChunkError)
)
const SettingsDialog = defineAsyncComponent(() =>
  import('@/components/SettingsDialog.vue').catch(reportDialogChunkError)
)
const ms = message()
const appStore = useAppStore()
const authStore = useAuthStore()
useOverlayHashState()
const { isMobile } = useViewport()
const showNoticeModal = ref(false)
const isAutoOpenNotice = computed(() => Number(authStore.globalConfig?.isAutoOpenNotice) === 1)

/** 宽屏时给侧栏让出位置（展开 260px，收起后留 56px 图标列）；窄屏侧栏浮在内容上方，不留位 */
const sidebarInset = computed(() => {
  if (isMobile.value) return ''
  return appStore.siderCollapsed ? 'pl-14' : 'pl-[260px]'
})

onMounted(() => {
  // 会话路由下 getUserInfo 由 chatBase.vue 的 onMounted 引导；

  // 检测公告
  checkNotice()
})

const useGlobalStore = useGlobalStoreWithOut()
const loginDialog = computed(() => authStore.loginDialog)
const contentViolationDialog = computed(() => useGlobalStore.contentViolationDialog)
const settingsDialog = computed(() => useGlobalStore.settingsDialog)

/**
 * 公告检测逻辑
 * 检查是否需要显示公告弹窗
 */
function checkNotice() {
  // 获取存储的公告信息
  const storedNoticeData = localStore.get('noticeData')
  const currentNoticeContent = authStore.globalConfig?.noticeInfo || ''

  // 如果没有公告内容，直接返回
  if (!currentNoticeContent) {
    return
  }

  // 生成当前公告的唯一标识（基于标题和内容）
  const currentNoticeHash = getNoticeHash()

  // 检查是否需要显示公告
  let shouldShowNotice = false

  if (storedNoticeData) {
    const { hash, doNotRemindUntil } = storedNoticeData

    // 如果公告内容变化了，需要显示
    if (hash !== currentNoticeHash) {
      shouldShowNotice = true
    }
    // 如果内容没变但是提醒时间已过，也需要显示
    else if (doNotRemindUntil && Date.now() > Number(doNotRemindUntil)) {
      shouldShowNotice = true
      // 清理过期的缓存数据
      localStore.remove('noticeData')
    }
  } else {
    // 没有存储记录，需要显示
    shouldShowNotice = true
  }

  // 如果开启了自动弹出且需要显示，则显示公告
  if (shouldShowNotice && isAutoOpenNotice.value) {
    showNoticeModal.value = true
  }
}

/** 当前公告的唯一标识：标题 + 内容前 100 字，与「7 天不再提醒」缓存里的 hash 比对 */
function getNoticeHash() {
  const currentNoticeTitle = authStore.globalConfig?.noticeTitle || ''
  const currentNoticeContent = authStore.globalConfig?.noticeInfo || ''
  return `${currentNoticeTitle}_${currentNoticeContent}`.slice(0, 100)
}

/** 关闭公告：只有勾选了「7 天不再提醒」才写缓存 */
function handleNoticeClose({ doNotRemind }: { doNotRemind: boolean }) {
  if (!doNotRemind) return
  localStore.set('noticeData', {
    hash: getNoticeHash(),
    doNotRemindUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })
}
</script>

<template>
  <div class="ds-chat-shell h-full">
    <div
      class="ds-chat-frame h-full overflow-hidden rounded-none"
      :class="isMobile ? 'shadow-none' : 'shadow-md'"
    >
      <div class="ds-chat-main chat-layout-offset h-full flex" :class="sidebarInset">
        <ChatBase class="w-full flex-1" />
      </div>
    </div>
    <div class="overflow-hidden">
      <Login :visible="loginDialog" />
      <ContentViolationDialog :visible="contentViolationDialog" />
      <!-- 扩展包的全局弹窗（chat.dialog 挂载点），可见性由各包自己的 store 控制 -->
      <PackSlot name="chat.dialog" />
      <MarkdownDialog
        v-model:visible="showNoticeModal"
        :title="authStore.globalConfig?.noticeTitle || t('common.platformNotice')"
        :content="authStore.globalConfig?.noticeInfo || ''"
        :confirm-text="t('common.confirm')"
        show-do-not-remind
        @close="handleNoticeClose"
      />

      <!-- 设置弹窗与其余对话框同层管理；桌面与手机同一个组件，跨过断点时保持打开 -->
      <SettingsDialog :visible="settingsDialog" />
    </div>
  </div>
</template>
