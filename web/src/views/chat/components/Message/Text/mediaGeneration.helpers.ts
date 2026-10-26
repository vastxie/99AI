import type { CSSProperties } from 'vue'
import { t } from '@/locales'

export type MediaGenerationKind = 'image' | 'video' | 'presentation'

/** 生成中占位框的内容 */
export interface MediaGenerationPlaceholder {
  kind: MediaGenerationKind
  label: string
  subLabel?: string
  aspectRatio?: string
  progressPercent?: number
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function stableRandom(seed: string, min: number, max: number): number {
  return min + (max - min) * (stableHash(seed) / 0xffffffff)
}

export function isPresentationTool(toolCall: any): boolean {
  const descriptor = [
    toolCall?.toolName,
    toolCall?.name,
    toolCall?.displayName,
    toolCall?.display?.summary,
    toolCall?.output?.summary,
  ]
    .filter(Boolean)
    .join(' ')
  return /presentation|pptx|ppt|演示文稿/iu.test(descriptor)
}

export function getWorkflowProgress(toolCall: any): any {
  return (
    toolCall?.workflowProgress ||
    toolCall?.display?.workflowProgress ||
    toolCall?.output?.workflowProgress
  )
}

export function getMediaGenerationAspectRatio(toolCall: any): string | undefined {
  const ratio = String(
    toolCall?.outputHint?.aspectRatio || toolCall?.display?.outputHint?.aspectRatio || ''
  ).trim()
  const match = ratio.match(/^(\d{1,5})\s*(?::|\/)\s*(\d{1,5})$/u)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined
  }
  return `${width} / ${height}`
}

export function parseMediaGenerationAspectRatio(
  aspectRatio?: string
): { width: number; height: number } | null {
  const match = String(aspectRatio || '')
    .trim()
    .match(/^(\d{1,5})\s*(?::|\/)\s*(\d{1,5})$/u)
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return { width, height }
}

export function getPresentationProgressSubtitle(toolCall: any): string | undefined {
  const progress = getWorkflowProgress(toolCall)
  if (!progress || progress.kind !== 'presentation') return undefined
  const total = Number(progress.total)
  const current = Number(progress.current)
  if (Number.isFinite(total) && total > 0 && Number.isFinite(current) && current > 0) {
    return t('activity.presentationSlideProgress', {
      current: Math.min(current, total),
      total,
    })
  }
  if (Number.isFinite(total) && total > 0) {
    return t('activity.presentationSlideCount', { count: total })
  }
  return undefined
}

/** 运行中的工具在生成哪类媒体；不是媒体生成（或已结束）返回 null */
export function getMediaGenerationKind(toolCall: any): MediaGenerationKind | null {
  if (!toolCall || toolCall.status !== 'loading') return null

  const hintedType = String(
    toolCall?.outputHint?.type || toolCall?.display?.outputHint?.type || ''
  ).toLowerCase()
  if (getWorkflowProgress(toolCall)?.kind === 'presentation') return 'presentation'
  if (hintedType === 'video') return 'video'
  if (hintedType === 'image') return 'image'
  if ((hintedType === 'document' || hintedType === 'file') && isPresentationTool(toolCall)) {
    return 'presentation'
  }

  const output = toolCall?.display || toolCall?.output || {}
  const files = Array.isArray(output.files) ? output.files : []
  if (files.some((item: any) => item?.type === 'video')) return 'video'
  if (files.some((item: any) => item?.type === 'image')) return 'image'
  return null
}

/** 占位框的尺寸与进度环：宽高比缺省时图片按 1:1、其余按 16:9 */
export function mediaPlaceholderStyle(placeholder: MediaGenerationPlaceholder): CSSProperties {
  const ratio = parseMediaGenerationAspectRatio(placeholder.aspectRatio) || {
    width: placeholder.kind === 'image' ? 1 : 16,
    height: placeholder.kind === 'image' ? 1 : 9,
  }
  const progressPercent =
    typeof placeholder.progressPercent === 'number'
      ? Math.max(0, Math.min(100, placeholder.progressPercent))
      : 0

  return {
    '--media-placeholder-aspect-ratio': `${ratio.width} / ${ratio.height}`,
    '--media-placeholder-width': `min(calc(32vh * ${ratio.width} / ${ratio.height}), 28rem, 100%)`,
    '--media-progress-percent': `${progressPercent}%`,
    '--media-progress-deg': `${progressPercent * 3.6}deg`,
  } as CSSProperties
}
