import { isHttpUrl } from '@/utils/is'
import { currentUserToken, markVisitorTokenUsed } from '@/services/identity'
import { usableVisitorToken } from '@/services/visitorSession'

/**
 * 私有文件访问统一工具。
 *
 * 平台私有文件的公开身份是 fileId（/api/files/{fileId}/preview|download，
 * 访问时由文件 API 鉴权）；本模块收敛所有「识别私有文件、构造访问地址、
 * 鉴权取数」的逻辑，MediaOutput 等组件统一复用，
 * 禁止在组件内再各自实现。
 */

/** 结构化文件项的最小形状（消息工具输出 / 文件工作台行均满足） */
export interface PrivateFileLike {
  fileId?: string
  id?: string
  url?: string
  downloadUrl?: string
  previewUrl?: string
  publicUrl?: string
  visibility?: string
  privateDownloadHidden?: boolean
  [key: string]: any
}

export function getApiBaseUrl(): URL {
  const apiBase = String(import.meta.env.VITE_GLOB_API_URL || '').replace(/\/+$/, '')
  return new URL(apiBase || '/api', window.location.origin)
}

export function isAllowedAuthenticatedFileTarget(target: URL): boolean {
  const apiBaseUrl = getApiBaseUrl()
  return target.origin === window.location.origin || target.origin === apiBaseUrl.origin
}

export function isInternalFileDownloadUrl(value?: string): boolean {
  if (!value) return false
  try {
    const target = new URL(value, window.location.origin)
    return (
      isAllowedAuthenticatedFileTarget(target) &&
      /^\/api\/files\/file_[a-zA-Z0-9_-]+\/download$/.test(target.pathname)
    )
  } catch {
    return false
  }
}

export function normalizeFileAssetId(value?: string): string {
  const id = String(value || '').trim()
  return /^file_[a-zA-Z0-9_-]+$/.test(id) ? id : ''
}

export function extractInternalFileAssetIdFromUrl(value?: string): string {
  if (!value) return ''
  try {
    const target = new URL(value, window.location.origin)
    if (!isAllowedAuthenticatedFileTarget(target)) return ''
    const match = target.pathname.match(
      /^\/api\/files\/(file_[a-zA-Z0-9_-]+)\/(?:download|preview)$/
    )
    return match?.[1] || ''
  } catch {
    return ''
  }
}

export function getFileIdFromItem(item: PrivateFileLike): string {
  return (
    normalizeFileAssetId(item.fileId || item.id) ||
    extractInternalFileAssetIdFromUrl(item.previewUrl || item.downloadUrl || item.url)
  )
}

export function getPrivateFileDownloadUrl(item: PrivateFileLike): string {
  const fileId = getFileIdFromItem(item)
  if (fileId) return `/api/files/${fileId}/download`

  const url = item.downloadUrl || item.url || ''
  return isInternalFileDownloadUrl(url) ? url : ''
}

/** 受控的预览直链（仅放行站内文件路径与可信源 http(s) 地址） */
export function getControlledFilePreviewUrl(item: PrivateFileLike): string {
  const url = item.previewUrl || item.url || ''
  if (!url) return ''

  try {
    const target = new URL(url, window.location.origin)
    if (!['http:', 'https:'].includes(target.protocol)) return ''
    if (!isAllowedAuthenticatedFileTarget(target)) return ''

    if (target.pathname.startsWith('/api/files/')) {
      return /^\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:preview|download)$/.test(target.pathname)
        ? url
        : ''
    }
    return url
  } catch {
    return ''
  }
}

export function getPrivateFilePreviewUrl(item: PrivateFileLike): string {
  const fileId = getFileIdFromItem(item)
  if (fileId) return `/api/files/${fileId}/preview`
  return getControlledFilePreviewUrl(item)
}

export function isPrivateOutputFile(item: PrivateFileLike): boolean {
  const visibility = String(item.visibility || '').toLowerCase()
  if (visibility === 'public') return isInternalFileDownloadUrl(item.downloadUrl || item.url)
  return Boolean(
    getFileIdFromItem(item) ||
    visibility === 'private' ||
    visibility === 'temporary' ||
    isInternalFileDownloadUrl(item.downloadUrl || item.url)
  )
}

export function getAuthenticatedFileRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Website-Domain': window.location.origin,
  }
  // 与请求层同一口径：登录令牌优先，其次可用的访客凭证（本地判定过期的不发出去）
  const userToken = currentUserToken()
  const token = userToken || usableVisitorToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
    if (!userToken) markVisitorTokenUsed(token)
  }
  return headers
}

/** 把站内相对地址解析为带 API 源的完整地址；非可信目标抛错 */
export function resolveAuthenticatedFileUrl(url: string): string {
  const apiBase = String(import.meta.env.VITE_GLOB_API_URL || '').replace(/\/+$/, '')
  const target = new URL(url, window.location.origin)
  if (!isAllowedAuthenticatedFileTarget(target)) {
    throw new Error('Invalid file download target')
  }

  if (isHttpUrl(url)) return target.toString()

  if (url.startsWith('/api/')) {
    if (!apiBase || apiBase === '/api') return url
    return `${apiBase.replace(/\/api$/, '')}${url}`
  }
  if (url.startsWith('/')) return apiBase ? `${apiBase}${url}` : url
  return apiBase ? `${apiBase}/${url}` : url
}

export class FileAccessError extends Error {
  constructor(readonly status: number) {
    super(String(status))
  }
}

export async function fetchPrivateFileBlob(url: string) {
  const headers = new Headers(getAuthenticatedFileRequestHeaders())

  const response = await fetch(resolveAuthenticatedFileUrl(url), { headers })
  if (!response.ok) throw new FileAccessError(response.status)

  return {
    response,
    blob: await response.blob(),
  }
}

export async function fetchPublicFileBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new FileAccessError(response.status)
  return response.blob()
}

/** 按文件可见性自动选择鉴权 / 公开通道取回 Blob */
export async function loadFileBlob(item: PrivateFileLike): Promise<Blob> {
  if (isPrivateOutputFile(item)) {
    const privateUrl = getPrivateFileDownloadUrl(item)
    if (!privateUrl) throw new Error('Invalid private file download URL')
    const { blob } = await fetchPrivateFileBlob(privateUrl)
    return blob
  }

  const url = item.downloadUrl || item.url
  if (!url) throw new Error('Invalid file URL')
  return fetchPublicFileBlob(url)
}
