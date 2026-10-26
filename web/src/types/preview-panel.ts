/** Unified right-side preview panel state — replaces multiple boolean flags */
import type { FilePreviewSource } from './file-preview'

/** 代码内容类型：内核识别的语言 / 格式，扩展包登记的预览类型（如图表 DSL）也走这个字段 */
export type CodeContentType =
  | 'html'
  | 'svg'
  | 'markdown'
  | 'json'
  | 'css'
  | 'javascript'
  | 'typescript'
  | 'sql'
  | 'python'
  | 'java'
  | 'cpp'
  | 'rust'
  | 'bash'
  | 'text'
  | (string & {})

export type ActivityPanelStatus = 'running' | 'success' | 'error'
export type ActivityEventStatus = 'loading' | 'success' | 'error'

export interface ActivityEvent {
  id: string
  title: string
  status: ActivityEventStatus
  /** 原始工具名；用于区分 file_search 与 web_search 等展示语义。 */
  toolName?: string
  roundIndex?: number
  toolIndex?: number
  type?: string
  summary?: string
  content?: string
  duration?: number
  startedAt?: number
  completedAt?: number
  outputHint?: {
    type: 'image' | 'video' | 'audio' | 'file' | 'document'
    aspectRatio?: string
  }
  safeInputSummary?: string
  output?: any
  display?: any
  error?: string
  /** 回合结束时仍未收到结束事件的工具：按已中断展示 */
  interrupted?: boolean
}

export interface ActivityPanelPayload {
  sourceKey?: string
  messageId?: string
  roundIndex?: number
  title?: string
  status: ActivityPanelStatus
  summary?: string
  duration?: number
  events: ActivityEvent[]
}

export type PreviewPanelState =
  | {
      type: 'code'
      content: string
      contentType: CodeContentType
      title?: string
      sourceKey?: string
    }
  | {
      type: 'activity'
      activity: ActivityPanelPayload
    }
  | {
      type: 'file'
      file: FilePreviewSource
    }
  | null
