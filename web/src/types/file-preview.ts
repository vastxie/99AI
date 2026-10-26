import type { CodeContentType } from './preview-panel'

export type FilePreviewSourceKind = 'local' | 'private-file' | 'public-url' | 'inline-content'

export interface FilePreviewSource {
  key?: string
  name: string
  mime?: string
  size?: number
  extension?: string
  sourceKind: FilePreviewSourceKind
  previewUrl?: string
  downloadUrl?: string
  content?: string
  contentType?: CodeContentType | 'word'
  loadBlob?: () => Promise<Blob>
  downloadFile?: () => Promise<void> | void
}
