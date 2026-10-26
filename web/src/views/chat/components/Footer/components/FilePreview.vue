<script setup lang="ts">
import {
  CircleAlert,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  RotateCw,
  X,
} from '@lucide/vue'

import { t } from '@/locales'
import { downloadBlob } from '@/utils/download'
import { formatFileSize } from '@/utils/format'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import type { DraftAttachment } from '@/store/modules/chat/attachments'
import { getLocalFilePreviewKey } from '../footer.helpers'

/**
 * 输入框里待发送的附件：图片、视频显示缩略图，其余显示文件卡片；
 * 附件选中即在后台上传，这里显示上传进度、失败原因与重新上传，点开可在右侧面板预览本地文件
 */
const useGlobalStore = useGlobalStoreWithOut()

const props = withDefaults(
  defineProps<{
    attachments: DraftAttachment[]
    /**
     * 发送中：传完的附件正随消息发出，不能移除；还在上传的可以移除
     * （发送在等它传完，上传卡住时移除它就不用再等）
     */
    locked?: boolean
  }>(),
  { locked: false }
)
const emit = defineEmits<{
  remove: [id: string]
  retry: [id: string]
}>()

const mediaAttachments = () =>
  props.attachments.filter(item => item.kind === 'image' || item.kind === 'video')
const fileAttachments = () =>
  props.attachments.filter(item => item.kind !== 'image' && item.kind !== 'video')

function canRemove(attachment: DraftAttachment) {
  return !props.locked || attachment.status === 'uploading'
}

function removeAttachment(attachment: DraftAttachment) {
  if (!canRemove(attachment)) return
  const panel = useGlobalStore.rightPreviewPanel
  if (panel?.type === 'file' && panel.file.key === getLocalFilePreviewKey(attachment.file)) {
    useGlobalStore.closePanel()
  }
  emit('remove', attachment.id)
}

function uploadStatusText(attachment: DraftAttachment) {
  if (attachment.status === 'uploading') {
    return t('chat.attachmentUploading', { percent: Math.round(attachment.progress * 100) })
  }
  if (attachment.status === 'failed') return t('chat.attachmentUploadError')
  return ''
}

// 文件大小格式化统一走 @/utils/format 的 formatFileSize
const getFileSize = (bytes: number): string => formatFileSize(bytes) || '0 B'

const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) return t('common.unknown')
  return fileName.slice(lastDot + 1).toUpperCase()
}

const endsWithAny = (fileName: string, extensions: string[]) => {
  const lowerName = fileName.toLowerCase()
  return extensions.some(extension => lowerName.endsWith(extension))
}

