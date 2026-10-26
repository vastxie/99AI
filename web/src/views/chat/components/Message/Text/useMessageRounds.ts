import { answerRoundStart, findQuestion } from '@99agent/contracts'
import { computed } from 'vue'
import type { Round, ToolCall, UnifiedMessage } from '@/types/chat'
import { parseChatMessage } from '@/utils/messageParser'
import { getMessageFinalFileOutputsByRound } from './activityTimeline'
import { readFileField } from '../../../outputFile'
import {
  fileIdentityKeys,
  findReplyPresentation,
  presentedFileItems,
  processFileOutputs,
} from './replyPresentation'
import { getMediaGenerationKind } from './mediaGeneration.helpers'
import {
  extractPreviewableFileLinksFromMarkdown,
  getAssistantMarkdownSource,
  getStreamingMarkdownSource,
} from './markdownSource.helpers'

/**
 * 助手消息按轮（round）渲染所需的数据：解析消息结构、并入实时工具进度、流式正文回退与每轮的最终产物。
 *
 * 纯文本流式阶段服务端不下发 message JSON，正文只在 content 里；rounds 里的文本追不上 content 时，
 * 多出来的部分接在最后一轮后面（或整段单独）按流式渲染。
 *
 * 回答与过程话术（contracts agent-reply）：最后一个过程轮之后的轮次是回答，正文只渲染它们；
 * 之前各轮的文字是过程话术，还没有回答时显示最新一段。agent 选了成果文件时文件按清单集中展示。
 */
