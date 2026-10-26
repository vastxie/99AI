/**
 * 全局缓存模块类型定义
 */

export interface CacheState {
  // 用户信息缓存
  userInfo: UserInfo | null

  // 模型列表缓存
  models: Model[]
}

export interface UserInfo {
  id: number
  username: string
  email: string
  avatar?: string
  balance?: number
  // ... 其他用户信息字段
}

export interface Model {
  id: number
  model: string
  modelName: string
  deductType: number
  deduct: number
  // ... 其他模型字段
}

// 缓存键名常量
export const CACHE_KEYS = {
  USER_INFO: 'userInfo',
  MODELS: 'models',
}
