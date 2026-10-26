<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useAppStore } from '@/store/modules/app'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import { useViewport } from '@/hooks/useViewport'
import { emitWeixinBotStatus, onWeixinBotStatus } from './events'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { fetchWeixinBotStatus } from './api/weixinBot'
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { useConversationNavigator } from '@/views/chat/composables/useConversationNavigator'
import WeixinBotBindDialog from './WeixinBotBindDialog.vue'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    hideWhenUnbound?: boolean
  }>(),
  {
    compact: false,
    hideWhenUnbound: false,
  }
)

const authStore = useAuthStore()
const chatStore = useChatStore()
const appStore = useAppStore()
const globalStore = useGlobalStoreWithOut()
const { isMobile } = useViewport()
const ms = message()
const navigation = useConversationNavigator()
const WEIXIN_CHANNEL = 'weixin'

const weixinBotEnabled = computed(() => Number(authStore.globalConfig?.weixinBotStatus) === 1)
const isLoggedIn = computed(() => authStore.isLogin)

const showBindDialog = ref(false)
const weixinBound = ref(false)
const isWeixinConversationActive = computed(() => chatStore.getActiveChannel() === WEIXIN_CHANNEL)

function collapseSidebarOnMobile() {
  if (isMobile.value) {
    appStore.setSiderCollapsed(true)
  }
}

async function navigateToWeixinConversation() {
  if (!navigation.canNavigate()) return

  const workspaceId = await chatStore.resolveLatestChannelWorkspace(WEIXIN_CHANNEL)
  if (!workspaceId) {
    ms.warning(t('settings.weixinBotConversationNotFound'))
    return
  }
  await navigation.openConversation(workspaceId, { checkLock: false })
}

async function refreshWeixinBotState() {
  if (!weixinBotEnabled.value || !isLoggedIn.value) {
    weixinBound.value = false
    return
  }

  try {
    const statusRes: any = await fetchWeixinBotStatus()
    if (statusRes.success) weixinBound.value = statusRes.data.bound
  } catch {}
}

function handleWeixinBotStatusChanged(payload: { bound: boolean }) {
  weixinBound.value = payload.bound
  void refreshWeixinBotState()
}

let stopStatusListener: (() => void) | null = null

onMounted(() => {
  void refreshWeixinBotState()
  stopStatusListener = onWeixinBotStatus(handleWeixinBotStatusChanged)
})

onBeforeUnmount(() => {
  stopStatusListener?.()
  stopStatusListener = null
})

async function handleClick() {
  try {
    if (!navigation.canNavigate()) return

    const statusRes: any = await fetchWeixinBotStatus()
    if (!statusRes.success) return

    if (!statusRes.data.bound) {
      showBindDialog.value = true
      collapseSidebarOnMobile()
      return
    }

    await navigateToWeixinConversation()
  } catch (error: any) {
    ms.error(error?.message || t('common.operationFailed'))
  }
}

function onBindSuccess() {
  showBindDialog.value = false
  weixinBound.value = true
  emitWeixinBotStatus({ bound: true, status: 1 })
  void chatStore.queryMyGroup()
}

const iconColor = computed(() =>
  isWeixinConversationActive.value || weixinBound.value
    ? 'text-semantic-success'
    : 'text-text-subtle'
)

const statusActionText = computed(() =>
  weixinBound.value ? t('settings.unbind') : t('common.bind')
)

function openWeixinBotSettings(event?: MouseEvent) {
  event?.stopPropagation()

  if (!authStore.isLogin || authStore.userInfo?.role === 'visitor') {
    authStore.setLoginDialog(true)
    return
  }

  globalStore.updateAccountSettingsView('weixinBot')
  globalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

const buttonClass = computed(() => {
  if (props.compact) {
    return ['relative', 'fg-quiet hover:bg-btn-ghost-hover']
  }

  return [
    'type-control relative flex w-full items-center gap-3 rounded-lg px-3 py-2 pr-14 transition-colors',
    isWeixinConversationActive.value ? 'bg-app-surface text-text-primary' : 'text-text-primary',
    'hover:bg-btn-ghost-hover',
  ]
})
</script>

<template>
  <div
    v-if="weixinBotEnabled && isLoggedIn && (!props.hideWhenUnbound || weixinBound)"
    :class="props.compact ? 'group relative flex justify-center' : 'group relative flex w-full'"
  >
    <!-- 收起时只剩图标：提示给出名字；展开时文字就在按钮里，不再提示 -->
    <UiTooltip
      :text="props.compact ? t('settings.weixinBot') : ''"
      placement="right"
      :class="{ 'w-full': !props.compact }"
    >
      <UiButton
        :icon="props.compact"
        type="button"
        :class="buttonClass"
        :aria-label="t('settings.weixinBot')"
        @click="handleClick"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          :class="[iconColor, 'shrink-0']"
        >
          <path
            d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05a6.23 6.23 0 0 1-.248-1.753c0-3.694 3.452-6.692 7.706-6.692.349 0 .69.029 1.029.068-.856-3.569-4.66-6.255-9.298-6.255zM5.785 5.991a.96.96 0 0 1 0 1.92.96.96 0 0 1 0-1.92zm5.812 0a.96.96 0 0 1 0 1.92.96.96 0 0 1 0-1.92zm3.2 4.143c-3.677 0-6.66 2.389-6.66 5.335 0 2.946 2.983 5.335 6.66 5.335a8.17 8.17 0 0 0 2.042-.259.7.7 0 0 1 .58.08l1.37.8a.264.264 0 0 0 .135.043.236.236 0 0 0 .234-.237c0-.058-.023-.115-.039-.172l-.28-1.067a.477.477 0 0 1 .172-.538C20.475 18.674 21.46 17.004 21.46 15.13c0-2.946-2.983-5.335-6.66-5.335h-.004zm-2.137 3.151a.776.776 0 1 1 0 1.552.776.776 0 0 1 0-1.552zm4.274 0a.776.776 0 1 1 0 1.552.776.776 0 0 1 0-1.552z"
          />
        </svg>
        <span v-if="!props.compact" class="min-w-0 flex-1 truncate text-left">
          {{ t('settings.weixinBot') }}
        </span>
      </UiButton>
    </UiTooltip>
    <button
      v-if="!props.compact"
      type="button"
      class="weixin-bot-status-action fg-quiet absolute right-2 top-1/2 flex -translate-y-1/2 items-center px-1.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      @click="openWeixinBotSettings"
    >
      {{ statusActionText }}
    </button>
  </div>

  <WeixinBotBindDialog v-model="showBindDialog" @success="onBindSuccess" />
</template>

<style scoped>
.weixin-bot-status-action {
  font-size: var(--type-caption-size);
}
</style>
