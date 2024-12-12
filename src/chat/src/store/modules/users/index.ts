import { defineStore } from 'pinia'
import type { UserInfo, UserState } from './helper'
import { getLocalState, setLocalState } from './helper'

export const useUserStore = defineStore('user-store', {
  state: (): UserState => getLocalState(),
  actions: {
    updateUserInfo(userInfo: Partial<UserInfo>) {
      this.userInfo = { ...this.userInfo, ...userInfo }
      this.recordState()
    },

    recordState() {
      setLocalState(this.$state)
    },

  },
})
