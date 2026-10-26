/**
 * URL 项类型（用于传递给后端）
 */
export interface UrlItem {
  type: 'image' | 'video' | 'audio' | 'file'
  url?: string
  name?: string
  fileId?: string
  previewUrl?: string
  downloadUrl?: string
  publicUrl?: string
  mime?: string
  size?: number
}

/**
 * 媒体项类型（统一格式）
 */
export interface MediaItem {
  type: 'image' | 'video' | 'audio' | 'file'
  name: string
  url?: string
  fileId?: string
  previewUrl?: string
  downloadUrl?: string
  publicUrl?: string
  mime?: string
  size?: number
}

/**
 * 统一消息结构（与 chat.d.ts 中的 Chat.UnifiedMessage 一致）
 */
export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  rounds: Round[]
  attachments?: MediaItem[]
  model?: string
  tokens?: TokenUsage
  timestamp?: string
}

export interface Round {
  text: string | null
  thinking: string | null
  thinkingDuration?: number
  toolCalls: ToolCall[]
  completed?: boolean
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
  result?: any
  status: 'loading' | 'success' | 'error'
  duration?: number
  type?: string
  output?: {
    thought?: string
    details?: any
    error?: string
    content?: string
    files?: MediaItem[]
  }
}

export interface TokenUsage {
  input: number
  output: number
  total: number
}

/**
 * 构建用户消息的统一消息结构（rounds + toolCalls 格式）
 * 使用 toolCalls.output 来存储媒体文件，与 AI 回复保持一致
 *
 * @param content - 消息文本内容
 * @param urlItems - URL 项数组
 * @returns JSON 字符串格式的统一消息结构
 */
export function buildUserMessage(content: string, urlItems: UrlItem[] = []): string {
  // 按类型分类 URL（统一使用对象数组）
  const images: MediaItem[] = []
  const videos: MediaItem[] = []
  const audios: MediaItem[] = []
  const files: MediaItem[] = []

  for (const item of urlItems) {
    const url = item.url || item.previewUrl || item.downloadUrl || item.publicUrl || ''
    if (!url && !item.fileId) continue

    const mediaItem: MediaItem = {
      type: item.type,
      name: item.name || url.split('/').pop() || item.fileId || 'file',
      url: item.url,
      fileId: item.fileId,
      previewUrl: item.previewUrl,
      downloadUrl: item.downloadUrl,
      publicUrl: item.publicUrl,
      mime: item.mime,
      size: item.size,
    }
    switch (item.type) {
      case 'image':
        images.push(mediaItem)
        break
      case 'video':
        videos.push(mediaItem)
        break
      case 'audio':
        audios.push(mediaItem)
        break
      case 'file':
        files.push(mediaItem)
        break
    }
  }

  // 构建 output 对象（直接存储对象数组，避免双重 JSON 编码）
  const output: {
    files?: MediaItem[]
  } = {}
  const attachments = [...images, ...videos, ...audios, ...files]

  if (attachments.length > 0) {
    output.files = attachments
  }

  // 构建工具调用（虚拟的 user_upload 工具）
  const toolCalls = []
  if (images.length > 0 || videos.length > 0 || audios.length > 0 || files.length > 0) {
    toolCalls.push({
      id: `user_upload_${Date.now()}`,
      name: 'user_upload',
      arguments: {},
      result: null,
      status: 'success' as const,
      output,
    })
  }

  // 构建统一消息结构
  const unifiedMessage: UnifiedMessage = {
    role: 'user',
    content: content,
    rounds: [
      {
        text: content || null,
        thinking: null,
        toolCalls: toolCalls,
        completed: true,
      },
    ],
    ...(attachments.length > 0 ? { attachments } : {}),
    timestamp: new Date().toISOString(),
  }

  return JSON.stringify(unifiedMessage)
}
