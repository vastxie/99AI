/**
 * 复制文本到剪贴板（全站唯一实现）。
 *
 * 优先异步 Clipboard API；不可用（非安全上下文 / 旧浏览器）或被拒绝时，
 * 回退到隐藏 textarea + execCommand('copy')。
 *
 * @returns 是否复制成功；调用方据此给出成功 / 失败提示
 */
export async function copyText(text: string): Promise<boolean> {
  if (await writeWithClipboardApi(text)) return true
  return copyWithExecCommand(text)
}

async function writeWithClipboardApi(text: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (!clipboard?.writeText) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.setAttribute('readonly', 'readonly')
  textarea.value = text
  // 移出视口：避免插入节点时页面滚动或闪现
  textarea.style.position = 'fixed'
  textarea.style.left = '-999999px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
