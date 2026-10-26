import { t } from '@/locales'
import { normalizeFileAssetId } from '@/utils/privateFileAccess'
import { assetToOutputFile } from '../outputFile'

export const getLiveToolCallKey = (roundIndex: number, toolId: string) => `${roundIndex}:${toolId}`

function getToolCallProgressPayload(toolCall: any) {
  return (
    toolCall?.estimatedProgress ||
    toolCall?.display?.estimatedProgress ||
    toolCall?.output?.estimatedProgress ||
    null
  )
}

function getToolCallWorkflowProgress(toolCall: any) {
  return (
    toolCall?.workflowProgress ||
    toolCall?.display?.workflowProgress ||
    toolCall?.output?.workflowProgress ||
    null
  )
}

function getToolCallOutputHintType(toolCall: any): string {
  return String(
    toolCall?.outputHint?.type ||
      toolCall?.display?.outputHint?.type ||
      toolCall?.output?.outputHint?.type ||
      ''
  ).toLowerCase()
}

function hasOutputFileTarget(item: any) {
  return Boolean(
    normalizeFileAssetId(item?.fileId || item?.id) ||
    item?.url ||
    item?.previewUrl ||
    item?.downloadUrl ||
    item?.previewContent ||
    item?.preview?.content
  )
}

function withAssetFiles(output: any, assetFiles: any[]) {
  if (!output || !assetFiles.length) return output
  if (!Array.isArray(output.files) || output.files.length === 0) {
    return {
      ...output,
      files: assetFiles,
    }
  }

  const usedAssetIndexes = new Set<number>()
  const files = output.files.map((item: any, index: number) => {
    if (hasOutputFileTarget(item)) return item
    const assetFile = assetFiles[index]
    if (!assetFile) return item
    usedAssetIndexes.add(index)
    return {
      ...assetFile,
      ...item,
      type: item?.type && item.type !== 'file' ? item.type : assetFile.type,
      id: assetFile.id,
      fileId: assetFile.fileId,
      privateDownloadHidden: item?.privateDownloadHidden ?? assetFile.privateDownloadHidden,
      privatePreviewHidden: item?.privatePreviewHidden ?? assetFile.privatePreviewHidden,
    }
  })

  assetFiles.forEach((assetFile, index) => {
    if (usedAssetIndexes.has(index)) return
    const hasSameFile = files.some(
      (item: any) => normalizeFileAssetId(item?.fileId || item?.id) === assetFile.fileId
    )
    if (!hasSameFile) files.push(assetFile)
  })

  return {
    ...output,
    files,
  }
}

function collectFileItemsWithHandles(toolCall: any): any[] {
  const lists = [toolCall?.output?.files, toolCall?.display?.files]
  const items: any[] = []
  lists.forEach(list => {
    if (!Array.isArray(list)) return
    list.forEach(item => {
      if (item && normalizeFileAssetId(item.fileId || item.id)) items.push(item)
    })
  })
  return items
}

function findLocalFileWithHandle(localFiles: any[], item: any, index: number) {
  const fileRef = String(item?.fileRef || '')
  if (fileRef) {
    const byRef = localFiles.find(local => String(local?.fileRef || '') === fileRef)
    if (byRef) return byRef
  }
  const title = String(item?.title || item?.name || '').trim()
  if (title) {
    const byTitle = localFiles.find(
      local => String(local?.title || local?.name || '').trim() === title
    )
    if (byTitle) return byTitle
  }
  return localFiles[index]
}

function restoreFileListHandles(list: any, localFiles: any[]) {
  if (!Array.isArray(list) || !localFiles.length) return list
  return list.map((item: any, index: number) => {
    if (!item || typeof item !== 'object') return item
    if (normalizeFileAssetId(item.fileId || item.id)) return item
    const local = findLocalFileWithHandle(localFiles, item, index)
    const fileId = local ? normalizeFileAssetId(local.fileId || local.id) : ''
    if (!fileId) return item
    return {
      ...item,
      id: fileId,
      fileId,
      privateDownloadHidden: item.privateDownloadHidden ?? local.privateDownloadHidden ?? true,
      privatePreviewHidden: item.privatePreviewHidden ?? local.privatePreviewHidden ?? true,
    }
  })
}

/**
 * 服务端快照（snapshot.sync）走公开投影，会剥掉私有文件的 fileId；本地累积的工具调用
 * 已经通过 tool.end 的 assets 拿到了 fileId。用快照整体替换本地消息时，把这些句柄
 * 补回快照里对应的文件项，否则文件卡片要等落库后重拉才会出现。
 */
export function restoreMessageFileHandles(previousMessage: any, nextMessage: any) {
  const previousRounds: any[] = Array.isArray(previousMessage?.rounds) ? previousMessage.rounds : []
  const nextRounds: any[] = Array.isArray(nextMessage?.rounds) ? nextMessage.rounds : []
  if (!previousRounds.length || !nextRounds.length) return nextMessage
  const localToolCalls = new Map<string, any>()
  previousRounds.forEach(round => {
    ;(round?.toolCalls || []).forEach((toolCall: any) => {
      if (toolCall?.id) localToolCalls.set(String(toolCall.id), toolCall)
    })
  })
  if (!localToolCalls.size) return nextMessage
  nextRounds.forEach(round => {
    ;(round?.toolCalls || []).forEach((toolCall: any) => {
      const local = toolCall?.id ? localToolCalls.get(String(toolCall.id)) : undefined
      if (!local) return
      const localFiles = collectFileItemsWithHandles(local)
      if (!localFiles.length) return
      if (toolCall.output && typeof toolCall.output === 'object') {
        toolCall.output = {
          ...toolCall.output,
          files: restoreFileListHandles(toolCall.output.files, localFiles),
        }
      }
      if (!Array.isArray(toolCall.assets) && Array.isArray(local.assets)) {
        toolCall.assets = local.assets
      }
    })
  })
  return nextMessage
}

