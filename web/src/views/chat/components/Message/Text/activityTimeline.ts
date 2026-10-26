import { answerRoundStart } from '@99agent/contracts'
import type {
  ActivityEvent,
  ActivityPanelPayload,
  ActivityPanelStatus,
} from '@/types/preview-panel'
import type { Round, ToolCall } from '@/types/chat'
import { t, tp } from '@/locales'
import { getFileContentType } from '@/utils/codeContent'
import { normalizeFileAssetId } from '@/utils/privateFileAccess'
import { fileItemUrl, hasFileTarget, hasPreviewContent, readFileField } from '../../../outputFile'

type BuildActivityOptions = {
  sourceKey?: string
  messageId?: string
  roundIndex?: number
  loading?: boolean
  /**
   * 回合已进入终态（完成、失败或停止）。此时仍标着执行中的工具说明结束事件没有到达，
   * 按「已中断」展示，也不再让整条消息显示为运行中。
   */
  terminal?: boolean
  title?: string
  /** 这一轮的文字是过程话术（在回答轮之前）：作为一条说明记进活动，排在思考之后、工具之前 */
  note?: boolean
}

const SUMMARY_LIMIT = 120
const SAFE_INPUT_KEYS = [
  'query',
  'keyword',
  'keywords',
  'location',
  'repo',
  'username',
  'fileName',
  'filename',
  'name',
  'title',
  'type',
  'action',
  'task',
  'description',
]

