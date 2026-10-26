import { ElMessage } from 'element-plus';
import type { RouteLocationNormalized } from 'vue-router';
import {
  createRouter,
  createWebHashHistory,
  isNavigationFailure,
  NavigationFailureType,
} from 'vue-router';
import useShellStore from '@/store/modules/shell';
import useUserStore from '@/store/modules/user';
import { HOME_PATH, routes } from './routes';

const APP_TITLE = import.meta.env.VITE_APP_TITLE;

const router = createRouter({
  history: createWebHashHistory(import.meta.env.VITE_BASE_PATH),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * 登录后要回到的地址：去的本来就是登录页时沿用它已带的回跳地址，不再把登录页自己套进去；
 * 首页不用带。
 */
function returnPathOf(to: RouteLocationNormalized): string | undefined {
  if (to.name === 'login') {
    return typeof to.query.redirect === 'string' ? to.query.redirect : undefined;
  }
  return to.fullPath === HOME_PATH ? undefined : to.fullPath;
}

function toLogin(to: RouteLocationNormalized, replace = false) {
  return { name: 'login', query: { redirect: returnPathOf(to) }, replace };
}

router.beforeEach(async (to) => {
  useShellStore().navigating = true;
  const user = useUserStore();

  if (!user.isLoggedIn) {
    return to.name === 'login' ? true : toLogin(to);
  }
  // 每次打开页面先向服务端确认一次账号：凭据失效时回登录页
  if (!user.verified) {
    try {
      await user.fetchProfile();
    } catch {
      user.clear();
      return toLogin(to, true);
    }
  }
  if (!user.hasAdminAccess) {
    ElMessage.error('当前账号没有管理后台的访问权限');
    user.clear();
    return { name: 'login', replace: true };
  }
  if (to.name === 'login') {
    return { path: HOME_PATH, replace: true };
  }
  // 按角色限制的页面：路由链上任何一级不满足都回首页
  if (to.matched.some((record) => !user.hasRole(record.meta.roles))) {
    return { path: HOME_PATH, replace: true };
  }
  return true;
});

router.afterEach((to, _from, failure) => {
  // 被更新的导航取消时，由那一次导航结束进度条
  if (isNavigationFailure(failure, NavigationFailureType.cancelled)) return;
  useShellStore().navigating = false;
  if (failure) return;
  document.title = to.meta.title ? `${to.meta.title} - ${APP_TITLE}` : APP_TITLE;
});

router.onError(() => {
  useShellStore().navigating = false;
});

export default router;
