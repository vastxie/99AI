import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ emitWithAck: vi.fn() }))
vi.mock('@/services/socket-io', () => ({ socketService: { emitWithAck: mocks.emitWithAck } }))

import { resyncChat } from './index'

describe('resyncChat', () => {
  beforeEach(() => {
    mocks.emitWithAck.mockReset().mockResolvedValue({ ok: true })
  })

  it('调用时同步进入 emitWithAck（之前不单独等连接）：身份在它的入口记下', async () => {
    const pending = resyncChat('cid-1', 12)
    // 还没有任何 await 就已经进入 emitWithAck
    expect(mocks.emitWithAck).toHaveBeenCalledWith('chat:resync', { cid: 'cid-1', afterSeq: 12 })
    await pending
    await resyncChat('cid-2')
    expect(mocks.emitWithAck).toHaveBeenLastCalledWith('chat:resync', { cid: 'cid-2' })
  })
})
