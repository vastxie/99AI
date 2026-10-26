declare global {
  namespace Chat {
    /**
     * 用户插话记录（Agent 运行中的补充输入）
     */
    interface UserInterjection {
      content: string
      timestamp: string
    }

    /**
     * 单轮对话结构
     */
    interface Round {
      text: string | null
      thinking: string | null
      thinkingDuration?: number
      toolCalls: ToolCall[]
      completed?: boolean
      /** 调用了工具的轮次：文字是过程话术，不算回答（见 contracts agent-reply） */
      phase?: 'process'
      /** 用户插话列表 */
      interjections?: UserInterjection[]
    }

    /**
     * 统一消息结构 - 工具调用记录
     */
    interface ToolCall {
      id: string
      name: string
      arguments?: Record<string, any>
      inputSummary?: string
      status: 'loading' | 'success' | 'error'
      duration?: number
      type?: string
      outputHint?: {
        type: 'image' | 'video' | 'file' | 'audio' | 'document'
        aspectRatio?: string
      }
      display?: {
        json?: {
          [key: string]: any
        }
        [key: string]: any
      }
      output?: {
        thought?: string
        details?: any
        error?: string
        publicError?: string
        inputSummary?: string
        result?: {
          content?: string
          summary?: string
        }
        userContent?: string
        displayContent?: string
        finalContent?: string
        content?: string
        summary?: string
        message?: string
        title?: string
        fileType?: string
        previewContent?: string
        previewContentType?: string
        downloadUrl?: string
        files?: Array<{
          id?: string
          fileId?: string
          type?: 'image' | 'video' | 'file' | 'audio' | 'document'
          title?: string
          url?: string
          previewUrl?: string
          downloadUrl?: string
          publicUrl?: string
          fileType?: string
          mime?: string
          mimeType?: string
          size?: number
          visibility?: string
        }>
        filePreview?:
          | {
              title: string
              fileType: string
              previewContent: string
              previewContentType: string
              downloadUrl?: string
            }
          | Array<{
              title: string
              fileType: string
              previewContent: string
              previewContentType: string
              downloadUrl?: string
            }>
        fileTree?: any
        diff?: any
      }
    }

    /**
     * 统一消息结构 - Token 使用量
     */
    interface TokenUsage {
      input: number
      output: number
      total: number
    }

    type AgentTurnStatus = 'running' | 'completed' | 'interrupted' | 'failed'

    /**
     * 回合收尾的具体原因：max_rounds 是工具轮次用完（interrupted）；
     * length 是模型单次输出达到上限（completed，回复可能没写完）；缺省表示普通收尾或用户主动停止
     */
    type AgentTurnStopReason = 'max_rounds' | 'length'

    interface AgentTurnState {
      id: string
      status: AgentTurnStatus
      parentTurnId?: string
      startedAt: string
      completedAt?: string
      durationMs?: number
      stopReason?: AgentTurnStopReason
    }

    /**
     * 统一消息结构
     */
    interface UnifiedMessage {
      role: 'user' | 'assistant' | 'system'
      content: string
      rounds: Round[]
      model?: string
      tokens?: TokenUsage
      turn?: AgentTurnState
      timestamp?: string
      createdAt?: string
      startedAt?: string
    }

    /**
     * 流式运行中的工具状态。
     * 只用于前端实时渲染进度，不写入持久化 message，避免工具进度刷新重渲染正文。
     */
    interface LiveToolCall {
      roundIndex: number
      toolCall: ToolCall
    }

    interface Chat {
      cid?: string
      content: string
      status?: number
      model?: string
      modelName?: string
      modelType?: number
      createdAt?: string
      startedAt?: string
      usage?: object
      error?: boolean
      loading?: boolean
      message?: string
      role?: 'user' | 'assistant'
      turnId?: string
      files?: any[]
      liveToolCalls?: LiveToolCall[]
      progress?: number | string
      conversationGid?: string
      /** 回复失败的原因（agent.error 带来；刷新后服务端把原因写在 content 里） */
      errorMessage?: string
      /** 服务端说明这次失败能否重试；没说时按能重试处理 */
      errorRetryable?: boolean
      /**
       * 本页跟丢了这条仍在运行的回复（恢复被拒、多次重连没有结果）：stalled 等用户手动重连，
       * reconnecting 正在重连。只存在本地，事件恢复后清掉
       */
      recovery?: 'reconnecting' | 'stalled'
      /** 跟丢时给用户看的说明 */
      recoveryMessage?: string
      /** 跟丢是因为服务端明确拒绝了恢复：切回页面、联网时不再自动重连，等用户手动重连或停止 */
      recoveryRejected?: boolean
    }

    /** 侧栏里的一个会话（分组） */
    interface ConversationGroup {
      title: string
      uuid: string
      config: string
      channel?: string
      isSticky?: boolean
      createdAt?: Date | string | number
      updatedAt?: Date | string | number
      isFixedModel?: boolean
      params?: string
      content?: string
    }

    interface GroupPaginationState {
      initialized: boolean
      loading: boolean
      /** 最近一次拉取失败（侧栏据此给出重试） */
      failed?: boolean
      hasMore: boolean
      nextCursor: { updatedAt: string | Date } | null
    }

    interface MessagePaginationState {
      initialized: boolean
      loading: boolean
      hasMore: boolean
      beforeCursor: string | null
      /** 首屏消息没取到、也没有缓存可显示：界面给出「加载失败，重试」，不当成空会话 */
      loadFailed?: boolean
      /** 更早的消息没取到：保留 hasMore，停止随滚动自动重试，改为点击重试 */
      olderLoadFailed?: boolean
      /**
       * 列表里有搜索定位取来、还没接上最新的一段，值是这一段最后一条的 cid：刷新拿到的最新一页接在它后面
       * （不拿最新一页换掉它）；某次刷新的那一页含这一条（接上了）时回到普通列表
       */
      detached?: string
    }

    interface QueueFollowUpCanonicalPayload {
      prompt: string
      model: string
      modelId: number | null
    }

    interface PendingQueueIntentIdentity {
      targetCid: string
      parentTurnId: string
      submissionId: string
    }

    interface PendingQueueIntent extends PendingQueueIntentIdentity {
      payload: QueueFollowUpCanonicalPayload
      /** 发起的会话：回执超时后按聊天记录对账时清这个会话的草稿 */
      workspaceId?: string
      /** 输入框里的原文（排队的 prompt 可能带着引用前缀） */
      draftText?: string
      /** 随这次补充要求一起发出的引用：对账确认已执行时一并清掉 */
      quoteId?: string
    }

    type ReasoningEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

    interface ChatState {
      active: string
      draftConfig?: any
      groupList: {
        uuid: string
        title: string
        channel?: string
        config: string
        isSticky?: boolean
        createdAt?: Date | string | number
        updatedAt?: Date | string | number
        isFixedModel?: boolean
        params?: string
        content?: string
      }[]
      chatList: Chat[]
      groupPagination: GroupPaginationState
      messagePaginationByWorkspace: Record<string, MessagePaginationState>
      messageCacheByWorkspace: Record<string, Chat[]>
      /** 最近打开过的会话（越靠后越新，不持久化）：消息缓存只保留最近几个 */
      recentWorkspaceIds: string[]
      pendingFocusCid?: string | null
      activeConfig?: any
      /** 会话组 config 叠加 draftConfig 后的生效配置（store getter） */
      activeSessionConfig?: any
      activeModel?: string
      activeModelName?: string
      activeModelType?: number
      activeModelFileUpload?: number
      /** 提交中（发送发起 → 服务端 ack 返回）：真实 state */
      isSubmitting?: boolean
      /** 是否有进行中的回复：由 store getter 依据 isSubmitting 与消息 loading/status 派生 */
      isStreamIn?: boolean
      /** 导航是否应被阻塞（仅提交窗口，store getter） */
      isNavigationLocked?: boolean
      /** 仅存于当前应用会话；ACK 结果未知时为 queue 重试保留稳定 submissionId */
      pendingQueueIntent: PendingQueueIntent | null
      /**
       * 各会话输入框里没发出去的内容，键为会话 ID；首页（还没有会话）用空字符串。
       * 当前会话的那份由 store getter prompt 读出、setPrompt 写入
       */
      drafts: Record<string, string>
      /** 各会话输入框上方待发送的引用（划词引用），键同 drafts */
      quotes: Record<string, DraftQuote>
      /** 各会话生成中已排进下一轮的补充要求（只在当前页面），键同 drafts */
      queuedFollowUps: Record<string, { text: string; turnId: string }>
      /** 草稿属于谁（user:<id> 或 visitor）：换成另一个账号时丢掉上一个账号的草稿 */
      draftOwner: string
      /** 登录过期后成了游客时收起来的上一个账号的草稿：同一个账号再登录时放回，别的账号登录时丢掉 */
      stashedDrafts: StashedDrafts | null
    }

    interface StashedDrafts {
      owner: string
      drafts: Record<string, string>
      quotes: Record<string, DraftQuote>
      draftConfig: ChatState['draftConfig']
    }

    /** 划词引用：发送时拼在问题前面 */
    interface DraftQuote {
      id: string
      text: string
      sourceTitle?: string
      createdAt: number
    }

    /**
     * URL 项类型（用于统一传递所有媒体文件）
     */
    interface UrlItem {
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

    interface ConversationParams {
      msg: string
      modelId?: number
      model?: string
      modelName?: string
      reasoningEffort?: ReasoningEffort
      modelType?: number
      cid?: string
      urlItems?: UrlItem[]
      message?: string
    }
  }
}

export type Round = Chat.Round
export type ToolCall = Chat.ToolCall
export type UnifiedMessage = Chat.UnifiedMessage
