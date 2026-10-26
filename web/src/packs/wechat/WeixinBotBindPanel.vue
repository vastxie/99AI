<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import QrScanCard from '@/components/common/QrScanCard.vue'
import SettingsSubViewHeader from '@/components/Settings/SettingsSubViewHeader.vue'
import { useConversationNavigator } from '@/views/chat/composables/useConversationNavigator'
import type { ResData } from '@/api/types'
import { emitWeixinBotStatus } from './events'
import { t } from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { message } from '@/utils/message'
import { fetchWeixinBotUnbind } from './api/weixinBot'
import { useWeixinBotBindStatus, type WeixinBotStatusPayload } from './useWeixinBotBindStatus'
import { useWeixinBotScan } from './useWeixinBotScan'

/** 账号页里的微信 Bot 绑定视图：扫码绑定 / 查看会话 / 解绑 */
const WEIXIN_CHANNEL = 'weixin'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const ms = message()
const navigation = useConversationNavigator()
const chatStore = useChatStore()
const { bound, apply, query, subscribe, unsubscribe } = useWeixinBotBindStatus()

/** 绑定状态查到之前不取码；未绑定时显示二维码，解绑后自动换一张 */
const statusKnown = ref(false)
const scan = useWeixinBotScan({
  active: () => statusKnown.value && !bound.value,
  async onBound() {
    ms.success(t('settings.weixinBotBindSuccessWithHint'))
    await refreshSurfaces({ bound: true, status: 1 })
  },
})

/** 绑定关系变化后：同步其它入口，并刷新渠道会话列表 */
async function refreshSurfaces(payload: WeixinBotStatusPayload) {
  apply(payload)
  emitWeixinBotStatus(payload)
  try {
    await chatStore.queryMyGroup({ reset: true })
  } catch {}
}

async function unbind() {
  try {
    const wasInWeixinChannel = chatStore.getActiveChannel() === WEIXIN_CHANNEL
    const res: ResData = await fetchWeixinBotUnbind()
    if (!res.success) {
      ms.error(res.message || t('settings.unbindFailed'))
      return
    }
    ms.success(t('settings.weixinBotUnboundSuccess'))
    await refreshSurfaces({ bound: false, status: 0 })
    if (wasInWeixinChannel) await navigation.leaveConversation()
  } catch (error: any) {
    ms.error(error?.message || t('settings.unbindFailed'))
  }
}

async function openConversation() {
  try {
    if (!navigation.canNavigate()) return
    const workspaceId = await chatStore.resolveLatestChannelWorkspace(WEIXIN_CHANNEL)
    if (!workspaceId) {
      ms.warning(t('settings.weixinBotConversationNotFound'))
      return
    }
    // 打开会话时会一并关掉设置弹窗
    await navigation.openConversation(workspaceId, { checkLock: false })
    emit('back')
  } catch (error: any) {
    ms.error(error?.message || t('common.operationFailed'))
  }
}

onMounted(async () => {
  subscribe()
  await query()
  statusKnown.value = true
})

onBeforeUnmount(unsubscribe)
</script>

<template>
  <div class="p-2">
    <div class="settings-card mb-4 p-4">
      <SettingsSubViewHeader :title="t('settings.weixinBotBinding')" @back="emit('back')" />

      <!-- 已绑定状态 -->
      <div v-if="bound" class="settings-subtle-card overflow-hidden p-0">
        <button
          type="button"
          class="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-btn-ghost-hover"
          @click="openConversation"
        >
          <span class="settings-field-title">
            {{ t('settings.viewWeixinBotConversation') }}
          </span>
          <ChevronRight :size="16" class="text-text-muted" />
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between border-t border-app-divider px-4 py-4 text-left transition-colors hover:bg-btn-ghost-hover"
          @click="unbind"
        >
          <span class="settings-field-title">
            {{ t('settings.unbind') }}
          </span>
        </button>
      </div>

      <!-- 未绑定状态 -->
      <div v-else>
        <QrScanCard
          class="min-h-[232px] px-5 py-4"
          :qr-url="scan.qrUrl.value"
          :phase="scan.phase.value"
          :message="scan.message.value"
          :hint="t('settings.scanQrCodeWithWechat')"
          :confirming-text="t('settings.binding')"
          :done-text="t('settings.bindSuccess')"
          @refresh="scan.refresh"
        />
      </div>
    </div>
  </div>
</template>
