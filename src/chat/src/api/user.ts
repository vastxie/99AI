import { get, post } from '@/utils/request';

/* get wechat-login senceStr */
export function fetchGetQRSceneStrAPI<T>(data: {}): Promise<T> {
  return post<T>({
    url: '/official/getQRSceneStr',
    data,
  });
}

/* get wechat-login qr url */
export function fetchGetQRCodeAPI<T>(data: { sceneStr: string }): Promise<T> {
  return get<T>({
    url: '/official/getQRCode',
    data,
  });
}

/* login by scenceStr */
export function fetchLoginBySceneStrAPI<T>(data: {
  sceneStr: string;
}): Promise<T> {
  return post<T>({
    url: '/official/loginBySceneStr',
    data,
  });
}

/* login by code */
export function fetchLoginByCodeAPI<T>(data: { code: string }): Promise<T> {
  return post<T>({
    url: '/official/loginByCode',
    data,
  });
}

/* get wx registery config */
export function fetchGetJsapiTicketAPI<T>(data: { url: string }): Promise<T> {
  return post<T>({
    url: '/official/getJsapiTicket',
    data,
  });
}

/* get wechat-login senceStr */
export function fetchGetQRSceneStrByBindAPI<T>(): Promise<T> {
  return post<T>({
    url: '/official/getQRSceneStrByBind',
  });
}

/* bind wx by scenceStr */
export function fetchBindWxBySceneStrAPI<T>(data: {
  sceneStr: string;
}): Promise<T> {
  return post<T>({
    url: '/official/bindWxBySceneStr',
    data,
  });
}

/* get wx rediriect login url */
export function fetchWxLoginRedirectAPI<T>(data: { url: string }): Promise<T> {
  return post<T>({
    url: '/official/getRedirectUrl',
    data,
  });
}

/* 实名认证 */
export function fetchVerifyIdentityAPI<T>(data: {
  name: string;
  idCard: string;
}): Promise<T> {
  return post<T>({
    url: '/auth/verifyIdentity',
    data,
  });
}

/* 手机认证 */
export function fetchVerifyPhoneIdentityAPI<T>(data: {
  phone: string;
  username: string;
  password: string;
  code: string;
}): Promise<T> {
  return post<T>({
    url: '/auth/verifyPhoneIdentity',
    data,
  });
}