const SENSITIVE_KEY_PATTERN = /token|secret|password|cookie|authorization|apikey|api_key/i
const FINAL_FILE_FIELDS = ['files'] as const
const MAX_TOOL_DURATION_MS = 24 * 60 * 60 * 1000
const IMAGE_URL_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i
const VIDEO_URL_PATTERN = /\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#].*)?$/i
const FILE_URL_PATTERN =
  /\.(psd|pdf|docx?|xlsx?|pptx?|csv|zip|rar|7z|txt|md|markdown|json|html?|xml|rtf)(?:[?#].*)?$/i
const FILE_TOOL_PATTERN =
  /file|document|download|export|sandbox|文件|文档|下载|导出|生成|报告|pdf|word|excel|ppt/i
type FinalFileField = (typeof FINAL_FILE_FIELDS)[number]
type PreviewFileOutput = {
  title: string
  fileType: string
  previewContent: string
  previewContentType: string
  downloadUrl?: string
  path?: string
}

type ClassifiedToolOutput = {
  activitySummary: string | null
  previewContent: string | null
  outputs: Array<{ field: FinalFileField; items: any[] }>
}

function normalizeStatus(status?: string): ActivityEvent['status'] {
  if (status === 'error') return 'error'
  if (status === 'success') return 'success'
  return 'loading'
}

function trimText(value: string, limit = SUMMARY_LIMIT): string {
  const normalized = value.replaceAll(/\s+/gu, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

function stripHtml(value: string): string {
  return value.replaceAll(/<[^>]*>/gu, ' ')
}

function basename(value: string): string {
  const cleaned = value.split(/[?#]/u)[0]
  const parts = cleaned.split(/[\\/]/u).filter(Boolean)
  return parts.at(-1) || cleaned
}

function summarizeUrl(value: string): string {
  try {
    const url = new URL(value)
    const file = basename(url.pathname)
    return file ? `${url.hostname}/${file}` : url.hostname
  } catch {
    return value
  }
}

function sanitizeText(value: unknown, limit = SUMMARY_LIMIT): string {
  if (value === null || value === undefined) return ''
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  const withoutHtml = stripHtml(raw)
  const withoutSignedUrls = withoutHtml.replaceAll(/https?:\/\/[^\s)'"<>]+/gu, match =>
    summarizeUrl(match)
  )
  return trimText(withoutSignedUrls, limit)
}

export function sanitizeToolInput(input: unknown): string | undefined {
  if (!input) return undefined

  if (typeof input === 'string') {
    return sanitizeText(input)
  }

  if (Array.isArray(input)) {
    const safeItems = input
      .slice(0, 3)
      .map(item => sanitizeToolInput(item))
      .filter(Boolean)
    return safeItems.length > 0 ? safeItems.join(t('common.listSeparator')) : undefined
  }

  if (typeof input === 'object') {
    const inputRecord = input as Record<string, any>
    const parts: string[] = []

    for (const key of SAFE_INPUT_KEYS) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue
      const value = inputRecord[key]
      if (value === undefined || value === null || value === '') continue
      parts.push(`${key}: ${sanitizeText(value, 60)}`)
      if (parts.length >= 3) break
    }

    if (parts.length > 0) return parts.join(' · ')
  }

  return undefined
}

export function classifyToolOutput(output: any, _toolCall?: ToolCall): ClassifiedToolOutput {
  if (!output) {
    return {
      activitySummary: null,
      previewContent: null,
      outputs: [],
    }
  }

  const candidate =
    output.summary ||
    output.thought ||
    output.error ||
    output.message ||
    output.title ||
    output.content

  const previewCandidate = output.previewContent

  return {
    activitySummary: candidate ? sanitizeText(candidate) : null,
    previewContent: typeof previewCandidate === 'string' ? previewCandidate : null,
    outputs: FINAL_FILE_FIELDS.map(field => ({
      field,
      items: parseOutputFileField(output[field]),
    })).filter(outputGroup => outputGroup.items.length > 0),
  }
}

function getToolDisplayJson(toolCall: ToolCall): Record<string, any> {
  const displayJson = (toolCall as any)?.display?.json
  return displayJson && typeof displayJson === 'object' && !Array.isArray(displayJson)
    ? displayJson
    : {}
}

function getToolOutputForSummary(toolCall: ToolCall): any {
  const output =
    toolCall.output && typeof toolCall.output === 'object' ? { ...(toolCall.output as any) } : {}
  const display = ((toolCall as any).display || {}) as Record<string, any>
  const displayJson = getToolDisplayJson(toolCall)

  return {
    ...displayJson,
    ...output,
    ...(display.summary && !output.summary ? { summary: display.summary } : {}),
    details: output.details || displayJson.details,
    results: output.results || displayJson.results,
    sources: output.sources || displayJson.sources,
    queries: output.queries || displayJson.queries,
  }
}

function getFirstSearchQuery(output: any): string {
  const queries = Array.isArray(output?.queries) ? output.queries : []
  const firstQuery = queries.find((item: unknown) => typeof item === 'string' && item.trim())
  const value = firstQuery || output?.query || output?.keyword || output?.searchQuery || output?.q
  return typeof value === 'string' ? sanitizeText(value, 80) : ''
}

export function isFileSearchActivityDescriptor(value: unknown): boolean {
  const descriptor = String(value || '').toLowerCase()
  return Boolean(
    descriptor.includes('file_search') ||
    descriptor.includes('file-search') ||
    descriptor.includes('file search') ||
    /文件(?:索引)?(?:检索|搜索)|文档(?:内容)?(?:检索|搜索)/u.test(descriptor)
  )
}

export function isWebSearchActivityDescriptor(value: unknown): boolean {
  const descriptor = String(value || '')
  return Boolean(
    descriptor &&
    !isFileSearchActivityDescriptor(descriptor) &&
    /search|搜索|联网|web_search|serp|bing|google/iu.test(descriptor)
  )
}

function getSearchSourceCount(output: any): number {
  const details = Array.isArray(output?.details) ? output.details : []
  const results = Array.isArray(output?.results) ? output.results : []
  const sources = Array.isArray(output?.sources) ? output.sources : []
  const seen = new Set<string>()

  for (const item of [...details, ...results, ...sources]) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const key = String(
      record.url ||
        record.link ||
        record.href ||
        record.sourceUrl ||
        record.domain ||
        record.title ||
        ''
    ).trim()
    if (key) seen.add(key)
  }

  return seen.size
}

function summarizeSearchToolCall(
  toolCall: ToolCall,
  output = getToolOutputForSummary(toolCall)
): string | null {
  if (!isSearchToolCall(toolCall, output)) return null

  const query = getFirstSearchQuery(output)
  const sourceCount = getSearchSourceCount(output)
  if (query && sourceCount > 0) return `${query} · ${tp('activity.sourcesCount', sourceCount)}`
  if (query) return query
  if (sourceCount > 0) return tp('activity.sourcesCount', sourceCount)
  return null
}

function isSearchToolCall(toolCall: ToolCall, output = getToolOutputForSummary(toolCall)): boolean {
  const label = getToolLabel(toolCall)
  if (isFileSearchActivityDescriptor(label)) return false
  return Boolean(
    toolCall.type === 'search' ||
    isWebSearchActivityDescriptor(label) ||
    Array.isArray(output.queries) ||
    Array.isArray(output.sources)
  )
}

function getActivityToolTitle(
  toolCall: ToolCall,
  output = getToolOutputForSummary(toolCall)
): string {
  if (isSearchToolCall(toolCall, output)) return t('activity.webSearch')
  if (isFileSearchActivityDescriptor(getToolLabel(toolCall))) {
    return (
      (toolCall as any).displayName ||
      (toolCall.name === 'file_search' ? t('activity.fileSearch') : toolCall.name)
    )
  }
  return (toolCall as any).displayName || toolCall.name || t('activity.tool')
}

function getExplicitOutputType(
  toolCall?: ToolCall
): 'image' | 'video' | 'audio' | 'file' | 'document' | null {
  const tool = (toolCall || {}) as any
  const output = tool.display || tool.output || {}
  const hintedType = String(
    tool.outputHint?.type || tool.display?.outputHint?.type || output.outputHint?.type || ''
  ).toLowerCase()
  if (['image', 'video', 'audio', 'file', 'document'].includes(hintedType)) {
    return hintedType as 'image' | 'video' | 'audio' | 'file' | 'document'
  }

  const files = Array.isArray(output.files) ? output.files : []
  const explicitType = files
    .map((item: any) => String(item?.type || item?.fileType || '').toLowerCase())
    .find((type: string) => ['image', 'video', 'audio', 'file', 'document'].includes(type))
  if (explicitType) return explicitType as 'image' | 'video' | 'audio' | 'file' | 'document'
  if (output.filePreview) return 'file'
  return null
}

function getRunningSummary(toolCall?: ToolCall): string {
  const type = toolCall?.type || ''
  const name = toolCall?.name || ''
  const outputType = getExplicitOutputType(toolCall)

  if (type === 'search' || /search|搜索/iu.test(name)) return t('activity.searchingMaterials')
  if (outputType === 'video') return t('activity.generatingVideo')
  if (outputType === 'image') return t('activity.generatingImage')
  if (outputType === 'file' || outputType === 'document') return t('activity.generatingFile')
  if (type === 'creative') return t('activity.generatingContent')
  if (/网页|浏览|链接|阅读|browser|url/iu.test(name)) return t('activity.searchingMaterials')
  if (
    type === 'file' ||
    /文件|文档|markdown|生成文件|创建|编辑|写入|保存|整理|excel|pdf|word/iu.test(name)
  ) {
    return t('activity.generatingFile')
  }
  return t('activity.processing')
}

function getToolDuration(toolCall: ToolCall): number {
  const duration = Number(toolCall.duration || 0)
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (duration > MAX_TOOL_DURATION_MS) return 0
  return duration
}

function getToolsDuration(toolCalls: ToolCall[]): number {
  return toolCalls.reduce((total, toolCall) => total + getToolDuration(toolCall), 0)
}

/** 工具在活动时间线里的展示状态；失败与已中断都算未成功，照样列出 */
function resolveToolStatus(
  toolCall: ToolCall,
  options: BuildActivityOptions = {}
): { status: ActivityEvent['status']; interrupted: boolean } {
  const status = normalizeStatus(toolCall.status)
  if (status === 'loading' && options.terminal) return { status: 'error', interrupted: true }
  return { status, interrupted: false }
}

function getToolErrorText(toolCall: ToolCall): string {
  const output = toolCall.output as { publicError?: unknown; error?: unknown } | undefined
  return String(output?.publicError || output?.error || '').trim()
}

function getRoundThinkingDuration(round: Round): number {
  const duration = Number((round as any).thinkingDuration || 0)
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (duration > MAX_TOOL_DURATION_MS) return 0
  return duration
}

function getRoundsThinkingDuration(rounds: Round[]): number {
  return rounds.reduce((total, round) => total + getRoundThinkingDuration(round), 0)
}

function formatActivityDuration(duration: number): string | null {
  if (!duration || duration <= 0) return null

  const totalSeconds = Math.max(1, Math.round(duration / 1000))
  if (totalSeconds < 60) return t('activity.seconds', { count: totalSeconds })

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds > 0
      ? t('activity.minutesSeconds', { minutes, seconds })
      : t('activity.minutes', { count: minutes })
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0
    ? t('activity.hoursMinutes', { hours, minutes: restMinutes })
    : t('activity.hours', { count: hours })
}

function getCompletedActivitySummary(
  toolCount: number,
  duration: number,
  hasThinking: boolean,
  unsuccessfulCount = 0
): string {
  const durationText = formatActivityDuration(duration)
  if (toolCount > 0) {
    const base =
      unsuccessfulCount > 0
        ? tp('activity.toolCallsWithUnsuccessful', toolCount, { failed: unsuccessfulCount })
        : tp('activity.toolCallsCount', toolCount)
    return durationText ? `${base} · ${durationText}` : base
  }
  if (durationText) return t('activity.thoughtFor', { duration: durationText })
  if (hasThinking) return t('activity.thoughtDone')
  return t('activity.title')
}

function getMessageTools(rounds: Round[]) {
  return rounds.flatMap((round, roundIndex) =>
    (round.toolCalls || []).map((toolCall, toolIndex) => ({
      round,
      roundIndex,
      toolCall,
      toolIndex,
    }))
  )
}

function hasRoundThinking(round: Round): boolean {
  return Boolean(round.thinking && round.thinking.trim())
}

function hasMessageThinking(rounds: Round[]): boolean {
  return rounds.some(round => hasRoundThinking(round))
}

function isRoundThinkingRunning(round: Round, options: BuildActivityOptions = {}): boolean {
  return Boolean(
    options.loading &&
    hasRoundThinking(round) &&
    !round.completed &&
    !round.text &&
    (!round.toolCalls || round.toolCalls.length === 0)
  )
}

function hasRunningThinking(rounds: Round[], loading?: boolean): boolean {
  return rounds.some(round => isRoundThinkingRunning(round, { loading }))
}

function getMessagePanelStatus(
  rounds: Round[],
  options: BuildActivityOptions = {}
): ActivityPanelStatus {
  if (options.terminal) return 'success'
  if (
    getMessageTools(rounds).some(({ toolCall }) => toolCall.status === 'loading') ||
    hasRunningThinking(rounds, options.loading)
  ) {
    return 'running'
  }
  return 'success'
}

/** 跨工具去重用的键：同一个文件被多个工具先后输出时只展示一次 */
function getOutputFileKey(item: any, index: number): string {
  if (!item) return ''
  if (typeof item === 'string') return item
  return (
    fileItemUrl(item) ||
    normalizeFileAssetId(item.fileId || item.id) ||
    item.name ||
    item.title ||
    item.fileName ||
    item.filename ||
    item.path ||
    `file-${index}`
  )
}

function parseOutputFileField(field: any): any[] {
  return readFileField(field).filter(item => hasFileTarget(item))
}

function getToolLabel(toolCall?: ToolCall): string {
  const tool = (toolCall || {}) as any
  return [tool.displayName, tool.toolName, tool.name, tool.type].filter(Boolean).join(' ')
}

function getToolArguments(toolCall?: ToolCall): Record<string, any> {
  return (((toolCall || {}) as any).arguments || {}) as Record<string, any>
}

function isLikelyFileTool(output: any, toolCall?: ToolCall): boolean {
  return Boolean(
    output?.fileType ||
    output?.fileName ||
    output?.filename ||
    output?.documentTitle ||
    FILE_TOOL_PATTERN.test(getToolLabel(toolCall))
  )
}

function hasPreviewFileOutput(output: any): boolean {
  if (!output || typeof output !== 'object') return false
  if (hasPreviewContent(output)) return true

  return readFileField(output.filePreview, { splitUrls: false }).some(item =>
    hasPreviewContent(item)
  )
}

function normalizeFileOutputItem(item: any): any {
  if (typeof item === 'string') return item
  if (item?.downloadUrl && !item.url) {
    return {
      ...item,
      url: item.downloadUrl,
    }
  }
  return item
}

function classifyFileOutputUrl(
  url: string,
  output: any,
  toolCall?: ToolCall
): FinalFileField | null {
  if (
    IMAGE_URL_PATTERN.test(url) ||
    VIDEO_URL_PATTERN.test(url) ||
    FILE_URL_PATTERN.test(url) ||
    isLikelyFileTool(output, toolCall)
  ) {
    return 'files'
  }
  return null
}

function getOutputFileAliases(output: any, toolCall?: ToolCall) {
  const aliases: Record<FinalFileField, any[]> = {
    files: [],
  }

  const addItems = (field: any, forcedField?: FinalFileField) => {
    parseOutputFileField(field).forEach(item => {
      if (forcedField === 'files' && hasPreviewContent(item)) return
      const url = fileItemUrl(item)
      if (!url && !hasFileTarget(item)) return
      const fileField = forcedField || (url ? classifyFileOutputUrl(url, output, toolCall) : null)
      if (!fileField) return
      aliases[fileField].push(normalizeFileOutputItem(item))
    })
  }

  if (!hasPreviewFileOutput(output)) {
    addItems(output?.downloadUrl, 'files')
  }
  addItems(output?.files, 'files')

  return aliases
}

function getFileItemsForField(output: any, field: FinalFileField, toolCall?: ToolCall) {
  return [
    ...parseOutputFileField(output?.[field]),
    ...getOutputFileAliases(output, toolCall)[field],
  ]
}

function getOutputFileName(output: any, toolCall?: ToolCall): string {
  const args = getToolArguments(toolCall)
  return (
    output?.name ||
    output?.title ||
    output?.fileName ||
    output?.filename ||
    output?.documentTitle ||
    (typeof args.path === 'string' ? basename(args.path) : '') ||
    'document'
  )
}

function normalizePreviewFileOutput(
  source: any,
  fallbackOutput: any,
  toolCall?: ToolCall
): PreviewFileOutput | null {
  if (!source || typeof source !== 'object') return null
  const previewContent =
    typeof source.previewContent === 'string' ? source.previewContent.trim() : ''
  if (!previewContent) return null

  const args = getToolArguments(toolCall)
  const title =
    source.title ||
    source.name ||
    source.fileName ||
    source.filename ||
    fallbackOutput?.title ||
    getOutputFileName(fallbackOutput, toolCall)
  const fileType = source.fileType || fallbackOutput?.fileType || ''

  return {
    title,
    fileType,
    previewContent: source.previewContent,
    previewContentType: getFileContentType(source.previewContentType || fileType),
    downloadUrl: source.downloadUrl,
    path: source.path || fallbackOutput?.path || args.path,
  }
}

function getPreviewFileOutputs(output: any, toolCall?: ToolCall): any[] {
  if (!output) return []

  const explicitItems = readFileField(output.filePreview, { splitUrls: false })
    .map(item => normalizePreviewFileOutput(item, output, toolCall))
    .filter(Boolean)

  const directItem = normalizePreviewFileOutput(output, output, toolCall)
  if (directItem) explicitItems.unshift(directItem)

  return explicitItems as PreviewFileOutput[]
}

function getUniqueFinalFileOutput(toolCall: ToolCall, seenUrls: Set<string>): any | null {
  const output = toolCall.output as any
  if (!output) return null

  const result = { ...output }
  let hasNewFileOutput = false

  for (const field of FINAL_FILE_FIELDS) {
    const items = getFileItemsForField(output, field, toolCall)
    const uniqueItems = items.filter(item => {
      const key = getOutputFileKey(item, seenUrls.size)
      if (!key || seenUrls.has(key)) return false
      seenUrls.add(key)
      return true
    })

    if (uniqueItems.length > 0) {
      result[field] = uniqueItems
      hasNewFileOutput = true
    } else {
      delete result[field]
    }
  }

  const uniquePreviewItems = getPreviewFileOutputs(output, toolCall).filter(item => {
    const key = item.path || item.title || item.previewContent?.slice(0, 80)
    if (!key) return false
    const seenKey = `preview:${key}`
    if (seenUrls.has(seenKey)) return false
    seenUrls.add(seenKey)
    return true
  })

  if (uniquePreviewItems.length > 0) {
    result.filePreview = uniquePreviewItems
    hasNewFileOutput = true
  } else {
    delete result.filePreview
  }

  return hasNewFileOutput ? result : null
}

function collectFinalFileOutputs(toolCalls: ToolCall[], seenUrls = new Set<string>()): any[] {
  return toolCalls
    .filter(toolCall => toolCall.status !== 'loading' && hasFinalFileOutput(toolCall))
    .map(toolCall => getUniqueFinalFileOutput(toolCall, seenUrls))
    .filter(Boolean)
}

export function hasFinalFileOutput(toolCall: ToolCall): boolean {
  const output = toolCall.output as any
  if (!output) return false
  return (
    FINAL_FILE_FIELDS.some(field => getFileItemsForField(output, field, toolCall).length > 0) ||
    getPreviewFileOutputs(output, toolCall).length > 0
  )
}

export function getMessageFinalFileOutputs(rounds: Round[]): any[] {
  return collectFinalFileOutputs(getMessageTools(rounds).map(({ toolCall }) => toolCall))
}

export function getMessageFinalFileOutputsByRound(
  rounds: Round[]
): Array<{ roundIndex: number; outputs: any[] }> {
  const seenUrls = new Set<string>()

  return rounds
    .map((round, roundIndex) => ({
      roundIndex,
      outputs: collectFinalFileOutputs(round.toolCalls || [], seenUrls),
    }))
    .filter(item => item.outputs.length > 0)
}

export function hasVisibleMessageActivity(rounds: Round[]): boolean {
  return hasMessageThinking(rounds) || getMessageTools(rounds).length > 0
}

export function buildActivityEvents(
  round: Round,
  options: BuildActivityOptions = {}
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  if (round.thinking) {
    const thinkingRunning = isRoundThinkingRunning(round, options)
    events.push({
      id: `thinking-${options.roundIndex ?? 0}`,
      title: t('activity.thinkingSummary'),
      status: thinkingRunning ? 'loading' : 'success',
      roundIndex: options.roundIndex,
      type: 'thinking',
      summary: thinkingRunning ? t('activity.thinking') : t('activity.thoughtDone'),
      content: round.thinking,
      duration: getRoundThinkingDuration(round) || undefined,
    })
  }

  if (options.note && round.text?.trim()) {
    events.push({
      id: `note-${options.roundIndex ?? 0}`,
      title: t('activity.note'),
      status: 'success',
      roundIndex: options.roundIndex,
      type: 'note',
      content: round.text,
    })
  }

  ;(round.toolCalls || []).forEach((toolCall, index) => {
    const { status, interrupted } = resolveToolStatus(toolCall, options)
    const errorText = status === 'error' && !interrupted ? getToolErrorText(toolCall) : ''

    const safeInputSummary =
      (toolCall as any).inputSummary ||
      (toolCall.output as any)?.inputSummary ||
      sanitizeToolInput(toolCall.arguments)
    const output = getToolOutputForSummary(toolCall)
    const outputSummary =
      summarizeSearchToolCall(toolCall, output) ||
      classifyToolOutput(output, toolCall).activitySummary ||
      undefined

    events.push({
      id: toolCall.id || `tool-${options.roundIndex ?? 0}-${index}`,
      title: getActivityToolTitle(toolCall, output),
      status,
      toolName: toolCall.name,
      roundIndex: options.roundIndex,
      toolIndex: index,
      type: toolCall.type,
      outputHint:
        (toolCall as any).outputHint ||
        (toolCall as any).display?.outputHint ||
        (toolCall.output as any)?.outputHint,
      summary:
        status === 'loading' ? getRunningSummary(toolCall) : outputSummary || safeInputSummary,
      duration: getToolDuration(toolCall) || undefined,
      safeInputSummary,
      output: toolCall.output,
      ...(toolCall.display ? { display: toolCall.display } : {}),
      ...(interrupted ? { interrupted: true } : {}),
      ...(errorText ? { error: errorText } : {}),
    })
  })

  return events
}

export function buildMessageActivityEvents(
  rounds: Round[],
  options: BuildActivityOptions = {}
): ActivityEvent[] {
  const answerStart = answerRoundStart(rounds)
  return rounds.flatMap((round, roundIndex) =>
    buildActivityEvents(round, {
      ...options,
      roundIndex,
      note: roundIndex < answerStart,
    })
  )
}

export function getMessageActivitySummary(
  rounds: Round[],
  options: BuildActivityOptions = {}
): string {
  const tools = getMessageTools(rounds)
  const status = getMessagePanelStatus(rounds, options)
  const thinkingRunning = hasRunningThinking(rounds, options.loading)

  if (status === 'running') {
    const activeTool = tools.find(({ toolCall }) => toolCall.status === 'loading') || tools.at(-1)
    if (activeTool) return getRunningSummary(activeTool.toolCall)
    if (thinkingRunning) return t('activity.thinking')
    return t('activity.processing')
  }

  return getCompletedActivitySummary(
    tools.length,
    getRoundsThinkingDuration(rounds) + getToolsDuration(tools.map(({ toolCall }) => toolCall)),
    hasMessageThinking(rounds),
    tools.filter(({ toolCall }) => resolveToolStatus(toolCall, options).status === 'error').length
  )
}

export function buildMessageActivity(
  rounds: Round[],
  options: BuildActivityOptions = {}
): ActivityPanelPayload {
  const status = getMessagePanelStatus(rounds, options)
  const events = buildMessageActivityEvents(rounds, options)
  const duration =
    getRoundsThinkingDuration(rounds) +
    getToolsDuration(getMessageTools(rounds).map(({ toolCall }) => toolCall))

  return {
    sourceKey: options.sourceKey,
    messageId: options.messageId,
    title: options.title || t('activity.title'),
    status,
    summary: getMessageActivitySummary(rounds, options),
    duration: duration || undefined,
    events,
  }
}
