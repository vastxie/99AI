import { useRoute, useRouter } from 'vue-router'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { message } from '@/utils/message'

/**
 * 落地时地址里带的一次性参数 token（第三方登录回跳）：写入登录态后立即从地址栏移除，
 * 不留在历史记录、Referer 与访问日志里。经路由替换当前记录：路由知道地址变了，
 * 之后打开设置、登录框推 hash 时不会把参数写回来
 */
export function useLandingQuery() {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const ms = message()

  async function loginByToken(token: string) {
    // 读到落地令牌就开始这次登录（任何 await 之前）：清理地址期间别的入口登录、退出了，就不再写入
    const login = authStore.beginLogin()
    // 一次性令牌先从地址栏清掉（不等资料请求）；地址已经不带它了（期间离开了这页）就不动
    if (route.query.token === token) {
      const { token: _token, ...query } = route.query
      await router.replace({ path: route.path, query, hash: route.hash }).catch(() => undefined)
    }
    if (!login.commit(token)) return
    try {
      await authStore.getUserInfo()
      // 资料取到才算登录成功
      ms.success(t('chat.loginSuccessful'))
    } catch {
      // 资料取不到（含期间身份又变了）：不提示成功，登录态由请求层处理
    }
  }

  /** 挂载时调用一次：处理完即从地址栏清掉 */
  async function consume() {
    const token = route.query.token ? String(route.query.token) : ''
    if (token) await loginByToken(token)
  }

  return { consume }
}
