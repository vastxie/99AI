<script setup lang="ts">
import { fetchQrPollAPI, fetchQrSceneAPI } from '@/api/user'
import QrScanCard from '@/components/common/QrScanCard.vue'
import { useQrScanFlow } from '@/composables/useQrScanFlow'
import { t } from '@/locales'
import { IdentityChangedError } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import { message } from '@/utils/message'

/** 通用扫码登录面板：任何注册为 qr 类型的登录方式都走内核的 scene / poll 路由 */
const props = defineProps<{
  provider: string
  displayName: string
  active: boolean
}>()
const emit = defineEmits<{
  loginSuccess: []
}>()

const authStore = useAuthStore()
const ms = message()

const scan = useQrScanFlow({
  active: () => props.active,
  async load() {
    const res = await fetchQrSceneAPI(props.provider, { scene: 'login' })
    if (!res.success || !res.data?.sceneId) throw new Error(res.message || t('common.requestError'))
    return { id: res.data.sceneId, qrUrl: res.data.qrUrl, expiresIn: res.data.expiresIn }
  },
  async poll(ticket) {
    const res = await fetchQrPollAPI(props.provider, { sceneId: ticket.id, scene: 'login' })
    return res.success ? res.data : null
  },
  async onConfirmed(result, ticket) {
    const token = typeof result.token === 'string' ? result.token : ''
    if (!token) throw new Error(t('common.requestError'))
    // 取码之后身份换了（别的入口已经登录、退出或过期）：这次扫码作废
    if (!authStore.commitLogin(token, ticket.identityEpoch ?? -1)) throw new IdentityChangedError()
    // 资料取到才算登录成功；等资料期间身份又变了会抛「身份已变化」，扫码流程按过期处理
    await authStore.getUserInfo()
    ms.success(t('login.loginSuccess'))
    emit('loginSuccess')
  },
})
</script>

<template>
  <QrScanCard
    class="min-h-[290px] px-5 py-6 md:h-full"
    frame-class="login-qr-frame mb-5"
    :qr-url="scan.qrUrl.value"
    :phase="scan.phase.value"
    :message="scan.message.value"
    :hint="t('login.scanWithToLogin', { name: displayName })"
    :confirming-text="t('login.loggingIn')"
    @refresh="scan.refresh"
  />
</template>

<style scoped>
:deep(.login-qr-frame) {
  border: 0;
  background: var(--dialog-qr-paper-bg);
}
</style>
