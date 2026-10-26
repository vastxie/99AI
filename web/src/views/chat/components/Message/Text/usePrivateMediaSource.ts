import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
  getFileIdFromItem,
  getPrivateFileDownloadUrl,
  getPrivateFilePreviewUrl,
  isPrivateOutputFile,
  loadFileBlob,
  resolveAuthenticatedFileUrl,
} from '@/utils/privateFileAccess'
import { isVideoOutputFile, type OutputFile } from '@/views/chat/outputFile'
import { usePrivateMediaObjectUrls } from './usePrivateMediaObjectUrls'

/** 联网后重取失败图片：同一条消息里每张错开这么久 */
const ONLINE_RETRY_STAGGER_MS = 250
/** 联网后重取失败图片：各条消息之间随机错开的上限 */
const ONLINE_RETRY_JITTER_MS = 1000

/** 私有视频回落到 blob 时要整个下载下来，超过这个大小就改成下载卡片（直链流式播放不受限） */
const VIDEO_INLINE_HYDRATION_MAX_BYTES = 100 * 1024 * 1024
/** 图片取不回时隔这么久再取（流式期间文件可能还没落盘，网络也可能刚好抖了一下），之后等联网再试 */
const IMAGE_RETRY_DELAYS_MS = [2000, 5000, 15000]

/** 同一个私有文件的身份键：多处引用共用一份 blob */
export function privateMediaKey(item: OutputFile): string {
  return getFileIdFromItem(item) || item.downloadUrl || item.url || item.name || item.title || ''
}

function resolveDirectSrc(item: OutputFile, urlOf: (item: OutputFile) => string) {
  try {
    const url = urlOf(item)
    return url ? resolveAuthenticatedFileUrl(url) : ''
  } catch {
    return ''
  }
}

function canHydrateVideo(item: OutputFile) {
  if (!getPrivateFileDownloadUrl(item)) return false
  const size = Number(item.size)
  return !(Number.isFinite(size) && size > VIDEO_INLINE_HYDRATION_MAX_BYTES)
}

function setFlag(target: Ref<Record<string, true>>, key: string, on: boolean) {
  if (Boolean(target.value[key]) === on) return
  const next = { ...target.value }
  if (on) next[key] = true
  else delete next[key]
  target.value = next
}

/**
 * 消息里图片、视频的取源。
 *
 * 私有文件先用直链（普通 URL，靠 fa_token cookie 鉴权：复制出去能用，分享给别人没有凭证打不开）；
 * 直链加载失败（没有 cookie、超出在线预览体积、凭证过期）再回落到带鉴权取回的 blob；
 * blob 也放不出来就不再当媒体展示，由调用方改成文件卡片。
 */
