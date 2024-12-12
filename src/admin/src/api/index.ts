import router from '@/router/index';
import useUserStore from '@/store/modules/user';
import axios from 'axios';
import { ElMessage } from 'element-plus';

const api = axios.create({
  baseURL:
    import.meta.env.DEV && import.meta.env.VITE_OPEN_PROXY === 'true'
      ? '/proxy/'
      : import.meta.env.VITE_APP_API_BASEURL,
  timeout: 1000 * 60,
  responseType: 'json',
});

api.interceptors.request.use((request) => {
  const userStore = useUserStore();
  /**
   * 全局拦截请求发送前提交的参数
   * 以下代码为示例，在请求头里带上 token 信息
   */
  if (userStore.isLogin && request.headers) {
    request.headers.Authorization = userStore.token
      ? `Bearer ${userStore.token}`
      : '';
  }
  // 是否将 POST 请求参数进行字符串化处理
  if (request.method === 'post') {
    // request.data = qs.stringify(request.data, {
    //   arrayFormat: 'brackets',
    // })
  }
  return request;
});

api.interceptors.response.use(
  (response) => {
    /**
     * 全局拦截请求发送后返回的数据，如果数据有报错则在这做全局的错误提示
     * 假设返回数据格式为：{ status: 1, error: '', data: '' }
     * 规则是当 status 为 1 时表示请求成功，为 0 时表示接口需要登录或者登录状态失效，需要重新登录
     * 请求出错时 error 会返回错误信息
     */
    return Promise.resolve(response.data);
  },
  (error) => {
    let msg = '';
    if (error?.response) {
      const { data, status } = error.response;
      if (status === 401) {
        msg = '权限验证失败，请重新登录';
        // loginout
        if (data.code === 401 && data.message.includes('请登录后继续操作')) {
          const userStore = useUserStore();
          userStore.logout().then(() => {
            router.push({ name: 'login' });
          });
        }
      }
      const { message, code } = data;
      message && (msg = message);
    } else {
      msg = '接口请求异常，请稍后再试';
    }

    ElMessage({
      message: msg,
      type: 'error',
    });
    return Promise.reject(error);
  }
);

export default api;
