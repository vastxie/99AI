/**
 * 工作区域 store：会话分组、消息列表与分页缓存、路由激活态。
 *
 * 拆分边界（与计划中"四 store"的差异说明）：
 * - 模型目录 → store/modules/modelCatalog
 * - 会话与消息保留在一起：删除会话需同步清理消息缓存、路由激活同时驱动两者，
 *   强行分拆只会产生跨 store 编排，无清晰度收益。
 * - 「当前会话选用的模型」属于会话配置（activeConfig 链），不归模型目录。
 */
import { defineStore } from 'pinia'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { t } from '@/locales'
import { useModelCatalogStore } from '../modelCatalog'
import {
  loadChatState,
  loadStoredDraftState,
  mergeChanged,
  normalizeDrafts,
  normalizeQuotes,
  saveChatPreferences,
  type DraftChanges,
} from './persistence'

import {
  fetchDelChatLogAPI,
  fetchQueryChatLogAroundAPI,
  fetchQueryChatLogListAPI,
} from '@/api/chatLog'
import {
  cancelQueuedChatTurnWithAck,
  createSubmissionId,
  queueChatTurnWithAck,
  type QueuedChatTurnInput,
} from '@/api'
import {
  fetchCreateChatGroupAPI,
  fetchDeleteChatGroupAPI,
  fetchQueryChatGroupsAPI,
  fetchUpdateChatGroupAPI,
  type ChatGroupSummary,
} from '@/api/chatGroup'
import { useGlobalStore } from '../global'
import { useComposerAttachmentsStore } from './attachments'
import { eventBus } from '@/core/events/eventBus'
import { IdentityChangedError } from '@/services/identity'
import { isConversationId } from '@/constants/conversation'
import { isAssistantRunning, TERMINAL_CHAT_LOG_STATUSES } from './messageState'
import { resolveEffectiveModelConfig } from './modelConfig'
import { parseStoredTurnId } from '@/utils/messageParser'
import { getModelReasoningControl } from '@/utils/reasoning'

const MESSAGE_PAGE_LIMIT = 50
/** 在途的新建会话（按 store 实例）：只复用同一会话数据代次的那一个，换身份后的新建不拿旧身份的 */
const pendingWorkspaceCreations = new WeakMap<object, { epoch: number; promise: Promise<string> }>()
/**
 * queryMyGroup 的请求新鲜度序号：只允许「最新一次请求」的响应提交
 * groupList / active 与草稿相关的副作用，交错请求的过期响应整体丢弃。
 * 否则旧快照晚到会把「创建会话 + 刷新列表」之后的状态整表打回，
 * 草稿被静默清掉、active 被改写且没有恢复路径。
 */
let queryMyGroupRequestSeq = 0
/**
 * 最新一次 queryMyGroup 的落地信号。被更新请求取代的旧请求在返回前等待它：
 * 旧调用方（如深链路由同步）await 完成后读到的必是最新一次请求落地后的状态，
 * 而不是「请求发起前」的旧状态（否则会误判深链会话不存在）。
 */
let queryMyGroupLatestSettled: Promise<void> = Promise.resolve()
/**
 * 排队回执结果不明：保留排队意图（同一提交号重发、按聊天记录对账）。清不清草稿看聊天记录里
 * 这条补充要求有没有真的执行（reconcilePendingQueueIntentFromChatLog），没发出去的不会被清
 */
const UNKNOWN_QUEUE_ACK_CODES = new Set([
  'TIMEOUT',
  'CONNECTION_FAILED',
  // 实时连接校验失败（服务端随后断开）：服务端没有处理这次排队，结果按不确定保留，稍后可用同一提交号重试
  'SESSION_UNAVAILABLE',
  'SESSION_INVALID',
])
/** 首页（还没有会话）输入框草稿的键 */
export const NEW_CONVERSATION_DRAFT_KEY = ''
/** 输入框每次按键都会改草稿：合并成一次写本地存储，页面隐藏前补写 */
const DRAFT_PERSIST_DELAY = 300
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null
let flushDraftPersist: (() => void) | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flushDraftPersist?.())
  // 手机切到后台后可能被系统直接回收，不一定有 pagehide
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDraftPersist?.()
  })
}
/**
 * 本页改过、还没写进本地存储的草稿与引用：写入时只合并这些会话，别的标签页写的保留；
 * 整体清空过（退出登录、换号）时整份替换
 */
const pendingDraftChanges: DraftChanges = {
  draftKeys: new Set<string>(),
  quoteKeys: new Set<string>(),
  replace: false,
}
/**
 * 别的页签换了身份、本页的改动写不进本地存储期间改过的会话。用在：同一个账号再认领时这些以本页为准、
 * 其余以收起的那份为准（别的页签发出、清空了的不被本页的旧内容写回）；收起草稿时并进去；
 * 游客登录以存储为底、存储重新归本页的身份时，只在存储里还没有这一条时写进去（有的以存储为准）
 */
const unsavedDraftChanges = { draftKeys: new Set<string>(), quoteKeys: new Set<string>() }
/** keys 里存储还没有值的那些 */
function keysAbsentFrom<T>(keys: Iterable<string>, values: Record<string, T>) {
  return [...keys].filter(key => values[key] === undefined)
}
function clearUnsavedDraftChanges() {
  unsavedDraftChanges.draftKeys.clear()
  unsavedDraftChanges.quoteKeys.clear()
}
/** 记下改过的会话：重新放到最后，写入时按改动先后排列，上限截掉的是最久没改的 */
function markChanged(keys: Set<string>, ...changed: string[]) {
  for (const key of changed) {
    keys.delete(key)
    keys.add(key)
  }
}

/**
 * 登录过期成了游客时收起的草稿：存储还归这个账号时以存储为底、换上本页还没写进去的改动（本页内存里的
 * 可能是旧的：别的页签后来写的、发出后清掉的都以存储为准）；存储已经归了别人就用本页的
 */
function stashDrafts(
  owner: string,
  state: Pick<Chat.ChatState, 'drafts' | 'quotes' | 'draftConfig'>
): Chat.StashedDrafts {
  const stored = loadStoredDraftState()
  const fromStorage = stored.draftOwner === owner
  const draftKeys = [...unsavedDraftChanges.draftKeys, ...pendingDraftChanges.draftKeys]
  const quoteKeys = [...unsavedDraftChanges.quoteKeys, ...pendingDraftChanges.quoteKeys]
  return {
    owner,
    drafts: fromStorage
      ? normalizeDrafts(mergeChanged(stored.drafts, state.drafts, draftKeys))
      : state.drafts,
    quotes: fromStorage
      ? normalizeQuotes(mergeChanged(stored.quotes, state.quotes, quoteKeys))
      : state.quotes,
    draftConfig: state.draftConfig,
  }
}

/** 各会话在途的往上翻页：丢掉过期刷新后的重取等它结束（不限时），两边不交错 */
const olderLoadsInFlight = new Map<string, Promise<void>>()

/**
 * 会话数据的代次：clearChat（只由身份变化调用：登录、过期、退出、换访客）时加一。
 * 异步 action 发起时记下它，每个 await 之后核对，变了就不再写状态（旧身份的结果不能落到新身份上）；
 * finally 里的收尾（settle、删除自己的在途记录）照常执行，后续调用不会卡住
 */
let chatEpoch = 0
export function chatDataEpoch() {
  return chatEpoch
}

/** 提交锁的持有者凭据：0 表示空闲（见 acquireSubmitLock） */
let submitLockSeq = 0
let submitLockHolder = 0

/** 这次提交在发出之前已被作废（停止按钮、身份变化）：调用方静默结束，草稿留着 */
export class SubmissionCancelledError extends Error {
  readonly code = 'SUBMISSION_CANCELLED'
  /** 与 notifyError 的约定：不要再提示 */
  readonly notified = true
  constructor() {
    super('submission cancelled')
  }
}

function normalizeQueueFollowUpPayload(
  input: Chat.QueueFollowUpCanonicalPayload
): Chat.QueueFollowUpCanonicalPayload {
  const modelId = Number(input.modelId)
  return {
    prompt: String(input.prompt || '').trim(),
    model: String(input.model || '').trim(),
    modelId: Number.isInteger(modelId) && modelId > 0 ? modelId : null,
  }
}

function isSameQueueFollowUpPayload(
  left: Chat.QueueFollowUpCanonicalPayload,
  right: Chat.QueueFollowUpCanonicalPayload
) {
  return (
    left.prompt === right.prompt && left.model === right.model && left.modelId === right.modelId
  )
}

function getChatMessageTurnId(message?: Chat.Chat) {
  return String(message?.turnId || parseStoredTurnId(message?.message) || '').trim()
}

function isTerminalAssistantMessage(message?: Chat.Chat) {
  return Boolean(
    message?.role === 'assistant' && TERMINAL_CHAT_LOG_STATUSES.has(Number(message.status))
  )
}

/**
 * 最多保留这么多个会话的消息缓存：切过的会话都常驻内存，会话一多、长会话各有上百条消息时会越占越多。
 * 更早打开的丢掉缓存，再打开时重新加载
 */
export const MESSAGE_CACHE_LIMIT = 8

/** 服务端给新会话写入的默认标题：前端当作「未命名」，显示时按界面语言换成「新对话」 */
const SERVER_DEFAULT_CONVERSATION_TITLE = '新对话'

function normalizeConversationTitle(value: unknown) {
  const title = String(value || '').trim()
  return title === SERVER_DEFAULT_CONVERSATION_TITLE ? '' : title
}

function normalizeConversationGroup(input: any): Chat.ConversationGroup | null {
  const uuid = String(input?.uuid || input?.gid || '').trim()
  if (!isConversationId(uuid)) return null

  return {
    uuid,
    title: normalizeConversationTitle(input?.title),
    channel: typeof input?.channel === 'string' ? input.channel : 'web',
    config: typeof input?.config === 'string' ? input.config : JSON.stringify(input?.config || {}),
    isSticky: Boolean(input?.isSticky),
    params: input?.params ?? undefined,
    createdAt: input?.createdAt,
    updatedAt: input?.updatedAt,
  }
}

function isConversationGroup(
  input: Chat.ConversationGroup | null
): input is Chat.ConversationGroup {
  return input !== null
}

function getConversationGroupUpdatedAtValue(value?: Date | string | number) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getConversationGroupActivityValue(group: Chat.ConversationGroup) {
  return (
    getConversationGroupUpdatedAtValue(group.updatedAt) ||
    getConversationGroupUpdatedAtValue(group.createdAt)
  )
}

