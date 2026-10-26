/**
 * 文件访问 cookie（fa_token）同步。
 *
 * <img> / <video> 等媒体标签无法携带 Authorization 头，私有文件直链
 * （/api/files/{fileId}/preview|download）依靠该 cookie 完成鉴权：
 * URL 本身不携带任何凭证，复制分享出去对他人天然不可用。
 * cookie 的 Path 限定在文件 API 前缀下，只随文件请求发送；
 * 跨站部署（如 Electron 指向远端 API）无法用 JS 设置 cookie 时，
 * 媒体渲染会自动回落到鉴权 blob 水合，不影响功能。
 */

const FILE_ACCESS_COOKIE_NAME = 'fa_token'
const FILE_ACCESS_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 3600

/** 当前凭证由身份模块注册进来（services/identity.ts）：这里不反向导入它，也不直读存储 */
let currentCredential: (() => string) | null = null

export function registerFileAccessCredential(provider: () => string) {
  currentCredential = provider
}

function getFileApiCookiePath(): string {
  try {
    const base = new URL(
      String(import.meta.env.VITE_GLOB_API_URL || '/api'),
      window.location.origin
    )
    return `${base.pathname.replace(/\/+$/, '')}/files`
  } catch {
    return '/api/files'
  }
}

export function syncFileAccessCookie(token: string | null | undefined): void {
  if (typeof document === 'undefined') return

  const path = getFileApiCookiePath()
  if (!token) {
    document.cookie = `${FILE_ACCESS_COOKIE_NAME}=; Path=${path}; Max-Age=0; SameSite=Lax`
    return
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${FILE_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; Path=${path}; Max-Age=${FILE_ACCESS_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

/** 按当前身份（登录令牌优先于访客令牌）重算文件访问 cookie；凭证变化时与应用启动时调用 */
export function refreshFileAccessCookie(): void {
  if (!currentCredential) return
  syncFileAccessCookie(currentCredential() || null)
}
