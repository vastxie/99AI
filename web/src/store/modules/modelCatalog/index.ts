import { defineStore } from 'pinia'
import { fetchModelBaseConfigAPI, fetchQueryModelsListAPI } from '@/api/models'
import { useCacheStore } from '../cache'

/**
 * 模型目录域 store：可用模型列表与默认模型配置（全局目录数据）。
 * 从 chat 上帝 store 拆出；「当前会话选用了哪个模型」属于会话配置，
 * 由 chat store 的 effectiveModelConfig 决定（会话 config → 本次改动 → 管理员默认模型 → 列表第一个）。
 */

interface ModelCatalogState {
  modelList: any[]
  baseConfig: any | null
}

export const useModelCatalogStore = defineStore('model-catalog-store', {
  state: (): ModelCatalogState => ({
    modelList: [],
    baseConfig: null,
  }),

  actions: {
    async queryModels() {
      try {
        const cacheStore = useCacheStore()

        // 先从缓存获取
        const cachedModels = cacheStore.get('models')
        let modelList: any

        if (cachedModels && cacheStore.hasModels) {
          modelList = cachedModels
        } else {
          // 从API获取（后端现在直接返回数组）
          const res: any = await fetchQueryModelsListAPI()
          if (res.success && res.code === 200) {
            modelList = res.data
            // 缓存模型列表
            cacheStore.set('models', modelList)
          } else {
            return
          }
        }

        // 只保留需要的字段
        this.modelList = modelList.map((model: any) => {
          return {
            id: model.id,
            model: model.model,
            modelName: model.modelName,
            modelAvatar: model.modelAvatar,
            deduct: model.deduct,
            multimodalTypes: model.multimodalTypes || [],
            protocol: model.protocol,
            capabilities: model.capabilities || {},
            modelDescription: model.modelDescription,
            maxModelTokens: model.maxModelTokens,
          }
        })
      } catch {}
    },

    /** 管理员配置的默认模型：新会话在用户没选模型时显示并发送它，与服务端的兜底一致 */
    async getBaseModelConfig() {
      try {
        const res: any = await fetchModelBaseConfigAPI()
        this.baseConfig = res?.data ?? null
      } catch {
        // 取不到时按模型列表第一个兜底
      }
    },
  },
})
