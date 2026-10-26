import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, shallowRef } from 'vue'
import type { OutputFile } from '@/views/chat/outputFile'
import { usePrivateMediaSource } from './usePrivateMediaSource'

const files = vi.hoisted(() => ({ loadFileBlob: vi.fn(async (): Promise<Blob> => new Blob()) }))
vi.mock('@/utils/privateFileAccess', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/privateFileAccess')>()),
  loadFileBlob: files.loadFileBlob,
}))

const item = { fileId: 'file_missing', name: 'chart.png', type: 'image' } as OutputFile
const nativeCreateObjectURL = URL.createObjectURL
const nativeRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  // 只接管定时器：flushPromises 用的 setImmediate 照常
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  files.loadFileBlob.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:loaded')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  URL.createObjectURL = nativeCreateObjectURL
  URL.revokeObjectURL = nativeRevokeObjectURL
})

/** 与 MediaOutput 一样：放不出来的不再当图片，候选随之收缩；present 是消息里还在的文件 */
const presentItems = shallowRef<OutputFile[]>([])
function mountMedia() {
  presentItems.value = [item]
  let media!: ReturnType<typeof usePrivateMediaSource>
  const wrapper = mount(
    defineComponent({
      setup() {
        media = usePrivateMediaSource()
        media.hydrateFrom({
          images: () =>
            presentItems.value.filter(file => file === item && !media.isHardFailed(file)),
          videos: () => [],
          present: () => presentItems.value,
        })
        return () => null
      },
    })
  )
  return { wrapper, media: () => media }
}

async function settle() {
  await nextTick()
  await flushPromises()
  await nextTick()
}

describe('消息里私有图片的取源', () => {
  it('直链与带鉴权的取回都失败（404、断网）：改成文件卡片，不再整张消失，也不马上反复重取', async () => {
    files.loadFileBlob.mockRejectedValue(new Error('404'))
    const { wrapper, media } = mountMedia()
    const direct = media().imageSrc(item)
    expect(direct).toContain('/api/files/file_missing/preview')

    media().onMediaError(item, direct)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    expect(media().isHardFailed(item)).toBe(true)

    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    expect(media().isHardFailed(item)).toBe(true)
    wrapper.unmount()
  })

  it('取不回的图片隔一会儿自动再取几次（文件可能还没落盘）：取到了就换回图片', async () => {
    files.loadFileBlob.mockRejectedValueOnce(new Error('404'))
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    expect(media().isHardFailed(item)).toBe(true)

    await vi.advanceTimersByTimeAsync(2000)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(2)
    expect(media().isHardFailed(item)).toBe(false)
    expect(media().imageSrc(item)).toBe('blob:loaded')
    wrapper.unmount()
  })

  it('自动重试有上限；之后联网时再取一次', async () => {
    files.loadFileBlob.mockRejectedValue(new Error('offline'))
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    for (const delay of [2000, 5000, 15000, 60000]) {
      await vi.advanceTimersByTimeAsync(delay)
      await settle()
    }
    // 第一次取回 + 3 次自动重试
    expect(files.loadFileBlob).toHaveBeenCalledTimes(4)
    expect(media().isHardFailed(item)).toBe(true)

    files.loadFileBlob.mockResolvedValue(new Blob())
    window.dispatchEvent(new Event('online'))
    // 联网后错开着取（最多随机错开 1 秒），不同时重新请求
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1300)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(5)
    expect(media().isHardFailed(item)).toBe(false)
    wrapper.unmount()
  })

  it('取回了却解码不了：改成文件卡片，不再重试', async () => {
    files.loadFileBlob.mockResolvedValue(new Blob())
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    expect(media().imageSrc(item)).toBe('blob:loaded')

    media().onMediaError(item, 'blob:loaded')
    await settle()
    expect(media().isHardFailed(item)).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    expect(media().isHardFailed(item)).toBe(true)
    wrapper.unmount()
  })

  it('卸载后不再重试', async () => {
    files.loadFileBlob.mockRejectedValue(new Error('404'))
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(30000)
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
  })

  it('卸载后才落地的取回不再生成对象 URL（生成了就再也没人释放）', async () => {
    let resolveLoad: (blob: Blob) => void = () => undefined
    files.loadFileBlob.mockImplementationOnce(
      () =>
        new Promise<Blob>(resolve => {
          resolveLoad = resolve
        })
    )
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    wrapper.unmount()
    resolveLoad(new Blob())
    await settle()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('从消息里移除的图片', () => {
  it('还在等取回时被移除：旧请求随后失败，不登记失败、不再重试', async () => {
    let fail: (error: Error) => void = () => undefined
    files.loadFileBlob.mockImplementationOnce(
      () => new Promise<Blob>((_resolve, reject) => (fail = reject))
    )
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    presentItems.value = []
    await settle()
    fail(new Error('404'))
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    expect(media().isHardFailed(item)).toBe(false)
    wrapper.unmount()
  })

  it('已经排着的重试在图片被移除后取消；仍在消息里的失败图片照常恢复', async () => {
    files.loadFileBlob.mockRejectedValueOnce(new Error('404'))
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    expect(media().isHardFailed(item)).toBe(true)
    // 仍在消息里：重试取到后换回图片
    await vi.advanceTimersByTimeAsync(2000)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(2)
    expect(media().isHardFailed(item)).toBe(false)

    wrapper.unmount()

    // 另一条：取回失败、重试已经排上，随后图片从消息里移除：排着的重试取消
    files.loadFileBlob.mockReset().mockRejectedValue(new Error('404'))
    const second = mountMedia()
    second.media().onMediaError(item, second.media().imageSrc(item))
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    expect(second.media().isHardFailed(item)).toBe(true)
    presentItems.value = []
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(1)
    second.wrapper.unmount()
  })

  it('自动重试已经开始、图片随后被移除：重试取到的源随即释放，不再排下一次', async () => {
    files.loadFileBlob.mockRejectedValueOnce(new Error('404'))
    const { wrapper, media } = mountMedia()
    media().onMediaError(item, media().imageSrc(item))
    await settle()
    let succeed: (blob: Blob) => void = () => undefined
    files.loadFileBlob.mockImplementationOnce(
      () => new Promise<Blob>(resolve => (succeed = resolve))
    )
    await vi.advanceTimersByTimeAsync(2000)
    expect(files.loadFileBlob).toHaveBeenCalledTimes(2)
    presentItems.value = []
    await settle()
    succeed(new Blob())
    await settle()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:loaded')
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(files.loadFileBlob).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
