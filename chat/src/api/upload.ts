import type { Response } from '@/utils/request'
import { post } from '@/utils/request'

/**
 * 上传单个文件
 * @param file 要上传的文件
 * @param dir 上传目录，默认使用当前日期目录
 */
export function uploadFile<T = any>(file: File, dir?: string): Promise<Response<T>> {
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
  })
}
