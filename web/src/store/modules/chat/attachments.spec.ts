import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useComposerAttachmentsStore } from './attachments'

type Upload = {
  file: File
  signal?: AbortSignal
  onProgress?: (ratio: number) => void
  resolve: (data: unknown) => void
  reject: (error: unknown) => void
}
const uploads = vi.hoisted(() => [] as Upload[])
const notify = vi.hoisted(() => vi.fn())

vi.mock('@/api/upload', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/upload')>()),
  uploadFile: vi.fn(
    (
      file: File,
      _dir: unknown,
      options: { signal?: AbortSignal; onProgress?: (r: number) => void }
    ) =>
      new Promise((resolve, reject) => {
        uploads.push({ file, ...options, resolve, reject })
        options.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }))
        )
      })
  ),
}))
vi.mock('@/utils/message', () => ({ notifyError: notify, message: () => ({}) }))

const HOME = ''
const GID = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
const image = () => new File(['png'], 'shot.png', { type: 'image/png' })
const doc = () => new File(['pdf'], 'report.pdf', { type: 'application/pdf' })

beforeEach(() => {
  setActivePinia(createPinia())
  uploads.length = 0
  notify.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview') as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
})

describe('输入框附件', () => {
  it('选中即在后台上传：显示进度，成功后带上发送要用的字段；图片有本地预览', async () => {
    const store = useComposerAttachmentsStore()
    store.add(GID, image(), 'image')
    const [attachment] = store.list(GID)
    expect(attachment).toMatchObject({ status: 'uploading', previewUrl: 'blob:preview' })

    uploads[0].onProgress?.(0.4)
    expect(store.list(GID)[0].progress).toBe(0.4)
    uploads[0].resolve({ data: { fileId: 'file_1', previewUrl: '/files/1' } })
    await store.settled(GID)
    expect(store.list(GID)[0]).toMatchObject({
      status: 'uploaded',
      progress: 1,
      uploaded: { type: 'image', name: 'shot.png', fileId: 'file_1', url: '/files/1' },
    })
  })

  it('上传失败：标成失败并提示一次，可以重试', async () => {
    const store = useComposerAttachmentsStore()
    store.add(GID, doc(), 'file')
    uploads[0].reject(new Error('网络错误'))
    await store.settled(GID)
    expect(store.list(GID)[0]).toMatchObject({ status: 'failed', error: '网络错误' })
    expect(notify).toHaveBeenCalledTimes(1)

    store.retry(store.list(GID)[0].id)
    expect(store.list(GID)[0].status).toBe('uploading')
    uploads[1].resolve({ data: '/files/2' })
    await store.settled(GID)
    expect(store.list(GID)[0].status).toBe('uploaded')
  })

  it('等上传结果期间又点了「重新上传」：新开始的那次也一起等到有结果', async () => {
    const store = useComposerAttachmentsStore()
    store.add(GID, doc(), 'file')
    store.add(GID, image(), 'image')
    uploads[1].reject(new Error('网络错误'))
    await Promise.resolve()
    await Promise.resolve()

    let settled = false
    const waiting = store.settled(GID).then(() => {
      settled = true
    })
    // 第一份还在传时，重新上传失败的第二份
    store.retry(store.list(GID)[1].id)
    uploads[0].resolve({ data: '/files/1' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)

    uploads[2].resolve({ data: { fileId: 'file_2', previewUrl: '/files/2' } })
    await waiting
    expect(store.list(GID).map(item => item.status)).toEqual(['uploaded', 'uploaded'])
  })

  it('移除还在上传的附件：取消上传、释放预览，不算失败也不提示', async () => {
    const store = useComposerAttachmentsStore()
    store.add(GID, image(), 'image')
    const id = store.list(GID)[0].id
    store.remove(GID, id)
    expect(uploads[0].signal?.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(store.list(GID)).toEqual([])
    await Promise.resolve()
    expect(notify).not.toHaveBeenCalled()
  })

  it('各会话互不影响；在首页加的附件随新建的会话走；发出后从输入框移除并释放预览', async () => {
    const store = useComposerAttachmentsStore()
    store.add(HOME, image(), 'image')
    store.add(GID, doc(), 'file')
    expect(store.list(HOME)).toHaveLength(1)
    expect(store.list(GID)).toHaveLength(1)

    store.moveTo(HOME, GID)
    expect(store.list(HOME)).toEqual([])
    expect(store.list(GID).map(item => item.file.name)).toEqual(['report.pdf', 'shot.png'])

    const sentId = store.list(GID)[1].id
    store.release(GID, [sentId])
    expect(store.list(GID).map(item => item.file.name)).toEqual(['report.pdf'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('上传途中附件换了会话名下（首页建会话）：结果照样落到这个附件上，不会一直停在上传中', async () => {
    const store = useComposerAttachmentsStore()
    store.add(HOME, image(), 'image')
    store.add(HOME, doc(), 'file')
    store.moveTo(HOME, GID)

    uploads[0].onProgress?.(0.5)
    expect(store.list(GID)[0].progress).toBe(0.5)
    uploads[0].resolve({ data: { fileId: 'file_1', previewUrl: '/files/1' } })
    uploads[1].reject(new Error('网络错误'))
    await store.settled(GID)

    expect(store.list(GID).map(item => item.status)).toEqual(['uploaded', 'failed'])
    expect(notify).toHaveBeenCalledTimes(1)
    store.retry(store.list(GID)[1].id)
    expect(store.list(GID)[1].status).toBe('uploading')
  })

  it('会话被删除：它的附件取消上传、释放预览，别的会话的不受影响', () => {
    const store = useComposerAttachmentsStore()
    store.add(GID, image(), 'image')
    store.add(HOME, doc(), 'file')
    store.discard(GID)
    expect(uploads[0].signal?.aborted).toBe(true)
    expect(uploads[1].signal?.aborted).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(store.list(GID)).toEqual([])
    expect(store.list(HOME)).toHaveLength(1)
  })

  it('主动退出：取消全部上传并清空', () => {
    const store = useComposerAttachmentsStore()
    store.add(GID, doc(), 'file')
    store.add(HOME, image(), 'image')
    store.clearAll()
    expect(uploads.every(upload => upload.signal?.aborted)).toBe(true)
    expect(store.byWorkspace).toEqual({})
  })
})
