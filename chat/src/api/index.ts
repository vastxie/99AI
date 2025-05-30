import { get, post } from '@/utils/request'
import { fetchStream } from '@/utils/request/fetch'
import type { AxiosProgressEvent, GenericAbortSignal } from 'axios'

/* 对话聊天 */
export function fetchChatAPIProcess<T = any>(params: {
  model: string
  modelName: string
  modelType: number
  modelAvatar?: string
  prompt: string
  sslUrl?: string
  chatId?: string
  fileInfo?: string
  imageUrl?: string
  fileUrl?: string
  action?: string
  drawId?: string
  customId?: string
  appId?: number
  extraParam?: { size?: string }
  usingPluginId?: number
  options?: {
    groupId: number
    usingNetwork: boolean
    usingMcpTool: boolean
  }
  signal?: GenericAbortSignal
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
  taskId?: string
}) {
  // 准备请求数据
  const data = {
    model: params.model,
    modelName: params.modelName,
    modelType: params.modelType,
    prompt: params.prompt,
    fileInfo: params?.fileInfo,
    imageUrl: params?.imageUrl,
    fileUrl: params?.fileUrl,
    extraParam: params?.extraParam,
    appId: params?.appId,
    options: params.options,
    action: params?.action,
    customId: params?.customId,
    usingPluginId: params?.usingPluginId,
    drawId: params?.drawId,
    modelAvatar: params?.modelAvatar,
    taskId: params?.taskId,
  }

  // 如果没有进度回调，则使用普通POST请求
  if (!params.onDownloadProgress) {
    return post<T>({
      url: '/chatgpt/chat-process',
      data,
      signal: params.signal,
    })
  }

  // 使用流式请求处理
  return new Promise((resolve, reject) => {
    // 创建AbortController用于取消请求
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }

    // 如果提供了signal，添加到请求选项
    if (params.signal) {
      // 由于类型不兼容，这里使用类型断言
      fetchOptions.signal = params.signal as any
    }

    fetchStream('/chatgpt/chat-process', fetchOptions, chunk => {
      // 调用进度回调，模拟axios的onDownloadProgress事件
      if (params.onDownloadProgress) {
        // 创建一个符合AxiosProgressEvent的对象
        const progressEvent: AxiosProgressEvent = {
          event: {
            target: {
              responseText: chunk,
              getResponseHeader: (name: string) => null,
            },
          } as any,
          loaded: chunk.length,
          total: 0, // 流式响应无法预知总长度
          bytes: chunk.length,
          lengthComputable: false,
          progress: 0,
        }
        params.onDownloadProgress(progressEvent)
      }
    })
      .then(response => {
        resolve({ data: response } as any)
      })
      .catch(error => {
        reject(error)
      })
  })
}

export function fetchPptCoverAPIProcess<T>(data: {
  color?: string
  style?: string
  title: string
}): Promise<T> {
  return post<T>({ url: '/chatgpt/ppt-cover', data }) as Promise<T>
}

/* TTS 文字转语音 */
export function fetchTtsAPIProcess<T>(data: { chatId: number; prompt: string }): Promise<T> {
  return post<T>({ url: '/chatgpt/tts-process', data }) as Promise<T>
}

/* 获取个人信息 */
export function fetchGetInfo<T>() {
  return get<T>({ url: '/auth/getInfo' })
}

/* 注册 */
export function fetchRegisterAPI<T>(data: {
  username: string
  password: string
  contact: string
  code: string
}): Promise<T> {
  return post<T>({ url: '/auth/register', data }) as Promise<T>
}

/* 登录 */
export function fetchLoginAPI<T>(data: { username: string; password: string }): Promise<T> {
  return post<T>({ url: '/auth/login', data }) as Promise<T>
}

/* 验证码登录 */
export function fetchLoginWithCaptchaAPI<T>(data: { contact: string; code: string }): Promise<T> {
  return post<T>({ url: '/auth/loginWithCaptcha', data }) as Promise<T>
}

/* 修改个人信息 */
export function fetchUpdateInfoAPI<T>(data: {
  username?: string
  avatar?: string
  nickname?: string
}): Promise<T> {
  return post<T>({ url: '/user/update', data }) as Promise<T>
}

/* 修改密码 */
export function fetchUpdatePasswordAPI<T>(data: { password?: string }): Promise<T> {
  return post<T>({ url: '/auth/updatePassword', data }) as Promise<T>
}

/* 获取图片验证码 */
export function fetchCaptchaImg<T>(data: { color: string }): Promise<T> {
  return post<T>({ url: '/auth/captcha', data }) as Promise<T>
}

/* 发送邮箱验证码 */
export function fetchSendCode<T>(data: { contact: string; captchaCode: string }): Promise<T> {
  return post<T>({ url: '/auth/sendCode', data }) as Promise<T>
}

/* 发送手机验证码 */
export function fetchSendSms<T>(data: { phone: string }): Promise<T> {
  return post<T>({ url: '/auth/sendPhoneCode', data }) as Promise<T>
}

/* 发送邮箱验证码 */
export function fetchSendEmailCode<T>(data: {
  phone: string
  captchaId: string
  captchaCode: string
}): Promise<T> {
  return post<T>({ url: '/auth/sendEmailCode', data }) as Promise<T>
}
