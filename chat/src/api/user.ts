import type { Response } from '@/utils/request'
import { get, post } from '@/utils/request'

/* get wechat-login senceStr */
export function fetchGetQRSceneStrAPI<T>(data: {}): Promise<Response<T>> {
  return post<T>({
    url: '/official/getQRSceneStr',
    data,
  })
}

/* get wechat-login qr url */
export function fetchGetQRCodeAPI<T>(data: { sceneStr: string }): Promise<Response<T>> {
  return get<T>({
    url: '/official/getQRCode',
    data,
  })
}

/* login by scenceStr */
export function fetchLoginBySceneStrAPI<T>(data: { sceneStr: string }): Promise<Response<T>> {
  return post<T>({
    url: '/official/loginBySceneStr',
    data,
  })
}

/* login by code */
export function fetchLoginByCodeAPI<T>(data: { code: string }): Promise<Response<T>> {
  return post<T>({
    url: '/official/loginByCode',
    data,
  })
}

/* get wx registery config */
export function fetchGetJsapiTicketAPI<T>(data: { url: string }): Promise<Response<T>> {
  return post<T>({
    url: '/official/getJsapiTicket',
    data,
  })
}

/* get wechat-login senceStr */
export function fetchGetQRSceneStrByBindAPI<T>(): Promise<Response<T>> {
  return post<T>({
    url: '/official/getQRSceneStrByBind',
  })
}

/* bind wx by scenceStr */
export function fetchBindWxBySceneStrAPI<T>(data: { sceneStr: string }): Promise<Response<T>> {
  return post<T>({
    url: '/official/bindWxBySceneStr',
    data,
  })
}

/* get wx rediriect login url */
export function fetchWxLoginRedirectAPI<T>(data: { url: string }): Promise<Response<T>> {
  return post<T>({
    url: '/official/getRedirectUrl',
    data,
  })
}

/* 实名认证 */
export function fetchVerifyIdentityAPI<T>(data: {
  name: string
  idCard: string
}): Promise<Response<T>> {
  return post<T>({
    url: '/auth/verifyIdentity',
    data,
  })
}

/* 手机认证 */
export function fetchVerifyPhoneIdentityAPI<T>(data: {
  phone: string
  username: string
  password: string
  code: string
}): Promise<Response<T>> {
  return post<T>({
    url: '/auth/verifyPhoneIdentity',
    data,
  })
}

/* 获取旧账号迁移二维码的sceneStr */
export function fetchGetQRSceneStrByOldWechatAPI<T>(): Promise<Response<T>> {
  return post<T>({
    url: '/official/getQRSceneStrByOldWechat',
  })
}

/* 轮询查询旧微信迁移结果 */
export function fetchBindWxByOldWechatAPI<T>(data: { sceneStr: string }): Promise<Response<T>> {
  return post<T>({
    url: '/official/bindWxByOldWechat',
    data,
  })
}

/* 获取旧公众号二维码（用于账号迁移）
 * 注意：此接口与普通二维码接口区别在于它返回的是旧公众号的二维码
 * 后端API: /official/getOldQRCode
 */
export function fetchGetOldQRCodeAPI<T>(data: { sceneStr: string }): Promise<Response<T>> {
  console.log('[API调试] 调用getOldQRCode接口, 参数:', data)
  return get<T>({
    url: '/official/getOldQRCode',
    data, // 使用data字段传递参数，会被转换为URL参数
  })
}
