export interface GlobalState {
  loading: boolean
  showLoginDialog: boolean
  userAgreementDialog: boolean
  contentViolationDialog: boolean
  settingsDialog: boolean
  /**
   * 设置弹窗当前页签 id（内核页签见 DIALOG_TABS，扩展包页签用自己的 id）；
   * 没指定时桌面停在第一页，手机停在页签列表
   */
  settingsActiveTab?: string
  accountSettingsView?: string
  previewImageUrls: string[]
  initialImageIndex: number
  previewPanelState: import('@/types/preview-panel').PreviewPanelState
}
