import { describe, expect, it } from 'vitest'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { planChatSync, type ChatSyncContext, type ChatSyncEvent } from './chatSync.helpers'

const ACTIVE_GID = 'g_active000000000000000000'
const OTHER_GID = 'g_other0000000000000000000'

function context(overrides: Partial<ChatSyncContext> = {}): ChatSyncContext {
  return {
    activeConversationGid: ACTIVE_GID,
    isAtBottom: true,
    currentStreamCid: null,
    hasMessage: () => false,
    ...overrides,
  }
}

const message = (cid: string, role: 'user' | 'assistant', extra: Partial<Chat.Chat> = {}) =>
  ({ cid, role, content: '', ...extra }) as Chat.Chat

describe('planChatSync', () => {
  it('removes a conversation deleted elsewhere and reports whether it was the active one', () => {
    const event: ChatSyncEvent = {
      type: 'conversation_updated',
      deleted: true,
      conversationGid: ACTIVE_GID,
    }
    expect(planChatSync(event, context())).toEqual({
      kind: 'remove_conversation',
      conversationGid: ACTIVE_GID,
      wasActive: true,
    })
    expect(planChatSync({ ...event, conversationGid: OTHER_GID }, context())).toEqual({
      kind: 'remove_conversation',
      conversationGid: OTHER_GID,
      wasActive: false,
    })
  })

  it('upserts an updated conversation and ignores an empty conversation update', () => {
    const conversation = { gid: OTHER_GID, title: '改名了' }
    expect(planChatSync({ type: 'conversation_updated', conversation }, context())).toEqual({
      kind: 'upsert_conversation',
      conversation,
    })
    expect(planChatSync({ type: 'conversation_updated' }, context())).toEqual({ kind: 'ignore' })
  })

  it('ignores turn events that belong to another conversation or carry no gid', () => {
    const base: ChatSyncEvent = { type: 'turn_done', cids: { assistant: 'c_a' } }
    expect(planChatSync({ ...base, conversationGid: OTHER_GID }, context())).toEqual({
      kind: 'ignore',
    })
    expect(planChatSync(base, context())).toEqual({ kind: 'ignore' })
    expect(
      planChatSync({ ...base, conversationGid: ACTIVE_GID }, context({ activeConversationGid: '' }))
    ).toEqual({
      kind: 'ignore',
    })
  })

  it('appends only the placeholder messages the page does not have yet on turn_created', () => {
    const user = message('c_user', 'user', { content: 'hi' })
    const assistant = message('c_assistant', 'assistant')
    const plan = planChatSync(
      {
        type: 'turn_created',
        conversationGid: ACTIVE_GID,
        cids: { user: 'c_user', assistant: 'c_assistant' },
        initialMessages: { user, assistant },
      },
      context({ hasMessage: cid => cid === 'c_user' })
    )
    expect(plan).toEqual({
      kind: 'turn',
      appendMessages: [{ ...assistant, loading: true, error: false }],
      followBottom: true,
      terminal: null,
      refresh: true,
    })
  })

  it('keeps explicit loading / error flags on the synced assistant placeholder', () => {
    const assistant = message('c_assistant', 'assistant', { loading: false, error: true })
    const plan = planChatSync(
      {
        type: 'turn_created',
        conversationGid: ACTIVE_GID,
        initialMessages: { assistant },
      },
      context({ isAtBottom: false })
    )
    expect(plan).toMatchObject({
      kind: 'turn',
      appendMessages: [assistant],
      followBottom: false,
    })
  })

  it('does not refresh for the stream this page is rendering itself but still reports the terminal status', () => {
    const plan = planChatSync(
      {
        type: 'turn_done',
        conversationGid: ACTIVE_GID,
        cids: { assistant: 'c_mine' },
        finishReason: 'stop',
      },
      context({ currentStreamCid: 'c_mine' })
    )
    expect(plan).toEqual({
      kind: 'turn',
      appendMessages: [],
      followBottom: true,
      terminal: { cid: 'c_mine', status: ChatLogStatus.COMPLETED },
      refresh: false,
    })
  })

  it('maps finish reasons of other connections to terminal statuses and schedules a refresh', () => {
    const base: ChatSyncEvent = { conversationGid: ACTIVE_GID, cids: { assistant: 'c_other' } }
    const ctx = context({ currentStreamCid: 'c_mine', isAtBottom: false })

    expect(planChatSync({ ...base, type: 'turn_error', finishReason: 'error' }, ctx)).toEqual({
      kind: 'turn',
      appendMessages: [],
      followBottom: false,
      terminal: { cid: 'c_other', status: ChatLogStatus.FAILED },
      refresh: true,
    })
    expect(planChatSync({ ...base, type: 'turn_done', finishReason: 'abort' }, ctx)).toMatchObject({
      terminal: { cid: 'c_other', status: ChatLogStatus.STOPPED },
      refresh: true,
    })
    expect(
      planChatSync({ ...base, type: 'turn_done', finishReason: 'handoff' }, ctx)
    ).toMatchObject({
      terminal: { cid: 'c_other', status: ChatLogStatus.COMPLETED },
    })
  })

  it('treats a terminal event without an assistant cid as a plain refresh', () => {
    expect(
      planChatSync(
        { type: 'turn_done', conversationGid: ACTIVE_GID, finishReason: 'stop' },
        context()
      )
    ).toEqual({
      kind: 'turn',
      appendMessages: [],
      followBottom: true,
      terminal: null,
      refresh: true,
    })
  })
})
