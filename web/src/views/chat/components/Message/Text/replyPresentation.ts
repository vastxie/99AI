import { readPresentedFiles, type AgentPresentedFile } from '@99agent/contracts'
import type { Round, ToolCall } from '@/types/chat'
import { getFileIdFromItem, normalizeFileAssetId } from '@/utils/privateFileAccess'
import { parseOutputFiles, type OutputFile } from '../../../outputFile'
import { getMessageFinalFileOutputs } from './activityTimeline'

/**
 * 回复里文件的呈现：agent 用 present_files 选了成果文件时，成果按清单顺序（带说明）排在回答后面，
 * 其余产物收进「过程文件」；没选时维持各轮就地展示全部产物。运行中、结束与刷新后都按这里分组。
 */

export interface ReplyPresentation {
  /** 生效的清单所在的工具调用：成果文件的信息优先取它的输出 */
  toolCall: ToolCall
  files: AgentPresentedFile[]
}

export interface PresentedFileItem {
  key: string
  /** 交给 MediaOutput 的输出：只含这一个文件 */
  output: { files: OutputFile[] }
  caption?: string
}

/** 生效的成果清单：整条消息里最后一次成功且有效的选择，失败的调用不覆盖之前的选择 */
export function findReplyPresentation(rounds: Round[]): ReplyPresentation | null {
  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const toolCalls = rounds[roundIndex]?.toolCalls || []
    for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
      const files = readPresentedFiles(toolCalls[index])
      if (files) return { toolCall: toolCalls[index], files }
    }
  }
  return null
}

function fileIdOf(item: any): string {
  return normalizeFileAssetId(item?.fileId || item?.id)
}

function isPresentationCall(toolCall: ToolCall): boolean {
  return Boolean(readPresentedFiles(toolCall))
}

/** 成果文件：按清单顺序；清单工具调用的输出里没有的，到其他工具的产物里找 */
export function presentedFileItems(
  rounds: Round[],
  presentation: ReplyPresentation
): PresentedFileItem[] {
  const own = parseOutputFiles((presentation.toolCall.output as any)?.files)
  const others = rounds.flatMap(round =>
    (round.toolCalls || []).flatMap(toolCall => parseOutputFiles((toolCall.output as any)?.files))
  )
  return presentation.files.flatMap(({ fileId, caption }) => {
    const file =
      own.find(item => fileIdOf(item) === fileId) || others.find(item => fileIdOf(item) === fileId)
    return file ? [{ key: fileId, output: { files: [file] }, ...(caption ? { caption } : {}) }] : []
  })
}

/** 过程文件：清单以外的产物（跨工具去重），清单调用本身的输出不算 */
export function processFileOutputs(rounds: Round[], presentation: ReplyPresentation): any[] {
  const presented = new Set(presentation.files.map(file => file.fileId))
  const toolRounds = rounds.map(round => ({
    ...round,
    toolCalls: (round.toolCalls || []).filter(toolCall => !isPresentationCall(toolCall)),
  }))
  return getMessageFinalFileOutputs(toolRounds).flatMap(output => {
    const files = Array.isArray(output.files)
      ? output.files.filter((item: any) => !presented.has(fileIdOf(item)))
      : output.files
    const hasFiles = Array.isArray(files) && files.length > 0
    if (!hasFiles && !output.filePreview) return []
    const rest = { ...output }
    if (hasFiles) rest.files = files
    else delete rest.files
    return [rest]
  })
}

/** 同一个文件的身份：fileId（含站内文件地址里的 fileId），再加上去掉域名与参数的地址 */
export function fileIdentityKeys(item: any): string[] {
  if (!item || typeof item !== 'object') return []
  const keys: string[] = []
  const fileId = getFileIdFromItem(item)
  if (fileId) keys.push(`id:${fileId}`)
  for (const url of [item.downloadUrl, item.url, item.previewUrl]) {
    if (typeof url !== 'string' || !url.trim()) continue
    try {
      keys.push(`url:${new URL(url, 'http://local.invalid').pathname}`)
    } catch {
      // 不是地址的字段不参与比较
    }
  }
  return keys
}
