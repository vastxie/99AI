import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelQueuedChatTurnWithAck, createSubmissionId, queueChatTurnWithAck } from '@/api'
import { fetchQueryChatLogListAPI } from '@/api/chatLog'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import type { AgentEvent } from '@99agent/contracts'
import { createAgentStreamSession } from '@/views/chat/agent-stream/streamSession'
import { useChatStore } from './index'

vi.mock('@/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    cancelQueuedChatTurnWithAck: vi.fn(),
    createSubmissionId: vi.fn(),
    queueChatTurnWithAck: vi.fn(),
  }
})

vi.mock('@/api/chatGroup', () => ({
  fetchUpdateChatGroupAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchCreateChatGroupAPI: vi.fn(() => Promise.resolve({ success: true, data: {} })),
  fetchDeleteChatGroupAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchQueryChatGroupsAPI: vi.fn(() => Promise.resolve({ success: true, data: [] })),
}))

vi.mock('@/api/chatLog', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/chatLog')>()
  return {
    ...actual,
    fetchQueryChatLogListAPI: vi.fn(),
  }
})

const SUBMISSION_A = '019fa3d8-4321-7a00-9000-123456789abc'
const SUBMISSION_B = '019fa3d8-4321-7a00-9000-123456789abd'
const TARGET_CID = 'assistant-cid-1'
const PARENT_TURN_ID = 'turn-parent-1'
const TARGET_GID = 'g_0123456789abcdefghijklmn'
const OTHER_TARGET_CID = 'assistant-cid-2'
const OTHER_PARENT_TURN_ID = 'turn-parent-2'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })
  return { promise, resolve }
}

function assistantMessage(
  status: ChatLogStatus,
  target = { targetCid: TARGET_CID, parentTurnId: PARENT_TURN_ID }
): Chat.Chat {
  return {
    cid: target.targetCid,
    turnId: target.parentTurnId,
    role: 'assistant',
    content: '',
    error: status === ChatLogStatus.FAILED,
    loading: status === ChatLogStatus.GENERATING,
    status,
  }
}

function chatListResponse(rows: Chat.Chat[]) {
  return {
    data: {
      rows,
      pageInfo: {
        hasMore: false,
        beforeCursor: null,
      },
    },
  }
}

function sourceAgentErrorEvent(
  overrides: Partial<AgentEvent> & { data?: Record<string, any> } = {}
): AgentEvent {
  const event = {
    type: 'agent.error',
    chatId: TARGET_CID,
    messageId: TARGET_CID,
    turnId: PARENT_TURN_ID,
    timestamp: Date.now(),
    data: {
      code: 'AI_ERROR',
      message: 'source stream failed',
      turnStatus: 'failed',
      turn: {
        id: PARENT_TURN_ID,
        status: 'failed',
        startedAt: new Date().toISOString(),
      },
    },
  }
  return {
    ...event,
    ...overrides,
    data: {
      ...event.data,
      ...(overrides.data || {}),
    },
  } as AgentEvent
}

function createStoreBackedStreamSession(store: ReturnType<typeof useChatStore>) {
  return createAgentStreamSession({
    cid: TARGET_CID,
    turnId: PARENT_TURN_ID,
    applyPatch: (patch, pendingQueueIntentExpectation) => {
      const index = store.chatList.findIndex(message => message.cid === (patch.cid || TARGET_CID))
      if (index >= 0) {
        store.updateGroupChatSome(index, patch, pendingQueueIntentExpectation)
      }
    },
    onError: ({ pendingQueueIntentExpectation }) => {
      const index = store.chatList.findIndex(message => message.cid === TARGET_CID)
      if (index >= 0) {
        // 对齐 chatBase.handleStreamError 的后续 loading 收口，验证它不会用当前
        // replacement identity 再次越过事件入口冻结的 CAS。
        store.updateGroupChatSome(
          index,
          { loading: false, liveToolCalls: [] },
          pendingQueueIntentExpectation
        )
      }
    },
  })
}

