import type { ResData } from '@/api/types'
import { qrPollFailureReason, useQrScanFlow } from '@/composables/useQrScanFlow'
import { t } from '@/locales'
import {
  fetchWeixinBotBindStatus,
  fetchWeixinBotConfirmBind,
  fetchWeixinBotQrCode,
} from './api/weixinBot'

/**
 * 微信 Bot 扫码绑定：取码、每 3 秒查一次、60 秒过期，扫码确认后调用确认绑定；
 * 设置页面板与弹窗共用。确认失败停在「失败」并给出刷新（以前会停在「正在绑定」只能返回重进）。
 */
export function useWeixinBotScan(options: {
  active: () => boolean
  onBound: () => Promise<void> | void
}) {
  return useQrScanFlow({
    active: options.active,
    intervalMs: 3000,
    maxSeconds: 60,
    async load() {
      const res: ResData = await fetchWeixinBotQrCode()
      if (!res.success) throw new Error(res.message || t('settings.getWeixinBotQrCodeFailed'))
      return { id: res.data.sessionId, qrUrl: res.data.qrData }
    },
    async poll(ticket) {
      const res: ResData = await fetchWeixinBotBindStatus(ticket.id)
      if (!res.success) return null
      const status = String(res.data?.status || '')
      if (status === 'scanned' || status === 'expired' || status === 'confirmed') {
        return { status } as { status: 'scanned' | 'expired' | 'confirmed' }
      }
      return { status: 'pending' }
    },
    async onConfirmed(_result, ticket) {
      const res: ResData = await fetchWeixinBotConfirmBind({ sessionId: ticket.id })
      if (!res.success) throw new Error(res.message || t('settings.bindConfirmFailed'))
      await options.onBound()
    },
    // 服务端明确拒绝是终态（401 由请求层提示过，这里不再给原因）；网络抖动继续轮询
    isTerminalError: error => qrPollFailureReason(error, t('settings.weixinBotBindStatusFailed')),
  })
}
