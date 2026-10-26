import { onUnmounted, ref } from 'vue'

export interface PrivateMediaObjectUrlOptions<T> {
  /** 媒体项的稳定身份键（通常为 fileId，回退到 URL / 名称） */
  keyOf: (item: T) => string
  /** 鉴权取数：返回媒体 Blob，由调用方决定如何携带凭证 */
  load: (item: T) => Promise<Blob>
}

/**
 * 私有媒体源水合复用层：key → 鉴权 Blob → objectURL 的统一生命周期。
 *
 * 原生 <img> / <video> / <audio> 标签无法携带鉴权头，私有文件需要先以鉴权
 * 请求取回 Blob 再喂 objectURL。该组合式统一负责：去重加载（hydrate 批量
 * 与 ensure 按需共享在途 Promise）、活跃集外的 objectURL 回收、失败标记
 * （供调用方决定回退形态，如下载卡片）与卸载清理。
 * 加载失败不会阻止下一轮水合重试（流式期间文件可能尚未就绪）。
 */
export function usePrivateMediaObjectUrls<T>(options: PrivateMediaObjectUrlOptions<T>) {
  const sourceUrls = ref<Record<string, string>>({})
  const failedKeys = ref<Record<string, true>>({})
  const loadingKeys = ref<Record<string, true>>({})
  const objectUrls = new Map<string, string>()
  const pendingLoads = new Map<string, Promise<string>>()
  /** 已卸载：之后才落地的取回不再生成对象 URL（生成了就再也没人释放） */
  let disposed = false
  /**
   * 谁还需要取回的结果：最新一次 hydrate 的集合，加上还在等待的 ensure。取数按 key 共享，
   * 取回时只要还有一方需要就发布；没人需要（候选已经换掉）就不生成对象 URL，也不记失败
   */
  let wanted = new Set<string>()
  let generation = 0
  const ensureDemand = new Map<string, number>()
  const isNeeded = (key: string) => wanted.has(key) || (ensureDemand.get(key) ?? 0) > 0
  /** 每个对象 URL 是在哪一代 hydrate 期间发布的：这一代收尾时不回收本代期间按需发布的，交给下一代按候选决定 */
  const publishedIn = new Map<string, number>()

  const getSource = (item: T): string => {
    const key = options.keyOf(item)
    return key ? sourceUrls.value[key] || '' : ''
  }

  const hasFailed = (item: T): boolean => {
    const key = options.keyOf(item)
    return Boolean(key && failedKeys.value[key])
  }

  const isLoading = (item: T): boolean => {
    const key = options.keyOf(item)
    return Boolean(key && loadingKeys.value[key])
  }

  function setLoading(key: string, value: boolean): void {
    const next = { ...loadingKeys.value }
    if (value) next[key] = true
    else delete next[key]
    loadingKeys.value = next
  }

  function loadOne(key: string, item: T): Promise<string> {
    const existing = pendingLoads.get(key)
    if (existing) return existing

    const promise = (async () => {
      setLoading(key, true)
      try {
        const blob = await options.load(item)
        if (disposed) throw new Error('disposed')
        if (!isNeeded(key)) return ''
        const objectUrl = URL.createObjectURL(blob)
        const previousUrl = objectUrls.get(key)
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        objectUrls.set(key, objectUrl)
        publishedIn.set(key, generation)
        sourceUrls.value = { ...sourceUrls.value, [key]: objectUrl }
        if (failedKeys.value[key]) {
          const nextFailed = { ...failedKeys.value }
          delete nextFailed[key]
          failedKeys.value = nextFailed
        }
        return objectUrl
      } catch (error) {
        // 仅标记失败供展示层回退，不回退成无鉴权直连；已经没人需要的不记
        if (!disposed && isNeeded(key)) failedKeys.value = { ...failedKeys.value, [key]: true }
        throw error
      } finally {
        if (!disposed) setLoading(key, false)
        pendingLoads.delete(key)
      }
    })()
    pendingLoads.set(key, promise)
    return promise
  }

  /**
   * 按需取源（不触发活跃集回收，可以在候选集之外，例如加载失败后改成卡片的图片自动重试）：
   * 已有源直接返回，在途加载复用；等待期间算「需要结果的一方」，失败抛错并标记
   */
  async function ensure(item: T): Promise<string> {
    if (disposed) throw new Error('disposed')
    const key = options.keyOf(item)
    if (!key) throw new Error('Invalid media key')
    const existing = sourceUrls.value[key]
    if (existing) return existing
    ensureDemand.set(key, (ensureDemand.get(key) ?? 0) + 1)
    try {
      return await loadOne(key, item)
    } finally {
      const left = (ensureDemand.get(key) ?? 1) - 1
      if (left > 0) ensureDemand.set(key, left)
      else ensureDemand.delete(key)
    }
  }

  /**
   * 换成新的候选集：只有最新一次 hydrate 能继续发起加载与回收；被新的取代后，旧调用停在原处，
   * 它等着的共享取数照常完成，由新的候选集决定是否发布
   */
  async function hydrate(items: T[]): Promise<void> {
    const mine = ++generation
    const activeKeys = new Set<string>()
    for (const item of items) {
      const key = options.keyOf(item)
      if (key) activeKeys.add(key)
    }
    wanted = activeKeys

    for (const item of items) {
      if (disposed || mine !== generation) return
      const key = options.keyOf(item)
      if (!key || sourceUrls.value[key]) continue

      await loadOne(key, item).catch(() => {})
    }

    if (disposed || mine !== generation) return
    releaseInactive(activeKeys, mine)
  }

  function releaseKey(key: string): void {
    publishedIn.delete(key)
    const objectUrl = objectUrls.get(key)
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrls.delete(key)
    }
    if (sourceUrls.value[key]) {
      const nextUrls = { ...sourceUrls.value }
      delete nextUrls[key]
      sourceUrls.value = nextUrls
    }
  }

  /** 释放单个媒体项的源（如元素层播放失败后，允许下次按需重新取数） */
  function release(item: T): void {
    const key = options.keyOf(item)
    if (key) releaseKey(key)
  }

  function releaseInactive(activeKeys: Set<string>, mine: number): void {
    // 与发布同一口径：还在等的 ensure 需要的、这一代期间按需发布的（如失败图片的重试刚取到）都不回收
    for (const key of [...objectUrls.keys()]) {
      if (activeKeys.has(key) || ensureDemand.get(key) || publishedIn.get(key) === mine) continue
      releaseKey(key)
    }

    let failedChanged = false
    const nextFailed: Record<string, true> = {}
    for (const key of Object.keys(failedKeys.value)) {
      if (activeKeys.has(key)) nextFailed[key] = true
      else failedChanged = true
    }
    if (failedChanged) failedKeys.value = nextFailed
  }

  function dispose(): void {
    disposed = true
    wanted = new Set()
    ensureDemand.clear()
    for (const url of objectUrls.values()) URL.revokeObjectURL(url)
    objectUrls.clear()
    pendingLoads.clear()
    loadingKeys.value = {}
    sourceUrls.value = {}
    failedKeys.value = {}
  }

  onUnmounted(dispose)

  return { getSource, hasFailed, isLoading, ensure, hydrate, release, dispose }
}