export function usePrivateMediaSource() {
  /** 直链加载失败的项，改走 blob */
  const directFailedKeys = ref<Record<string, true>>({})
  /**
   * 放不出来的图片先改成文件卡片（否则既不显示图片、也不进文件列表，整张消失）：
   * - 取不回（断网、凭证过期、文件还没落盘）：隔一会儿自动再取几次、联网时再取，取到了换回图片；
   * - 取回了却解码不了：不再重试。
   * 两种都单独记着、不随取数候选变化清掉：否则「失败 → 不当图片 → 候选收缩 → 失败标记被回收 → 再取」地循环
   */
  const loadFailedKeys = ref<Record<string, true>>({})
  const unplayableKeys = ref<Record<string, true>>({})
  const imageRetries = new Map<
    string,
    { item: OutputFile; attempts: number; timer?: ReturnType<typeof setTimeout> }
  >()
  let disposed = false
  /**
   * 这条消息里还有哪些文件（不按展示层的失败过滤）：加载失败后改成卡片的图片仍在，按需重试；
   * 已经从消息里移除的，旧请求失败不再登记、已排的重试取消。挂上来源之前（hydrateFrom）都算在
   */
  let presentKeys: (() => Set<string>) | null = null
  const isPresent = (key: string) => !presentKeys || presentKeys().has(key)

  function cancelRetry(key: string) {
    const retry = imageRetries.get(key)
    if (retry?.timer) clearTimeout(retry.timer)
    imageRetries.delete(key)
  }

  function markLoadFailed(item: OutputFile) {
    const key = privateMediaKey(item)
    if (!key) return
    if (!isPresent(key)) {
      cancelRetry(key)
      return
    }
    setFlag(loadFailedKeys, key, true)
    const retry = imageRetries.get(key) ?? { item, attempts: 0 }
    retry.item = item
    imageRetries.set(key, retry)
    if (disposed || retry.timer || retry.attempts >= IMAGE_RETRY_DELAYS_MS.length) return
    const delay = IMAGE_RETRY_DELAYS_MS[retry.attempts]
    retry.attempts += 1
    retry.timer = setTimeout(() => {
      retry.timer = undefined
      void retryImage(key)
    }, delay)
  }

  /** 按需再取一次（不经候选集：卡片一直显示到取到为止，取到了才换回图片，不闪空） */
  async function retryImage(key: string) {
    const retry = imageRetries.get(key)
    if (!retry || disposed) return
    if (!isPresent(key)) {
      cancelRetry(key)
      return
    }
    try {
      await imageBlobs.ensure(retry.item)
      // 重试途中图片已从消息里移除：取到的源不再需要，释放掉
      if (disposed || !isPresent(key)) {
        imageBlobs.release(retry.item)
        cancelRetry(key)
        return
      }
      imageRetries.delete(key)
      setFlag(loadFailedKeys, key, false)
    } catch {
      // 失败已由 load 记下并排好下一次
    }
  }

  const imageBlobs = usePrivateMediaObjectUrls<OutputFile>({
    keyOf: privateMediaKey,
    load: item =>
      loadFileBlob(item).catch(error => {
        markLoadFailed(item)
        throw error
      }),
  })
  const videoBlobs = usePrivateMediaObjectUrls<OutputFile>({
    keyOf: privateMediaKey,
    load: loadFileBlob,
  })

  function isDirectFailed(item: OutputFile) {
    const key = privateMediaKey(item)
    return Boolean(key && directFailedKeys.value[key])
  }

  /** 当前放不出来、改成文件卡片（取不回的可能稍后换回图片） */
  function isHardFailed(item: OutputFile) {
    const key = privateMediaKey(item)
    return Boolean(key && (loadFailedKeys.value[key] || unplayableKeys.value[key]))
  }

  /** <img> / <video> 加载失败：直链失败就改走 blob，blob 也解码不了就放弃当媒体展示 */
  function onMediaError(item: OutputFile, src: string) {
    if (!isPrivateOutputFile(item)) return
    const key = privateMediaKey(item)
    if (!key) return
    if (src.startsWith('blob:')) {
      setFlag(unplayableKeys, key, true)
      return
    }
    if (!directFailedKeys.value[key]) {
      directFailedKeys.value = { ...directFailedKeys.value, [key]: true }
    }
  }

  function imageSrc(item: OutputFile): string {
    if (!isPrivateOutputFile(item)) return item.url || ''
    if (isDirectFailed(item)) return imageBlobs.getSource(item)
    return resolveDirectSrc(item, getPrivateFilePreviewUrl) || imageBlobs.getSource(item)
  }

  function videoSrc(item: OutputFile): string {
    if (!isPrivateOutputFile(item)) return item.url || ''
    // 视频直链走下载接口：支持 Range 流式播放，也不受在线预览体积上限约束
    if (!isDirectFailed(item)) return resolveDirectSrc(item, getPrivateFileDownloadUrl)
    return videoBlobs.getSource(item)
  }

  /** 是否按视频播放；私有视频直链失败后只有能回落到 blob 时才继续当视频 */
  function playsAsVideo(item: OutputFile): boolean {
    if (!isVideoOutputFile(item)) return false
    if (!isPrivateOutputFile(item)) return Boolean(item.url)
    if (!getPrivateFileDownloadUrl(item) || isHardFailed(item)) return false
    if (isDirectFailed(item)) return canHydrateVideo(item) && !videoBlobs.hasFailed(item)
    return true
  }

  const hydratable = (items: OutputFile[]) =>
    items.filter(
      item => isPrivateOutputFile(item) && getPrivateFileDownloadUrl(item) && isDirectFailed(item)
    )

  /**
   * 给出候选的图片与视频，直链失败的项去取 blob。候选集要独立于展示层的失败过滤，
   * 否则会「失败 → 被排除 → 候选收缩 → blob 被回收 → 再失败」地循环。
   * 候选依赖本组合式的状态，所以在拿到返回值之后再调用。
   */
  function hydrateFrom(sources: {
    images: () => OutputFile[]
    videos: () => OutputFile[]
    /** 这条消息里的全部文件（不按展示过滤）；不给就按图片与视频候选的并集 */
    present?: () => OutputFile[]
  }) {
    const present = computed(
      () =>
        new Set(
          (sources.present?.() ?? [...sources.images(), ...sources.videos()])
            .map(privateMediaKey)
            .filter((key): key is string => Boolean(key))
        )
    )
    presentKeys = () => present.value
    // 文件从消息里移除了：已经排着的重试取消
    watch(present, keys => {
      for (const key of [...imageRetries.keys()]) if (!keys.has(key)) cancelRetry(key)
    })
    const videoCandidates = () =>
      hydratable(sources.videos().filter(isVideoOutputFile)).filter(canHydrateVideo)
    watch(
      () => hydratable(sources.images()),
      items => void imageBlobs.hydrate(items),
      { immediate: true }
    )
    watch(videoCandidates, items => void videoBlobs.hydrate(items), { immediate: true })
    // 联网了：取不回的图片重新计次再取，取不回的视频再取一次。错开着取（每张隔一点、各条消息再随机错开），
    // 不在联网的一瞬间把所有失败的图片同时重新请求
    useEventListener(window, 'online', () => {
      const jitter = Math.random() * ONLINE_RETRY_JITTER_MS
      let index = 0
      for (const [key, retry] of imageRetries) {
        if (retry.timer) clearTimeout(retry.timer)
        retry.attempts = 0
        retry.timer = setTimeout(
          () => {
            retry.timer = undefined
            void retryImage(key)
          },
          jitter + index * ONLINE_RETRY_STAGGER_MS
        )
        index += 1
      }
      void videoBlobs.hydrate(videoCandidates())
    })
  }

  onBeforeUnmount(() => {
    disposed = true
    for (const retry of imageRetries.values()) {
      if (retry.timer) clearTimeout(retry.timer)
    }
    imageRetries.clear()
  })

  return { imageSrc, videoSrc, playsAsVideo, isHardFailed, onMediaError, hydrateFrom }
}
