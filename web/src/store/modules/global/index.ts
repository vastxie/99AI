import { closeImageViewer, openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { defineStore } from 'pinia'
import type { GlobalState } from './helper'
import type { PreviewPanelState } from '@/types/preview-panel'

/** 设置弹窗的内核页签 id；扩展包页签用自己的 id（settings.tab 挂载点的 key，hash 为 #settings/<id>） */
export const DIALOG_TABS = {
  GENERAL: 'general',
  ACCOUNT: 'account',
  SERVICE: 'notice',
  AGREEMENT: 'agreement',
} as const

export const useGlobalStore = defineStore('global-store', {
  state: (): GlobalState => ({
    loading: false,
    settingsDialog: false,
    showLoginDialog: false,
    previewImageUrls: [],
    initialImageIndex: 0,
    settingsActiveTab: undefined,
    accountSettingsView: undefined,
    userAgreementDialog: false,
    contentViolationDialog: false,
    previewPanelState: null,
  }),

  getters: {
    rightPreviewPanel(state): PreviewPanelState {
      return state.previewPanelState
    },
  },

  actions: {
    updateUserAgreementDialog(userAgreementDialog: boolean) {
      this.userAgreementDialog = userAgreementDialog
    },

    updateContentViolationDialog(visible: boolean) {
      this.contentViolationDialog = visible
    },

    updateImagePreviewer(visible: boolean, imageUrls: string[] = [], initialIndex: number = 0) {
      if (visible) {
        this.previewPanelState = null
        this.previewImageUrls = imageUrls
        this.initialImageIndex = initialIndex
        const imageUrl = imageUrls[initialIndex] || imageUrls[0]
        if (imageUrl) {
          openImageViewer({
            imageUrl,
            fileName: `image_${initialIndex + 1}`,
          })
        }
      } else {
        this.previewImageUrls = []
        this.initialImageIndex = 0
        closeImageViewer()
      }
    },

    /** 打开或关闭设置；打开时停在 activeTab（不给则桌面停在第一页、手机停在页签列表） */
    updateSettingsDialog(settingsDialog: boolean, activeTab?: string) {
      this.settingsDialog = settingsDialog
      if (!settingsDialog) return
      this.closeAllPreviewers()
      this.settingsActiveTab = activeTab
    },

    updateSettingsActiveTab(tab?: string) {
      this.settingsActiveTab = tab
    },

    updateAccountSettingsView(view?: string) {
      this.accountSettingsView = view
    },

    // 关闭所有预览器
    closeAllPreviewers() {
      this.previewPanelState = null
      this.previewImageUrls = []
      this.initialImageIndex = 0
      closeImageViewer()
    },

    openPanel(panel: Exclude<PreviewPanelState, null>) {
      this.closeAllPreviewers()
      this.previewPanelState = panel
    },

    updateActivityPanel(activity: Exclude<PreviewPanelState, null> & { type: 'activity' }) {
      const current = this.previewPanelState
      if (current?.type !== 'activity') return

      const sameSource =
        Boolean(current.activity.sourceKey && activity.activity.sourceKey) &&
        current.activity.sourceKey === activity.activity.sourceKey
      const sameMessageRound =
        current.activity.messageId !== undefined &&
        activity.activity.messageId !== undefined &&
        current.activity.messageId === activity.activity.messageId &&
        current.activity.roundIndex === activity.activity.roundIndex

      if (sameSource || sameMessageRound) {
        this.previewPanelState = activity
      }
    },

    updateCodePanel(panel: Exclude<PreviewPanelState, null> & { type: 'code'; sourceKey: string }) {
      const current = this.previewPanelState
      if (current?.type !== 'code') return
      if (!current.sourceKey || current.sourceKey !== panel.sourceKey) return

      this.previewPanelState = {
        ...current,
        ...panel,
      }
    },

    closePanel() {
      this.closeAllPreviewers()
    },
  },
})

export function useGlobalStoreWithOut() {
  // 直接使用 useGlobalStore，不再引入 store
  return useGlobalStore()
}
