import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { usePrivateMediaObjectUrls } from './usePrivateMediaObjectUrls'

type Item = { key: string }
const nativeCreateObjectURL = URL.createObjectURL
const nativeRevokeObjectURL = URL.revokeObjectURL
let created: string[] = []
let revoked: string[] = []

/** 每次取数挂起，由用例决定何时成功或失败 */
const loads = new Map<string, Array<{ resolve: () => void; reject: (error: Error) => void }>>()
const load = vi.fn(
  (item: Item) =>
    new Promise<Blob>((resolve, reject) => {
      const list = loads.get(item.key) ?? []
      list.push({ resolve: () => resolve(new Blob([item.key])), reject })
      loads.set(item.key, list)
    })
)

function mountUrls() {
  let api!: ReturnType<typeof usePrivateMediaObjectUrls<Item>>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = usePrivateMediaObjectUrls<Item>({ keyOf: item => item.key, load })
        return () => null
      },
    })
  )
  return { wrapper, api: () => api }
}

const A = { key: 'A' }
const B = { key: 'B' }
const C = { key: 'C' }

beforeEach(() => {
  loads.clear()
  load.mockClear()
  created = []
  revoked = []
  let n = 0
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:${++n}`
    created.push(url)
    void blob
    return url
  })
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
})

afterEach(() => {
  URL.createObjectURL = nativeCreateObjectURL
  URL.revokeObjectURL = nativeRevokeObjectURL
})

describe('私有媒体对象 URL：共享取数与发布归属', () => {
  it('[A]→[B]：A 晚到不再发布，B 照常发布、不被旧调用回收', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([A])
    void api().hydrate([B])
    await flushPromises()
    loads.get('A')![0].resolve()
    await flushPromises()
    expect(api().getSource(A)).toBe('')
    loads.get('B')![0].resolve()
    await flushPromises()
    const b = api().getSource(B)
    expect(b).toMatch(/^blob:/u)
    expect(created).toEqual([b])
    expect(revoked).not.toContain(b)
    wrapper.unmount()
  })

  it('[A]→[]：A 晚到不发布、也不生成对象 URL', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([A])
    void api().hydrate([])
    loads.get('A')![0].resolve()
    await flushPromises()
    expect(api().getSource(A)).toBe('')
    expect(created).toEqual([])
    wrapper.unmount()
  })

  it('[A]→[A,B]：A 只取一次且仍可用，B 随后取回', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([A])
    void api().hydrate([A, B])
    loads.get('A')![0].resolve()
    await flushPromises()
    expect(load.mock.calls.filter(([item]) => item.key === 'A')).toHaveLength(1)
    const a = api().getSource(A)
    expect(a).toMatch(/^blob:/u)
    loads.get('B')![0].resolve()
    await flushPromises()
    expect(api().getSource(A)).toBe(a)
    expect(api().getSource(B)).toMatch(/^blob:/u)
    expect(revoked).toEqual([])
    wrapper.unmount()
  })

  it('被取代的旧调用不再发起后续加载', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([A, C])
    void api().hydrate([B])
    loads.get('A')![0].resolve()
    await flushPromises()
    expect(load.mock.calls.some(([item]) => item.key === 'C')).toBe(false)
    wrapper.unmount()
  })

  it('共享取数失败：还需要时记失败，已经没人需要时不记', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([A, B])
    loads.get('A')![0].reject(new Error('404'))
    await flushPromises()
    expect(api().hasFailed(A)).toBe(true)
    void api().hydrate([C])
    loads.get('B')![0].reject(new Error('404'))
    await flushPromises()
    expect(api().hasFailed(B)).toBe(false)
    wrapper.unmount()
  })

  it('候选集之外的按需取源（失败后改成卡片的图片重试）照常发布', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([])
    const pending = api().ensure(C)
    loads.get('C')![0].resolve()
    expect(await pending).toMatch(/^blob:/u)
    expect(api().getSource(C)).toMatch(/^blob:/u)
    wrapper.unmount()
  })

  it('候选集外的 ensure 与换候选的 hydrate 相邻完成：ensure 拿到的 URL 不被回收', async () => {
    const { wrapper, api } = mountUrls()
    const pending = api().ensure(A)
    void api().hydrate([B])
    loads.get('A')![0].resolve()
    loads.get('B')![0].resolve()
    const a = await pending
    await flushPromises()
    expect(a).toMatch(/^blob:/u)
    expect(api().getSource(A)).toBe(a)
    expect(revoked).not.toContain(a)
    wrapper.unmount()
  })

  it('卸载后再按需取源：直接拒绝，不发请求也不留加载状态', async () => {
    const { wrapper, api } = mountUrls()
    const urls = api()
    wrapper.unmount()
    await expect(urls.ensure(C)).rejects.toThrow('disposed')
    expect(load).not.toHaveBeenCalled()
    expect(urls.isLoading(C)).toBe(false)
  })

  it('卸载后才完成的取回不生成对象 URL', async () => {
    const { wrapper, api } = mountUrls()
    void api().hydrate([A])
    wrapper.unmount()
    loads.get('A')![0].resolve()
    await flushPromises()
    expect(created).toEqual([])
  })
})
