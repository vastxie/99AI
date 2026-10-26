import { localStore } from '@/utils/storage'

/**
 * 只把用户偏好（草稿配置、各会话输入框里没发出去的内容）保存到本地；
 * 会话与消息每次从服务端加载，提交锁与排队意图只属于当前页面，都不跨刷新保留。键名沿用既有值。
 */
const CHAT_PREFERENCES_KEY = 'chatStorage'
/** 最多保留多少个会话的输入框草稿：超出时丢掉最早写的 */
export const MAX_SAVED_DRAFTS = 30

type ChatPreferences = Pick<
  Chat.ChatState,
  'draftConfig' | 'drafts' | 'quotes' | 'draftOwner' | 'stashedDrafts'
>

/** 只留非空草稿；对象按写入顺序保存，超出上限时保留最后写入的那些 */
export function normalizeDrafts(source: unknown): Record<string, string> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const entries = Object.entries(source as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
  )
  return Object.fromEntries(entries.slice(-MAX_SAVED_DRAFTS))
}

/** 引用与草稿一样按会话保存，只留文字非空的，同样有上限 */
export function normalizeQuotes(source: unknown): Record<string, Chat.DraftQuote> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const entries = Object.entries(source as Record<string, Chat.DraftQuote | undefined>).filter(
    (entry): entry is [string, Chat.DraftQuote] => Boolean(entry[1]?.text)
  )
  return Object.fromEntries(entries.slice(-MAX_SAVED_DRAFTS))
}

function normalizeStash(source: unknown): Chat.StashedDrafts | null {
  const stash = source as Partial<Chat.StashedDrafts> | null | undefined
  if (!stash || typeof stash.owner !== 'string' || !stash.owner) return null
  return {
    owner: stash.owner,
    drafts: normalizeDrafts(stash.drafts),
    quotes: normalizeQuotes(stash.quotes),
    draftConfig: stash.draftConfig || null,
  }
}

function pickPreferences(source: Partial<Chat.ChatState> | null | undefined): ChatPreferences {
  return {
    draftConfig: source?.draftConfig || null,
    drafts: normalizeDrafts(source?.drafts),
    quotes: normalizeQuotes(source?.quotes),
    draftOwner: typeof source?.draftOwner === 'string' ? source.draftOwner : '',
    stashedDrafts: normalizeStash(source?.stashedDrafts),
  }
}

export function createInitialChatState(): Chat.ChatState {
  return {
    active: '',
    groupList: [],
    chatList: [],
    groupPagination: {
      initialized: false,
      loading: false,
      hasMore: true,
      nextCursor: null,
    },
    messagePaginationByWorkspace: {},
    messageCacheByWorkspace: {},
    recentWorkspaceIds: [],
    pendingFocusCid: null,
    pendingQueueIntent: null,
    draftConfig: null,
    isSubmitting: false,
    drafts: {},
    quotes: {},
    queuedFollowUps: {},
    draftOwner: '',
    stashedDrafts: null,
  }
}

function loadStoredPreferences() {
  return pickPreferences(localStore.get<Partial<Chat.ChatState>>(CHAT_PREFERENCES_KEY))
}

/** 本地存储里的草稿：现在归谁、收起了谁的草稿（别的页签可能已经换过身份） */
export function loadStoredDraftState(): Pick<
  ChatPreferences,
  'draftOwner' | 'stashedDrafts' | 'drafts' | 'quotes'
> {
  const stored = loadStoredPreferences()
  return {
    draftOwner: stored.draftOwner,
    stashedDrafts: stored.stashedDrafts,
    drafts: stored.drafts,
    quotes: stored.quotes,
  }
}

export function loadChatState(): Chat.ChatState {
  return {
    ...createInitialChatState(),
    ...pickPreferences(localStore.get<Partial<Chat.ChatState>>(CHAT_PREFERENCES_KEY)),
  }
}

/**
 * 本页改过的草稿与引用（按会话）；replace 表示整体清空过，写入时整份替换；
 * owner 表示本页改过草稿的归属或收起的草稿（认领身份时）
 */
export interface DraftChanges {
  draftKeys: Set<string>
  quoteKeys: Set<string>
  replace: boolean
  owner?: boolean
}

/** 以存储里的为底，只换上 keys 里这些会话的当前值（当前没有就删掉） */
export function mergeChanged<T>(
  stored: Record<string, T>,
  current: Record<string, T>,
  keys: Iterable<string>
) {
  const merged = { ...stored }
  for (const key of keys) {
    delete merged[key]
    if (current[key] !== undefined) merged[key] = current[key]
  }
  return merged
}

/**
 * 写本地存储。传入 changes 时草稿与引用只合并本页改过的会话：同时开着的别的标签页写的草稿不会被本页的旧内容盖掉。
 * 返回本页的草稿改动有没有写进去（别的页签已经换了身份时写不进去）
 */
export function saveChatPreferences(state?: Chat.ChatState, changes?: DraftChanges): boolean {
  const next = pickPreferences(state ?? createInitialChatState())
  const stored = state && changes && !changes.replace ? loadStoredPreferences() : null
  // 本页在认领身份，存储却归另一个真实账号（别的页签登录过别的账号）：那个人的草稿不能并进本页的账号，
  // 整份按本页写入
  const storedByOtherAccount =
    Boolean(changes?.owner && stored?.draftOwner) &&
    stored?.draftOwner !== 'visitor' &&
    stored?.draftOwner !== state?.draftOwner
  if (state && changes && stored && !storedByOtherAccount) {
    // 草稿的归属与收起的草稿只由认领身份的那个页签写；别的页签还以旧身份开着时不覆盖它们
    if (!changes.owner) {
      next.draftOwner = stored.draftOwner || next.draftOwner
      next.stashedDrafts = stored.stashedDrafts
    }
    // 别的页签已经换了身份：这个页签的草稿与模型选择属于上一个人，不再写进去
    // （本页正在认领身份时例外：归属以本页为准，草稿按会话合并）
    if (
      !changes.owner &&
      stored.draftOwner &&
      state.draftOwner &&
      stored.draftOwner !== state.draftOwner
    ) {
      next.drafts = stored.drafts
      next.quotes = stored.quotes
      next.draftConfig = stored.draftConfig
      localStore.set(CHAT_PREFERENCES_KEY, next)
      return false
    } else {
      next.drafts = normalizeDrafts(mergeChanged(stored.drafts, state.drafts, changes.draftKeys))
      next.quotes = normalizeQuotes(mergeChanged(stored.quotes, state.quotes, changes.quoteKeys))
    }
  }
  localStore.set(CHAT_PREFERENCES_KEY, next)
  return true
}
