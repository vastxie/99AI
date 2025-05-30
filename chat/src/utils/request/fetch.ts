import { useAuthStore, useGlobalStore } from '@/store'

// 基本配置
const BASE_URL = import.meta.env.VITE_GLOB_API_URL

/**
 * 自定义错误类，包含响应信息
 */
export class FetchError extends Error {
  status: number
  statusText: string
  data: any

  constructor(message: string, status: number, statusText: string, data?: any) {
    super(message)
    this.name = 'FetchError'
    this.status = status
    this.statusText = statusText
    this.data = data
  }
}

/**
 * 封装的fetch请求
 * @param url 请求URL
 * @param options 请求选项
 * @returns Promise
 */
const fetchClient = async (url: string, options: RequestInit = {}) => {
  const token = useAuthStore().token
  const fingerprint = useGlobalStore()?.fingerprint
  const currentDomain = window.location.origin

  // 设置默认headers
  const headers = new Headers()

  // 手动添加所有headers
  if (options.headers) {
    const headerObj = options.headers as Record<string, string>
    Object.keys(headerObj).forEach(key => {
      headers.set(key, String(headerObj[key]))
    })
  }

  headers.set('X-Website-Domain', currentDomain)
  if (fingerprint) headers.set('Fingerprint', String(fingerprint))
  if (token) headers.set('Authorization', `Bearer ${token}`)

  // 合并选项
  const mergedOptions: RequestInit = {
    ...options,
    headers,
  }

  try {
    // 发送请求
    const response = await fetch(`${BASE_URL}${url}`, mergedOptions)

    // 处理错误状态
    if (![200, 201].includes(response.status)) {
      let errorData
      try {
        // 尝试解析错误响应的JSON数据
        errorData = await response.clone().json()
      } catch (e) {
        // 如果不是JSON，尝试获取文本内容
        try {
          errorData = await response.clone().text()
        } catch (textError) {
          errorData = null
        }
      }

      // 抛出自定义错误，包含更多信息
      throw new FetchError(
        response.status.toString(),
        response.status,
        response.statusText,
        errorData
      )
    }

    return response
  } catch (error: any) {
    // 如果是我们自定义的错误，直接向上传递
    if (error instanceof FetchError) {
      return Promise.reject(error)
    }

    // 如果是AbortError或其他网络错误，包装成自定义错误
    const fetchError = new FetchError(error.message || 'Network Error', 0, 'Network Error')

    return Promise.reject(fetchError)
  }
}

/**
 * 用于处理流式响应的fetch
 * @param url 请求URL
 * @param options 请求选项
 * @param onProgress 进度回调
 * @returns Promise
 */
export const fetchStream = async (
  url: string,
  options: RequestInit = {},
  onProgress?: (chunk: string) => void
) => {
  const response = await fetchClient(url, options)

  // 获取响应的reader
  const reader = response.body?.getReader()
  if (!reader) {
    throw new FetchError('Failed to get reader from response', 0, 'Reader Error')
  }

  // 用于保存响应文本
  let responseText = ''

  // 用于解码二进制数据
  const decoder = new TextDecoder()

  // 循环读取数据
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // 解码二进制数据
    const chunk = decoder.decode(value, { stream: true })

    // 追加到完整响应文本
    responseText += chunk

    // 调用进度回调
    if (onProgress) {
      onProgress(chunk)
    }
  }

  return responseText
}

/**
 * POST请求封装
 * @param url 请求URL
 * @param data 请求数据
 * @param options 请求选项
 * @param onProgress 进度回调
 * @returns Promise
 */
export const fetchPost = async (
  url: string,
  data: any,
  options: RequestInit = {},
  onProgress?: (chunk: string) => void
) => {
  // 准备POST请求选项
  const postOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(data),
    ...options,
  }

  // 如果有进度回调，使用流式处理
  if (onProgress) {
    return fetchStream(url, postOptions, onProgress)
  }

  // 否则，使用普通请求并返回JSON
  const response = await fetchClient(url, postOptions)
  return response.json()
}

export default {
  get: async (url: string, options?: RequestInit) => {
    const response = await fetchClient(url, { ...options, method: 'GET' })
    return response.json()
  },
  post: fetchPost,
  stream: fetchStream,
}
