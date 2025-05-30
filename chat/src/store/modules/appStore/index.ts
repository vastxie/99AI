import { fetchQueryMineAppsAPI } from '@/api/appStore'
import { store } from '@/store'
import { defineStore } from 'pinia'
import type { AppStoreState } from './helper'

export const useAppCatStore = defineStore('app-cat-store', {
  state: (): AppStoreState => ({
    catId: 0,
    mineApps: [],
  }),

  actions: {
    setCatId(catId: number) {
      this.catId = catId
    },

    async queryMineApps() {
      const res = await fetchQueryMineAppsAPI()
      this.mineApps = res?.data?.rows || []
    },
  },
})

export function useAppCatStoreWithOut() {
  return useAppCatStore(store)
}
