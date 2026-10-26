import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentityChangedError } from '@/services/identity'
import { stopChat } from './index'

const mocks = vi.hoisted(() => ({
  emitWithAck: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/services/socket-io', () => ({
  socketService: { emitWithAck: mocks.emitWithAck },
}))
vi.mock('@/utils/request', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/request')>()),
  get: vi.fn(),
  post: mocks.post,
}))

const CID = 'c_0000000000000000a1'
const httpError = (status: number, message = '', notified = false) =>
  Object.assign(new Error(message), { status, ...(notified ? { notified: true } : {}) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.post.mockResolvedValue({ data: { stopped: true, status: 'stopped' } })
})

describe('stopChat 的判定表', () => {
  it('WebSocket 回执按 status 分类：stopped → 受理，completed / error → 已结束，not_found → 核对', async () => {
    const cases: Array<[unknown, unknown]> = [
      [{ stopped: true, status: 'stopped' }, { kind: 'accepted' }],
      [{ stopped: false, status: 'stopped' }, { kind: 'accepted' }],
      [
        { stopped: true, status: 'completed' },
        { kind: 'ended', status: 'completed' },
      ],
      [
        { stopped: false, status: 'error' },
        { kind: 'ended', status: 'error' },
      ],
      [{ stopped: false, status: 'not_found' }, { kind: 'verify' }],
    ]
    for (const [data, outcome] of cases) {
      mocks.emitWithAck.mockResolvedValueOnce({ ok: true, data })
      await expect(stopChat(CID)).resolves.toEqual(outcome)
    }
    expect(mocks.emitWithAck).toHaveBeenCalledWith('chat:stop', { cid: CID })
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('回执成功但载荷缺失或不合法：改走 HTTP 一次', async () => {
    const invalid = [
      undefined,
      null,
      [],
      { status: 'stopped' },
      { stopped: 'yes', status: 'stopped' },
      { stopped: true, status: 'paused' },
    ]
    for (const data of invalid) {
      mocks.emitWithAck.mockResolvedValueOnce({ ok: true, data })
      await expect(stopChat(CID)).resolves.toEqual({ kind: 'accepted' })
    }
    expect(mocks.post).toHaveBeenCalledTimes(invalid.length)
    expect(mocks.post).toHaveBeenCalledWith({
      url: '/chat/stop',
      data: { cid: CID },
      silentError: true,
    })
  })

  it('回执没送到（超时、连接失败、回执不对、没有错误码）或实时连接校验失败：改走 HTTP', async () => {
    const codes = [
      'TIMEOUT',
      'CONNECTION_FAILED',
      'INVALID_ACK',
      undefined,
      'SESSION_UNAVAILABLE',
      'SESSION_INVALID',
    ]
    for (const code of codes) {
      mocks.emitWithAck.mockResolvedValueOnce({ ok: false, code, message: 'x' })
      await expect(stopChat(CID)).resolves.toEqual({ kind: 'accepted' })
    }
    expect(mocks.post).toHaveBeenCalledTimes(codes.length)
  })

  it('回执的身份已变化：取消，不走 HTTP', async () => {
    mocks.emitWithAck.mockResolvedValueOnce({ ok: false, code: 'IDENTITY_CHANGED' })
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'cancelled' })
    mocks.emitWithAck.mockRejectedValueOnce(new IdentityChangedError())
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'cancelled' })
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('服务端内部错误：无法确认；其他带码的拒绝：附服务端文案', async () => {
    mocks.emitWithAck.mockResolvedValueOnce({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '停止失败',
    })
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'unknown' })
    mocks.emitWithAck.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: '无权操作此任务',
    })
    await expect(stopChat(CID)).resolves.toEqual({
      kind: 'rejected',
      message: '无权操作此任务',
      notified: false,
    })
    mocks.emitWithAck.mockResolvedValueOnce({ ok: false, code: 'UNAUTHORIZED' })
    await expect(stopChat(CID)).resolves.toMatchObject({ kind: 'rejected', notified: false })
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('emitWithAck 意外抛出别的错误：当作没送到，改走 HTTP', async () => {
    mocks.emitWithAck.mockRejectedValueOnce(new Error('boom'))
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'accepted' })
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('改走 HTTP 之前操作已失效：不发 HTTP', async () => {
    mocks.emitWithAck.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    await expect(stopChat(CID, () => false)).resolves.toEqual({ kind: 'cancelled' })
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('换身份后回执超时：先核对，不以新身份发出 HTTP 停止', async () => {
    let current = true
    mocks.emitWithAck.mockImplementationOnce(async () => {
      current = false
      return { ok: false, code: 'TIMEOUT' }
    })
    await expect(stopChat(CID, () => current)).resolves.toEqual({ kind: 'cancelled' })
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('HTTP 的结果：合法载荷按同一张表，非法载荷无法确认', async () => {
    mocks.emitWithAck.mockResolvedValue({ ok: false, code: 'TIMEOUT' })
    mocks.post.mockResolvedValueOnce({ data: { stopped: true, status: 'completed' } })
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'ended', status: 'completed' })
    mocks.post.mockResolvedValueOnce({ data: { stopped: false, status: 'not_found' } })
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'verify' })
    mocks.post.mockResolvedValueOnce({ data: { ok: 1 } })
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'unknown' })
    mocks.post.mockResolvedValueOnce(undefined)
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'unknown' })
  })

  it('HTTP 失败：身份变化取消；4xx（含请求层提示过的 401）是拒绝；其余无法确认', async () => {
    mocks.emitWithAck.mockResolvedValue({ ok: false, code: 'CONNECTION_FAILED' })
    mocks.post.mockRejectedValueOnce(new IdentityChangedError())
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'cancelled' })
    mocks.post.mockRejectedValueOnce(httpError(403, '无权操作此任务'))
    await expect(stopChat(CID)).resolves.toEqual({
      kind: 'rejected',
      message: '无权操作此任务',
      notified: false,
    })
    mocks.post.mockRejectedValueOnce(httpError(401, '登录已过期', true))
    await expect(stopChat(CID)).resolves.toEqual({
      kind: 'rejected',
      message: '登录已过期',
      notified: true,
    })
    mocks.post.mockRejectedValueOnce(httpError(502, '网关错误'))
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'unknown' })
    mocks.post.mockRejectedValueOnce(new Error('Network Error'))
    await expect(stopChat(CID)).resolves.toEqual({ kind: 'unknown' })
  })

  it('结果回来时操作已失效：交出取消，不交出结果', async () => {
    let current = true
    mocks.emitWithAck.mockImplementationOnce(async () => {
      current = false
      return { ok: true, data: { stopped: true, status: 'stopped' } }
    })
    await expect(stopChat(CID, () => current)).resolves.toEqual({ kind: 'cancelled' })
    current = true
    mocks.emitWithAck.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
    mocks.post.mockImplementationOnce(async () => {
      current = false
      return { data: { stopped: true, status: 'stopped' } }
    })
    await expect(stopChat(CID, () => current)).resolves.toEqual({ kind: 'cancelled' })
  })
})