function sortConversationGroups(groups: Chat.ConversationGroup[]) {
  return groups.toSorted((left, right) => {
    const stickyDelta = Number(Boolean(right.isSticky)) - Number(Boolean(left.isSticky))
    if (stickyDelta !== 0) return stickyDelta
    return (
      getConversationGroupUpdatedAtValue(right.updatedAt) -
      getConversationGroupUpdatedAtValue(left.updatedAt)
    )
  })
}

function getConversationGroupChannel(group?: Pick<Chat.ConversationGroup, 'channel'> | null) {
  return String(group?.channel || 'web')
    .trim()
    .toLowerCase()
}

function isSidebarVisibleGroup(group: Chat.ConversationGroup) {
  // 非 web 渠道（各类 Bot / 渠道网关）创建的会话不进侧栏列表
  return getConversationGroupChannel(group) === 'web'
}

function pickLatestChannelGroup(groups: Chat.ConversationGroup[], channel: string) {
  return groups
    .filter(item => getConversationGroupChannel(item) === channel)
    .toSorted(
      (left, right) =>
        getConversationGroupActivityValue(right) - getConversationGroupActivityValue(left)
    )[0]
}

function pickResponseData<T>(response: any): T {
  return (response?.data ?? response) as T
}

function uniqueMessages(rows: Chat.Chat[]) {
  const seenIds = new Set<string>()
  const result: Chat.Chat[] = []

  rows.forEach(item => {
    if (item.cid) {
      if (seenIds.has(item.cid)) return
      seenIds.add(item.cid)
    }
    result.push(item)
  })

  return result
}

/**
 * 停止流程已经落定终态的回复（cid → 状态）：服务端落库可能晚于本页的停止回执，在那之前发出的刷新
 * 会带回「生成中」的行，不能用它把本地的终态退回去；服务端带回终态时以服务端为准并删掉记录。
 * 清空会话数据时清空，只保留最近的这些条
 */
const settledTerminalCids = new Map<string, number>()
const SETTLED_TERMINAL_LIMIT = 100

export function markReplySettled(cid: string, status: number) {
  settledTerminalCids.delete(cid)
  settledTerminalCids.set(cid, status)
  while (settledTerminalCids.size > SETTLED_TERMINAL_LIMIT) {
    settledTerminalCids.delete(settledTerminalCids.keys().next().value!)
  }
}

/** 同一条消息的本地版本与服务端版本合成一条 */
function mergeRefreshedRow(local: Chat.Chat, incoming: Chat.Chat): Chat.Chat {
  const incomingStatus = Number(incoming.status)
  const incomingStillGenerating =
    incomingStatus === ChatLogStatus.PENDING || incomingStatus === ChatLogStatus.GENERATING
  const cid = local.cid || incoming.cid
  if (cid && settledTerminalCids.has(cid)) {
    // 停止流程落定的终态（只看状态，不看 loading）：服务端仍是生成中就保留本地；服务端也到了终态就以它为准
    if (!incomingStillGenerating) settledTerminalCids.delete(cid)
    else if (TERMINAL_CHAT_LOG_STATUSES.has(Number(local.status))) return local
  }
  // 流式进行中的消息以本地投影为准：DB 行此刻没有 loading/liveToolCalls
  // 且内容滞后，整行替换会把正在生成的消息瞬间打成「已完成」外观；
  // 服务端已落终态时（status 非生成中）仍以 DB 为准，避免本地状态悬挂
  if (local.loading === true && incomingStillGenerating) return local
  // 只存在本地的状态，服务端的行不带：跟丢的标记（服务端仍在生成时保留，否则显示成生成中却没人接着）、
  // 这次失败能否重试
  return {
    ...incoming,
    ...(incomingStillGenerating && local.recovery
      ? {
          recovery: local.recovery,
          recoveryMessage: local.recoveryMessage,
          recoveryRejected: local.recoveryRejected,
        }
      : {}),
    ...(local.errorRetryable !== undefined && incoming.errorRetryable === undefined
      ? { errorRetryable: local.errorRetryable }
      : {}),
  }
}

/**
 * 刷新合并，按服务端的顺序重建列表（响应是会话最新的一页）：
 * 1. 比这一页更早、之前翻页加载的本地消息，原样保留在前面；
 * 2. 这一页的消息按服务端顺序，逐条与本地版本合并（本地没有的也按位置放进来，
 *    例如别处替换掉几轮后，最新一页往前多出来的旧消息）；
 * 3. 请求途中本地新加的（agent.start 带来的这一轮）接在最后。
 * 请求发出时本地已有、落在这一页范围里、服务端却没有返回的消息，已在别处删掉（别的页签重新生成、
 * 编辑重发替换掉的旧回合），不再保留；请求途中本地删掉的（本页替换截掉的），也不从过期的响应里加回来。
 * 这一页的范围：完整响应（没有更早的页）是整个会话，否则从它最早一条在本地的位置开始。
 *
 * 这一页不完整、又和本地一条都接不上：
 * - 带来了本地不认识的消息（别处新增了一页以上、本地整段在别处被替换）：本地那些放在哪里都不对，
 *   按这一页重建（rebased，翻页从这一页的游标重新往前加载）；
 * - 列表里有搜索定位取来、还没接上最新的一段（detachedTailCid 是它的最后一条）：那一段就是用户要看的，
 *   留在前面，最新一页接在后面；
 * - 这一页的消息都在请求途中被本地删掉了（本页替换截掉）：没有可重建的，本地的原样保留。
 * 请求途中本地新加的（正在生成的这一轮）是最后一条已知消息之后的那些，始终接在最后；更前面的
 * （往上翻页插进来的更早消息）留在原位。
 * 定位的一段在这一页里接上了最新（完整响应，或这一页含它的最后一条、或这一页把它去掉了）才回到普通列表；
 * 还没接上时返回它的最后一条作为 detachedTailCid
 */
function mergeMessagesForRefresh(
  currentRows: Chat.Chat[],
  incomingRows: Chat.Chat[],
  options: { requestedCids: ReadonlySet<string>; complete: boolean; detachedTailCid?: string }
): { rows: Chat.Chat[]; rebased: boolean; detachedTailCid?: string } {
  const localByCid = new Map<string, Chat.Chat>()
  currentRows.forEach(row => {
    if (row.cid) localByCid.set(row.cid, row)
  })
  const incomingCids = new Set(incomingRows.map(row => row.cid).filter(Boolean))
  const firstCoveredCid = incomingRows.find(row => row.cid && localByCid.has(row.cid))?.cid
  const page = incomingRows
    .filter(row => !(row.cid && options.requestedCids.has(row.cid) && !localByCid.has(row.cid)))
    .map(row => {
      const local = row.cid ? localByCid.get(row.cid) : undefined
      return local ? mergeRefreshedRow(local, row) : row
    })
  const isAddedMeanwhile = (row: Chat.Chat) =>
    !row.cid || (!incomingCids.has(row.cid) && !options.requestedCids.has(row.cid))
  const tailCid = options.detachedTailCid
  const stillDetached = Boolean(
    tailCid && !options.complete && !incomingCids.has(tailCid) && localByCid.has(tailCid)
  )
  // 最后一条被这一页去掉了（别处删了它）：这一页是从它前面的某条一直盖到最新，已经接上了
  const result = (rows: Chat.Chat[], rebased: boolean) =>
    stillDetached && rows.some(row => row.cid === tailCid)
      ? { rows, rebased, detachedTailCid: tailCid }
      : { rows, rebased }

  if (!options.complete && !firstCoveredCid) {
    const lastKnown = currentRows.findLastIndex(row => !isAddedMeanwhile(row))
    const kept = currentRows.slice(0, lastKnown + 1)
    const addedMeanwhile = currentRows.slice(lastKnown + 1)
    if (page.length && !tailCid) {
      return result(uniqueMessages([...page, ...addedMeanwhile]), true)
    }
    return result(uniqueMessages([...kept, ...page, ...addedMeanwhile]), false)
  }

  const coveredFrom = options.complete
    ? 0
    : currentRows.findIndex(row => row.cid === firstCoveredCid)
  const earlier = currentRows
    .slice(0, coveredFrom)
    .filter(row => !row.cid || !incomingCids.has(row.cid))
  const addedMeanwhile = currentRows.slice(coveredFrom).filter(isAddedMeanwhile)

  return result(uniqueMessages([...earlier, ...page, ...addedMeanwhile]), false)
}

/**
 * 每个会话的列表版本：整表换掉（搜索定位、刷新重建）时加一。往上翻页的响应回来时版本变了就丢掉：
 * 它是按换掉之前的游标取的，拼上去会把更新的一段排到前面、还会盖掉新的游标
 */
const listVersionByWorkspace = new Map<string, number>()
const listVersionOf = (workspaceId: string) => listVersionByWorkspace.get(workspaceId) ?? 0
const bumpListVersion = (workspaceId: string) =>
  listVersionByWorkspace.set(workspaceId, listVersionOf(workspaceId) + 1)

function buildModelConfigFromModel(model: any) {
  if (!model) return null
  const capabilities = model.capabilities || {}
  return {
    reasoningEffort: getModelReasoningControl(capabilities).defaultLevel,
    modelInfo: {
      id: model.id,
      modelName: model.modelName || model.label || model.model || '',
      model: model.model || model.value || '',
      deduct: model.deduct,
      deductType: model.deductType,
      multimodalTypes: model.multimodalTypes || [],
      protocol: model.protocol,
      capabilities,
      modelAvatar: model.modelAvatar || '',
      isFixedModel: model.isFixedModel || false,
      modelDescription: model.modelDescription || '',
      maxModelTokens: model.maxModelTokens,
    },
  }
}

function hasModelConfig(config: any) {
  return Boolean(config?.modelInfo?.model)
}

function parseModelConfig(config?: string | null) {
  if (!config) return null
  try {
    return JSON.parse(config)
  } catch {
    return null
  }
}

