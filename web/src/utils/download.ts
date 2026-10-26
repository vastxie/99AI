/**
 * 浏览器下载的唯一入口：建临时链接、点击、移除。
 *
 * blob 地址要等一会再释放：浏览器在点击之后才开始读取，立即释放会让部分浏览器下载失败。
 * 普通网址可能跨源，跨源时浏览器会忽略 download 属性直接打开，所以放到新标签页，不把当前页面带走。
 */
const REVOKE_DELAY_MS = 1000

/**
 * 只放行能下载的地址：http(s)、blob，以及带了文件名的 data。按浏览器解析后的协议判断：
 * 开头的空白、中间的制表符与换行浏览器都会去掉，只看原始字符串的前缀拦不住 javascript: 这类地址
 */
function isDownloadableUrl(url: string, filename?: string) {
  let protocol = ''
  try {
    protocol = new URL(url, window.location.href).protocol.toLowerCase()
  } catch {
    return false
  }
  if (protocol === 'http:' || protocol === 'https:' || protocol === 'blob:') return true
  return protocol === 'data:' && Boolean(filename)
}

export function downloadUrl(url: string, filename?: string) {
  if (!url || !isDownloadableUrl(url, filename)) return
  const link = document.createElement('a')
  link.href = url
  // blob / data 地址带了文件名一定是下载；其余情况放到新标签页，不让当前页面跳走
  if (!filename || !/^(?:blob|data):/iu.test(url)) {
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
  }
  if (filename) link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    downloadUrl(objectUrl, filename)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_DELAY_MS)
  }
}

export function downloadText(content: string, filename: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type }), filename)
}

/** 响应头 Content-Disposition 里的文件名，优先取 RFC 5987 的 filename* */
export function filenameFromContentDisposition(disposition: string | null): string {
  if (!disposition) return ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {}
  }
  return disposition.match(/filename="?([^";]+)"?/iu)?.[1] || ''
}
