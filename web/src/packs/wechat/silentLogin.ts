import { fetchOAuthCallbackAPI, fetchOAuthUrlAPI } from '@/api/user'
import { useAuthStore } from '@/store/modules/auth'
import router from '@/utils/router'
import { normalizeOAuthRedirectPath } from '@/views/auth/oauthRedirect'
import { WECHAT_OFFICIAL_PROVIDER } from './api/wechatOpenWeb'

/** 是否微信内置浏览器（企业微信不算） */
export function isWechatBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('wxwork')) return false
  return ua.includes('micromessenger')
}

/**
 * 从地址里去掉一次性的 code、state（换取会话之前就去掉，刷新不会拿同一个 code 再换一次）。
 * 经路由替换当前记录：路由知道地址变了，之后打开设置、登录框推 hash 时不会把参数写回来，
 * 历史状态里路由记的位置号也保留（临时层靠它判断前后）
 */
async function removeWechatOfficialOAuthQuery() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  const cleaned = `${url.pathname}${url.search}${url.hash}`
  await router.replace(cleaned).catch(() => undefined)
  return normalizeOAuthRedirectPath(cleaned)
}

/**
 * 微信内静默登录：带 code 回来就换取会话，否则跳转公众号授权页。
 * 由 App 启动时在「站点开启微信内授权 + 微信浏览器 + 非 OAuth 回调页」时调用。
 */
export async function runWechatSilentLogin() {
  const authStore = useAuthStore()
  if (authStore.isLogin) return
  const urlParams = new URLSearchParams(window.location.search)
  const codes = urlParams.getAll('code')
  const code = codes.length > 0 ? codes[codes.length - 1] : null
  if (code) {
    // 任何 await 之前记下身份：期间别的入口已经登录、退出或过期，这次静默登录作废（本来就不提示）
    const login = authStore.beginLogin()
    const state = urlParams.get('state') || ''
    const redirectPath = await removeWechatOfficialOAuthQuery()
    try {
      const res = await fetchOAuthCallbackAPI<string>(WECHAT_OFFICIAL_PROVIDER, { code, state })
      if (res.success && login.commit(res.data)) {
        await authStore.getUserInfo()
        authStore.setLoginDialog(false)
        router.replace(redirectPath)
      }
    } catch {}
    return
  }
  try {
    const res = await fetchOAuthUrlAPI<string>(WECHAT_OFFICIAL_PROVIDER, {
      scene: 'oauth',
      source: 'wechat_browser',
    })
    if (res.success) {
      window.location.replace(res.data)
    }
  } catch {}
}
