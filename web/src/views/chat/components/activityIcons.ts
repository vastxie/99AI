import type { ActivityEvent } from '@/types/preview-panel'
import {
  Atom,
  Code,
  FileText,
  Globe as Browser,
  Image as Picture,
  MessageSquareText,
  Play as PlayTwo,
  Search,
  ToolCase as Tool,
} from '@lucide/vue'
import type { Component } from 'vue'

type ActivityIconSource =
  Pick<ActivityEvent, 'type' | 'title' | 'outputHint' | 'output'> | null | undefined
type ActivityIconKey =
  'thinking' | 'note' | 'search' | 'browser' | 'code' | 'image' | 'video' | 'file' | 'tool'

const ACTIVITY_ICON_MAP: Record<ActivityIconKey, Component> = {
  thinking: Atom,
  note: MessageSquareText,
  search: Search,
  browser: Browser,
  code: Code,
  image: Picture,
  video: PlayTwo,
  file: FileText,
  tool: Tool,
}

export function getActivityIconKey(event?: ActivityIconSource): ActivityIconKey {
  const eventType = String(event?.type || '').toLowerCase()
  const title = event?.title || ''
  const output = event?.output || {}
  const descriptor = `${eventType} ${title}`
  const outputType = String(event?.outputHint?.type || output.outputHint?.type || '').toLowerCase()
  const outputFiles = Array.isArray(output.files) ? output.files : []
  const fileTypeSet = new Set(
    outputFiles.map((item: any) => String(item?.type || '').toLowerCase())
  )

  if (eventType === 'thinking') return 'thinking'
  if (eventType === 'note') return 'note'
  if (eventType === 'search' || /search|搜索/iu.test(descriptor)) return 'search'
  if (/browser|web|网页|读取/iu.test(descriptor)) return 'browser'
  if (/code|python|calculator|计算|代码/iu.test(descriptor)) return 'code'
  if (outputType === 'image' || fileTypeSet.has('image')) return 'image'
  if (outputType === 'video' || fileTypeSet.has('video')) return 'video'
  if (
    output.filePreview ||
    outputFiles.length > 0 ||
    /file|document|excel|pdf|word|ppt|文件|文档|报告|表格/iu.test(descriptor)
  ) {
    return 'file'
  }
  return 'tool'
}

export function getActivityIcon(event?: ActivityIconSource): Component {
  return ACTIVITY_ICON_MAP[getActivityIconKey(event)]
}

/** 时间线图标颜色：与状态文字一致，失败用危险色，已中断（只是没等到结束）用弱化色 */
export function getActivityTimelineIconClass(event: Pick<ActivityEvent, 'status' | 'interrupted'>) {
  if (event.status === 'loading') {
    return 'text-text-subtle animate-pulse'
  }
  if (event.status === 'error' && !event.interrupted) {
    return 'text-semantic-danger'
  }
  return 'text-text-subtle'
}
