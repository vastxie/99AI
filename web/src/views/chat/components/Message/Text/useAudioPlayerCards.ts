import { onUnmounted, ref, watch, type ComponentPublicInstance, type ComputedRef } from 'vue'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { usePrivateMediaObjectUrls } from './usePrivateMediaObjectUrls'

export interface AudioCardEntry<T> {
  item: T
  index: number
  /** 播放卡片渲染键（同一文件多次出现时含位置信息） */
  key: string
}

/** 播放器控制对象：MediaOutput 创建，传给每张音频卡片 */
export type AudioPlayerCards<T> = ReturnType<typeof useAudioPlayerCards<T>>

interface AudioPlayerCardsOptions<T> {
  /** 可播放音频条目，由调用方过滤；变化时自动水合与回收 */
  entries: ComputedRef<AudioCardEntry<T>[]>
  /** 播放卡片键（与 entries 内 key 同源），查询/控制函数据此定位状态 */
  cardKeyOf: (item: T, index: number) => string
  isPrivate: (item: T) => boolean
  /** 私有媒体身份键（同一文件的多张卡片共享一个 objectURL） */
  privateKeyOf: (item: T) => string
  loadBlob: (item: T) => Promise<Blob>
  publicUrlOf: (item: T) => string
}

/**
 * 音频播放卡片 composable：私有音频经 usePrivateMediaObjectUrls 统一
 * blob 通道取源（公网直链直接使用），并管理 <audio> 元素注册、互斥播放、
 * 进度 / 时长 / 跳转与错误回退。从 MediaOutput 整体迁出，
 * 取代原先按播放键各自建 objectURL 的第三套手工 blob 管理。
 */
