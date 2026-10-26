import { get, post } from '@/utils/request'

export interface ChatLogQueryParams {
  gid: string
  limit?: number
  beforeCursor?: string | null
}

export interface ChatSearchParams {
  keyword: string
  limit?: number
}

export interface ChatAroundParams {
  gid: string
  targetCid: string
  limit?: number
}

export interface ChatAroundRequestOptions {
  silentError?: boolean
}

/* 删除对话记录 */
export function fetchDelChatLogAPI<T>(data: { cid: string; gid: string }): Promise<T> {
  return post<T>({
    url: '/chatlog/del',
    data,
  })
}

/* 查询当前会话；silentError 时失败不弹提示（由调用方给出重试等状态） */
export function fetchQueryChatLogListAPI<T>(
  data: ChatLogQueryParams,
  options: { silentError?: boolean } = {}
): Promise<T> {
  return get<T>({
    url: '/chatlog/chatList',
    data,
    ...(options.silentError ? { silentError: true } : {}),
  })
}

/* 搜索当前用户消息内容 */
export function fetchSearchChatLogsAPI<T>(data: ChatSearchParams): Promise<T> {
  return get<T>({
    url: '/chatlog/search',
    data,
    // 失败由搜索框就地显示并可重试，请求层不再另弹一次
    silentError: true,
  })
}

/* 查询指定消息附近的对话内容 */
export function fetchQueryChatLogAroundAPI<T>(
  data: ChatAroundParams,
  options: ChatAroundRequestOptions = {}
): Promise<T> {
  return get<T>({
    url: '/chatlog/chatAround',
    data,
    silentError: options.silentError,
  })
}
