import { defineStore } from 'pinia'
import { normalizeUploadedFile, uploadFile } from '@/api/upload'
import { t } from '@/locales'
import { notifyError } from '@/utils/message'
import { isRequestCancelled } from '@/utils/request'

type AttachmentKind = Chat.UrlItem['type']

/** 输入框里一个待发送的附件：选中后立即在后台上传 */
export interface DraftAttachment {
  id: string
  file: File
  kind: AttachmentKind
  /** 图片、视频的本地预览（objectURL），移除或发出后释放；其他类型为空 */
  previewUrl: string
  status: 'uploading' | 'uploaded' | 'failed'
  /** 上传进度 0–1 */
  progress: number
  /** 上传结果：发送时直接放进消息 */
  uploaded: Chat.UrlItem | null
  error: string
}

let nextAttachmentId = 0
/** 进行中的上传：取消用的控制器与完成信号，不放进响应式状态 */
const inFlight = new Map<string, { controller: AbortController; done: Promise<void> }>()

function releasePreview(attachment: DraftAttachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
}

/**
 * 各会话输入框里的附件（首页用空字符串）：切换会话互不影响，只保存在当前页面（File 无法存进本地存储）。
 * 选中即上传，发送时只等还没传完的，上传失败的由用户决定重试、移除，或不带它们发送。
 */
export const useComposerAttachmentsStore = defineStore('composerAttachments', {
  state: () => ({
    byWorkspace: {} as Record<string, DraftAttachment[]>,
  }),

  actions: {
    list(workspaceId: string): DraftAttachment[] {
      return this.byWorkspace[workspaceId] ?? []
    },

    add(workspaceId: string, file: File, kind: AttachmentKind) {
      const attachment: DraftAttachment = {
        id: `attachment-${++nextAttachmentId}`,
        file,
        kind,
        previewUrl: kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : '',
        status: 'uploading',
        progress: 0,
        uploaded: null,
        error: '',
      }
      this.byWorkspace[workspaceId] = [...this.list(workspaceId), attachment]
      this.startUpload(attachment.id)
      return attachment.id
    },

    /** 按 id 在所有会话里找：上传途中附件可能换了会话名下（首页建会话、登录后回到首页） */
    find(id: string): DraftAttachment | undefined {
      for (const attachments of Object.values(this.byWorkspace)) {
        const found = attachments.find(item => item.id === id)
        if (found) return found
      }
      return undefined
    },

    startUpload(id: string) {
      const find = () => this.find(id)
      const attachment = find()
      if (!attachment) return
      Object.assign(attachment, { status: 'uploading', progress: 0, error: '', uploaded: null })

      const controller = new AbortController()
      const done = uploadFile(attachment.file, undefined, {
        signal: controller.signal,
        onProgress: ratio => {
          const current = find()
          if (current) current.progress = ratio
        },
      })
        .then(response => {
          const current = find()
          if (!current) return
          const uploaded = normalizeUploadedFile(response.data)
          if (!uploaded.url) throw new Error(t('settings.uploadFailed'))
          Object.assign(current, {
            status: 'uploaded',
            progress: 1,
            uploaded: { type: current.kind, ...uploaded, name: current.file.name },
          })
        })
        .catch(error => {
          // 用户移除了还在上传的附件：不算失败
          if (isRequestCancelled(error)) return
          const current = find()
          if (!current) return
          Object.assign(current, {
            status: 'failed',
            error: error?.message || t('settings.uploadFailed'),
          })
          notifyError(error, t('chat.attachmentUploadFailedNamed', { name: current.file.name }))
        })
        .finally(() => {
          if (inFlight.get(id)?.controller === controller) inFlight.delete(id)
        })
      inFlight.set(id, { controller, done })
    },

    retry(id: string) {
      this.startUpload(id)
    },

    remove(workspaceId: string, id: string) {
      const attachment = this.list(workspaceId).find(item => item.id === id)
      if (!attachment) return
      inFlight.get(id)?.controller.abort()
      inFlight.delete(id)
      releasePreview(attachment)
      this.byWorkspace[workspaceId] = this.list(workspaceId).filter(item => item.id !== id)
    },

    /**
     * 等这个会话里还在上传的附件都有结果；等待期间又开始的（点了「重新上传」）也一起等。
     * 每次上传有结果时先把自己从在途表里去掉，所以不会空转
     */
    async settled(workspaceId: string) {
      for (;;) {
        const pending = this.list(workspaceId)
          .map(item => inFlight.get(item.id)?.done)
          .filter((done): done is Promise<void> => Boolean(done))
        if (!pending.length) return
        await Promise.all(pending)
      }
    },

    /** 已随消息发出的附件：从输入框移除并释放预览 */
    release(workspaceId: string, ids: string[]) {
      const sent = new Set(ids)
      this.list(workspaceId)
        .filter(item => sent.has(item.id))
        .forEach(releasePreview)
      this.byWorkspace[workspaceId] = this.list(workspaceId).filter(item => !sent.has(item.id))
    },

    /** 在首页加了附件再建会话：附件跟着新会话走 */
    moveTo(fromWorkspaceId: string, toWorkspaceId: string) {
      const moving = this.list(fromWorkspaceId)
      if (!moving.length || fromWorkspaceId === toWorkspaceId) return
      this.byWorkspace[toWorkspaceId] = [...this.list(toWorkspaceId), ...moving]
      delete this.byWorkspace[fromWorkspaceId]
    },

    /** 会话被删除：取消它还在上传的附件、释放预览 */
    discard(workspaceId: string) {
      this.list(workspaceId).forEach(attachment => {
        inFlight.get(attachment.id)?.controller.abort()
        inFlight.delete(attachment.id)
        releasePreview(attachment)
      })
      delete this.byWorkspace[workspaceId]
    },

    /** 主动退出：取消全部上传、释放全部预览 */
    clearAll() {
      Object.values(this.byWorkspace)
        .flat()
        .forEach(attachment => {
          inFlight.get(attachment.id)?.controller.abort()
          releasePreview(attachment)
        })
      inFlight.clear()
      this.byWorkspace = {}
    },
  },
})