export function useAudioPlayerCards<T>(options: AudioPlayerCardsOptions<T>) {
  const { entries, cardKeyOf, isPrivate, privateKeyOf, loadBlob, publicUrlOf } = options
  const ms = message()

  const privateAudioSources = usePrivateMediaObjectUrls<T>({
    keyOf: privateKeyOf,
    load: loadBlob,
  })

  const audioElements = new Map<string, HTMLAudioElement>()
  const itemByKey = new Map<string, T>()
  const audioSrcByKey = ref<Record<string, string>>({})
  const audioErrorByKey = ref<Record<string, boolean>>({})
  const audioDurationByKey = ref<Record<string, number>>({})
  const audioCurrentTimeByKey = ref<Record<string, number>>({})
  const audioPlayingKey = ref('')

  function setStringRecord(target: typeof audioSrcByKey, key: string, value?: string) {
    const next = { ...target.value }
    if (value) next[key] = value
    else delete next[key]
    target.value = next
  }

  function setBooleanRecord(target: typeof audioErrorByKey, key: string, value: boolean) {
    const next = { ...target.value }
    if (value) next[key] = true
    else delete next[key]
    target.value = next
  }

  function setNumberRecord(
    target: typeof audioDurationByKey | typeof audioCurrentTimeByKey,
    key: string,
    value?: number
  ) {
    const next = { ...target.value }
    if (Number.isFinite(Number(value)) && Number(value) >= 0) next[key] = Number(value)
    else delete next[key]
    target.value = next
  }

  /** 还有没有卡片在用这个私有文件（同一文件的多张卡片共用一个 objectURL） */
  function isPrivateFileInUse(item: T): boolean {
    const privateKey = privateKeyOf(item)
    for (const other of itemByKey.values()) {
      if (isPrivate(other) && privateKeyOf(other) === privateKey) return true
    }
    return false
  }

  // ====== 源获取（私有走统一 blob 通道，公网直链直挂） ======
  /** 取回时这张卡片已经移除：返回空字符串、不落源；没有别的卡片在用这个文件时释放刚取到的 objectURL */
  async function ensureAudioSource(item: T, key: string): Promise<string> {
    const existingSource = audioSrcByKey.value[key]
    if (existingSource) return existingSource

    setBooleanRecord(audioErrorByKey, key, false)
    try {
      const source = isPrivate(item) ? await privateAudioSources.ensure(item) : publicUrlOf(item)
      if (!source) throw new Error('Invalid audio source')
      if (!itemByKey.has(key)) {
        if (isPrivate(item) && !isPrivateFileInUse(item)) privateAudioSources.release(item)
        return ''
      }
      setStringRecord(audioSrcByKey, key, source)
      return source
    } catch (error) {
      if (itemByKey.has(key)) setBooleanRecord(audioErrorByKey, key, true)
      throw error
    }
  }

  function cleanupStalePlaybackState(activeKeys: Set<string>) {
    for (const [key, audio] of audioElements.entries()) {
      if (activeKeys.has(key)) continue
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioElements.delete(key)
    }
    for (const key of itemByKey.keys()) {
      if (!activeKeys.has(key)) itemByKey.delete(key)
    }
    for (const key of Object.keys(audioSrcByKey.value)) {
      if (!activeKeys.has(key)) setStringRecord(audioSrcByKey, key)
    }
    for (const key of Object.keys(audioErrorByKey.value)) {
      if (!activeKeys.has(key)) setBooleanRecord(audioErrorByKey, key, false)
    }
    for (const key of Object.keys(audioDurationByKey.value)) {
      if (!activeKeys.has(key)) setNumberRecord(audioDurationByKey, key)
    }
    for (const key of Object.keys(audioCurrentTimeByKey.value)) {
      if (!activeKeys.has(key)) setNumberRecord(audioCurrentTimeByKey, key)
    }
    if (audioPlayingKey.value && !activeKeys.has(audioPlayingKey.value)) {
      audioPlayingKey.value = ''
    }
  }

  watch(
    entries,
    list => {
      const activeKeys = new Set(list.map(entry => entry.key))
      cleanupStalePlaybackState(activeKeys)
      for (const entry of list) itemByKey.set(entry.key, entry.item)
      // 私有项批量水合（含通道内活跃集回收），公网项直接落 src
      void privateAudioSources.hydrate(list.filter(entry => isPrivate(entry.item)).map(e => e.item))
      for (const entry of list) {
        if (audioSrcByKey.value[entry.key]) continue
        void ensureAudioSource(entry.item, entry.key).catch(() => {})
      }
    },
    { immediate: true }
  )

  // ====== <audio> 元素注册与互斥播放 ======
  function registerAudioElement(key: string, element: Element | ComponentPublicInstance | null) {
    if (!element) {
      audioElements.delete(key)
      return
    }

    if (element instanceof HTMLAudioElement) {
      audioElements.set(key, element)
    }
  }

  function pauseOtherAudio(activeKey: string) {
    for (const [key, audio] of audioElements.entries()) {
      if (key === activeKey) continue
      if (!audio.paused) audio.pause()
    }
    if (audioPlayingKey.value && audioPlayingKey.value !== activeKey) {
      audioPlayingKey.value = ''
    }
  }

  function isSameAudioSource(audio: HTMLAudioElement, source: string): boolean {
    const currentSource = audio.currentSrc || audio.src
    try {
      return currentSource === new URL(source, window.location.href).toString()
    } catch {
      return currentSource === source
    }
  }

  async function toggleAudioPlayback(item: T, index: number) {
    const key = cardKeyOf(item, index)
    const audio = audioElements.get(key)
    if (!audio) return

    if (audioPlayingKey.value === key && !audio.paused) {
      audio.pause()
      audioPlayingKey.value = ''
      return
    }

    try {
      const source = await ensureAudioSource(item, key)
      // 取源期间这张卡片的播放元素已经换掉（卡片被移除，或移除后在同一位置重建）：不用旧元素播放，也不报错
      if (audioElements.get(key) !== audio) return
      if (!source) throw new Error('Invalid audio source')

      pauseOtherAudio(key)
      if (!isSameAudioSource(audio, source)) audio.src = source
      await audio.play()
      audioPlayingKey.value = key
    } catch {
      if (!itemByKey.has(key)) return
      // 只清这张卡片的播放状态：别的卡片可能还在播
      if (audioPlayingKey.value === key) audioPlayingKey.value = ''
      setBooleanRecord(audioErrorByKey, key, true)
      ms.error(t('common.audioPlayFailed'))
    }
  }

  // ====== 元素事件 ======
  function handleAudioLoadedMetadata(key: string, event: Event) {
    const audio = event.currentTarget as HTMLAudioElement
    setNumberRecord(audioDurationByKey, key, audio.duration)
    setNumberRecord(audioCurrentTimeByKey, key, audio.currentTime)
  }

  function handleAudioTimeUpdate(key: string, event: Event) {
    const audio = event.currentTarget as HTMLAudioElement
    setNumberRecord(audioCurrentTimeByKey, key, audio.currentTime)
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setNumberRecord(audioDurationByKey, key, audio.duration)
    }
  }

  function handleAudioPlay(key: string) {
    pauseOtherAudio(key)
    audioPlayingKey.value = key
  }

  function handleAudioPause(key: string, event: Event) {
    const audio = event.currentTarget as HTMLAudioElement
    if (audioPlayingKey.value === key && !audio.ended) {
      audioPlayingKey.value = ''
    }
  }

  function handleAudioEnded(key: string, event: Event) {
    const audio = event.currentTarget as HTMLAudioElement
    audioPlayingKey.value = ''
    setNumberRecord(audioCurrentTimeByKey, key, audio.duration)
  }

  function handleAudioError(key: string) {
    if (audioPlayingKey.value === key) audioPlayingKey.value = ''
    // 释放私有源并清空 src，允许下次点击重新取数
    const item = itemByKey.get(key)
    if (item && isPrivate(item)) privateAudioSources.release(item)
    setStringRecord(audioSrcByKey, key)
    setBooleanRecord(audioErrorByKey, key, true)
  }

  // ====== 进度与跳转 ======
  function handleAudioSeek(item: T, index: number, event: MouseEvent) {
    const key = cardKeyOf(item, index)
    const audio = audioElements.get(key)
    const duration = audioDurationByKey.value[key]
    if (!audio || !Number.isFinite(duration) || duration <= 0) return

    const track = event.currentTarget as HTMLElement
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const nextTime = duration * ratio
    audio.currentTime = nextTime
    setNumberRecord(audioCurrentTimeByKey, key, nextTime)
  }

  function stepAudioSeek(item: T, index: number, deltaSeconds: number) {
    const key = cardKeyOf(item, index)
    const audio = audioElements.get(key)
    const duration = audioDurationByKey.value[key]
    if (!audio || !Number.isFinite(duration) || duration <= 0) return

    const nextTime = Math.min(duration, Math.max(0, audio.currentTime + deltaSeconds))
    audio.currentTime = nextTime
    setNumberRecord(audioCurrentTimeByKey, key, nextTime)
  }

  // ====== 展示态查询 ======
  function isAudioLoading(item: T, index: number): boolean {
    const key = cardKeyOf(item, index)
    if (audioSrcByKey.value[key]) return false
    return isPrivate(item) && privateAudioSources.isLoading(item)
  }

  function isAudioPlaying(item: T, index: number): boolean {
    const key = cardKeyOf(item, index)
    return audioPlayingKey.value === key && !audioElements.get(key)?.paused
  }

  function getAudioButtonLabel(item: T, index: number): string {
    return isAudioPlaying(item, index) ? t('common.pauseAudio') : t('common.playAudio')
  }

  function formatAudioTime(seconds?: number): string {
    const safeSeconds =
      Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? Number(seconds) : 0
    const totalSeconds = Math.floor(safeSeconds)
    const minutes = Math.floor(totalSeconds / 60)
    const restSeconds = totalSeconds % 60
    return `${minutes}:${String(restSeconds).padStart(2, '0')}`
  }

  function getAudioTimeLabel(item: T, index: number): string {
    const key = cardKeyOf(item, index)
    const duration = audioDurationByKey.value[key]
    const currentTime = audioCurrentTimeByKey.value[key] || 0
    if (Number.isFinite(duration) && duration > 0) {
      return `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
    }
    if (isAudioLoading(item, index)) return t('common.loading')
    if (audioErrorByKey.value[key] || privateAudioSources.hasFailed(item)) {
      return t('common.audioPlayFailed')
    }
    return ''
  }

  function getAudioProgressPercent(item: T, index: number): number {
    const key = cardKeyOf(item, index)
    const duration = audioDurationByKey.value[key]
    if (!Number.isFinite(duration) || duration <= 0) return 0
    const currentTime = audioCurrentTimeByKey.value[key] || 0
    return Math.min(100, Math.max(0, (currentTime / duration) * 100))
  }

  function getAudioDurationValue(item: T, index: number): number {
    const duration = audioDurationByKey.value[cardKeyOf(item, index)]
    return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0
  }

  function getAudioCurrentValue(item: T, index: number): number {
    const currentTime = audioCurrentTimeByKey.value[cardKeyOf(item, index)]
    return Number.isFinite(currentTime) && currentTime > 0 ? Math.floor(currentTime) : 0
  }

  onUnmounted(() => {
    for (const audio of audioElements.values()) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioElements.clear()
    itemByKey.clear()
    audioSrcByKey.value = {}
    audioErrorByKey.value = {}
    audioDurationByKey.value = {}
    audioCurrentTimeByKey.value = {}
    audioPlayingKey.value = ''
  })

  return {
    audioSrcByKey,
    registerAudioElement,
    toggleAudioPlayback,
    handleAudioLoadedMetadata,
    handleAudioTimeUpdate,
    handleAudioPlay,
    handleAudioPause,
    handleAudioEnded,
    handleAudioError,
    handleAudioSeek,
    stepAudioSeek,
    isAudioLoading,
    isAudioPlaying,
    getAudioButtonLabel,
    getAudioTimeLabel,
    getAudioProgressPercent,
    getAudioDurationValue,
    getAudioCurrentValue,
  }
}
