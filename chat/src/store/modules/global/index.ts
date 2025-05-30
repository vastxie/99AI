import { store } from '@/store'
import { ss } from '@/utils/storage'
import { defineStore } from 'pinia'
import { useChatStore } from '../chat'
import type { GlobalState } from './helper'

// 定义对话框的索引常量，方便后续使用
export const DIALOG_TABS = {
  ACCOUNT: 0, // 账户管理
  MEMBER: 1, // 会员中心
  NOTICE: 2, // 网站公告
  AGREEMENT: 3, // 用户协议
}

export const useGlobalStore = defineStore('global-store', {
  state: (): GlobalState => ({
    loading: false,
    showAppListComponent: false,
    settingsDialog: false,
    showLoginDialog: false,
    showBadWordsDialog: false,
    showHtmlPreviewer: false,
    showTextEditor: false,
    showImagePreviewer: false,
    showWorkflowPreviewer: false,
    showMarkdownPreviewer: false,
    previewImageUrls: [],
    initialImageIndex: 0,
    pythonDialog: false,
    htmlDialog: false,
    isChatIn: false,
    settingsActiveTab: 0,
    htmlContent: '',
    contentType: '',
    textContent: '',
    pythonContent: '',
    full_json: '',
    externalLinkDialog: false,
    currentExternalLink: null,
    mobileSettingsDialog: false,
    goodsDialog: false,
    fingerprint: 0,
    noticeDialog: false,
    bindWxDialog: false,
    signInDialog: false,
    appDialog: false,
    identityDialog: false,
    phoneIdentityDialog: false,
    userAgreementDialog: false,
    BadWordsDialog: false,
    isCacheEnabled: false,
    orderInfo: {
      pkgInfo: {
        id: 0,
        des: '',
        name: '',
        price: '',
        model3Count: 0,
        model4Count: 0,
        drawMjCount: 0,
        coverImg: '',
        days: 0,
      },
    },
    model: 0,
    iframeUrl: '',
    clipboardText: '',
    mjImageData: {},
    mobileInitialTab: undefined,
    workflowContent: [],
    markdownContent: '',
    isMarkdownPreviewerVisible: false,
  }),

  actions: {
    updateClipboardText(text: string) {
      this.clipboardText = text
    },

    updateTextContent(text: string) {
      this.textContent = text
    },

    updateFullJson(json: string) {
      this.full_json = json
    },

    updateFingerprint(str: number) {
      let id = str
      /* 超过mysql最大值进行截取 */
      if (id > 2147483647) {
        id = Number(id.toString().slice(-9))
        id = Number(String(Number(id)))
      }
      ss.set('fingerprint', id)
      this.fingerprint = id
    },

    updateIframeUrl(iframeUrl: string) {
      this.iframeUrl = iframeUrl
    },

    updateUserAgreementDialog(userAgreementDialog: boolean) {
      this.userAgreementDialog = userAgreementDialog
    },

    UpdateBadWordsDialog(BadWordsDialog: boolean) {
      this.BadWordsDialog = BadWordsDialog
    },

    updateHtmlContent(
      htmlContent: string,
      contentType: 'html' | 'mermaid' | 'markmap' | '' = 'html'
    ) {
      this.htmlContent = htmlContent
      this.contentType = contentType
    },

    updateHtmlPreviewer(visible: boolean) {
      this.showHtmlPreviewer = visible
    },

    updateTextEditor(visible: boolean) {
      this.showTextEditor = visible
    },

    updateImagePreviewer(
      visible: boolean,
      imageUrls: string[] = [],
      initialIndex: number = 0,
      mjData?: any
    ) {
      this.showImagePreviewer = visible
      if (visible) {
        this.previewImageUrls = imageUrls
        this.initialImageIndex = initialIndex
        this.mjImageData = mjData || {}
        // 当图片预览器启用时，自动清空正在使用的插件
        const chatStore = useChatStore()
        chatStore.setUsingPlugin(null)
      }
    },

    updateIsChatIn(isChatIn: boolean) {
      this.isChatIn = isChatIn
    },

    updateGoodsDialog(goodsDialog: boolean) {
      this.goodsDialog = goodsDialog
    },

    updateBindwxDialog(bindWxDialog: boolean) {
      this.bindWxDialog = bindWxDialog
    },

    updateSignInDialog(signInDialog: boolean) {
      this.signInDialog = signInDialog
    },

    updateNoticeDialog(noticeDialog: boolean) {
      this.noticeDialog = noticeDialog
    },

    updateAppDialog(appDialog: boolean) {
      this.appDialog = appDialog
    },

    updateIdentityDialog(identityDialog: boolean) {
      this.identityDialog = identityDialog
    },

    updatePhoneDialog(phoneIdentityDialog: boolean) {
      this.phoneIdentityDialog = phoneIdentityDialog
    },

    updateHtmlDialog(htmlDialog: boolean) {
      this.htmlDialog = htmlDialog
    },

    updateModel(model: number) {
      ss.set('model', model)
      this.model = model
    },

    updateOrderInfo(info: any) {
      // Add appropriate type
      this.orderInfo = info
    },

    updatePythonDialog(pythonDialog: boolean) {
      this.pythonDialog = pythonDialog
    },

    updatePythonContent(content: string) {
      console.log('updatePythonContent', content)
      this.pythonContent = content
    },

    updateExternalLinkDialog(visible: boolean, url: string | null = null) {
      this.externalLinkDialog = visible
      this.currentExternalLink = url
    },

    updateSettingsDialog(settingsDialog: boolean, activeTab?: number) {
      this.settingsDialog = settingsDialog
      if (settingsDialog && activeTab !== undefined) {
        this.settingsActiveTab = activeTab
      }
    },

    updateMobileSettingsDialog(mobileSettingsDialog: boolean, activeTab?: number | string) {
      this.mobileSettingsDialog = mobileSettingsDialog

      if (activeTab !== undefined) {
        // 如果是数字索引，转换为对应的tabId
        if (typeof activeTab === 'number') {
          const tabIds = ['account', 'member', 'notice', 'agreement']
          this.mobileInitialTab = tabIds[activeTab] || undefined
        } else {
          // 如果直接传入了tabId字符串
          this.mobileInitialTab = activeTab
        }
      } else {
        this.mobileInitialTab = undefined
      }
    },

    updateShowAppListComponent(showAppListComponent: boolean) {
      this.showAppListComponent = showAppListComponent
    },

    setCurrentExternalLink(link: string | null) {
      this.currentExternalLink = link
      if (link) {
        this.externalLinkDialog = true
      }
    },

    updateSettingsActiveTab(tab: number) {
      this.settingsActiveTab = tab
    },

    updateWorkflowPreviewer(visible: boolean) {
      this.showWorkflowPreviewer = visible
      if (!visible) {
        this.workflowContent = []
      }
    },

    addWorkflowContent(content: string) {
      this.workflowContent.push(content)
    },

    clearWorkflowContent() {
      this.workflowContent = []
    },

    updateWorkflowContentAt(index: number, content: string) {
      if (index >= 0 && index < this.workflowContent.length) {
        this.workflowContent[index] = content
      }
    },

    updateWorkflowContentLast(newContent: string) {
      const currentWorkflow = this.workflowContent
      if (currentWorkflow.length > 0) {
        // 获取最后一项的索引
        const lastIndex = currentWorkflow.length - 1
        // 将新内容追加到最后一项
        this.workflowContent[lastIndex] += newContent
      } else {
        // 如果还没有内容，则创建新项
        this.workflowContent.push(newContent)
      }
    },

    updateMarkdownPreviewer(visible: boolean, markdownContent?: string) {
      this.isMarkdownPreviewerVisible = visible
      if (markdownContent) {
        this.markdownContent = markdownContent
      }
      if (!visible) {
        this.markdownContent = ''
      }
    },
  },
})

export function useGlobalStoreWithOut() {
  return useGlobalStore(store)
}
