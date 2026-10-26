import type { App } from 'vue'
import { createPinia } from 'pinia'

/** 全局唯一的 Pinia 实例 */
export const pinia = createPinia()

export function installStores(app: App) {
  app.use(pinia)
}

// 汇总导出各 store 模块，方便组件从 '@/store' 导入；模块之间不经这里互相引用，避免循环依赖
export * from './modules/app'
export * from './modules/auth'
export * from './modules/chat'
export * from './modules/global'
