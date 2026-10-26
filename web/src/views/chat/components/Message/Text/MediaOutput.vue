<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import { isPrivateOutputFile, loadFileBlob } from '@/utils/privateFileAccess'
import {
  dedupeOutputFiles,
  explicitOutputFileName,
  fileNameFromUrl,
  hasPreviewContent,
  isImageOutputFile,
  outputFileKey,
  parseOutputFiles,
  type OutputFile,
} from '@/views/chat/outputFile'
import OutputFileCard from './OutputFileCard.vue'
import {
  describeFileCard,
  downloadOutputFile,
  filePreviewSource,
  hasDownloadTarget,
  type FileCard,
} from './outputFileCard'
import { useAudioPlayerCards } from './useAudioPlayerCards'
import { privateMediaKey, usePrivateMediaSource } from './usePrivateMediaSource'

/**
 * 工具产出与消息附件的展示：图片成排、视频逐个播放，其余文件是卡片。
 * 文件怎么分类、卡片能做什么在 outputFileCard.ts；私有图片 / 视频怎么取源在 usePrivateMediaSource.ts。
 */
const props = withDefaults(
  defineProps<{
    output: any
    fileMode?: 'card' | 'inline'
    inlineSize?: 'default' | 'sm'
    inlineTone?: 'default' | 'muted'
    variant?: 'default' | 'user-message'
  }>(),
  {
    fileMode: 'card',
    inlineSize: 'default',
    inlineTone: 'default',
    variant: 'default',
  }
)

const { isMobile } = useViewport()
const globalStore = useGlobalStoreWithOut()
const ms = message()
const media = usePrivateMediaSource()

const isUserMessage = computed(() => props.variant === 'user-message')
const fileAssets = computed(() => dedupeOutputFiles(parseOutputFiles(props.output?.files)))
const videoItems = computed(() => fileAssets.value.filter(item => media.playsAsVideo(item)))
const rawFileItems = computed(() =>
  dedupeOutputFiles([
    ...parseOutputFiles(props.output?.filePreview),
    ...fileAssets.value.filter(item => !media.playsAsVideo(item)),
  ])
)

/** 按图片展示：能下载到原图、不是蒙版、不是内联文本，且没有彻底加载失败 */
function showsAsImage(item: OutputFile) {
  return (
    isImageOutputFile(item) &&
    String(item.role || '').toLowerCase() !== 'mask' &&
    !hasPreviewContent(item) &&
    hasDownloadTarget(item) &&
    !media.isHardFailed(item)
  )
}

const imageItems = computed(() => rawFileItems.value.filter(showsAsImage))
/** 有图片成排展示时，其余图片类附件（如蒙版）不再单独出卡片；加载失败的图片改成文件卡片 */
const fileItems = computed(() =>
  rawFileItems.value.filter(
    item => !isImageOutputFile(item) || media.isHardFailed(item) || imageItems.value.length === 0
  )
)
media.hydrateFrom({
  images: () => imageItems.value,
  videos: () => fileAssets.value,
  // 这条消息里的全部文件：加载失败、改成卡片的图片仍算在，按需重试；从消息里移除的不再重试
  present: () => [...fileAssets.value, ...rawFileItems.value],
})

const images = computed(() =>
  imageItems.value.flatMap(item => {
    const src = media.imageSrc(item)
    if (!src) return []
    const alt = explicitOutputFileName(item) || fileNameFromUrl(item.url || '') || t('common.image')
    return [{ item, src, alt, key: privateMediaKey(item) || src }]
  })
)
const videos = computed(() =>
  videoItems.value.flatMap(item => {
    const src = media.videoSrc(item)
    return src ? [{ item, src, key: privateMediaKey(item) || src }] : []
  })
)

const imageClass = computed(() => {
  if (isUserMessage.value) {
    return [
      'media-output-user-image',
      isMobile.value ? 'h-24 w-24' : 'h-28 w-28',
      'object-cover',
      'flex-shrink-0',
    ]
  }
  if (images.value.length === 1) return ['max-w-[min(28rem,100%)]']
  return isMobile.value ? ['max-w-[44vw]', 'flex-shrink-0'] : ['max-w-[12rem]', 'flex-shrink-0']
})

const imageStyle = computed(() => {
  if (isUserMessage.value) return undefined
  if (images.value.length === 1) return { maxHeight: '32vh', width: 'auto', height: 'auto' }
  return { height: 'auto', maxHeight: isMobile.value ? '44vw' : '12rem' }
})

function previewImage(index: number) {
  const urls = images.value.map(image => image.src)
  if (urls.length > 0) globalStore.updateImagePreviewer(true, urls, index)
}

/** 只有一个文件时，工具输出上的名称可以当作它的名称 */
const fallbackName = computed(() => {
  if (fileItems.value.length !== 1) return ''
  const output = props.output || {}
  return (
    output.name || output.title || output.fileName || output.filename || output.documentTitle || ''
  )
})
const cards = computed(() =>
  fileItems.value.map((file, index) =>
    describeFileCard(file, index, {
      userMessage: isUserMessage.value,
      fallbackName: fallbackName.value,
    })
  )
)

