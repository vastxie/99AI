<script setup lang="ts">
import { Download, FileSearch, Pause, Play } from '@lucide/vue'
import { computed } from 'vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { t } from '@/locales'
import type { OutputFile } from '@/views/chat/outputFile'
import type { FileCard } from './outputFileCard'
import type { AudioPlayerCards } from './useAudioPlayerCards'

/** 一张文件卡片；形态与能做的事由 FileCard 决定（见 outputFileCard.ts） */
const props = defineProps<{
  card: FileCard
  /** 在 MediaOutput 文件列表里的位置，音频播放器按它区分同名卡片 */
  index: number
  cardClass: unknown
  /** 正在下载：下载键换成转圈，重复点击由 MediaOutput 忽略 */
  downloading?: boolean
  player?: AudioPlayerCards<OutputFile>
}>()

const emit = defineEmits<{
  preview: []
  download: []
}>()

const previewLabel = computed(() => t('common.previewNamed', { name: props.card.name }))
const downloadLabel = computed(() => t('common.downloadNamed', { name: props.card.name }))
const actionLabel = computed(() =>
  props.card.action === 'preview' ? previewLabel.value : downloadLabel.value
)
const meta = computed(() => {
  if (props.card.kind !== 'audio' || !props.player) return props.card.meta
  const time = props.player.getAudioTimeLabel(props.card.file, props.index)
  return time ? [...props.card.meta, time] : props.card.meta
})

function runAction() {
  if (props.card.action === 'preview') emit('preview')
  else emit('download')
}
</script>

