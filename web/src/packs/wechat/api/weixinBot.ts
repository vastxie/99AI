import type { ApiResponse } from '@/utils/request'
import { get, post } from '@/utils/request'

/* 获取微信Bot绑定二维码（失败显示在二维码卡片上，请求层不另弹提示） */
export function fetchWeixinBotQrCode<T>(): Promise<ApiResponse<T>> {
  return get<T>({ url: '/weixinBot/bind/qrcode', silentError: true })
}

/* 轮询微信Bot绑定二维码状态 */
export function fetchWeixinBotBindStatus<T>(sessionId: string): Promise<ApiResponse<T>> {
  // 轮询失败由调用方分类处理（终态停轮询并提示一次），请求层不要每隔几秒弹一次错误；
  // 服务端对上游是长轮询（最多 35 秒），前端要等得比它久，不然同一张码会有两条长轮询重叠
  return get<T>({
    url: '/weixinBot/bind/status',
    data: { sessionId },
    silentError: true,
    timeout: 45_000,
  })
}

/* 确认绑定微信Bot（失败显示在二维码卡片上，请求层不另弹提示） */
export function fetchWeixinBotConfirmBind<T>(data: { sessionId: string }): Promise<ApiResponse<T>> {
  return post<T>({ url: '/weixinBot/bind/confirm', data, silentError: true })
}

/* 解绑微信Bot */
export function fetchWeixinBotUnbind<T>(): Promise<ApiResponse<T>> {
  return post<T>({ url: '/weixinBot/unbind' })
}

/* 查询微信Bot绑定状态 */
export function fetchWeixinBotStatus<T>(): Promise<ApiResponse<T>> {
  return get<T>({ url: '/weixinBot/status' })
}
