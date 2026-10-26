import axios, { isAxiosError } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';
import useUserStore from '@/store/modules/user';

/**
 * 管理端请求实例：凭据以 Bearer 头显式携带（认证方式变更时要重新评估 CSRF 边界），
 * 响应直接交出后端的响应体，失败时统一弹出错误提示并原样抛出。
 */
const api = axios.create({
  baseURL:
    import.meta.env.DEV && import.meta.env.VITE_OPEN_PROXY === 'true'
      ? '/proxy/'
      : import.meta.env.VITE_APP_API_BASEURL,
  timeout: 60_000,
  responseType: 'json',
});

api.interceptors.request.use((config) => {
  const { token } = useUserStore();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let leavingForLogin = false;

/** 凭据失效：清掉登录状态并回登录页，带上当前地址以便登录后返回 */
async function handleSessionExpired() {
  useUserStore().clear();
  const current = router.currentRoute.value;
  if (current.name === 'login' || leavingForLogin) return;
  leavingForLogin = true;
  try {
    await router.replace({
      name: 'login',
      query: { redirect: current.name ? current.fullPath : undefined },
    });
  } finally {
    leavingForLogin = false;
  }
}

/** 错误提示优先用后端给的 message */
function describeError(error: unknown): string {
  if (!isAxiosError(error)) return '接口请求异常，请稍后再试';
  const { response } = error;
  if (!response) return error.message || '接口请求异常，请稍后再试';
  const body = response.data;
  const message = body && typeof body === 'object' ? (body as { message?: unknown }).message : '';
  if (typeof message === 'string' && message) return message;
  // 参数校验失败时后端可能给出多条
  if (Array.isArray(message) && message.length) return message.join('；');
  if (response.status === 401) return '登录已失效，请重新登录';
  return `请求失败（${response.status}），请稍后再试`;
}

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      void handleSessionExpired();
    }
    // 错误提示多停留一会儿，方便看清
    ElMessage({ message: describeError(error), type: 'error', duration: 5000 });
    return Promise.reject(error);
  },
);

export default api;