const FILE_KINDS: Array<{ extensions: string[]; icon: unknown; tone: string }> = [
  { extensions: ['.pdf'], icon: FileText, tone: 'is-pdf' },
  { extensions: ['.xlsx', '.xls', '.csv'], icon: FileSpreadsheet, tone: 'is-excel' },
  { extensions: ['.docx', '.doc'], icon: FileText, tone: 'is-word' },
  { extensions: ['.ppt', '.pptx'], icon: Presentation, tone: 'is-presentation' },
  { extensions: ['.txt'], icon: FileText, tone: 'is-generic' },
  { extensions: ['.md', '.markdown'], icon: FileCode, tone: 'is-markdown' },
  { extensions: ['.mp4', '.webm', '.mov', '.avi'], icon: FileVideo, tone: 'is-video' },
  {
    extensions: ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus'],
    icon: FileAudio,
    tone: 'is-audio',
  },
  {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    icon: FileImage,
    tone: 'is-image',
  },
  { extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'], icon: FileArchive, tone: 'is-archive' },
]

const fileKindOf = (fileName: string) =>
  FILE_KINDS.find(kind => endsWithAny(fileName, kind.extensions))

function getFileContentType(file: File) {
  if (endsWithAny(file.name, ['.docx', '.doc'])) return 'word'
  if (endsWithAny(file.name, ['.md', '.markdown'])) return 'markdown'
  if (endsWithAny(file.name, ['.txt'])) return 'text'
  return undefined
}

function openLocalFilePreview(attachment: DraftAttachment) {
  const { file } = attachment
  useGlobalStore.openPanel({
    type: 'file',
    file: {
      key: getLocalFilePreviewKey(file),
      name: file.name,
      mime: file.type,
      size: file.size,
      extension: getFileExtension(file.name).toLowerCase(),
      sourceKind: 'local',
      previewUrl: attachment.previewUrl || undefined,
      contentType: getFileContentType(file),
      loadBlob: async () => file,
      downloadFile: () => downloadBlob(file, file.name),
    },
  })
}
</script>

<template>
  <div v-if="attachments.length > 0" class="self-start w-full select-none">
    <div class="self-start w-full rounded-t-2xl mt-2">
      <div class="flex flex-wrap gap-2 px-2">
        <!-- 图片、视频：缩略图 -->
        <div
          v-for="attachment in mediaAttachments()"
          :key="attachment.id"
          class="group relative inline-block"
        >
          <div
            class="attachment-thumb"
            :class="{ 'is-failed': attachment.status === 'failed' }"
            role="button"
            tabindex="0"
            :title="attachment.error || t('common.previewNamed', { name: attachment.file.name })"
            @click="openLocalFilePreview(attachment)"
            @keydown.enter.self.prevent="openLocalFilePreview(attachment)"
            @keydown.space.self.prevent="openLocalFilePreview(attachment)"
          >
            <img
              v-if="attachment.kind === 'image'"
              :src="attachment.previewUrl"
              class="w-full h-full object-cover"
              :alt="attachment.file.name"
            />
            <video
              v-else
              :src="attachment.previewUrl"
              class="w-full h-full object-cover"
              muted
              preload="metadata"
              playsinline
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
            />
            <div
              v-if="attachment.status !== 'uploaded'"
              class="attachment-thumb-status"
              role="status"
              :aria-label="uploadStatusText(attachment)"
            >
              <button
                v-if="attachment.status === 'failed'"
                type="button"
                class="attachment-retry ds-focus-ring"
                :aria-label="t('chat.retryUpload')"
                @click.stop="emit('retry', attachment.id)"
              >
                <RotateCw :size="14" aria-hidden="true" />
              </button>
              <span v-else aria-hidden="true">{{ Math.round(attachment.progress * 100) }}%</span>
            </div>
            <div class="attachment-close-slot">
              <button
                type="button"
                class="uploaded-file-close fg-quiet ds-focus-ring"
                :disabled="!canRemove(attachment)"
                :aria-label="t('settings.deleteFile')"
                @click.stop="removeAttachment(attachment)"
              >
                <X :size="14" :stroke-width="3" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <!-- 其余文件：卡片 -->
        <div v-if="fileAttachments().length" class="uploaded-file-list">
          <div
            v-for="attachment in fileAttachments()"
            :key="attachment.id"
            class="uploaded-file-item"
          >
            <div
              class="uploaded-file-card is-clickable group"
              :class="{ 'is-failed': attachment.status === 'failed' }"
              role="button"
              tabindex="0"
              :title="attachment.error || t('common.previewNamed', { name: attachment.file.name })"
              @click="openLocalFilePreview(attachment)"
              @keydown.enter.self.prevent="openLocalFilePreview(attachment)"
              @keydown.space.self.prevent="openLocalFilePreview(attachment)"
            >
              <div
                class="uploaded-file-icon"
                :class="fileKindOf(attachment.file.name)?.tone ?? 'is-generic'"
              >
                <component :is="fileKindOf(attachment.file.name)?.icon ?? FileText" :size="17" />
              </div>

              <div class="min-w-0 flex-1">
                <div class="uploaded-file-name">{{ attachment.file.name }}</div>
                <div class="uploaded-file-meta" role="status">
                  <template v-if="attachment.status === 'uploaded'">
                    <span class="uppercase">{{ getFileExtension(attachment.file.name) }}</span>
                    <span class="text-text-subtle">•</span>
                    <span>{{ getFileSize(attachment.file.size) }}</span>
                  </template>
                  <template v-else>
                    <CircleAlert
                      v-if="attachment.status === 'failed'"
                      :size="12"
                      class="shrink-0 text-semantic-danger"
                      aria-hidden="true"
                    />
                    <span :class="{ 'text-semantic-danger': attachment.status === 'failed' }">
                      {{ uploadStatusText(attachment) }}
                    </span>
                    <button
                      v-if="attachment.status === 'failed'"
                      type="button"
                      class="attachment-retry-link ds-focus-ring"
                      @click.stop="emit('retry', attachment.id)"
                    >
                      {{ t('chat.retryUpload') }}
                    </button>
                  </template>
                </div>
              </div>

              <div class="attachment-close-slot">
                <button
                  type="button"
                  class="uploaded-file-close fg-quiet ds-focus-ring"
                  :disabled="!canRemove(attachment)"
                  :aria-label="t('settings.deleteFile')"
                  @click.stop="removeAttachment(attachment)"
                >
                  <X :size="14" :stroke-width="3" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 图片、视频缩略图 */
.attachment-thumb {
  position: relative;
  width: 4rem;
  height: 4rem;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xl);
  background: var(--app-surface-sunken);
}