export function useMessageRounds(props: {
  message?: string
  content?: string
  loading?: boolean
  liveToolCalls?: Chat.LiveToolCall[]
}) {
  const parsedMessage = computed<UnifiedMessage | null>(() => parseChatMessage(props.message))
  const rounds = computed<Round[]>(() => {
    const value = parsedMessage.value?.rounds
    return Array.isArray(value) ? value : []
  })

  const liveToolCallsByRound = computed(() => {
    const map = new Map<number, ToolCall[]>()
    for (const entry of props.liveToolCalls || []) {
      const roundIndex = Number(entry?.roundIndex)
      const toolCall = entry?.toolCall
      if (!Number.isInteger(roundIndex) || roundIndex < 0 || !toolCall?.id) continue
      const list = map.get(roundIndex) || []
      list.push(toolCall)
      map.set(roundIndex, list)
    }
    return map
  })

  /** 该轮的工具调用：落库的与实时进度按 id 合并，实时的覆盖旧值 */
  function toolCallsOf(round: Round | undefined, roundIdx: number): ToolCall[] {
    const base = round?.toolCalls || []
    const live = liveToolCallsByRound.value.get(roundIdx) || []
    if (live.length === 0) return base
    const merged = [...base]
    for (const liveToolCall of live) {
      const index = merged.findIndex(toolCall => toolCall.id === liveToolCall.id)
      if (index >= 0) merged[index] = { ...merged[index], ...liveToolCall }
      else merged.push(liveToolCall)
    }
    return merged
  }

  /** 并入实时工具进度后的 rounds，活动时间线用它 */
  const activityRounds = computed<Round[]>(() => {
    if (liveToolCallsByRound.value.size === 0) return rounds.value
    return rounds.value.map((round, roundIdx) => {
      const toolCalls = toolCallsOf(round, roundIdx)
      return toolCalls === round.toolCalls ? round : { ...round, toolCalls }
    })
  })

  /** content 里比 rounds 文本多出来的部分（只在生成中） */
  const streamingText = computed(() => {
    if (!props.loading || !props.content) return ''
    const roundsTextLength = rounds.value.reduce((sum, round) => sum + (round.text?.length || 0), 0)
    if (roundsTextLength >= props.content.length) return ''
    return roundsTextLength === 0 ? props.content : props.content.slice(roundsTextLength)
  })

  /** 回答从哪一轮开始：最后一个过程轮之后，没有过程轮时从第 0 轮开始（旧消息全部是回答） */
  const answerStart = computed(() => answerRoundStart(rounds.value))

  function isAnswerRound(roundIdx: number) {
    return roundIdx >= answerStart.value
  }

  /** agent 用 present_files 选定的成果：有它时产物不逐轮展示，成果与过程文件集中在回答后面 */
  const presentation = computed(() => findReplyPresentation(rounds.value))
  const presentedFiles = computed(() =>
    presentation.value ? presentedFileItems(rounds.value, presentation.value) : []
  )
  const processFiles = computed(() =>
    presentation.value ? processFileOutputs(rounds.value, presentation.value) : []
  )

  /** 以提问收尾时的问题（最后一轮里成功的 ask_user） */
  const question = computed(() => findQuestion(parsedMessage.value))

  const finalFilesByRound = computed(() => {
    const map = new Map<number, any[]>()
    getMessageFinalFileOutputsByRound(rounds.value).forEach(({ roundIndex, outputs }) => {
      map.set(roundIndex, outputs)
    })
    return map
  })

  /** 这一轮就地展示的产物数：有成果清单时产物集中展示，各轮不再挂文件 */
  function roundFileCount(roundIdx: number) {
    return presentation.value ? 0 : (finalFilesByRound.value.get(roundIdx)?.length ?? 0)
  }

  /**
   * 每轮要展示的最终产物：工具产出的文件（没有成果清单时），加上回答正文里链接到的可预览文件。
   * 只随消息结构变化重算：流式输出时每帧只有正文变，不再每帧对每轮全文跑正则、序列化产物
   */
  const visibleFinalFilesByRound = computed(() => {
    // 已经出卡片的文件（跨轮次按 fileId / 地址比较）：正文里再链接到它时不重复出卡片
    const shown = new Set<string>()
    const remember = (outputs: any[]) =>
      outputs.forEach(output =>
        readFileField(output?.files).forEach(item =>
          fileIdentityKeys(item).forEach(key => shown.add(key))
        )
      )
    if (presentation.value) {
      remember(presentedFiles.value.map(item => item.output))
      remember(processFiles.value)
    } else {
      finalFilesByRound.value.forEach(outputs => remember(outputs))
    }
    return rounds.value.map((round, roundIdx) => {
      const outputs = presentation.value ? [] : finalFilesByRound.value.get(roundIdx) || []
      // 过程话术不在正文里渲染，它链接的文件也不跟着出现
      if (!isAnswerRound(roundIdx)) return outputs
      const linked = extractPreviewableFileLinksFromMarkdown(round?.text || '').filter(item => {
        const keys = fileIdentityKeys(item)
        if (keys.some(key => shown.has(key))) return false
        keys.forEach(key => shown.add(key))
        return true
      })
      return linked.length > 0 ? [...outputs, { files: linked }] : outputs
    })
  })

  function visibleFinalFilesOf(roundIdx: number): any[] {
    return visibleFinalFilesByRound.value[roundIdx] ?? []
  }

  /**
   * 已经定型的轮次，规范化后的 Markdown 按轮对象缓存：消息结构不变时轮对象不变，
   * 流式输出时每帧不再对它们重跑一遍规范化（多次整串正则替换）
   */
  const settledSources = new WeakMap<Round, string>()

  /**
   * 最后一轮仍在流式输出正文：按流式渲染并接上 content 多出来的部分。
   * 媒体生成阶段正文已经稳定，继续流式渲染会在进度更新时闪烁；这一轮已经挂了最终文件时，
   * 后续正文要排在文件之后（走流式回退），也不在这里接。
   */
  function streamsRound(roundIdx: number) {
    if (!props.loading || roundIdx !== rounds.value.length - 1) return false
    if (toolCallsOf(rounds.value[roundIdx], roundIdx).some(getMediaGenerationKind)) return false
    return roundFileCount(roundIdx) === 0
  }

  function roundText(round: Round, roundIdx: number) {
    const text = round.text || ''
    return streamsRound(roundIdx) && streamingText.value ? `${text}${streamingText.value}` : text
  }

  /** 这一轮交给 Markdown 渲染的源文本：正在流式输出的轮次每次现算，其余按轮对象缓存 */
  function markdownSourceOf(round: Round, roundIdx: number) {
    if (streamsRound(roundIdx)) return getStreamingMarkdownSource(roundText(round, roundIdx))
    let source = settledSources.get(round)
    if (source === undefined) {
      source = getAssistantMarkdownSource(round.text || '')
      settledSources.set(round, source)
    }
    return source
  }

  /** content 多出来的正文单独渲染：rounds 里还没有正文，或最后一轮不在这里接 */
  const showsStreamingFallback = computed(() => {
    if (!streamingText.value) return false
    const lastIdx = rounds.value.length - 1
    const hasFinalFiles = lastIdx >= 0 && roundFileCount(lastIdx) > 0
    return !(props.loading && rounds.value.at(-1)?.text && !hasFinalFiles)
  })

  /** 回答轮里有没有文字（含正在流式输出的部分） */
  const hasAnswerText = computed(
    () =>
      rounds.value.some(
        (round, roundIdx) => isAnswerRound(roundIdx) && Boolean(roundText(round, roundIdx).trim())
      ) ||
      (showsStreamingFallback.value && Boolean(streamingText.value.trim()))
  )

  /**
   * 正文里显示的那段过程话术：还没有回答时（运行中，或只有过程话术就结束了）显示最新一段；
   * 有回答后只留在活动详情里。没有要显示的时为 -1
   */
  const visibleNoteIndex = computed(() => {
    if (hasAnswerText.value) return -1
    for (
      let roundIdx = Math.min(answerStart.value, rounds.value.length) - 1;
      roundIdx >= 0;
      roundIdx--
    ) {
      if (rounds.value[roundIdx]?.text?.trim()) return roundIdx
    }
    return -1
  })

  return {
    parsedMessage,
    rounds,
    activityRounds,
    toolCallsOf,
    streamingText,
    visibleFinalFilesOf,
    streamsRound,
    roundText,
    markdownSourceOf,
    showsStreamingFallback,
    isAnswerRound,
    presentation,
    presentedFiles,
    processFiles,
    question,
    visibleNoteIndex,
  }
}
