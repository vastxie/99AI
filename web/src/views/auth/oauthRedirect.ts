import { CONVERSATION_ID_SOURCE } from '@/constants/conversation'

const OAUTH_REDIRECT_STORAGE_KEY = 'chat:oauthRedirectPath'
/** 登录后可以回到的页面：首页或某个会话 */
const CONVERSATION_PATH_PATTERN = new RegExp(`^/c/${CONVERSATION_ID_SOURCE}$`, 'u')
/** 登录 / 注册弹窗自己的 hash：登录完成后不能再带着它回去，否则弹窗会再次打开 */
const LOGIN_HASHES = new Set(['#login', '#register'])

export function normalizeOAuthRedirectPath(value: unknown) {
  const rawPath = typeof value === 'string' && value.trim() ? value.trim() : '/'
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\')) return '/'

  const url = new URL(rawPath, window.location.origin)
  if (url.origin !== window.location.origin) return '/'
  if (/^\/auth\/callback(?:\/|$)/.test(url.pathname)) return '/'
  if (url.pathname !== '/' && !CONVERSATION_PATH_PATTERN.test(url.pathname)) return '/'

  url.searchParams.delete('code')
  url.searchParams.delete('state')
  if (LOGIN_HASHES.has(url.hash)) url.hash = ''
  return `${url.pathname}${url.search}${url.hash}` || '/'
}

export function resolveCurrentOAuthRedirectPath() {
  return normalizeOAuthRedirectPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  )
}

export function saveOAuthRedirectPath(value = resolveCurrentOAuthRedirectPath()) {
  const redirectPath = normalizeOAuthRedirectPath(value)
  try {
    window.sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, redirectPath)
  } catch {}
  return redirectPath
}

export function consumeOAuthRedirectPath() {
  try {
    const redirectPath = window.sessionStorage.getItem(OAUTH_REDIRECT_STORAGE_KEY)
    window.sessionStorage.removeItem(OAUTH_REDIRECT_STORAGE_KEY)
    return normalizeOAuthRedirectPath(redirectPath)
  } catch {
    return '/'
  }
}