.attachment-thumb.is-failed,
.uploaded-file-card.is-failed {
  border-color: var(--semantic-danger);
}

/* 上传中 / 失败：盖在缩略图上 */
.attachment-thumb-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-on-media);
  background: var(--media-scrim-bg);
  font-size: var(--type-caption-size);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.attachment-retry {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  color: var(--text-primary);
  background: var(--app-surface);
}

.attachment-retry-link {
  color: var(--text-link);
  font-weight: 600;
}

/* 移除按钮：悬停或键盘聚焦时出现，触屏上一直显示 */
.attachment-close-slot {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  opacity: 1;
  transition: opacity var(--motion-duration-md) ease;
}

@media (hover: hover) {
  .group:not(:hover):not(:focus-within) .attachment-close-slot {
    opacity: 0;
  }
}

.uploaded-file-list {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.uploaded-file-item {
  flex: 0 1 calc((100% - 1rem) / 3);
  min-width: min(13rem, 100%);
}

.uploaded-file-card {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 3.5rem;
  align-items: center;
  gap: 0.6rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-2xl);
  padding: 0.45rem 1.85rem 0.45rem 0.62rem;
  color: var(--text-secondary);
  background: var(--app-surface-sunken);
  box-shadow: none;
  transition:
    border-color var(--motion-duration-md) ease,
    background-color var(--motion-duration-md) ease,
    box-shadow var(--motion-duration-md) ease;
}

.uploaded-file-card.is-clickable {
  cursor: pointer;
}

.uploaded-file-card.is-clickable:hover {
  border-color: var(--app-border-strong);
  background: var(--app-surface);
  box-shadow: var(--component-shadow-sm);
}

.uploaded-file-icon {
  display: flex;
  width: 1.9rem;
  height: 1.9rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  color: var(--text-on-media);
  background: var(--text-muted);
}

.uploaded-file-icon.is-pdf {
  background: var(--semantic-danger);
}

.uploaded-file-icon.is-excel {
  background: var(--semantic-success);
}

.uploaded-file-icon.is-word {
  background: var(--text-link);
}

.uploaded-file-icon.is-presentation {
  background: var(--file-kind-presentation);
}

.uploaded-file-icon.is-markdown {
  background: var(--agent-running);
}

.uploaded-file-icon.is-video {
  background: var(--file-kind-video);
}

.uploaded-file-icon.is-audio {
  background: var(--file-kind-audio);
}

.uploaded-file-icon.is-image {
  background: var(--file-kind-image);
}

.uploaded-file-icon.is-archive {
  background: var(--file-kind-archive);
}

.uploaded-file-icon.is-generic {
  background: var(--text-secondary);
}

.uploaded-file-name {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--type-meta-size);
  font-weight: 600;
  line-height: 1.12rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uploaded-file-meta {
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

.uploaded-file-close {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  background: var(--app-surface);
  box-shadow: none;
  transition:
    color var(--motion-duration-md) ease,
    background-color var(--motion-duration-md) ease;
}

.uploaded-file-close:hover:not(:disabled) {
  color: var(--control-fg-hover);
  background: var(--interaction-bg-hover);
}

/* design-guard-allow：附件条的疏密随可用宽度分两档，不是设备断点 */
@media (max-width: 720px) {
  .uploaded-file-item {
    flex-basis: calc((100% - 0.5rem) / 2);
    min-width: min(10.5rem, 100%);
  }
}

/* design-guard-allow：同上，窄到一行只放一个 */
@media (max-width: 480px) {
  .uploaded-file-item {
    flex-basis: 100%;
  }
}
</style>