<template>
  <!-- 音频：播放键代替图标，底边是进度条 -->
  <div
    v-if="card.kind === 'audio' && player"
    :class="[cardClass, 'audio-player-card']"
    role="group"
    :aria-label="card.name"
  >
    <button
      type="button"
      class="file-card-icon is-audio audio-play-button"
      :disabled="player.isAudioLoading(card.file, index)"
      :aria-label="player.getAudioButtonLabel(card.file, index)"
      @click="player.toggleAudioPlayback(card.file, index)"
    >
      <UiSpinner v-if="player.isAudioLoading(card.file, index)" :size="18" />
      <Pause v-else-if="player.isAudioPlaying(card.file, index)" :size="18" />
      <Play v-else :size="18" />
    </button>
    <div class="min-w-0 flex-1">
      <div class="file-card-title">{{ card.name }}</div>
      <div class="file-card-meta">
        <template v-for="(part, partIndex) in meta" :key="partIndex">
          <span v-if="partIndex > 0" aria-hidden="true">•</span>
          <span>{{ part }}</span>
        </template>
      </div>
    </div>
    <button
      type="button"
      class="file-card-action audio-download-button"
      :aria-busy="downloading || undefined"
      :aria-label="downloadLabel"
      @click.stop="emit('download')"
    >
      <UiSpinner v-if="downloading" :size="16" />
      <Download v-else :size="18" />
    </button>
    <div
      class="audio-progress-track"
      role="slider"
      tabindex="0"
      :aria-label="t('common.seek')"
      aria-valuemin="0"
      :aria-valuemax="player.getAudioDurationValue(card.file, index)"
      :aria-valuenow="player.getAudioCurrentValue(card.file, index)"
      @click="player.handleAudioSeek(card.file, index, $event)"
      @keydown.left.prevent="player.stepAudioSeek(card.file, index, -5)"
      @keydown.right.prevent="player.stepAudioSeek(card.file, index, 5)"
    >
      <div
        class="audio-progress-fill"
        :style="{ width: `${player.getAudioProgressPercent(card.file, index)}%` }"
      />
    </div>
    <audio
      :ref="element => player?.registerAudioElement(card.key, element)"
      :src="player.audioSrcByKey.value[card.key] || undefined"
      preload="metadata"
      class="sr-only"
      @loadedmetadata="player.handleAudioLoadedMetadata(card.key, $event)"
      @timeupdate="player.handleAudioTimeUpdate(card.key, $event)"
      @play="player.handleAudioPlay(card.key)"
      @pause="player.handleAudioPause(card.key, $event)"
      @ended="player.handleAudioEnded(card.key, $event)"
      @error="player.handleAudioError(card.key)"
    />
  </div>

  <!-- 源码 / 文本文件：左边打开预览，右边单独下载 -->
  <div
    v-else-if="card.kind === 'source'"
    :class="[cardClass, 'source-file-card group']"
    role="group"
    :aria-label="previewLabel"
  >
    <button
      type="button"
      class="source-file-card-open"
      :aria-label="previewLabel"
      @click="emit('preview')"
    >
      <div class="file-card-icon" :class="card.tone">
        <component :is="card.icon" :size="20" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="file-card-title">{{ card.name }}</div>
        <div class="file-card-meta">
          <template v-for="(part, partIndex) in meta" :key="partIndex">
            <span v-if="partIndex > 0" aria-hidden="true">•</span>
            <span>{{ part }}</span>
          </template>
        </div>
      </div>
      <FileSearch class="file-card-action file-card-action-primary" :size="18" />
    </button>
    <button
      v-if="card.canDownload"
      type="button"
      class="source-file-card-download"
      :aria-busy="downloading || undefined"
      :aria-label="downloadLabel"
      @click.stop="emit('download')"
    >
      <UiSpinner v-if="downloading" :size="16" />
      <Download v-else :size="18" />
    </button>
  </div>

  <!-- 整张卡片一个动作：能预览就预览，否则下载 -->
  <button
    v-else-if="card.action"
    type="button"
    :class="[cardClass, 'group']"
    :aria-busy="downloading || undefined"
    :aria-label="actionLabel"
    @click="runAction"
  >
    <div class="file-card-icon" :class="card.tone">
      <component :is="card.icon" :size="20" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="file-card-title">{{ card.name }}</div>
      <div class="file-card-meta">
        <template v-for="(part, partIndex) in meta" :key="partIndex">
          <span v-if="partIndex > 0" aria-hidden="true">•</span>
          <span>{{ part }}</span>
        </template>
      </div>
    </div>
    <UiSpinner v-if="downloading" class="file-card-action" :size="16" />
    <FileSearch
      v-else-if="card.action === 'preview'"
      class="file-card-action file-card-action-primary"
      :size="18"
    />
    <Download v-else class="file-card-action" :size="18" />
  </button>

  <!-- 只展示 -->
  <div v-else :class="[cardClass, 'file-card-readonly']" role="group" :aria-label="card.name">
    <div class="file-card-icon" :class="card.tone">
      <component :is="card.icon" :size="20" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="file-card-title">{{ card.name }}</div>
      <div class="file-card-meta">
        <template v-for="(part, partIndex) in meta" :key="partIndex">
          <span v-if="partIndex > 0" aria-hidden="true">•</span>
          <span>{{ part }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-card {
  position: relative;
  display: flex;
  width: min(18rem, 100%);
  min-width: min(13rem, 100%);
  height: 3.5rem;
  min-height: 3.5rem;
  align-items: center;
  gap: 0.6rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xl);
  padding: 0.45rem 0.62rem;
  text-align: left;
  color: var(--text-secondary);
  background: var(--app-surface-sunken);
  box-shadow: none;
  transition:
    border-color var(--motion-duration-xs) var(--motion-easing),
    background-color var(--motion-duration-xs) var(--motion-easing),
    box-shadow var(--motion-duration-xs) var(--motion-easing);
}

button.file-card {
  cursor: pointer;
}

button.file-card:hover:not(:disabled) {
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--component-shadow-sm);
}

.source-file-card {
  gap: 0;
  overflow: hidden;
  padding: 0;
}

.source-file-card:hover {
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--component-shadow-sm);
}

.source-file-card-open {
  display: flex;
  min-width: 0;
  height: 100%;
  flex: 1;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.45rem 0.45rem 0.62rem;
  text-align: left;
}

.source-file-card-open,
.source-file-card-download {
  border: 0;
  color: inherit;
  font: inherit;
  background: transparent;
  cursor: pointer;
}

.source-file-card-download {
  display: flex;
  width: 2.6rem;
  height: 100%;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-left: 1px solid color-mix(in srgb, var(--app-border) 74%, transparent);
  color: var(--text-muted);
  transition:
    color var(--motion-duration-xs) var(--motion-easing),
    background-color var(--motion-duration-xs) var(--motion-easing);
}

.source-file-card-download:hover {
  color: var(--control-fg-hover);
  background: var(--interaction-bg-hover);
}