/** 是否为带实时进度的运行中工具调用（图像/视频生成等需要高频 UI 更新） */
export function isLiveToolProgressCandidate(toolCall: Chat.ToolCall) {
  if (toolCall.status !== 'loading') return false
  const outputHintType = getToolCallOutputHintType(toolCall)
  return Boolean(
    getToolCallProgressPayload(toolCall) ||
    getToolCallWorkflowProgress(toolCall) ||
    outputHintType === 'image' ||
    outputHintType === 'video'
  )
}

export function hasLiveToolProgressInMessage(chatMessage: any) {
  const rounds = Array.isArray(chatMessage?.rounds) ? chatMessage.rounds : []
  return rounds.some((round: any) =>
    (round?.toolCalls || []).some((toolCall: Chat.ToolCall) =>
      isLiveToolProgressCandidate(toolCall)
    )
  )
}

/** 消息中影响布局的稳定文本签名（用于判断快照是否只是工具进度变化） */
export function getMessageStableTextSignature(chatMessage: any): string {
  const rounds = Array.isArray(chatMessage?.rounds) ? chatMessage.rounds : []
  return JSON.stringify({
    content: chatMessage?.content || '',
    rounds: rounds.map((round: any) => ({
      text: round?.text || null,
      thinking: round?.thinking || null,
      completed: Boolean(round?.completed),
      // 阶段决定正文渲染在回答还是过程话术的位置：只有它变了也要整条重渲染
      phase: round?.phase || null,
      interjections: Array.isArray(round?.interjections) ? round.interjections : [],
    })),
  })
}

function shouldSerializeLoadingToolCall(
  existingToolCall: Chat.ToolCall | undefined,
  nextToolCall: Chat.ToolCall
) {
  if (!existingToolCall) return true
  if (nextToolCall.status !== 'loading' || existingToolCall.status !== 'loading') return true
  if (!isLiveToolProgressCandidate(nextToolCall)) return true

  return (
    existingToolCall.name !== nextToolCall.name ||
    existingToolCall.type !== nextToolCall.type ||
    String(existingToolCall.inputSummary || '') !== String(nextToolCall.inputSummary || '')
  )
}

/** 把流式工具事件数据规整为 Chat.ToolCall */
export function buildStreamingToolCall(toolData: any): Chat.ToolCall {
  const rawStatus = String(toolData.status || 'loading')
  const status: Chat.ToolCall['status'] =
    rawStatus === 'success' || rawStatus === 'error' ? rawStatus : 'loading'
  const assets = Array.isArray(toolData.assets) ? toolData.assets : []
  const assetFiles = assets.map(assetToOutputFile).filter(Boolean)
  const displayJson =
    toolData.display?.json && typeof toolData.display.json === 'object' ? toolData.display.json : {}
  const explicitOutput =
    toolData.output && typeof toolData.output === 'object' ? toolData.output : undefined
  const mergedStructuredOutput =
    explicitOutput && Object.keys(displayJson).length > 0
      ? {
          ...displayJson,
          ...explicitOutput,
          details: explicitOutput.details || displayJson.details,
          results: explicitOutput.results || displayJson.results,
          sources: explicitOutput.sources || displayJson.sources,
          queries: explicitOutput.queries || displayJson.queries,
        }
      : explicitOutput
  const output =
    withAssetFiles(mergedStructuredOutput, assetFiles) ||
    (assetFiles.length > 0
      ? {
          files: assetFiles,
          summary: toolData.display?.summary,
          content: toolData.display?.markdown,
        }
      : toolData.display?.json || undefined)

  return {
    id: String(toolData.id || `tool-${Date.now()}`),
    name: String(toolData.name || toolData.displayName || t('activity.tool')),
    arguments: toolData.arguments || toolData.input || {},
    inputSummary: toolData.inputSummary,
    status,
    type: toolData.type,
    outputHint: toolData.outputHint || toolData.display?.outputHint,
    output,
    display: toolData.display,
    duration: toolData.duration ?? toolData.durationMs,
  }
}

/**
 * 把工具调用合并进 round（按 id 更新或追加）。
 * shouldSerialize 为 false 表示只是 live 进度变化，不必整条消息重新序列化。
 */
export function mergeToolCallIntoRound(round: Chat.Round, nextToolCall: Chat.ToolCall) {
  const existingIndex = round.toolCalls.findIndex((tool: any) => tool.id === nextToolCall.id)
  const existingToolCall = existingIndex >= 0 ? round.toolCalls[existingIndex] : undefined
  const shouldSerialize = shouldSerializeLoadingToolCall(existingToolCall, nextToolCall)

  if (existingIndex >= 0) {
    round.toolCalls[existingIndex] = {
      ...round.toolCalls[existingIndex],
      ...nextToolCall,
    }
    return {
      toolCall: round.toolCalls[existingIndex],
      shouldSerialize,
    }
  }

  round.toolCalls.push(nextToolCall)
  return {
    toolCall: nextToolCall,
    shouldSerialize,
  }
}
