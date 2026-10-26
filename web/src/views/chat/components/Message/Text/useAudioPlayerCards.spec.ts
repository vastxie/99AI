import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, shallowRef } from 'vue'
import { useAudioPlayerCards, type AudioCardEntry } from './useAudioPlayerCards'

const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('@/utils/message', () => ({ message: () => toasts }))

type Item = { id: string }
const nativeCreateObjectURL = URL.createObjectURL
const nativeRevokeObjectURL = URL.revokeObjectURL
let created: string[] = []
let revoked: string[] = []

/** 每次取数挂起，由用例决定何时成功或失败 */
const loads = new Map<string, Array<{ resolve: () => void; reject: () => void }>>()
const loadBlob = vi.fn(
  (item: Item) =>
    new Promise<Blob>((resolve, reject) => {
      const list = loads.get(item.id) ?? []
      list.push({
        resolve: () => resolve(new Blob([item.id])),
        reject: () => reject(new Error('404')),
      })
      loads.set(item.id, list)
    })
)
const finishLoad = (id: string) => loads.get(id)?.forEach(load => load.resolve())
const failLoad = (id: string) => loads.get(id)?.forEach(load => load.reject())

function fakeAudio(paused = true) {
  const audio = document.createElement('audio')
  const play = vi.fn(async () => undefined)
  Object.assign(audio, { play, pause: vi.fn(), load: vi.fn() })
  Object.defineProperty(audio, 'paused', { value: paused })
  return { audio, play }
}

const entry = (id: string, index: number): AudioCardEntry<Item> => ({
  item: { id },
  index,
  key: `${id}#${index}`,
})

let wrapper: VueWrapper | undefined

function mountCards(initial: AudioCardEntry<Item>[]) {
  const entries = shallowRef(initial)
  let api!: ReturnType<typeof useAudioPlayerCards<Item>>
  wrapper = mount(
    defineComponent({
      setup() {
        api = useAudioPlayerCards<Item>({
          entries: computed(() => entries.value),
          cardKeyOf: (item, index) => `${item.id}#${index}`,
          isPrivate: () => true,
          privateKeyOf: item => item.id,
          loadBlob,
          publicUrlOf: () => '',
        })
        return () => null
      },
    })
  )
  return { entries, api: () => api }
}

beforeEach(() => {
  loads.clear()
  loadBlob.mockClear()
  toasts.error.mockReset()
  created = []
  revoked = []
  let n = 0
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:${++n}`
    created.push(url)
    return url
  })
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  URL.createObjectURL = nativeCreateObjectURL
  URL.revokeObjectURL = nativeRevokeObjectURL
})

describe('音频卡片的私有取源', () => {
  it('取回之前卡片被移除：不再落源，对象 URL 随即释放，不等下一次水合或卸载', async () => {
    const { entries, api } = mountCards([entry('A', 0), entry('B', 1)])
    await flushPromises()
    expect(loadBlob).toHaveBeenCalledTimes(2)

    entries.value = [entry('B', 0)]
    await flushPromises()
    finishLoad('A')
    await flushPromises()
    finishLoad('B')
    await flushPromises()

    const sources = api().audioSrcByKey.value
    expect(Object.keys(sources)).toEqual(['B#0'])
    const urlOfA = created.find(url => !Object.values(sources).includes(url))
    expect(urlOfA).toBeDefined()
    expect(revoked).toEqual([urlOfA])
  })

  it('同一个文件的两张卡片移除其中一张：另一张照常拿到源，共用的对象 URL 不被释放', async () => {
    const { entries, api } = mountCards([entry('A', 0), entry('A', 1)])
    await flushPromises()
    expect(loadBlob).toHaveBeenCalledTimes(1)

    entries.value = [entry('A', 0)]
    await flushPromises()
    finishLoad('A')
    await flushPromises()

    expect(api().audioSrcByKey.value).toEqual({ 'A#0': created[0] })
    expect(revoked).toEqual([])
  })

  it('点了播放、取源期间卡片被移除：不播放、不报错，正在播放的另一张卡片状态不变', async () => {
    const { entries, api } = mountCards([entry('A', 0), entry('B', 1)])
    await flushPromises()
    finishLoad('B')
    await flushPromises()
    const a = fakeAudio()
    const b = fakeAudio(false)
    api().registerAudioElement('A#0', a.audio)
    api().registerAudioElement('B#1', b.audio)
    api().handleAudioPlay('B#1')

    const playing = api().toggleAudioPlayback({ id: 'A' }, 0)
    entries.value = [entry('B', 1)]
    await flushPromises()
    finishLoad('A')
    await playing
    await flushPromises()

    expect(a.play).not.toHaveBeenCalled()
    expect(toasts.error).not.toHaveBeenCalled()
    expect(api().isAudioPlaying({ id: 'B' }, 1)).toBe(true)
    expect(Object.keys(api().audioSrcByKey.value)).toEqual(['B#1'])
  })

  it('点了播放、取源失败时卡片已被移除：不弹播放失败的提示，正在播放的另一张卡片状态不变', async () => {
    const { entries, api } = mountCards([entry('A', 0), entry('B', 1)])
    await flushPromises()
    finishLoad('B')
    await flushPromises()
    const a = fakeAudio()
    api().registerAudioElement('A#0', a.audio)
    api().registerAudioElement('B#1', fakeAudio(false).audio)
    api().handleAudioPlay('B#1')

    const playing = api().toggleAudioPlayback({ id: 'A' }, 0)
    entries.value = [entry('B', 1)]
    await flushPromises()
    failLoad('A')
    await playing
    await flushPromises()

    expect(a.play).not.toHaveBeenCalled()
    expect(toasts.error).not.toHaveBeenCalled()
    expect(api().isAudioPlaying({ id: 'B' }, 1)).toBe(true)
  })

  it('点了 A 播放但取源失败：提示失败，正在播放的 B 状态不变', async () => {
    const { api } = mountCards([entry('A', 0), entry('B', 1)])
    await flushPromises()
    finishLoad('B')
    await flushPromises()
    api().registerAudioElement('A#0', fakeAudio().audio)
    api().registerAudioElement('B#1', fakeAudio(false).audio)
    api().handleAudioPlay('B#1')

    const playing = api().toggleAudioPlayback({ id: 'A' }, 0)
    failLoad('A')
    await playing
    await flushPromises()

    expect(toasts.error).toHaveBeenCalledTimes(1)
    expect(api().isAudioPlaying({ id: 'B' }, 1)).toBe(true)
  })

  it('取源期间卡片被移除、又在同一位置重建：不用旧元素播放，新卡片拿到源', async () => {
    const { entries, api } = mountCards([entry('A', 0)])
    await flushPromises()
    const old = fakeAudio()
    api().registerAudioElement('A#0', old.audio)

    const playing = api().toggleAudioPlayback({ id: 'A' }, 0)
    entries.value = []
    await flushPromises()
    entries.value = [entry('A', 0)]
    await flushPromises()
    const rebuilt = fakeAudio()
    api().registerAudioElement('A#0', rebuilt.audio)
    finishLoad('A')
    await playing
    await flushPromises()

    expect(old.play).not.toHaveBeenCalled()
    expect(rebuilt.play).not.toHaveBeenCalled()
    expect(toasts.error).not.toHaveBeenCalled()
    expect(Object.keys(api().audioSrcByKey.value)).toEqual(['A#0'])
  })
})
