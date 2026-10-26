import type { ApiResponse } from '@/utils/request'
import { post } from '@/utils/request'

/**
 * 上传单个文件
 * @param file 要上传的文件
 * @param dir 上传目录，默认使用当前日期目录
 * @param options signal 取消上传；onProgress 上传进度（0–1）
 */
export function uploadFile<T = any>(
  file: File,
  dir?: string,
  options: { signal?: AbortSignal; onProgress?: (ratio: number) => void } = {}
): Promise<ApiResponse<T>> {
  // 如果未提供目录，使用默认的日期格式目录
  if (!dir) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const currentDate = `${year}${month}/${day}`
    dir = `userFiles/${currentDate}`
  }

  const form = new FormData()
  form.append('file', file)

  const path = `/upload/file?dir=${encodeURIComponent(dir)}`

  return post<T>({
    url: path,
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    signal: options.signal,
    // 大文件在慢网下要传很久：不设超时，靠取消信号中止（移除附件、离开页面）
    timeout: 0,
    onUploadProgress: options.onProgress,
  })
}

/** 上传接口的返回统一成消息附件字段：老接口直接返回地址字符串，新接口返回文件描述 */
export function normalizeUploadedFile(data: any) {
  if (typeof data === 'string') {
    return { url: data }
  }
  const url = data?.previewUrl || data?.downloadUrl || data?.publicUrl || data?.url
  return {
    url,
    fileId: data?.fileId,
    previewUrl: data?.previewUrl,
    downloadUrl: data?.downloadUrl,
    publicUrl: data?.publicUrl,
    mime: data?.mime || data?.mimeType,
    size: data?.size,
  }
}
