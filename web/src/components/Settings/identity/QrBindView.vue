<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref } from 'vue'
import { fetchQrPollAPI, fetchQrSceneAPI } from '@/api/user'
import QrScanCard from '@/components/common/QrScanCard.vue'
import { useQrScanFlow } from '@/composables/useQrScanFlow'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import SettingsSubViewHeader from '../SettingsSubViewHeader.vue'

/** 通用的「扫码绑定」视图：任何 qr 类型登录方式共用，走内核 scene / poll 路由 */
const props = defineProps<{
  provider: string
  displayName: string
}>()
const emit = defineEmits<{
  back: []
  done: []
}>()

const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const ms = message()
const globalConfig = computed(() => authStore.globalConfig)
const needAgreement = computed(() => Number(globalConfig.value.isAutoOpenAgreement) === 1)

/** 设置页签切走时（keep-alive 收起）停止轮询，切回来重新取码 */
const shown = ref(true)
onActivated(() => (shown.value = true))
onDeactivated(() => (shown.value = false))

const scan = useQrScanFlow({
  active: () => shown.value,
  async load() {
    const res = await fetchQrSceneAPI(props.provider, { scene: 'bind' })
    if (!res.success || !res.data?.sceneId) {
      throw new Error(res.message || t('settings.getQrCodeFailed'))
    }
    return { id: res.data.sceneId, qrUrl: res.data.qrUrl, expiresIn: res.data.expiresIn }
  },
  async poll(ticket) {
    const res = await fetchQrPollAPI(props.provider, { sceneId: ticket.id, scene: 'bind' })
    return res.success ? res.data : null
  },
  onConfirmed(result) {
    ms.success((typeof result.message === 'string' && result.message) || t('settings.bindSuccess'))
    emit('done')
  },
})

function openAgreement() {
  globalStore.updateUserAgreementDialog(true)
}
</script>

<template>
  <div class="p-2">
    <div class="settings-card mb-4 p-4">
      <SettingsSubViewHeader
        :title="t('settings.bindMethod', { name: displayName })"
        @back="emit('back')"
      />
      <QrScanCard
        class="min-h-[232px] px-5 py-4"
        :qr-url="scan.qrUrl.value"
        :phase="scan.phase.value"
        :message="scan.message.value"
        :hint="t('settings.scanToBindWith', { name: displayName })"
        @refresh="scan.refresh"
      />
      <!-- 与登录一致：继续即同意，不放默认勾选的复选框 -->
      <p v-if="needAgreement" class="type-caption mt-4 text-text-muted">
        {{ t('login.continueMeansAgree') }}
        <a href="#" class="fg-link" @click.prevent="openAgreement">{{
          t('common.bookTitle', { title: globalConfig.agreementTitle })
        }}</a>
      </p>
    </div>
  </div>
</template>
