import { fetchLoginByCodeAPI, fetchWxLoginRedirectAPI } from '@/api/user'
import { useAuthStore } from '@/store'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

// 全局作用域不使用useRouter()
const authStore = useAuthStore()
const isLogin = computed(() => authStore.isLogin)

// 微信登录逻辑
export async function loginByWechat() {
  if (isLogin.value) {
    return
  }

  // 在函数内部使用useRouter
  const router = useRouter()
  const authStore = useAuthStore()

  const urlParams = new URLSearchParams(window.location.search)
  // alert(urlParams);

  const codes = urlParams.getAll('code')
  const code = codes.length > 0 ? codes[codes.length - 1] : null

  if (code) {
    try {
      const res = await fetchLoginByCodeAPI<any>({ code: code })
      if (res.success) {
        authStore.setToken(res.data)
        await authStore.getUserInfo()
        authStore.setLoginDialog(false) // 关闭登录对话框
        // return { success: true };
        router.replace('/')
      }
    } catch (error) {
      console.error('微信登录失败', error)
    }
  } else {
    try {
      const currentUrl = window.location.href
      // const currentUrl = window.location.href.split('#')[0];
      const res = await fetchWxLoginRedirectAPI<any>({ url: currentUrl })
      // alert(res.data);
      if (res.success) {
        // alert(window.location.href);
        window.location.replace(res.data)
        // window.location.href = res.data; // 跳转到微信授权页面
      }
    } catch (error) {
      console.error('获取微信授权链接失败', error)
    }
  }

  return { success: false }
}

// /**
//  * 检测当前浏览器是否是微信内置浏览器
//  * 区分微信和企业微信，只有微信浏览器返回true
//  * @returns {boolean} 如果是微信浏览器返回 true，否则返回 false
//  */
// export function isWechatBrowser(): boolean {
//   const ua = navigator.userAgent.toLowerCase();

//   // 检查是否是企业微信
//   const isWXWork = ua.indexOf('wxwork') !== -1;

//   // 检查是否是微信，排除企业微信的情况
//   const isWeixin = !isWXWork && ua.indexOf('micromessenger') !== -1;

//   return isWeixin;
// }

// 初始化微信登录
export function initWechatLogin() {
  // if (isWechatBrowser()) {
  loginByWechat() // 执行微信登录逻辑
  // }
}
