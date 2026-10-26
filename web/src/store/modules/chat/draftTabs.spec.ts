import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/chatGroup', () => ({
  fetchUpdateChatGroupAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchCreateChatGroupAPI: vi.fn(() => Promise.resolve({ success: true, data: {} })),
  fetchDeleteChatGroupAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchQueryChatGroupsAPI: vi.fn(() => Promise.resolve({ success: true, data: [] })),
}))
vi.mock('@/api/chatLog', () => ({
  fetchDelChatLogAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchQueryChatLogAroundAPI: vi.fn(() => Promise.resolve({ data: { rows: [] } })),
  fetchQueryChatLogListAPI: vi.fn(() => Promise.resolve({ data: [] })),
}))

const GID = 'g_abcdefghijklmnopqrstuvwx'
const OTHER_GID = 'g_zyxwvutsrqponmlkjihgfedc'
const stored = () => JSON.parse(localStorage.getItem('chatStorage') || '{}').data

/**
 * 一个页签：独立的模块实例（模块级的待写与写不进去的记录各一份）、独立的 pinia，
 * 与别的页签共用同一个本地存储
 */
async function openTab() {
  vi.resetModules()
  const { useChatStore } = await import('./index')
  const pinia: Pinia = createPinia()
  setActivePinia(pinia)
  const store = useChatStore()
  return {
    store,
    run<T>(fn: (chat: typeof store) => T): T {
      setActivePinia(pinia)
      return fn(store)
    },
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('多页签的草稿归属', () => {
  it('两个页签先后登录过期：后过期的不清掉先过期的那个游客时写的；登录回原账号时两边的都在', async () => {
    const first = await openTab()
    first.run(chat => {
      chat.claimDraftsFor('user:7')
      chat.setDraft(GID, '账号里写的')
      chat.persist()
    })
    const second = await openTab()
    second.run(chat => chat.claimDraftsFor('user:7'))

    // 先过期的页签成了游客，用户关掉登录框在首页写了一句
    first.run(chat => {
      chat.clearChat({ keepDraft: true })
      chat.claimDraftsFor('visitor')
      chat.setDraft('', '游客时写的')
      chat.persist()
    })
    // 另一个页签随后也过期：它在写不进去期间改了别的会话
    second.run(chat => {
      chat.setDraft(OTHER_GID, '后过期的页签改的')
      chat.persist()
      chat.clearChat({ keepDraft: true })
      chat.claimDraftsFor('visitor')
    })
    expect(stored().drafts).toEqual({ '': '游客时写的' })
    expect(stored().stashedDrafts.drafts).toEqual({
      [GID]: '账号里写的',
      [OTHER_GID]: '后过期的页签改的',
    })

    // 在先过期的页签里登录：收起的（含后过期页签并进去的改动）与游客时写的都在
    first.run(chat => {
      chat.clearChat({ keepDraft: true })
      chat.claimDraftsFor('user:7', { takeOver: true })
    })
    expect(first.store.drafts).toEqual({
      [GID]: '账号里写的',
      [OTHER_GID]: '后过期的页签改的',
      '': '游客时写的',
    })
    expect(stored().draftOwner).toBe('user:7')
    expect(stored().drafts).toEqual(first.store.drafts)
  })
})