function queueInput(
  payload: Partial<Chat.QueueFollowUpCanonicalPayload> = {},
  target: { targetCid?: string; parentTurnId?: string } = {}
) {
  return {
    targetCid: target.targetCid || TARGET_CID,
    parentTurnId: target.parentTurnId || PARENT_TURN_ID,
    modelName: 'GPT Test',
    payload: {
      prompt: 'continue with the same request',
      model: 'gpt-test',
      modelId: 7,
      ...payload,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cancelQueuedChatTurnWithAck).mockReset()
  vi.mocked(createSubmissionId).mockReset()
  vi.mocked(fetchQueryChatLogListAPI).mockReset()
  vi.mocked(fetchQueryChatLogListAPI).mockResolvedValue(chatListResponse([]) as any)
  vi.mocked(queueChatTurnWithAck).mockReset()
  sessionStorage.clear()
  setActivePinia(createPinia())
})

describe('pending queue intent submissionId lifecycle', () => {
  it('reuses the same ID after TIMEOUT and across a Footer component rebuild', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck)
      .mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
      .mockResolvedValueOnce({ ok: true, data: { duplicate: true } })
    const firstFooterConsumer = useChatStore()

    await firstFooterConsumer.submitQueueFollowUpIntent(queueInput())
    const firstTurn = vi.mocked(queueChatTurnWithAck).mock.calls[0][1]
    expect(firstTurn.submissionId).toBe(SUBMISSION_A)
    expect(firstFooterConsumer.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)

    // Footer 组件重建不会重建 Pinia；新的组件消费者应继续使用同一个 pending intent。
    const rebuiltFooterConsumer = useChatStore()
    await rebuiltFooterConsumer.submitQueueFollowUpIntent(queueInput())
    const retriedTurn = vi.mocked(queueChatTurnWithAck).mock.calls[1][1]
    expect(retriedTurn).toEqual(firstTurn)
    expect(rebuiltFooterConsumer.pendingQueueIntent).toBeNull()
    expect(createSubmissionId).toHaveBeenCalledTimes(1)
  })

  it('reuses the same ID after CONNECTION_FAILED and a socket reconnect', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck)
      .mockResolvedValueOnce({ ok: false, code: 'CONNECTION_FAILED' })
      .mockResolvedValueOnce({ ok: true, data: { replaced: false } })
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    await store.submitQueueFollowUpIntent(queueInput())

    expect(vi.mocked(queueChatTurnWithAck).mock.calls[0][1].submissionId).toBe(SUBMISSION_A)
    expect(vi.mocked(queueChatTurnWithAck).mock.calls[1][1].submissionId).toBe(SUBMISSION_A)
    expect(createSubmissionId).toHaveBeenCalledTimes(1)
    expect(store.pendingQueueIntent).toBeNull()
  })

  it.each(['SESSION_UNAVAILABLE', 'SESSION_INVALID'])(
    'keeps the same ID after %s (the server did not process the turn)',
    async code => {
      vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
      vi.mocked(queueChatTurnWithAck)
        .mockResolvedValueOnce({ ok: false, code })
        .mockResolvedValueOnce({ ok: true, data: { replaced: false } })
      const store = useChatStore()

      await store.submitQueueFollowUpIntent(queueInput())
      expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)
      await store.submitQueueFollowUpIntent(queueInput())
      expect(vi.mocked(queueChatTurnWithAck).mock.calls[1][1].submissionId).toBe(SUBMISSION_A)
      expect(createSubmissionId).toHaveBeenCalledTimes(1)
    }
  )

  it('clears the pending ID when the identity changed while queueing', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({ ok: false, code: 'IDENTITY_CHANGED' })
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    expect(store.pendingQueueIntent).toBeNull()
  })

  it('retains the same ID when the transport throws before a definitive ack', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck)
      .mockRejectedValueOnce(new Error('ack channel lost'))
      .mockResolvedValueOnce({ ok: true, data: { duplicate: true } })
    const store = useChatStore()

    await expect(store.submitQueueFollowUpIntent(queueInput())).rejects.toThrow('ack channel lost')
    expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)

    await store.submitQueueFollowUpIntent(queueInput())
    expect(vi.mocked(queueChatTurnWithAck).mock.calls[1][1].submissionId).toBe(SUBMISSION_A)
    expect(createSubmissionId).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['prompt', { prompt: 'changed prompt' }],
    ['model', { model: 'gpt-other' }],
    ['modelId', { modelId: 8 }],
  ])('uses a new ID when canonical %s changes', async (_field, changedPayload) => {
    vi.mocked(createSubmissionId)
      .mockReturnValueOnce(SUBMISSION_A)
      .mockReturnValueOnce(SUBMISSION_B)
    vi.mocked(queueChatTurnWithAck).mockResolvedValue({ ok: false, code: 'TIMEOUT' })
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    await store.submitQueueFollowUpIntent(queueInput(changedPayload))

    expect(vi.mocked(queueChatTurnWithAck).mock.calls[0][1].submissionId).toBe(SUBMISSION_A)
    expect(vi.mocked(queueChatTurnWithAck).mock.calls[1][1].submissionId).toBe(SUBMISSION_B)
    expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_B)
  })

  it.each([
    ['accepted', { ok: true, data: { replaced: false } }],
    ['duplicate', { ok: true, data: { duplicate: true } }],
    ['definitive rejection', { ok: false, code: 'TURN_MISMATCH' }],
  ])('clears the pending ID after a %s ack', async (_label, ack) => {
    vi.mocked(createSubmissionId)
      .mockReturnValueOnce(SUBMISSION_A)
      .mockReturnValueOnce(SUBMISSION_B)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce(ack as any)
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    expect(store.pendingQueueIntent).toBeNull()

    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    await store.submitQueueFollowUpIntent(queueInput())
    expect(vi.mocked(queueChatTurnWithAck).mock.calls[1][1].submissionId).toBe(SUBMISSION_B)
  })

  it('clears after the production cancel action receives a successful ack', async () => {
    vi.mocked(createSubmissionId)
      .mockReturnValueOnce(SUBMISSION_A)
      .mockReturnValueOnce(SUBMISSION_B)
    vi.mocked(queueChatTurnWithAck).mockResolvedValue({ ok: false, code: 'TIMEOUT' })
    vi.mocked(cancelQueuedChatTurnWithAck).mockResolvedValueOnce({
      ok: true,
      data: { removed: true },
    })
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    await store.cancelQueueFollowUpIntent(TARGET_CID, PARENT_TURN_ID)

    expect(cancelQueuedChatTurnWithAck).toHaveBeenCalledWith(TARGET_CID, PARENT_TURN_ID)
    expect(store.pendingQueueIntent).toBeNull()
  })

  it('retains after an unknown cancel ack and clears on an authoritative target change', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValue({ ok: false, code: 'TIMEOUT' })
    vi.mocked(cancelQueuedChatTurnWithAck).mockResolvedValueOnce({
      ok: false,
      code: 'CONNECTION_FAILED',
    })
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    await store.cancelQueueFollowUpIntent(TARGET_CID, PARENT_TURN_ID)

    expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)
    expect(store.clearPendingQueueIntentIfTargetChanged('assistant-cid-2', 'turn-parent-2')).toBe(
      true
    )
    expect(store.pendingQueueIntent).toBeNull()
  })

  it.each([
    ['FAILED', ChatLogStatus.FAILED],
    ['STOPPED', ChatLogStatus.STOPPED],
  ])(
    '父轮 %s（服务端丢掉了接续）：只作废排队意图，没执行的补充要求留在输入框里',
    async (_label, terminalStatus) => {
      vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
      vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({
        ok: false,
        code: 'TIMEOUT',
      })
      const store = useChatStore()
      store.addGroupChat(assistantMessage(ChatLogStatus.GENERATING))
      await store.setPrompt(queueInput().payload.prompt)
      await store.submitQueueFollowUpIntent(queueInput())

      // Footer/consumer 已卸载；权威 ChatLog 归约仍直接进入 store。
      store.updateGroupChatSome(0, {
        loading: false,
        status: terminalStatus,
      })

      const rebuiltConsumer = useChatStore()
      expect(rebuiltConsumer.pendingQueueIntent).toBeNull()
      expect(rebuiltConsumer.prompt).toBe(queueInput().payload.prompt)
    }
  )

  it('父轮完成：接续的提问出现在记录里才清掉输入框（带引用的连引用一起清）；还没出现时接着等', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    const store = useChatStore()
    store.active = TARGET_GID
    store.addGroupChat(assistantMessage(ChatLogStatus.GENERATING))
    const prompt = queueInput().payload.prompt
    await store.setPrompt(prompt)
    store.setQuote({ id: 'quote-1', text: '一段话', createdAt: 1 } as any, TARGET_GID)
    await store.submitQueueFollowUpIntent({
      ...queueInput(),
      workspaceId: TARGET_GID,
      quoteId: 'quote-1',
    })

    store.updateGroupChatSome(0, { loading: false, status: ChatLogStatus.COMPLETED })
    expect(store.pendingQueueIntent).not.toBeNull()
    expect(store.prompt).toBe(prompt)

    // 接续轮开始：它的提问插进来
    store.addGroupChat({ cid: 'user-next', role: 'user', content: prompt } as Chat.Chat)
    expect(store.pendingQueueIntent).toBeNull()
    expect(store.prompt).toBe('')
    expect(store.quotes[TARGET_GID]).toBeUndefined()
  })

  it('clears a timed-out intent and its old prompt through the real source agent.error projection', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({
      ok: false,
      code: 'TIMEOUT',
    })
    const store = useChatStore()
    store.addGroupChat(assistantMessage(ChatLogStatus.GENERATING))
    await store.setPrompt(queueInput().payload.prompt)
    await store.submitQueueFollowUpIntent(queueInput())
    const pendingQueueIntentExpectation = store.getPendingQueueIntentIdentity()
    const session = createStoreBackedStreamSession(store)

    await session.applyEvent(sourceAgentErrorEvent(), {
      pendingQueueIntentExpectation,
    })

    expect(store.chatList[0]).toMatchObject({
      cid: TARGET_CID,
      turnId: PARENT_TURN_ID,
      status: ChatLogStatus.FAILED,
      loading: false,
    })
    expect(store.pendingQueueIntent).toBeNull()
    // 父轮失败：接续没有执行，补充要求留在输入框里
    expect(store.prompt).toBe(queueInput().payload.prompt)
  })

  it('clears only the timed-out intent when the user has already edited a new draft', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({
      ok: false,
      code: 'TIMEOUT',
    })
    const store = useChatStore()
    store.addGroupChat(assistantMessage(ChatLogStatus.GENERATING))
    await store.submitQueueFollowUpIntent(queueInput())
    const pendingQueueIntentExpectation = store.getPendingQueueIntentIdentity()
    await store.setPrompt('new unsent draft')
    const session = createStoreBackedStreamSession(store)

    await session.applyEvent(sourceAgentErrorEvent(), {
      pendingQueueIntentExpectation,
    })

    expect(store.pendingQueueIntent).toBeNull()
    expect(store.prompt).toBe('new unsent draft')
  })

  it('does not let a delayed same-target source error clear a replacement submission', async () => {
    vi.mocked(createSubmissionId)
      .mockReturnValueOnce(SUBMISSION_A)
      .mockReturnValueOnce(SUBMISSION_B)
    vi.mocked(queueChatTurnWithAck).mockResolvedValue({
      ok: false,
      code: 'TIMEOUT',
    })
    const store = useChatStore()
    store.addGroupChat(assistantMessage(ChatLogStatus.GENERATING))
    await store.submitQueueFollowUpIntent(queueInput())
    const oldPendingQueueIntentExpectation = store.getPendingQueueIntentIdentity()

    const replacementPrompt = 'same target replacement'
    await store.submitQueueFollowUpIntent(queueInput({ prompt: replacementPrompt }))
    await store.setPrompt(replacementPrompt)
    const session = createStoreBackedStreamSession(store)

    await session.applyEvent(sourceAgentErrorEvent(), {
      pendingQueueIntentExpectation: oldPendingQueueIntentExpectation,
    })

    expect(store.pendingQueueIntent).toMatchObject({
      submissionId: SUBMISSION_B,
      targetCid: TARGET_CID,
      parentTurnId: PARENT_TURN_ID,
    })
    expect(store.prompt).toBe(replacementPrompt)
  })

  it.each([
    ['missing messageId', { messageId: undefined }],
    [
      'missing turn identity',
      {
        turnId: undefined,
        data: {
          turn: undefined,
        },
      },
    ],
    [
      'non-failed turn status',
      {
        data: {
          turnStatus: 'running',
          turn: {
            id: PARENT_TURN_ID,
            status: 'running',
            startedAt: new Date().toISOString(),
          },
        },
      },
    ],
    [
      'different turn',
      {
        turnId: OTHER_PARENT_TURN_ID,
        data: {
          turn: {
            id: OTHER_PARENT_TURN_ID,
            status: 'failed',
            startedAt: new Date().toISOString(),
          },
        },
      },
    ],
  ])(
    'does not clear for an incomplete or non-authoritative source error: %s',
    async (_label, event) => {
      vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
      vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({
        ok: false,
        code: 'TIMEOUT',
      })
      const store = useChatStore()
      store.addGroupChat(assistantMessage(ChatLogStatus.GENERATING))
      await store.setPrompt(queueInput().payload.prompt)
      await store.submitQueueFollowUpIntent(queueInput())
      const pendingQueueIntentExpectation = store.getPendingQueueIntentIdentity()
      const session = createStoreBackedStreamSession(store)

      await session.applyEvent(sourceAgentErrorEvent(event as any), {
        pendingQueueIntentExpectation,
      })

      expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)
      expect(store.prompt).toBe(queueInput().payload.prompt)
    }
  )

  it('does not clear during an initially empty load or after authoritative GENERATING data arrives', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({
      ok: false,
      code: 'TIMEOUT',
    })
    const response = deferred<any>()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(response.promise)
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    const loading = store.queryActiveChatLogList(TARGET_GID, { force: true })

    expect(store.chatList).toEqual([])
    expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)

    response.resolve(chatListResponse([assistantMessage(ChatLogStatus.GENERATING)]))
    await loading

    expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)
  })

  it('回执超时后按聊天记录对账：清的是发起的那个会话里的原文草稿，已经切走也不动当前会话', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    const store = useChatStore()
    const OTHER_GID = 'g_zyxwvutsrqponmlkjihgfedc'
    store.active = TARGET_GID
    store.setDraft(TARGET_GID, '再补充一点')
    await store.submitQueueFollowUpIntent({
      ...queueInput({ prompt: '引用内容：\n一段话\n\n用户问题：\n再补充一点' }),
      workspaceId: TARGET_GID,
      draftText: '再补充一点',
    })
    const expectation = store.getPendingQueueIntentIdentity()
    // 发起的会话的记录里：父轮之后出现了接续的提问（补充要求确实执行了）
    store.messageCacheByWorkspace[TARGET_GID] = [
      assistantMessage(ChatLogStatus.COMPLETED),
      {
        cid: 'user-next',
        role: 'user',
        content: '引用内容：\n一段话\n\n用户问题：\n再补充一点',
      } as Chat.Chat,
    ]
    store.active = OTHER_GID
    store.setDraft(OTHER_GID, '别的会话里写的')

    store.reconcilePendingQueueIntentFromChatLog(
      assistantMessage(ChatLogStatus.COMPLETED),
      expectation
    )
    expect(store.pendingQueueIntent).toBeNull()
    expect(store.drafts[TARGET_GID]).toBeUndefined()
    expect(store.drafts[OTHER_GID]).toBe('别的会话里写的')
  })

  it('clears after a terminal server refresh when the whole chat consumer missed the event', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({
      ok: false,
      code: 'TIMEOUT',
    })
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      chatListResponse([
        assistantMessage(ChatLogStatus.COMPLETED),
        { cid: 'user-next', role: 'user', content: queueInput().payload.prompt } as Chat.Chat,
      ]) as any
    )
    const store = useChatStore()

    await store.setPrompt(queueInput().payload.prompt)
    await store.submitQueueFollowUpIntent(queueInput())
    await store.queryActiveChatLogList(TARGET_GID, { force: true })

    expect(store.pendingQueueIntent).toBeNull()
    expect(store.prompt).toBe('')
  })

  it('does not let a delayed old-target terminal refresh clear a newer intent', async () => {
    vi.mocked(createSubmissionId)
      .mockReturnValueOnce(SUBMISSION_A)
      .mockReturnValueOnce(SUBMISSION_B)
    vi.mocked(queueChatTurnWithAck).mockResolvedValue({
      ok: false,
      code: 'TIMEOUT',
    })
    const response = deferred<any>()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(response.promise)
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    const oldTargetRefresh = store.queryActiveChatLogList(TARGET_GID, { force: true })

    const newerPrompt = 'new target follow-up'
    await store.submitQueueFollowUpIntent(
      queueInput(
        { prompt: newerPrompt },
        {
          targetCid: OTHER_TARGET_CID,
          parentTurnId: OTHER_PARENT_TURN_ID,
        }
      )
    )
    await store.setPrompt(newerPrompt)

    response.resolve(chatListResponse([assistantMessage(ChatLogStatus.COMPLETED)]))
    await oldTargetRefresh

    expect(store.pendingQueueIntent).toMatchObject({
      submissionId: SUBMISSION_B,
      targetCid: OTHER_TARGET_CID,
      parentTurnId: OTHER_PARENT_TURN_ID,
    })
    expect(store.prompt).toBe(newerPrompt)
  })

  it('does not let a delayed cancel ack clear a same-target replacement intent', async () => {
    vi.mocked(createSubmissionId)
      .mockReturnValueOnce(SUBMISSION_A)
      .mockReturnValueOnce(SUBMISSION_B)
    vi.mocked(queueChatTurnWithAck).mockResolvedValue({
      ok: false,
      code: 'TIMEOUT',
    })
    const cancelResponse = deferred<any>()
    vi.mocked(cancelQueuedChatTurnWithAck).mockReturnValueOnce(cancelResponse.promise)
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    const canceling = store.cancelQueueFollowUpIntent(TARGET_CID, PARENT_TURN_ID)
    await store.submitQueueFollowUpIntent(queueInput({ prompt: 'replacement prompt' }))

    cancelResponse.resolve({ ok: true, data: { removed: true } })
    await canceling

    expect(store.pendingQueueIntent).toMatchObject({
      submissionId: SUBMISSION_B,
      targetCid: TARGET_CID,
      parentTurnId: PARENT_TURN_ID,
    })
  })

  it('does not rotate an unresolved ID merely because local time passes', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-28T00:00:00Z'))
      vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
      vi.mocked(queueChatTurnWithAck).mockResolvedValue({ ok: false, code: 'TIMEOUT' })
      const store = useChatStore()

      await store.submitQueueFollowUpIntent(queueInput())
      vi.setSystemTime(new Date('2026-07-29T00:00:00Z'))
      await store.submitQueueFollowUpIntent(queueInput())

      expect(vi.mocked(queueChatTurnWithAck).mock.calls[1][1].submissionId).toBe(SUBMISSION_A)
      expect(createSubmissionId).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the intent in-memory only and never restores it into a new app session', async () => {
    vi.mocked(createSubmissionId).mockReturnValueOnce(SUBMISSION_A)
    vi.mocked(queueChatTurnWithAck).mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    const store = useChatStore()

    await store.submitQueueFollowUpIntent(queueInput())
    store.persist()
    expect(store.pendingQueueIntent?.submissionId).toBe(SUBMISSION_A)

    setActivePinia(createPinia())
    expect(useChatStore().pendingQueueIntent).toBeNull()
  })
})
