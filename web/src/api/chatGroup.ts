import { get, post } from '@/utils/request'

export interface ChatGroupSummary {
  gid: string
  /** 当前只有 chat 一种交互模式；服务端仍会返回该字段。 */
  channel?: string
  title: string
  isSticky?: boolean
  config?: string | null
  params?: string | null
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}

export interface CreateChatGroupParams {
  title?: string
  config?: string
  params?: string
}

export interface UpdateChatGroupParams {
  gid: string
  title?: string
  isSticky?: boolean
  config?: string
  params?: string
}

export function fetchQueryChatGroupsAPI<T = ChatGroupSummary[]>(): Promise<T> {
  return get<T>({
    url: '/group/query',
    // 失败由侧栏就地显示「没有加载出来 + 重试」，请求层不再另弹一次
    silentError: true,
  })
}

export function fetchCreateChatGroupAPI<T = ChatGroupSummary>(
  data: CreateChatGroupParams
): Promise<T> {
  return post<T>({
    url: '/group/create',
    data,
    // 创建入口会在调用侧展示带业务上下文的失败提示；关闭请求层兜底 toast，
    // 避免一次失败同时出现“服务器内部错误”和“创建对话失败”。
    silentError: true,
  })
}

export function fetchUpdateChatGroupAPI<T = boolean>(data: UpdateChatGroupParams): Promise<T> {
  return post<T>({
    url: '/group/update',
    data,
  })
}

export function fetchDeleteChatGroupAPI<T = boolean>(data: { gid: string }): Promise<T> {
  return post<T>({
    url: '/group/del',
    data,
    silentError: true,
  })
}
