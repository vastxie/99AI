import apiUser from '@/api/modules/user';
import router from '@/router';
import { ElMessage } from 'element-plus';
import useMenuStore from './menu';
import useRouteStore from './route';

const useUserStore = defineStore(
  // 唯一ID
  'user',
  () => {
    const routeStore = useRouteStore();
    const menuStore = useMenuStore();
    const avatar = ref('');
    const username = ref(localStorage.username ?? '');
    const token = ref(localStorage.token ?? '');
    const failure_time = ref(localStorage.failure_time ?? '');
    const permissions = ref<string[]>([]);
    const isLogin = computed(() => {
      return token.value;
    });

    // 登录
    async function login(data: { username: string; password: string }) {
      // 通过 mock 进行登录
      const res = await apiUser.login(data);
      // localStorage.setItem('username', res.data.username)
      localStorage.setItem('token', res.data);
      // localStorage.setItem('failure_time', res.data.failure_time)
      // username.value = res.data.username
      token.value = res.data;
      await getInfo();
      // failure_time.value = res.data.failure_time
    }
    // 登出
    async function logout() {
      localStorage.removeItem('username');
      localStorage.removeItem('token');
      localStorage.removeItem('failure_time');
      username.value = '';
      token.value = '';
      failure_time.value = '';
      routeStore.removeRoutes();
      menuStore.setActived(0);
      router.push({
        name: 'login',
      });
    }

    async function getInfo() {
      const res = await apiUser.getInfo();
      const { userInfo } = res.data;
      localStorage.setItem('username', userInfo.username);
      const { role } = userInfo;
      username.value = userInfo.username;
      avatar.value = userInfo.avatar;
      if (!['admin', 'super'].includes(role)) {
        ElMessage.error('您没有权限访问该系统!!!');
        await logout();
      }
    }

    // 获取我的权限
    async function getPermissions() {
      // 通过 mock 获取权限
      const res = await apiUser.permission();
      const { userInfo } = res.data;
      const { username: name } = userInfo;
      localStorage.setItem('username', name);
      username.value = name;

      permissions.value = [
        'permission.browse',
        'permission.create',
        'permission.edit',
        'permission.remove',
      ];
      return permissions.value;
    }
    // 修改密码
    async function editPassword(data: {
      oldPassword: string;
      password: string;
    }) {
      await apiUser.passwordEdit(data);
    }

    return {
      username,
      token,
      permissions,
      isLogin,
      avatar,
      login,
      logout,
      getInfo,
      getPermissions,
      editPassword,
    };
  }
);

export default useUserStore;