.file-card-inline {
  width: 100%;
  min-width: 0;
  height: 4.25rem;
  min-height: 4.25rem;
  padding: 0.625rem 0.75rem;
  max-width: 100%;
}

.file-card-inline-sm {
  width: min(17rem, 100%);
  min-width: min(12rem, 100%);
}

.file-card-inline-muted {
  background: var(--app-surface);
  box-shadow: none;
}

button.file-card-inline-muted:hover:not(:disabled) {
  background: var(--app-surface);
}

.file-card-readonly {
  cursor: default;
}

.file-card-icon {
  display: flex;
  width: 1.9rem;
  height: 1.9rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  --file-icon-color: var(--text-muted);
  color: var(--file-icon-color);
  background: color-mix(in srgb, var(--file-icon-color) 12%, transparent);
}

.file-card-icon.is-pdf {
  --file-icon-color: var(--semantic-danger);
}

.file-card-icon.is-excel {
  --file-icon-color: var(--semantic-success);
}

.file-card-icon.is-word {
  --file-icon-color: var(--text-link);
}

.file-card-icon.is-presentation {
  --file-icon-color: var(--file-kind-presentation);
}

.file-card-icon.is-markdown {
  --file-icon-color: var(--agent-running);
}

.file-card-icon.is-code {
  --file-icon-color: var(--file-kind-generic);
}

.file-card-icon.is-video {
  --file-icon-color: var(--file-kind-video);
}

.file-card-icon.is-audio {
  --file-icon-color: var(--file-kind-audio);
}

.file-card-icon.is-image {
  --file-icon-color: var(--file-kind-image);
}

.file-card-icon.is-archive {
  --file-icon-color: var(--file-kind-archive);
}

.file-card-icon.is-generic {
  --file-icon-color: var(--text-secondary);
}

.file-card-title {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--type-meta-size);
  font-weight: 500;
  line-height: 1.12rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.05rem;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--type-caption-size);
  font-weight: 500;
  line-height: 0.95rem;
  white-space: nowrap;
}

.file-card-action {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: color var(--motion-duration-xs) var(--motion-easing);
}

button.file-card:hover:not(:disabled) .file-card-action {
  color: var(--control-fg-hover);
}

.file-card-action-primary {
  color: var(--accent);
}

button.file-card:hover:not(:disabled) .file-card-action-primary {
  color: var(--accent-hover);
}

/* 用户消息里的附件卡：靠右，宽度按屏幕收窄 */
.file-card-user-message {
  width: min(17rem, calc(100vw - 4rem));
  min-width: min(13rem, calc(100vw - 4rem));
  align-self: flex-end;
  padding: 0.45rem 0.65rem 0.45rem 0.62rem;
}

.audio-player-card {
  overflow: hidden;
}

.audio-play-button {
  border: 0;
  padding: 0;
  cursor: pointer;
  transition:
    background-color var(--motion-duration-xs) var(--motion-easing),
    box-shadow var(--motion-duration-xs) var(--motion-easing);
}

.audio-play-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--file-kind-audio) 88%, black 12%);
}

.audio-play-button:disabled {
  cursor: wait;
  color: var(--control-fg-disabled);
  background: var(--control-bg-disabled);
}

.audio-download-button {
  display: flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.audio-download-button:hover {
  color: var(--control-fg-hover);
}

.audio-progress-track {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  height: 0.42rem;
  align-items: flex-end;
  overflow: hidden;
  border-radius: 0;
  cursor: pointer;
  background: transparent;
}

.audio-progress-track::before {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 0.1rem;
  background: color-mix(in srgb, var(--file-kind-audio) 7%, transparent 93%);
  content: '';
}

.audio-progress-track:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--file-kind-audio) 44%, transparent 56%);
  outline-offset: 3px;
}

.audio-progress-fill {
  position: relative;
  z-index: 1;
  height: 0.1rem;
  border-radius: 0 var(--radius-full) var(--radius-full) 0;
  background: color-mix(in srgb, var(--file-kind-audio) 52%, transparent 48%);
  transition: width var(--motion-duration-sm) linear;
}

@media (prefers-reduced-motion: reduce) {
  .audio-progress-fill {
    transition: none;
  }
}
</style>
