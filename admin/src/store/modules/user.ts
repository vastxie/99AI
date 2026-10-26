import apiUser from '@/api/modules/user';
import router from '@/router';

/** 管理后台只对这个角色开放 */
export const ADMIN_ROLE = 'super';

/** 登录凭据存在 localStorage，页面脚本可以读到，需持续防范 XSS */
const TOKEN_KEY = 'token';

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(value: string) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 存不进去时只在本次打开期间保持登录
  }
}

/** 当前登录的管理员 */
const useUserStore = defineStore('user', () => {
  const token = ref(readToken());
  const username = ref('');
  const avatar = ref('');
  const role = ref('');
  /** 本次打开页面后是否已向服务端确认过账号信息 */
  const verified = ref(false);

  const isLoggedIn = computed(() => Boolean(token.value));
  const hasAdminAccess = computed(() => role.value === ADMIN_ROLE);

  /** 路由 meta.roles 的判定：没有限制，或当前角色在名单里 */
  function hasRole(roles?: readonly string[]) {
    return !roles?.length || roles.includes(role.value);
  }

  async function fetchProfile() {
    const res = await apiUser.getInfo();
    const { userInfo } = res.data;
    username.value = userInfo.username;
    avatar.value = userInfo.avatar;
    role.value = userInfo.role;
    verified.value = true;
  }

  async function login(credentials: { username: string; password: string }) {
    const res = await apiUser.login(credentials);
    token.value = res.data;
    writeToken(res.data);
    await fetchProfile();
  }

  async function updateProfile(data: { username?: string; nickname?: string; avatar?: string }) {
    await apiUser.updateProfile(data);
    await fetchProfile();
  }

  /** 清掉本地登录状态，不跳转 */
  function clear() {
    token.value = '';
    username.value = '';
    avatar.value = '';
    role.value = '';
    verified.value = false;
    writeToken('');
  }

  /** 退出登录并回到登录页 */
  async function logout() {
    clear();
    if (router.currentRoute.value.name !== 'login') {
      await router.push({ name: 'login' });
    }
  }

  return {
    token,
    username,
    avatar,
    role,
    verified,
    isLoggedIn,
    hasAdminAccess,
    hasRole,
    fetchProfile,
    login,
    updateProfile,
    clear,
    logout,
  };
});

export default useUserStore;
