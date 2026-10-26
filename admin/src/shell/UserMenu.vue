<script setup lang="ts">
  import { HOME_PATH, HOME_TITLE } from '@/router/routes';
  import useShellStore from '@/store/modules/shell';
  import useUserStore from '@/store/modules/user';

  /** 顶栏右端的账号菜单：头像（没有时显示用户名首字）、用户名、下拉的主页 / 个人设置 / 退出登录 */
  const router = useRouter();
  const shell = useShellStore();
  const user = useUserStore();

  // 记住加载失败的头像地址：失败时显示首字，换了头像自然会再试
  const brokenAvatar = ref('');
  const initial = computed(() => (user.username || '?').trim().charAt(0).toUpperCase());

  function onCommand(command: unknown) {
    if (command === 'home') void router.push(HOME_PATH);
    else if (command === 'profile') void router.push({ name: 'personalSetting' });
    else if (command === 'logout') void user.logout();
  }
</script>

<template>
  <el-dropdown trigger="hover" placement="bottom-end" @command="onCommand">
    <button type="button" class="user-menu" aria-label="账号菜单">
      <span class="user-menu__avatar">
        <img
          v-if="user.avatar && user.avatar !== brokenAvatar"
          :src="user.avatar"
          alt=""
          @error="brokenAvatar = user.avatar"
        />
        <template v-else>{{ initial }}</template>
      </span>
      <span v-if="!shell.isCompact" class="user-menu__name">{{ user.username }}</span>
      <AppIcon name="i-lucide:chevron-down" :size="14" class="user-menu__caret" />
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="home">{{ HOME_TITLE }}</el-dropdown-item>
        <el-dropdown-item command="profile">个人设置</el-dropdown-item>
        <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
  .user-menu {
    display: flex;
    gap: 8px;
    align-items: center;
    height: 32px;
    margin-left: 4px;
    padding: 0 6px;
    font-family: inherit;
    font-size: 13px;
    color: var(--u-text-primary);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--u-radius-m);
    transition: background-color 0.15s ease;
  }

  .user-menu:hover {
    background-color: var(--u-bg-fill);
  }

  .user-menu__avatar {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    overflow: hidden;
    font-size: 11px;
    font-weight: 600;
    color: var(--u-accent-text);
    background-color: var(--u-accent-soft);
    border-radius: 50%;
  }

  .user-menu__avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-menu__name {
    max-width: 128px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-menu__caret {
    color: var(--u-text-placeholder);
  }
</style>