export const useChatStore = defineStore('chat', {
  state: (): Chat.ChatState => loadChatState(),

  getters: {
    /**
     * 是否有正在进行的回复。
     * 覆盖两段：提交发起到服务端 ack 返回的窗口（isSubmitting），
     * 以及助手消息真正处于流式生成中（最后一条 loading）。
     * 切换会话禁用、静默刷新、搜索/退出等守卫都依赖它，
     * 因此不能退化成只在提交瞬间为真的手工标志。
     */
    isStreamIn(state): boolean {
      return Boolean(state.isSubmitting) || isAssistantRunning(state.chatList.at(-1))
    },

    /**
     * 导航（切换 / 新建 / 搜索跳转）是否应被阻塞。
     *
     * 只在提交发起到 ack 返回这段极短窗口内拦截——此时消息尚未落地，切走会丢上下文。
     * 生成中不拦：Agent 长任务可达数分钟，钉住用户是体验倒退，
     * 而且会让「切走再切回自动恢复」这条链路永远无法触发。
     * 真正具破坏性的操作（如删除正在生成的会话）仍用 isStreamIn 拦。
     */
    isNavigationLocked(state): boolean {
      return Boolean(state.isSubmitting)
    },

    /** 当前会话输入框里没发出去的内容：每个会话（含首页）各有一份，切换会话互不影响 */
    prompt(state): string {
      return state.drafts[state.active] ?? ''
    },

    /** 当前会话输入框上方待发送的引用 */
    activeQuote(state): Chat.DraftQuote | null {
      return state.quotes[state.active] ?? null
    },

    /** 当前会话已排进下一轮的补充要求 */
    activeQueuedFollowUp(state): { text: string; turnId: string } | null {
      return state.queuedFollowUps[state.active] ?? null
    },

    /* 当前选用模型的配置 */
    activeConfig: state => {
      const modelCatalog = useModelCatalogStore()
      const draftConfig = hasModelConfig(state.draftConfig) ? state.draftConfig : null
      const baseConfig = hasModelConfig(modelCatalog.baseConfig) ? modelCatalog.baseConfig : null
      const firstModelConfig = buildModelConfigFromModel(modelCatalog.modelList?.[0])
      return draftConfig || baseConfig || firstModelConfig || {}
    },

    /**
     * 当前会话真正生效的配置：以会话组自身 config 为底，叠加用户本次改动（draftConfig）。
     * 发送链路与模型选择器必须共用它，否则会出现「选择器显示 A、实际发送 B」。
     */
    activeSessionConfig(state): any {
      const activeGroup = isConversationId(state.active)
        ? state.groupList?.find(item => item.uuid === state.active)
        : undefined
      const groupConfig = parseModelConfig(activeGroup?.config)
      if (!groupConfig) return this.activeConfig || {}

      const draftConfig = hasModelConfig(state.draftConfig) ? state.draftConfig : null
      if (!draftConfig) return groupConfig

      // 固定模型会话不允许被 draft 换模型：选择器对这类会话本就隐藏，
      // 能出现的 draft 都是从别的会话带过来的残留，让它生效等于绕开固定模型限制。
      // 其余字段（推理档位等）仍可被 draft 覆盖。
      const isFixedModelGroup = groupConfig.modelInfo?.isFixedModel === 1

      return {
        ...groupConfig,
        ...draftConfig,
        modelInfo: isFixedModelGroup
          ? groupConfig.modelInfo
          : draftConfig.modelInfo || groupConfig.modelInfo,
      }
    },

    /**
     * 当前会话实际生效的配置：会话配置叠加本次改动，没有可用模型时回落到
     * 本次改动 → 管理员默认模型 → 列表第一个。显示与发送都只读它。
     */
    effectiveModelConfig(): any {
      return resolveEffectiveModelConfig(this.activeSessionConfig, this.activeConfig)
    },

    /* 当前生效模型的标识 */
    activeModel(): string | undefined {
      return this.effectiveModelConfig?.modelInfo?.model
    },

    /* 当前生效模型的名称 */
    activeModelName(): string | undefined {
      return this.effectiveModelConfig?.modelInfo?.modelName
    },

    activeChannel(state): string | null {
      if (!state.active) return null
      const group = state.groupList.find(item => item.uuid === state.active)
      const channel = getConversationGroupChannel(group)
      return group && channel !== 'web' ? channel : null
    },
  },

  actions: {
    isCurrentConversationEmpty(): boolean {
      if (this.isSubmitting || this.chatList.length) return false
      if (!this.active) return true
      const group = this.groupList.find(item => item.uuid === this.active)
      const page = this.messagePaginationByWorkspace[this.active]
      return Boolean(
        group &&
        isSidebarVisibleGroup(group) &&
        page?.initialized &&
        !page.loading &&
        !page.hasMore &&
        this.messageCacheByWorkspace[this.active]?.length === 0
      )
    },
    resolveWorkspaceId(workspaceId?: string | null) {
      const candidate = String(workspaceId || this.active || '').trim()
      return isConversationId(candidate) ? candidate : ''
    },

    activeConversationGid(workspaceId?: string | null): string {
      const candidate = this.resolveWorkspaceId(workspaceId)
      return isConversationId(candidate) ? candidate : ''
    },

    getActiveChannel() {
      if (!this.active) return null
      const group = this.groupList.find(item => item.uuid === this.active)
      const channel = getConversationGroupChannel(group)
      return group && channel !== 'web' ? channel : null
    },

    getSidebarGroupList() {
      return this.groupList.filter(item => isSidebarVisibleGroup(item))
    },

    async resolveLatestChannelWorkspace(channelInput: string) {
      const channel = String(channelInput || '')
        .trim()
        .toLowerCase()
      if (!channel) return ''
      const epoch = chatEpoch

      if (!this.groupPagination.initialized) await this.queryMyGroup()
      if (epoch !== chatEpoch) return ''

      let workspaceId = pickLatestChannelGroup(this.groupList, channel)?.uuid || ''
      if (!workspaceId) {
        await this.queryMyGroup()
        if (epoch !== chatEpoch) return ''
        workspaceId = pickLatestChannelGroup(this.groupList, channel)?.uuid || ''
      }
      return workspaceId
    },

    /**
     * 一轮结束后的侧栏更新：会话还没有标题时（服务端在头几轮生成标题）刷新整张列表拿到标题；
     * 已经有标题就只把它排到最前（更新时间取本机现在与列表里最新的那个之后：本机时钟比服务端慢时
     * 也排在前面），不再每轮下载整张会话列表。
     * 恢复（重连、切回）接上的那一轮结束时按服务端的顺序刷新：它可能早就结束了（服务端直接回了终态），
     * 不能当成刚有新回复把会话顶到最前
     */
    async refreshAfterTurn(workspaceId?: string, options: { resumed?: boolean } = {}) {
      const group = workspaceId ? this.groupList.find(item => item.uuid === workspaceId) : undefined
      if (!group?.title || options.resumed) {
        await this.queryMyGroup()
        return
      }
      const latest = this.groupList.reduce(
        (max, item) => Math.max(max, getConversationGroupUpdatedAtValue(item.updatedAt)),
        0
      )
      const updatedAt = Math.max(Date.now(), latest + 1)
      this.groupList = sortConversationGroups(
        this.groupList.map(item => (item.uuid === workspaceId ? { ...item, updatedAt } : item))
      )
    },

    upsertConversationGroup(groupInput: ChatGroupSummary | Chat.ConversationGroup | any) {
      const group = normalizeConversationGroup(groupInput)
      if (!group) return null
      this.groupList = sortConversationGroups([
        group,
        ...this.groupList.filter(item => item.uuid !== group.uuid),
      ])
      return group
    },

    async updateConversationGroup(
      uuid: string,
      input: { title?: string; isSticky?: boolean; config?: string; params?: string }
    ) {
      if (!isConversationId(uuid)) return false
      const epoch = chatEpoch

      await fetchUpdateChatGroupAPI({ gid: uuid, ...input })
      if (epoch !== chatEpoch) return false

      const current = this.groupList.find(item => item.uuid === uuid)
      if (!current) {
        await this.queryMyGroup()
        return true
      }

      const nextGroup: Chat.ConversationGroup = {
        ...current,
        ...(input.title !== undefined ? { title: normalizeConversationTitle(input.title) } : {}),
        ...(input.isSticky !== undefined ? { isSticky: input.isSticky } : {}),
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.params !== undefined ? { params: input.params } : {}),
        updatedAt: Date.now(),
      }
      this.groupList = sortConversationGroups([
        nextGroup,
        ...this.groupList.filter(item => item.uuid !== uuid),
      ])
      this.persist()
      return true
    },

    async deleteConversationGroup(uuid: string) {
      if (!isConversationId(uuid)) return ''
      const epoch = chatEpoch

      await fetchDeleteChatGroupAPI({ gid: uuid })
      // 期间身份换了：新身份的草稿、引用、附件与当前会话都不动
      if (epoch !== chatEpoch) return ''
      return this.removeConversationGroupFromSync(uuid)
    },

    removeConversationGroupFromSync(uuid: string) {
      if (!isConversationId(uuid)) return ''
      const wasActive = this.active === uuid
      this.groupList = this.groupList.filter(item => item.uuid !== uuid)
      this.discardWorkspaceMessages(uuid)
      if (this.drafts[uuid]) this.setDraft(uuid, '')
      this.clearQuote(uuid)
      this.setQueuedFollowUp(null, uuid)
      useComposerAttachmentsStore().discard(uuid)

      if (wasActive) {
        const nextWorkspaceId = this.groupList.find(item => isSidebarVisibleGroup(item))?.uuid || ''
        this.active = nextWorkspaceId
        this.chatList = nextWorkspaceId ? this.messageCacheByWorkspace[nextWorkspaceId] || [] : []
      }

      this.persist()
      return wasActive ? this.active : uuid
    },

    setDraftConfig(config: any) {
      this.draftConfig = config || null
      this.persist()
    },

    /**
     * 应用一次模型 / 推理档位改动。
     *
     * 已有会话：直接写回该会话自身的 config 并持久化，会话配置是唯一真相。
     * 先乐观更新本地列表让选择器立即响应，请求失败再回滚，避免点了不动的顿挫感。
     *
     * 尚未建组（首页）：没有可写入的会话，落到全局 draft 暂存，
     * 建组时由 initializeWorkspace 写进 config。draft 只服务这一个场景，
     * 因此保持单值即可——同一时刻只可能存在一个「未建组」状态。
     *
     * 固定模型会话不接受模型改动（选择器本就对其隐藏），此处再挡一道。
     */
    async applySessionModelConfig(config: any, target?: { workspaceId: string }) {
      // 调用方给出了选择发生时的会话就按它写（选择排队期间可能已切到别的会话），否则取当前会话
      const workspaceId = target
        ? target.workspaceId
        : isConversationId(this.active)
          ? this.active
          : ''
      const targetGroup = workspaceId
        ? this.groupList.find(item => item.uuid === workspaceId)
        : undefined

      if (!targetGroup) {
        // 指定的会话已经不在（删除、身份变化后清空）：不落全局暂存，免得改到首页新对话的模型
        if (workspaceId) return false
        this.setDraftConfig(config)
        return true
      }

      const currentConfig = parseModelConfig(targetGroup.config)
      if (currentConfig?.modelInfo?.isFixedModel === 1) return false

      const previousConfig = targetGroup.config
      const nextConfig = JSON.stringify(config)

      const epoch = chatEpoch
      // 乐观更新：先改本地，UI 立即反映
      targetGroup.config = nextConfig
      // 会话已自带配置，全局 draft 不再参与，否则又变回「两套来源」
      this.draftConfig = null
      this.persist()

      try {
        await fetchUpdateChatGroupAPI({ gid: workspaceId, config: nextConfig })
        return true
      } catch (error) {
        // 回滚到写入前的配置；已经发出的消息按发送当时的值计，不受回滚影响。期间身份换了就不动
        if (epoch === chatEpoch) {
          const rollbackTarget = this.groupList.find(item => item.uuid === workspaceId)
          if (rollbackTarget) rollbackTarget.config = previousConfig
          this.persist()
        }
        throw error
      }
    },

    /* 计算拿到当前选择的对话组信息 */
    getChatByGroupInfo(): Chat.ConversationGroup {
      if (isConversationId(this.active)) {
        const activeGroup = this.groupList.find(item => item.uuid === this.active)
        if (activeGroup) return activeGroup
      }

      return {
        uuid: '',
        title: '',
        config: JSON.stringify(this.activeConfig || {}),
        updatedAt: Date.now(),
      }
    },

    /* 会话初始化入口 */
    async initializeWorkspace(_appId = 0, modelConfig?: any, _params?: string): Promise<string> {
      const isPlainNavigation = !modelConfig && !_params
      if (isPlainNavigation && this.active && this.isCurrentConversationEmpty()) return this.active
      const epoch = chatEpoch
      const pending = pendingWorkspaceCreations.get(this)
      if (isPlainNavigation && pending?.epoch === epoch) return pending.promise
      const creation = (async () => {
        useGlobalStore().closeAllPreviewers()
        const createdFromHome = !this.active
        if (modelConfig) this.draftConfig = modelConfig
        const res = await fetchCreateChatGroupAPI({
          title: SERVER_DEFAULT_CONVERSATION_TITLE,
          ...(modelConfig ? { config: JSON.stringify(modelConfig) } : {}),
          ...(_params ? { params: _params } : {}),
        })
        // 期间身份换了：旧身份建好的会话不放进新身份的列表，也不搬新身份的首页草稿与附件
        if (epoch !== chatEpoch) throw new IdentityChangedError()
        const group = this.upsertConversationGroup(pickResponseData<ChatGroupSummary>(res))
        if (!group) throw new Error(t('chat.createConversationFailed'))
        this.active = group.uuid
        this.chatList = []
        this.messageCacheByWorkspace[group.uuid] = []
        this.messagePaginationByWorkspace[group.uuid] = {
          initialized: true,
          loading: false,
          hasMore: false,
          beforeCursor: null,
        }
        // 在首页写好问题再建会话（发送或点「新对话」）：首页的草稿、引用与附件归到新会话名下
        if (createdFromHome) {
          this.moveDraft(NEW_CONVERSATION_DRAFT_KEY, group.uuid)
          useComposerAttachmentsStore().moveTo(NEW_CONVERSATION_DRAFT_KEY, group.uuid)
        }
        this.persist()
        return group.uuid
      })()
      if (isPlainNavigation) pendingWorkspaceCreations.set(this, { epoch, promise: creation })
      try {
        return await creation
      } finally {
        if (pendingWorkspaceCreations.get(this)?.promise === creation) {
          pendingWorkspaceCreations.delete(this)
        }
      }
    },

    /* 查询基础模型配置  */
    /* 查询会话 */
    async queryMyGroup(_options: { reset?: boolean } = {}) {
      // 不在 clearChat 里改请求序号：最新的在途请求会等自己的落地信号而卡住，旧身份的结果按代次丢弃
      const epoch = chatEpoch
      queryMyGroupRequestSeq += 1
      const requestSeq = queryMyGroupRequestSeq
      let settleThisRequest = () => {}
      queryMyGroupLatestSettled = new Promise<void>(resolve => {
        settleThisRequest = resolve
      })
      this.groupPagination = {
        initialized: this.groupPagination.initialized,
        loading: true,
        failed: false,
        hasMore: false,
        nextCursor: null,
      }

      try {
        const res = await fetchQueryChatGroupsAPI()
        if (epoch !== chatEpoch) return
        // 期间已有更新的 queryMyGroup 发起：本响应是过期快照，整体丢弃，
        // 由最新一次请求的响应作为唯一权威落地；返回前等最新请求落地，
        // 使旧调用方 await 后读到的必是最新权威状态而非请求前旧状态
        if (requestSeq !== queryMyGroupRequestSeq) {
          await queryMyGroupLatestSettled
          return
        }
        const rows = pickResponseData<ChatGroupSummary[]>(res)
        this.groupList = (Array.isArray(rows) ? rows : [])
          .map(item => normalizeConversationGroup(item))
          .filter((item): item is Chat.ConversationGroup => isConversationGroup(item))
        // 当前会话已不在列表里（在别处删除）才清掉，去哪里由路由决定；
        // 没有当前会话（首页新对话）时不再自动选一个，否则首页写的问题会发进那个会话
        if (this.active && !this.groupList.some(item => item.uuid === this.active)) {
          this.active = ''
        }
        this.groupPagination = {
          initialized: true,
          loading: false,
          failed: false,
          hasMore: false,
          nextCursor: null,
        }
      } catch {
        if (epoch !== chatEpoch) return
        if (requestSeq !== queryMyGroupRequestSeq) {
          await queryMyGroupLatestSettled
          return
        }
        this.groupPagination = {
          // 失败不算权威落地：initialized 保持原值（自举失败时仍为 false），
          // 「重连补拉 queryMyGroup」的 !initialized 守卫才真实可达；
          // 已成功初始化后的失败刷新则不把状态回退
          initialized: this.groupPagination.initialized,
          loading: false,
          failed: true,
          hasMore: false,
          nextCursor: null,
        }
      } finally {
        settleThisRequest()
        this.persist()
      }
    },

    /** 回到首页的新对话状态（离开会话、路由里的会话不存在）：不再显示原会话的消息 */
    resetRouteConversation() {
      const previousConfig = this.activeConfig
      useGlobalStore().closeAllPreviewers()
      if (previousConfig?.modelInfo) {
        this.draftConfig = previousConfig
      }
      this.active = ''
      this.chatList = []
      this.persist()
    },

    /**
     * 按路由激活会话：只由 useChatRouteState 调用（导航入口只改路由）。
     * 有缓存时先显示缓存再在后台刷新，没有缓存时加载第一页
     */
    async activateWorkspaceFromRoute(
      _uuid?: string,
      options: {
        throwOnMessageError?: boolean
        silentError?: boolean
      } = {}
    ) {
      // 使用服务层处理 UI 状态
      useGlobalStore().closeAllPreviewers()
      const targetWorkspaceId = this.resolveWorkspaceId(_uuid)
      if (!targetWorkspaceId) {
        this.active = ''
        this.chatList = []
        this.persist()
        return
      }
      // 输入框草稿按会话保存（prompt getter）：激活会话不清空任何草稿
      this.active = targetWorkspaceId
      this.rememberRecentWorkspace(targetWorkspaceId)

      await this.queryActiveChatLogList(targetWorkspaceId, {
        throwOnError: options.throwOnMessageError,
        silentError: options.silentError,
      })

      // 记录当前状态
      this.persist()
      // 加载期间又换了会话：这次激活已经过期，不再通知（否则会按别的会话的消息去续接）
      if (this.active === targetWorkspaceId) {
        eventBus.emit('chat:workspaceChanged', { workspaceId: targetWorkspaceId })
      }
    },

    /* 查询当前工作区的聊天记录 */
    async queryActiveChatLogList(
      _workspaceId?: string,
      options: {
        force?: boolean
        silent?: boolean
        throwOnError?: boolean
        silentError?: boolean
        pendingQueueIntentExpectation?: Chat.PendingQueueIntentIdentity | null
      } = {}
    ) {
      const targetWorkspaceId = this.resolveWorkspaceId(_workspaceId)
      if (!targetWorkspaceId) {
        this.chatList = []
        return
      }
      const epoch = chatEpoch
      const pendingQueueIntentExpectation =
        options.pendingQueueIntentExpectation === undefined
          ? this.getPendingQueueIntentIdentity()
          : options.pendingQueueIntentExpectation
      this.active = targetWorkspaceId
      const gid = this.activeConversationGid(targetWorkspaceId)

      const cachedMessages = this.messageCacheByWorkspace[targetWorkspaceId]
      const pagination = this.messagePaginationByWorkspace[targetWorkspaceId]
      // 请求发出时本地已有的消息：响应里没有的算作已在别处删除（见 mergeMessagesForRefresh）
      const requestedCids = new Set(
        (cachedMessages || []).map(item => item.cid).filter((cid): cid is string => Boolean(cid))
      )
      // 没有缓存的会话：加载期间不再显示上一个会话的消息（输入框会按它们判断「生成中」）
      if (!cachedMessages?.length) this.chatList = []
      if (cachedMessages?.length && !options.force) {
        if (this.active === targetWorkspaceId) {
          this.chatList = cachedMessages
          this.reconcilePendingQueueIntentFromChatLogs(this.chatList, pendingQueueIntentExpectation)
        }
        if (pagination?.initialized) {
          if (!options.silent && !this.isStreamIn) {
            void this.queryActiveChatLogList(targetWorkspaceId, { force: true, silent: true })
          }
          return
        }
      }

      if (pagination?.loading) return

      /** 本次请求登记的分页项：结束时只放下它的加载标记，不动之后的请求登记的 */
      this.messagePaginationByWorkspace[targetWorkspaceId] = {
        initialized: pagination?.initialized || false,
        loading: true,
        hasMore: pagination?.hasMore ?? true,
        beforeCursor: pagination?.beforeCursor ?? null,
        detached: pagination?.detached,
      }
      // 读回 store 里的那份（响应式代理），结束时才能按身份比对
      const ownPagination = this.messagePaginationByWorkspace[targetWorkspaceId]
      const listVersion = listVersionOf(targetWorkspaceId)
      /** 请求途中列表被整表换掉了（搜索定位）：结果不写回，分页也不动（已是换上去的那份） */
      let superseded = false
      /** 丢掉的是一次成功的响应：等列表空闲后按现在的列表再取一次 */
      let refreshAgain = false

      try {
        const res: any = await fetchQueryChatLogListAPI(
          { gid, limit: MESSAGE_PAGE_LIMIT },
          { silentError: options.silentError }
        )

        // 期间身份换了：按「已被取代」处理，不写消息、缓存与分页，也不清加载标记、不再重取
        if (epoch !== chatEpoch) {
          superseded = true
          return
        }
        if (this.active !== targetWorkspaceId) return
        // 请求途中列表被整表换掉了（搜索定位、丢缓存）：哪些算已删是按换掉之前的列表判断的，拿它合并会把
        // 最新一页整段滤掉；丢掉这次响应，按现在的列表再取一次
        if (listVersionOf(targetWorkspaceId) !== listVersion) {
          superseded = true
          refreshAgain = true
          return
        }

        // 检查响应数据并更新 chatList
        if (res && res.data) {
          const rows = Array.isArray(res.data) ? res.data : res.data.rows || []
          const shouldMergeWithCache = (cachedMessages?.length || 0) > 0
          const responseHasMore = Array.isArray(res.data)
            ? false
            : Boolean(res.data.pageInfo?.hasMore)
          const responseBeforeCursor = Array.isArray(res.data)
            ? null
            : res.data.pageInfo?.beforeCursor || null
          // 翻页状态按响应到达时的读：请求途中列表可能被搜索定位换过，游标不能写回请求前的旧值
          const latestPagination =
            this.messagePaginationByWorkspace[targetWorkspaceId] ?? pagination
          // 以响应到达时的列表为底：请求途中 agent.start 插入的这一轮（首页首发时尤其常见）不能被盖掉，
          // 请求途中本地截掉的（本页替换）也不从过期的响应里加回来（列表被截空时同样）
          const merged = mergeMessagesForRefresh(this.chatList, rows, {
            requestedCids,
            complete: !responseHasMore,
            detachedTailCid: latestPagination?.detached,
          })
          if (merged.rebased) bumpListVersion(targetWorkspaceId)

          this.chatList = merged.rows
          this.messageCacheByWorkspace[targetWorkspaceId] = this.chatList
          this.reconcilePendingQueueIntentFromChatLogs(this.chatList, pendingQueueIntentExpectation)
          // 本地的消息不是按页取来的（首屏的一页没取到时插进来的一轮）、或按这一页重建了：翻页状态以响应为准
          const useResponsePaging =
            !shouldMergeWithCache || merged.rebased || !latestPagination?.initialized
          this.messagePaginationByWorkspace[targetWorkspaceId] = {
            initialized: true,
            loading: false,
            hasMore: useResponsePaging
              ? responseHasMore
              : (latestPagination?.hasMore ?? responseHasMore),
            beforeCursor: useResponsePaging
              ? responseBeforeCursor
              : latestPagination?.beforeCursor || responseBeforeCursor,
            // 定位的一段还没接上最新：仍按定位的一段对待（之后的刷新也不拿最新一页换掉它）
            ...(merged.detachedTailCid ? { detached: merged.detachedTailCid } : {}),
          }
        } else {
          this.chatList = []
          this.messageCacheByWorkspace[targetWorkspaceId] = []
          this.messagePaginationByWorkspace[targetWorkspaceId] = {
            initialized: true,
            loading: false,
            hasMore: false,
            beforeCursor: null,
          }
        }
      } catch (error) {
        if (epoch !== chatEpoch) {
          superseded = true
          if (options.throwOnError) throw new IdentityChangedError()
          return
        }
        // 失败的是整表换掉之前的那次请求：现在的列表与分页都不是它的，不动
        if (listVersionOf(targetWorkspaceId) !== listVersion) {
          superseded = true
          if (options.throwOnError) throw error
          return
        }
        const currentMessages = this.messageCacheByWorkspace[targetWorkspaceId]
        if ((cachedMessages?.length || 0) > 0 || (currentMessages?.length || 0) > 0) {
          // 失败不回滚到请求时的列表：请求途中列表可能已经换过（本页替换截掉、新一轮插入），
          // 现在的就是对的；翻页状态也按现在的读，只放下加载标记
          const latestPagination =
            this.messagePaginationByWorkspace[targetWorkspaceId] ?? pagination
          if (this.active === targetWorkspaceId) {
            this.reconcilePendingQueueIntentFromChatLogs(
              this.chatList,
              pendingQueueIntentExpectation
            )
          }
          this.messagePaginationByWorkspace[targetWorkspaceId] = latestPagination?.initialized
            ? {
                initialized: true,
                loading: false,
                hasMore: latestPagination.hasMore ?? true,
                beforeCursor: latestPagination.beforeCursor ?? null,
                detached: latestPagination.detached,
              }
            : {
                // 首屏的一页没取到、期间又插进来新的一轮：留着这些消息，顶部给出重试（先取最新一页）；
                // 仍按没加载过对待，再次打开或发送前都会重新取
                initialized: false,
                loading: false,
                hasMore: true,
                beforeCursor: null,
                olderLoadFailed: true,
              }
        } else {
          if (this.active === targetWorkspaceId) {
            this.chatList = []
          }
          // 没有缓存可显示：记成加载失败，界面给出重试，而不是当成一个空会话
          this.messagePaginationByWorkspace[targetWorkspaceId] = {
            initialized: true,
            loading: false,
            hasMore: false,
            beforeCursor: null,
            loadFailed: true,
          }
        }
        if (options.throwOnError) throw error
      } finally {
        // 只放下本次请求登记的分页项的加载标记：被整表换掉、丢缓存后重新打开时，分页项已是别的请求的
        // （可能正被新的刷新或往上翻页占着），不动它
        if (!superseded && this.messagePaginationByWorkspace[targetWorkspaceId] === ownPagination) {
          ownPagination.loading = false
        }
        // 无论成功还是失败，都调用 persist
        if (this.active === targetWorkspaceId) {
          this.persist()
        }
        if (refreshAgain && this.active === targetWorkspaceId) {
          // 定位后还在往上翻页：等它结束再取，两边不交错（另一次刷新在途时由它带回最新的）；
          // 取回来再返回，调用方拿到的是接上最新的列表
          for (
            let olderLoad = olderLoadsInFlight.get(targetWorkspaceId);
            olderLoad;
            olderLoad = olderLoadsInFlight.get(targetWorkspaceId)
          ) {
            await olderLoad
          }
          if (this.active === targetWorkspaceId) {
            await this.queryActiveChatLogList(targetWorkspaceId, {
              force: true,
              silent: true,
              silentError: true,
              throwOnError: options.throwOnError,
            })
          }
        }
      }
    },

    async loadOlderChatMessages(_workspaceId?: string) {
      const targetWorkspaceId = this.resolveWorkspaceId(_workspaceId)
      if (!targetWorkspaceId) return { added: false }
      const epoch = chatEpoch
      this.active = targetWorkspaceId
      const gid = this.activeConversationGid(targetWorkspaceId)

      const pagination = this.messagePaginationByWorkspace[targetWorkspaceId]
      const cachedMessages = this.messageCacheByWorkspace[targetWorkspaceId] || []
      const beforeCursor = pagination?.beforeCursor || null

      // 首屏的一页没取到（失败时列表里已经插进来新的一轮）：先取最新一页，接上更早的消息与游标
      if (pagination && !pagination.initialized && !pagination.loading) {
        await this.queryActiveChatLogList(targetWorkspaceId, {
          force: true,
          silent: true,
          silentError: true,
        })
        if (epoch !== chatEpoch) return { added: false }
        const loaded = this.messageCacheByWorkspace[targetWorkspaceId] || []
        return { added: loaded.length > cachedMessages.length }
      }

      if (pagination?.loading || pagination?.hasMore === false || !beforeCursor) {
        return { added: false }
      }

      this.messagePaginationByWorkspace[targetWorkspaceId] = {
        ...pagination,
        initialized: true,
        loading: true,
        hasMore: pagination?.hasMore ?? true,
        beforeCursor,
      }
      const listVersion = listVersionOf(targetWorkspaceId)
      let settleOlderLoad = () => {}
      const olderLoad = new Promise<void>(resolve => {
        settleOlderLoad = resolve
      })
      olderLoadsInFlight.set(targetWorkspaceId, olderLoad)

      try {
        const res: any = await fetchQueryChatLogListAPI({
          gid,
          limit: MESSAGE_PAGE_LIMIT,
          beforeCursor,
        })
        // 期间身份换了：不把请求前的快照写回清空后的缓存
        if (epoch !== chatEpoch) return { added: false }
        // 请求途中列表被整表换掉了（搜索定位、刷新重建）：这一页接不上新的列表，丢掉
        if (listVersionOf(targetWorkspaceId) !== listVersion) return { added: false }
        const rows = Array.isArray(res.data) ? res.data : res.data?.rows || []
        // 按响应到达时的列表合并：请求途中截掉的（替换）不加回，agent.start 刚插入的一轮不丢
        const currentMessages = this.messageCacheByWorkspace[targetWorkspaceId] ?? cachedMessages
        const existingIds = new Set(currentMessages.map(item => item.cid).filter(Boolean))
        const olderRows = rows.filter((item: Chat.Chat) => !item.cid || !existingIds.has(item.cid))
        const mergedMessages = uniqueMessages([...olderRows, ...currentMessages])

        this.messageCacheByWorkspace[targetWorkspaceId] = mergedMessages
        this.messagePaginationByWorkspace[targetWorkspaceId] = {
          initialized: true,
          loading: false,
          hasMore: Array.isArray(res.data) ? false : Boolean(res.data?.pageInfo?.hasMore),
          beforeCursor: Array.isArray(res.data) ? null : res.data?.pageInfo?.beforeCursor || null,
          detached: this.messagePaginationByWorkspace[targetWorkspaceId]?.detached,
        }

        if (this.active === targetWorkspaceId) {
          this.chatList = mergedMessages
          this.persist()
        }

        return { added: olderRows.length > 0 }
      } catch {
        if (epoch !== chatEpoch) return { added: false }
        if (listVersionOf(targetWorkspaceId) !== listVersion) return { added: false }
        // 一次失败不等于到顶：保留 hasMore 与游标，记下失败，由界面提供重试
        this.messagePaginationByWorkspace[targetWorkspaceId] = {
          initialized: true,
          loading: false,
          hasMore: pagination?.hasMore ?? true,
          beforeCursor,
          olderLoadFailed: true,
          detached: pagination?.detached,
        }
        return { added: false }
      } finally {
        // 作废后又开始的新一次翻页已经登记了自己的：不删它的
        if (olderLoadsInFlight.get(targetWorkspaceId) === olderLoad) {
          olderLoadsInFlight.delete(targetWorkspaceId)
        }
        settleOlderLoad()
      }
    },

    async queryChatLogAround(
      _workspaceId: string,
      cid: string,
      options: { silentError?: boolean } = {}
    ) {
      const targetWorkspaceId = this.resolveWorkspaceId(_workspaceId)
      const targetCid = String(cid || '')
      if (!targetWorkspaceId || !targetCid) return []
      const pendingQueueIntentExpectation = this.getPendingQueueIntentIdentity()
      const epoch = chatEpoch
      this.active = targetWorkspaceId
      const gid = this.activeConversationGid(targetWorkspaceId)

      const res: any = await fetchQueryChatLogAroundAPI(
        {
          gid,
          targetCid,
          limit: MESSAGE_PAGE_LIMIT,
        },
        {
          silentError: options.silentError,
        }
      )
      const rows = Array.isArray(res?.data?.rows) ? res.data.rows : []

      if (epoch !== chatEpoch) return []
      if (this.active !== targetWorkspaceId) return rows

      bumpListVersion(targetWorkspaceId)
      this.chatList = uniqueMessages(rows)
      this.messageCacheByWorkspace[targetWorkspaceId] = this.chatList
      this.reconcilePendingQueueIntentFromChatLogs(this.chatList, pendingQueueIntentExpectation)
      this.messagePaginationByWorkspace[targetWorkspaceId] = {
        initialized: true,
        loading: false,
        hasMore: Boolean(res?.data?.pageInfo?.hasMore),
        beforeCursor: res?.data?.pageInfo?.beforeCursor || null,
        // 定位取来的一段不一定接到最新：记下它的最后一条，刷新时据此判断接上了没有
        detached: this.chatList.at(-1)?.cid || undefined,
      }
      this.persist()
      return this.chatList
    },

    async openSearchResult(params: {
      targetCid?: string | null
      gid?: string | null
      silentError?: boolean
    }) {
      const requestedWorkspaceId = params.gid
        ? this.resolveWorkspaceId(params.gid)
        : this.resolveWorkspaceId()
      const targetCid = params.targetCid ? String(params.targetCid) : null
      if (!requestedWorkspaceId) return ''
      const epoch = chatEpoch

      if (!this.groupList.some(item => item.uuid === requestedWorkspaceId)) {
        await this.queryMyGroup()
        if (epoch !== chatEpoch) return ''
        if (!this.groupList.some(item => item.uuid === requestedWorkspaceId)) return ''
      }

      const targetWorkspaceId = requestedWorkspaceId
      this.active = targetWorkspaceId
      const cachedMessages = this.messageCacheByWorkspace[targetWorkspaceId]
      if (cachedMessages) this.chatList = cachedMessages

      this.pendingFocusCid = targetCid

      if (
        targetWorkspaceId === this.active &&
        targetCid &&
        !this.chatList.some(item => item.cid === targetCid)
      ) {
        await this.queryChatLogAround(targetWorkspaceId, targetCid, {
          silentError: params.silentError,
        })
        if (epoch !== chatEpoch) return ''
      }

      this.pendingFocusCid = targetCid
      return targetWorkspaceId
    },

    /* 添加一条虚拟的对话记录 */
    addGroupChat(data: Chat.Chat) {
      const pendingQueueIntentExpectation = this.getPendingQueueIntentIdentity()
      if (data.cid) {
        const existingIndex = this.chatList.findIndex(item => item.cid === data.cid)
        if (existingIndex >= 0) {
          Object.assign(this.chatList[existingIndex], data)
          if (this.active) {
            this.messageCacheByWorkspace[this.active] = this.chatList
          }
          this.reconcilePendingQueueIntentFromChatLog(
            this.chatList[existingIndex],
            pendingQueueIntentExpectation
          )
          return
        }
      }

      // 使用push直接修改数组，避免创建新数组触发整个列表重新渲染
      this.chatList.push(data)
      if (this.active) {
        this.messageCacheByWorkspace[this.active] = this.chatList
      }
      this.reconcilePendingQueueIntentFromChatLog(data, pendingQueueIntentExpectation)
    },

    /* 动态修改对话记录 */
    updateGroupChat(index: number, data: Chat.Chat) {
      const pendingQueueIntentExpectation = this.getPendingQueueIntentIdentity()
      // 直接修改对象属性，避免创建新对象
      if (this.chatList[index]) {
        Object.assign(this.chatList[index], data)
        if (this.active) {
          this.messageCacheByWorkspace[this.active] = this.chatList
        }
        this.reconcilePendingQueueIntentFromChatLog(
          this.chatList[index],
          pendingQueueIntentExpectation
        )
      }
    },

    /**
     * 停止流程按服务端核对到的终态行落定一条回复（只改当前会话里已有的这一条）：按刷新的合并规则合并，
     * 收起加载、实时工具与跟丢标记，并记入已落定的终态。返回是否改到了
     */
    applySettledReplyRow(workspaceId: string, row: Chat.Chat) {
      if (!row?.cid || !workspaceId || workspaceId !== this.active) return false
      const index = this.chatList.findIndex(item => item.cid === row.cid)
      if (index < 0) return false
      const merged = mergeRefreshedRow(this.chatList[index], row)
      const failed = Number(merged.status) === ChatLogStatus.FAILED
      this.updateGroupChat(index, {
        ...merged,
        // 不是失败的结局：本地之前的错误标记作废（卡片优先按错误标记显示出错）
        ...(failed ? {} : { error: false, errorMessage: undefined, errorRetryable: undefined }),
        loading: false,
        liveToolCalls: [],
        recovery: undefined,
        recoveryMessage: undefined,
        recoveryRejected: undefined,
      })
      markReplySettled(row.cid, Number(merged.status))
      return true
    },

    /* 修改其中部分内容 */
    updateGroupChatSome(
      index: number,
      data: Partial<Chat.Chat>,
      expectedPendingQueueIntent?: Chat.PendingQueueIntentIdentity | null
    ) {
      const pendingQueueIntentExpectation =
        expectedPendingQueueIntent === undefined
          ? this.getPendingQueueIntentIdentity()
          : expectedPendingQueueIntent
      // 确保索引有效
      if (!this.chatList[index]) return

      // 直接更新对象属性，Vue 3的响应式系统会自动检测
      Object.assign(this.chatList[index], data)
      if (this.active) {
        this.messageCacheByWorkspace[this.active] = this.chatList
      }
      this.reconcilePendingQueueIntentFromChatLog(
        this.chatList[index],
        pendingQueueIntentExpectation
      )
    },

    /** 删除一条消息 */
    async deleteChatByCid(cid: string | undefined) {
      if (!cid) return
      const gid = this.activeConversationGid()
      if (!gid) return
      // 按发起时的会话写：请求途中可能已切到别的会话，或身份换了
      const workspaceId = this.active
      const epoch = chatEpoch
      // 删的正好是定位段记着的最后一条：标记挪到它前一条（和最新之间的空缺还在）。前一条在发请求之前
      // 算好：请求途中的刷新可能已经把这条去掉了
      const index = this.chatList.findIndex(item => item.cid === cid)
      const previousCid =
        index > 0 ? this.chatList.slice(0, index).findLast(item => item.cid)?.cid : undefined
      await fetchDelChatLogAPI({ cid, gid })
      if (epoch !== chatEpoch || !workspaceId) return
      const pagination = this.messagePaginationByWorkspace[workspaceId]
      if (pagination?.detached === cid) pagination.detached = previousCid || undefined
      const source =
        this.active === workspaceId
          ? this.chatList
          : this.messageCacheByWorkspace[workspaceId] || []
      const remaining = source.filter(item => item.cid !== cid)
      this.messageCacheByWorkspace[workspaceId] = remaining
      if (this.active === workspaceId) this.chatList = remaining
      this.persist()
    },

    /**
     * 重新生成 / 编辑重发被服务端接受后，去掉那个会话里这条提问及其后的消息
     * （服务端在写入新一轮的同一事务里已删除，见 chat:start 的 replaceFromCid）。
     * 发送途中可能已切到别的会话，所以按会话处理；只截掉尾部，往前翻页的游标不受影响
     */
    removeMessagesFromCid(cid: string | undefined, workspaceId?: string) {
      const key = workspaceId ?? this.active
      if (!cid || !key) return
      const isActive = key === this.active
      const rows = isActive ? this.chatList : this.messageCacheByWorkspace[key]
      const targetIndex = rows?.findIndex(item => item.cid === cid) ?? -1
      if (!rows || targetIndex < 0) return
      // 在定位的一段里截断：服务端连同它之后的全部删掉了，定位段之后拼上的最新部分也不再有效。
      // 回到普通列表；在途的刷新与往上翻页是截断之前发出的，列表版本加一让它们作废（它们不再写回，
      // 加载标记在这里放下），刷新会按现在的列表重取
      const pagination = this.messagePaginationByWorkspace[key]
      const tailIndex = pagination?.detached
        ? rows.findIndex(item => item.cid === pagination.detached)
        : -1
      if (pagination && tailIndex >= 0 && targetIndex <= tailIndex) {
        bumpListVersion(key)
        this.messagePaginationByWorkspace[key] = {
          ...pagination,
          loading: false,
          detached: undefined,
        }
      }
      const remaining = rows.slice(0, targetIndex)
      this.messageCacheByWorkspace[key] = remaining
      if (isActive) {
        this.chatList = remaining
        this.persist()
      }
    },

    /** 记下最近打开的会话；超过上限时丢掉最早那些会话的消息缓存（当前会话不丢） */
    rememberRecentWorkspace(workspaceId: string) {
      const recent = this.recentWorkspaceIds.filter(id => id !== workspaceId)
      recent.push(workspaceId)
      while (recent.length > MESSAGE_CACHE_LIMIT) {
        const evicted = recent.shift()!
        if (evicted === this.active) continue
        this.discardWorkspaceMessages(evicted)
      }
      this.recentWorkspaceIds = recent
    },

    /** 丢掉一个会话的消息缓存（发送结果不确定、服务端可能已经改过）：下次打开重新加载 */
    dropMessageCache(workspaceId: string) {
      if (!workspaceId || workspaceId === this.active) return
      this.discardWorkspaceMessages(workspaceId)
    },

    /**
     * 删掉一个会话的消息缓存与分页（丢缓存、超出缓存上限、删除会话共用）：在途的刷新与往上翻页
     * 是删之前发出的，列表版本加一让它们作废，不会用请求前的消息重建缓存、也不会动之后的请求的加载标记
     */
    discardWorkspaceMessages(workspaceId: string) {
      delete this.messageCacheByWorkspace[workspaceId]
      delete this.messagePaginationByWorkspace[workspaceId]
      bumpListVersion(workspaceId)
    },

    async setPrompt(prompt: string) {
      this.setDraft(this.active, prompt)
    },

    setDraft(workspaceId: string, text: string) {
      // 先删再写：保存时按写入先后截断上限，正在编辑的这份排到最后、不会被截掉
      delete this.drafts[workspaceId]
      if (text) this.drafts[workspaceId] = text
      markChanged(pendingDraftChanges.draftKeys, workspaceId)
      this.persistDraftsSoon()
    },

    /**
     * 草稿与引用换个会话名下（首页写好的问题跟着新建的会话走）。
     * 目标会话已有草稿时接在后面，两段都不丢；引用只有一份，两边都有时留较新的那个
     */
    moveDraft(fromWorkspaceId: string, toWorkspaceId: string) {
      if (fromWorkspaceId === toWorkspaceId) return
      const text = this.drafts[fromWorkspaceId]
      if (text) {
        delete this.drafts[fromWorkspaceId]
        const existing = this.drafts[toWorkspaceId]
        this.drafts[toWorkspaceId] = existing && existing !== text ? `${existing}\n\n${text}` : text
        markChanged(pendingDraftChanges.draftKeys, fromWorkspaceId, toWorkspaceId)
      }
      const quote = this.quotes[fromWorkspaceId]
      if (quote) {
        delete this.quotes[fromWorkspaceId]
        // 引用只有一份：两边都有时留较新的那个
        const existing = this.quotes[toWorkspaceId]
        if (!existing || (quote.createdAt ?? 0) > (existing.createdAt ?? 0)) {
          this.quotes[toWorkspaceId] = quote
        }
        markChanged(pendingDraftChanges.quoteKeys, fromWorkspaceId, toWorkspaceId)
      }
      if (text || quote) this.persistDraftsSoon()
    },

    /**
     * 身份确定后认领草稿。游客的草稿随登录带进账号；已登录账号换了身份时，上一个人的草稿、引用、
     * 附件与模型选择不能留给下一个人：
     * - 换成另一个账号：丢掉；
     * - 成了游客（多见于登录过期后刷新页面）：先收起来不给游客看，同一个账号再登录时放回
     *   （游客这段时间写的一并保留），别的账号登录时丢掉
     */
    claimDraftsFor(owner: string, options: { takeOver?: boolean } = {}) {
      let reclaiming = false
      if (this.draftOwner === owner) {
        const stored = loadStoredDraftState()
        if (stored.draftOwner === 'visitor' && stored.stashedDrafts?.owner === owner) {
          // 别的页签在这期间以同一个账号登录过期、成了游客，把这个账号的草稿收了起来：本页从存储里的
          // 身份再认领一次，收起的草稿放回，本页之后写的草稿才能继续存下来
          this.draftOwner = stored.draftOwner
          this.stashedDrafts = stored.stashedDrafts
          reclaiming = true
        } else if (
          options.takeOver &&
          owner !== 'visitor' &&
          stored.draftOwner &&
          stored.draftOwner !== owner
        ) {
          // 本页刚以这个账号登录，存储却归别的身份（别的页签换过账号）：最后登录的一方接管，按本页写入
          pendingDraftChanges.owner = true
          markChanged(pendingDraftChanges.draftKeys, ...Object.keys(this.drafts))
          markChanged(pendingDraftChanges.quoteKeys, ...Object.keys(this.quotes))
          clearUnsavedDraftChanges()
          this.persist()
          return
        } else {
          // 别的情况（别的页签换成了别的账号、本页自己就是游客）不是本页能认领的，不动
          return
        }
      }
      const previous = this.draftOwner
      pendingDraftChanges.owner = true
      const changedDraftKeys = [...unsavedDraftChanges.draftKeys, ...pendingDraftChanges.draftKeys]
      const changedQuoteKeys = [...unsavedDraftChanges.quoteKeys, ...pendingDraftChanges.quoteKeys]
      if (previous && previous !== 'visitor') {
        const stored = owner === 'visitor' ? loadStoredDraftState() : null
        if (stored?.draftOwner === 'visitor') {
          // 别的页签已经先成了游客：存储里的游客草稿是那边游客时写的，不整份清掉，本页接着用；
          // 收起的若是同一个账号的，以它为底换上本页还没写进去的改动，不拿本页内存里那份整个盖掉
          const stash = stored.stashedDrafts
          this.stashedDrafts =
            stash?.owner === previous
              ? {
                  owner: previous,
                  drafts: normalizeDrafts(
                    mergeChanged(stash.drafts, this.drafts, changedDraftKeys)
                  ),
                  quotes: normalizeQuotes(
                    mergeChanged(stash.quotes, this.quotes, changedQuoteKeys)
                  ),
                  draftConfig: this.draftConfig ?? stash.draftConfig,
                }
              : stashDrafts(previous, this.$state)
          this.drafts = { ...stored.drafts }
          this.quotes = { ...stored.quotes }
          // 账号期间的改动已经收进上面那份，不再按会话写进游客的草稿
          pendingDraftChanges.draftKeys.clear()
          pendingDraftChanges.quoteKeys.clear()
        } else {
          this.stashedDrafts = owner === 'visitor' ? stashDrafts(previous, this.$state) : null
          this.drafts = {}
          this.quotes = {}
          pendingDraftChanges.replace = true
        }
        this.draftConfig = null
        useComposerAttachmentsStore().clearAll()
      } else if (owner !== 'visitor') {
        const stored = reclaiming ? null : loadStoredDraftState()
        // 存储归游客、还没有归属或就是这个账号：以存储为底。本页内存里其余的草稿是打开页面时的快照，
        // 别的页签后来写的、发出后清掉的都以存储为准；本页还没写的改动照常换上，写不进去期间改过的
        // 只在存储里还没有这一条时换上（有的可能是别的页签后来写的）
        if (
          stored &&
          (!stored.draftOwner || stored.draftOwner === 'visitor' || stored.draftOwner === owner)
        ) {
          this.drafts = mergeChanged(stored.drafts, this.drafts, [
            ...keysAbsentFrom(unsavedDraftChanges.draftKeys, stored.drafts),
            ...pendingDraftChanges.draftKeys,
          ])
          this.quotes = mergeChanged(stored.quotes, this.quotes, [
            ...keysAbsentFrom(unsavedDraftChanges.quoteKeys, stored.quotes),
            ...pendingDraftChanges.quoteKeys,
          ])
        }
        // 收起的草稿：存储里收起的正是这个账号的就用它（别的页签后来收起时已把各自的改动并进去，
        // 比本页内存里的新）；否则用本页内存里的
        const stash =
          (stored?.stashedDrafts?.owner === owner ? stored.stashedDrafts : null) ??
          this.stashedDrafts
        this.stashedDrafts = null
        // 收起的那份已经被别的页签取走（存储已归这个账号）：内存里这份是旧的，不再用它
        // （存储里这个账号更新的草稿上面已经用上了）
        const takenElsewhere = Boolean(
          stored && stored.draftOwner === owner && stored.stashedDrafts?.owner !== owner
        )
        if (stash && stash.owner === owner && !takenElsewhere) {
          if (reclaiming) {
            // 再认领：收起的那份是这个账号在别的页签里最后的样子；本页只有写不进存储期间改过的会话
            // （连同还没写的）以本页为准
            this.drafts = mergeChanged(stash.drafts, this.drafts, changedDraftKeys)
            this.quotes = mergeChanged(stash.quotes, this.quotes, changedQuoteKeys)
          } else {
            // 从游客转回账号：游客这段时间写的与收起的不同就接在一起，都不丢
            const drafts = { ...stash.drafts }
            for (const [key, text] of Object.entries(this.drafts)) {
              const earlier = drafts[key]
              delete drafts[key]
              drafts[key] = earlier && earlier !== text ? `${earlier}\n\n${text}` : text
            }
            this.drafts = drafts
            this.quotes = { ...stash.quotes, ...this.quotes }
          }
          this.draftConfig = this.draftConfig ?? stash.draftConfig
        }
        // 按会话合并写回：别的页签在别的会话里写的草稿不被整份覆盖。本页还没写的清空照样清掉（它们本来
        // 就在待写的键里）；写不进去期间的清空不回放，存储里那一条可能是别的页签后来写的
        markChanged(pendingDraftChanges.draftKeys, ...Object.keys(this.drafts))
        markChanged(pendingDraftChanges.quoteKeys, ...Object.keys(this.quotes))
      }
      clearUnsavedDraftChanges()
      this.draftOwner = owner
      this.persist()
    },

    /** 设置当前会话的引用（划词引用、文件面板里的引用）；文字为空时清掉 */
    setQuote(quote: Partial<Chat.DraftQuote> & { text: string }, workspaceId?: string) {
      const key = workspaceId ?? this.active
      const text = String(quote.text || '').trim()
      if (!text) {
        this.clearQuote(key)
        return
      }
      const sourceTitle = String(quote.sourceTitle || '').trim()
      delete this.quotes[key]
      this.quotes[key] = {
        id: quote.id || `preview-quote-${Date.now()}`,
        text,
        sourceTitle: sourceTitle || undefined,
        createdAt: quote.createdAt || Date.now(),
      }
      markChanged(pendingDraftChanges.quoteKeys, key)
      this.persistDraftsSoon()
    },

    clearQuote(workspaceId?: string) {
      const key = workspaceId ?? this.active
      if (!this.quotes[key]) return
      delete this.quotes[key]
      markChanged(pendingDraftChanges.quoteKeys, key)
      this.persistDraftsSoon()
    },

    setQueuedFollowUp(entry: { text: string; turnId: string } | null, workspaceId?: string) {
      const key = workspaceId ?? this.active
      if (entry?.text) this.queuedFollowUps[key] = entry
      else delete this.queuedFollowUps[key]
    },

    persistDraftsSoon() {
      if (draftPersistTimer) clearTimeout(draftPersistTimer)
      flushDraftPersist = () => {
        if (draftPersistTimer) clearTimeout(draftPersistTimer)
        draftPersistTimer = null
        flushDraftPersist = null
        this.persist()
      }
      draftPersistTimer = setTimeout(flushDraftPersist, DRAFT_PERSIST_DELAY)
    },

    getPendingQueueIntentIdentity(): Chat.PendingQueueIntentIdentity | null {
      const pending = this.pendingQueueIntent
      if (!pending) return null
      return {
        submissionId: pending.submissionId,
        targetCid: pending.targetCid,
        parentTurnId: pending.parentTurnId,
      }
    },

    resolvePendingQueueIntent(input: {
      targetCid: string
      parentTurnId?: string
      payload: Chat.QueueFollowUpCanonicalPayload
      /** 发起的会话与输入框里的原文（不含引用前缀）：回执超时后按聊天记录对账时清对草稿 */
      workspaceId?: string
      draftText?: string
      quoteId?: string
    }): Chat.PendingQueueIntent {
      const targetCid = String(input.targetCid || '').trim()
      const parentTurnId = String(input.parentTurnId || '').trim()
      const payload = normalizeQueueFollowUpPayload(input.payload)
      if (!targetCid || !payload.prompt) {
        throw new Error('queue follow-up intent requires a target and prompt')
      }

      const existing = this.pendingQueueIntent
      if (
        existing &&
        existing.targetCid === targetCid &&
        existing.parentTurnId === parentTurnId &&
        isSameQueueFollowUpPayload(existing.payload, payload)
      ) {
        return existing
      }

      const pending: Chat.PendingQueueIntent = {
        targetCid,
        parentTurnId,
        payload,
        submissionId: createSubmissionId(),
        workspaceId: input.workspaceId ?? this.active,
        draftText: input.draftText,
        quoteId: input.quoteId,
      }
      this.pendingQueueIntent = pending
      return pending
    },

    clearPendingQueueIntent(expected?: {
      submissionId?: string
      targetCid?: string
      parentTurnId?: string
    }) {
      const current = this.pendingQueueIntent
      if (!current) return false
      if (expected?.submissionId && current.submissionId !== expected.submissionId) return false
      if (expected?.targetCid && current.targetCid !== expected.targetCid) return false
      if (
        expected?.parentTurnId !== undefined &&
        current.parentTurnId !== String(expected.parentTurnId || '').trim()
      ) {
        return false
      }
      this.pendingQueueIntent = null
      return true
    },

    clearPendingQueueIntentIfTargetChanged(targetCid: string, parentTurnId?: string) {
      const current = this.pendingQueueIntent
      if (!current) return false
      // 运行目标是当前会话的：排队意图是别的会话发起的（发起后切走了），不按这里的运行目标作废
      if (current.workspaceId && current.workspaceId !== this.active) return false
      const normalizedTargetCid = String(targetCid || '').trim()
      const normalizedParentTurnId = String(parentTurnId || '').trim()
      if (!normalizedTargetCid) return false
      if (
        current.targetCid === normalizedTargetCid &&
        current.parentTurnId === normalizedParentTurnId
      ) {
        return false
      }
      this.pendingQueueIntent = null
      return true
    },

    /**
     * 排队回执没等到（超时）时按聊天记录对账：父轮到了终态再看这条补充要求有没有真的执行——
     * 父轮之后出现了内容就是它的提问，才清掉发起会话的草稿与引用；父轮失败、停止时服务端丢掉了接续，
     * 只作废排队意图、草稿留着；父轮完成但接续的提问还没出现，接着等（它插进来时再对一次）
     */
    reconcilePendingQueueIntentFromChatLog(
      message: Chat.Chat | undefined,
      expected: Chat.PendingQueueIntentIdentity | null,
      /** 这条消息所在的整张列表（刷新时传入）；不传按发起的会话取 */
      list?: Chat.Chat[]
    ) {
      if (!expected) return false
      const pending = this.pendingQueueIntent
      if (!pending) return false
      const workspaceId = pending.workspaceId ?? this.active
      const rows =
        list ??
        (workspaceId === this.active
          ? this.chatList
          : (this.messageCacheByWorkspace[workspaceId] ?? []))
      const parentIndex = rows.findIndex(row => row.cid === expected.targetCid)
      // 传进来的父轮可能比列表里的新（别处同步来的终态）：以它为准
      const parent =
        String(message?.cid || '').trim() === expected.targetCid ? message : rows[parentIndex]
      if (!isTerminalAssistantMessage(parent)) return false
      if (getChatMessageTurnId(parent) !== expected.parentTurnId) return false

      const pendingPrompt = pending.payload.prompt
      const executed =
        parentIndex >= 0 &&
        rows
          .slice(parentIndex + 1)
          .some(
            row => row.role === 'user' && String(row.content || '').trim() === pendingPrompt.trim()
          )
      if (Number(parent?.status) === ChatLogStatus.COMPLETED && !executed) return false
      if (!this.clearPendingQueueIntent(expected)) return false
      if (!executed) return true

      // 清的是发起的那个会话的草稿（可能已经切走），按输入框里的原文比（排队的文字带着引用前缀）
      const draftText = (pending.draftText ?? pendingPrompt).trim()
      const draft = (this.drafts[workspaceId] ?? '').trim()
      if (draft && (draft === draftText || draft === pendingPrompt)) this.setDraft(workspaceId, '')
      if (pending.quoteId && this.quotes[workspaceId]?.id === pending.quoteId) {
        this.clearQuote(workspaceId)
      }
      return true
    },

    reconcilePendingQueueIntentFromChatLogs(
      messages: Chat.Chat[],
      expected: Chat.PendingQueueIntentIdentity | null
    ) {
      if (!expected) return false
      return messages.some(message =>
        this.reconcilePendingQueueIntentFromChatLog(message, expected, messages)
      )
    },

    settlePendingQueueIntent(submissionId: string, ack: { ok: boolean; code?: string | null }) {
      const current = this.pendingQueueIntent
      if (!current || current.submissionId !== submissionId) return
      if (!ack.ok && UNKNOWN_QUEUE_ACK_CODES.has(String(ack.code || ''))) return
      this.pendingQueueIntent = null
    },

    async submitQueueFollowUpIntent(input: {
      targetCid: string
      parentTurnId?: string
      payload: Chat.QueueFollowUpCanonicalPayload
      modelName?: string
      workspaceId?: string
      draftText?: string
      quoteId?: string
    }) {
      const pending = this.resolvePendingQueueIntent(input)
      const turn: QueuedChatTurnInput = {
        prompt: pending.payload.prompt,
        submissionId: pending.submissionId,
        model: pending.payload.model,
        modelName: String(input.modelName || ''),
      }
      if (pending.parentTurnId) {
        turn.expectedTurnId = pending.parentTurnId
      }
      if (pending.payload.modelId) {
        turn.modelId = pending.payload.modelId
      }

      const ack = await queueChatTurnWithAck(pending.targetCid, turn)
      this.settlePendingQueueIntent(pending.submissionId, ack)
      return ack
    },

    async cancelQueueFollowUpIntent(targetCid: string, parentTurnId?: string) {
      const normalizedTargetCid = String(targetCid || '').trim()
      const normalizedParentTurnId = String(parentTurnId || '').trim()
      const currentExpectation = this.getPendingQueueIntentIdentity()
      const cancelExpectation =
        currentExpectation &&
        currentExpectation.targetCid === normalizedTargetCid &&
        (!normalizedParentTurnId || currentExpectation.parentTurnId === normalizedParentTurnId)
          ? currentExpectation
          : null
      const ack = await cancelQueuedChatTurnWithAck(
        normalizedTargetCid,
        normalizedParentTurnId || undefined
      )
      if (ack.ok && cancelExpectation) {
        this.clearPendingQueueIntent(cancelExpectation)
      }
      return ack
    },

    /**
     * 提交锁（发送、重新生成 / 编辑重发、选项回答）：已被占用就返回 null，调用方放弃这次提交。
     * 返回的凭据同时代表「这次提交仍有效」：停止（revoke）或换身份后它就失效，
     * 持有者在每个 await 之后、重试 / 恢复订阅 / 收尾之前用 isSubmitLockCurrent 核对
     */
    acquireSubmitLock(): number | null {
      if (this.isSubmitting) return null
      submitLockSeq += 1
      submitLockHolder = submitLockSeq
      this.isSubmitting = true
      return submitLockHolder
    },

    isSubmitLockCurrent(lock: number | null | undefined): boolean {
      return Boolean(lock) && lock === submitLockHolder
    },

    /** 当前锁的凭据（没有提交在进行时为 0）：提交链路的下游据此核对自己仍有效 */
    heldSubmitLock(): number {
      return submitLockHolder
    },

    /** 只有仍是持有者时才释放：已被撤销的旧提交结束时不会解开新提交的锁 */
    releaseSubmitLock(lock: number | null | undefined) {
      if (!this.isSubmitLockCurrent(lock)) return
      submitLockHolder = 0
      this.isSubmitting = false
    },

    /** 作废当前的提交（停止按钮、换身份）：锁空出来，原持有者之后的核对与释放都不再生效 */
    revokeSubmitLock() {
      submitLockHolder = 0
      this.isSubmitting = false
    },

    persist() {
      // 写不进去期间本页改过的会话：存储重新归本页的身份时，存储里还没有这一条的（期间没人写过，或别的
      // 页签发出后清掉了）跟着这次写进去，写回的是本页自己的改动；已经有的可能是别的页签后来写的，
      // 以存储为准，不拿本页的旧值去盖
      if (unsavedDraftChanges.draftKeys.size || unsavedDraftChanges.quoteKeys.size) {
        const stored = loadStoredDraftState()
        const draftKeys = keysAbsentFrom(unsavedDraftChanges.draftKeys, stored.drafts)
        const quoteKeys = keysAbsentFrom(unsavedDraftChanges.quoteKeys, stored.quotes)
        pendingDraftChanges.draftKeys = new Set([...draftKeys, ...pendingDraftChanges.draftKeys])
        pendingDraftChanges.quoteKeys = new Set([...quoteKeys, ...pendingDraftChanges.quoteKeys])
      }
      if (saveChatPreferences(this.$state, pendingDraftChanges)) {
        clearUnsavedDraftChanges()
      } else {
        markChanged(unsavedDraftChanges.draftKeys, ...pendingDraftChanges.draftKeys)
        markChanged(unsavedDraftChanges.quoteKeys, ...pendingDraftChanges.quoteKeys)
      }
      pendingDraftChanges.draftKeys.clear()
      pendingDraftChanges.quoteKeys.clear()
      pendingDraftChanges.replace = false
      pendingDraftChanges.owner = false
    },

    /** 清空会话数据；keepDraft 时保留输入框草稿与模型选择（登录过期、重新登录后接着用） */
    clearChat(options: { keepDraft?: boolean } = {}) {
      chatEpoch += 1
      settledTerminalCids.clear()
      this.revokeSubmitLock()
      this.chatList = []
      this.groupList = []
      this.active = ''
      this.groupPagination = {
        initialized: false,
        loading: false,
        hasMore: true,
        nextCursor: null,
      }
      this.messagePaginationByWorkspace = {}
      this.messageCacheByWorkspace = {}
      this.pendingFocusCid = null
      this.pendingQueueIntent = null
      this.queuedFollowUps = {}
      if (!options.keepDraft) {
        this.draftConfig = null
        this.drafts = {}
        this.quotes = {}
        pendingDraftChanges.replace = true
      }
      this.persist()
    },
  },
})