const fileListClass = computed(() => {
  if (props.fileMode === 'inline') return 'flex max-w-full flex-col items-start gap-2'
  return isUserMessage.value
    ? 'flex max-w-full flex-col items-end gap-2'
    : 'flex max-w-full flex-wrap gap-2'
})

const cardClass = computed(() => {
  if (isUserMessage.value) return 'file-card file-card-user-message'
  if (props.fileMode !== 'inline') return 'file-card'
  return [
    'file-card',
    'file-card-inline',
    {
      'file-card-inline-sm': props.inlineSize === 'sm',
      'file-card-inline-muted': props.inlineTone === 'muted',
    },
  ]
})

/* 音频卡片共用一个播放器：同一时间只播一个，私有音频与图片、视频走同一条 blob 通道 */
const player = useAudioPlayerCards<OutputFile>({
  entries: computed(() =>
    cards.value.flatMap((card, index) =>
      card.kind === 'audio' ? [{ item: card.file, index, key: card.key }] : []
    )
  ),
  cardKeyOf: (item, index) => outputFileKey(item, index),
  isPrivate: item => isPrivateOutputFile(item),
  privateKeyOf: privateMediaKey,
  loadBlob: item => loadFileBlob(item),
  publicUrlOf: item => item.publicUrl || item.url || item.downloadUrl || item.previewUrl || '',
})

/** 下载中的卡片：大文件要整个取回才开始保存，期间显示转圈并忽略重复点击 */
const downloadingKeys = reactive(new Set<string>())

async function downloadFile(card: FileCard) {
  if (!card.canDownload || downloadingKeys.has(card.key)) return
  downloadingKeys.add(card.key)
  try {
    if (await downloadOutputFile(card)) ms.success(t('common.downloadSuccess'))
  } catch {
    ms.error(t('common.downloadFailed'))
  } finally {
    downloadingKeys.delete(card.key)
  }
}

function previewFile(card: FileCard) {
  if (!card.canPreview) return
  globalStore.openPanel({ type: 'file', file: filePreviewSource(card, () => downloadFile(card)) })
}
</script>

<template>
  <div
    v-if="images.length > 0 || videos.length > 0 || cards.length > 0"
    class="media-output-root flex max-w-full flex-col gap-2"
  >
    <div
      v-if="images.length > 0"
      :class="['flex max-w-full flex-wrap items-start gap-2', { 'justify-end': isUserMessage }]"
    >
      <!-- 不用 loading="lazy"：宽高自适应的图片加载前是 0×0，Chrome 在对话画布里一直不判定它进入视口，
           图片永远不去请求、始终空白；消息按页加载，同时渲染的图片有限，直接加载即可 -->
      <img
        v-for="(image, index) in images"
        :key="`img-${image.key}`"
        :src="image.src"
        :alt="image.alt"
        class="media-output-item cursor-pointer rounded-lg object-contain transition-opacity hover:opacity-90"
        :class="imageClass"
        :style="imageStyle"
        decoding="async"
        @click="previewImage(index)"
        @error="media.onMediaError(image.item, image.src)"
      />
    </div>

    <div v-if="videos.length > 0" class="flex max-w-full flex-wrap items-start gap-2">
      <video
        v-for="video in videos"
        :key="`vid-${video.key}`"
        :src="video.src"
        controls
        preload="metadata"
        class="media-output-item max-w-[min(28rem,100%)] cursor-pointer rounded-lg shadow-sm transition-opacity hover:opacity-90"
        :style="{ maxHeight: '32vh', objectFit: 'contain' }"
        @error="media.onMediaError(video.item, video.src)"
      >
        {{ t('common.videoUnsupported') }}
      </video>
    </div>

    <div v-if="cards.length > 0" :class="fileListClass">
      <OutputFileCard
        v-for="(card, index) in cards"
        :key="`file-${card.key}`"
        :card="card"
        :index="index"
        :card-class="cardClass"
        :downloading="downloadingKeys.has(card.key)"
        :player="card.kind === 'audio' ? player : undefined"
        @preview="previewFile(card)"
        @download="downloadFile(card)"
      />
    </div>
  </div>
</template>

<style scoped>
.media-output-root {
  animation: mediaOutputReveal var(--motion-duration-md) ease-out both;
  transform-origin: top left;
}

.media-output-item {
  border-radius: var(--radius-dialog);
  animation: mediaOutputItemReveal var(--motion-duration-lg) ease-out both;
  transform-origin: top left;
}

.media-output-user-image {
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  box-shadow: none;
}

@keyframes mediaOutputReveal {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.99);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes mediaOutputItemReveal {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-output-root,
  .media-output-item {
    animation: none;
  }
}
</style>
