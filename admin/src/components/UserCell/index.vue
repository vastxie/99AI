<script lang="ts" setup>
  /**
   * 用户身份单元(设计准则:所有表格 / 面板里出现用户的唯一写法)。
   *
   * 头像 + 主名(昵称优先,其次用户名)+ 次行(默认 `#id · 用户名`,可切换为邮箱 / 手机)。
   * 有 id 且当前账号能进用户详情时渲染成真实链接(可聚焦、回车打开、可新标签页打开);
   * 没有权限或关掉 link 时只显示文字。没有头像时用首字母占位,不再出现裸 <img>。
   */
  import { RouterLink } from 'vue-router';
  import useUserStore from '@/store/modules/user';
  import { userCellLinkable } from './userCellLink';

  interface UserLike {
    id?: number | string | null;
    username?: string | null;
    nickname?: string | null;
    avatar?: string | null;
    email?: string | null;
    phone?: string | null;
  }

  const props = withDefaults(
    defineProps<{
      user?: UserLike | null;
      /** sm 用于表格行,md 用于弹窗与摘要,lg 用于详情页头 */
      size?: 'sm' | 'md' | 'lg';
      secondary?: 'id' | 'email' | 'phone' | 'username' | 'none';
      link?: boolean;
    }>(),
    { user: null, size: 'sm', secondary: 'id', link: true },
  );

  const router = useRouter();

  const displayName = computed(() => {
    const nickname = props.user?.nickname?.toString().trim();
    const username = props.user?.username?.toString().trim();
    if (nickname) return nickname;
    if (username) return username;
    return props.user?.id ? `用户 #${props.user.id}` : '未知用户';
  });

  const secondaryText = computed(() => {
    const user = props.user;
    if (!user) return '';
    switch (props.secondary) {
      case 'id': {
        const parts: string[] = [];
        if (user.id) parts.push(`#${user.id}`);
        const nickname = user.nickname?.toString().trim();
        const username = user.username?.toString().trim();
        if (nickname && username && nickname !== username) parts.push(username);
        return parts.join(' · ');
      }
      case 'email':
        return user.email || '';
      case 'phone':
        return user.phone || '';
      case 'username':
        return user.username || '';
      default:
        return '';
    }
  });

  const avatarSize = computed(() => ({ sm: 24, md: 32, lg: 48 })[props.size]);
  const initial = computed(() => displayName.value.slice(0, 1).toUpperCase());
  const userStore = useUserStore();
  const detailTarget = computed(() =>
    props.user?.id ? { name: 'UserDetail', params: { id: String(props.user.id) } } : null,
  );
  const canLink = computed(() =>
    userCellLinkable({
      link: props.link,
      userId: props.user?.id,
      canAccessDetail: detailTarget.value
        ? userStore.hasRole(router.resolve(detailTarget.value).meta.roles as string[] | undefined)
        : false,
    }),
  );
</script>

<template>
  <component
    :is="canLink ? RouterLink : 'div'"
    v-bind="canLink && detailTarget ? { to: detailTarget } : {}"
    class="user-cell"
    :class="[`is-${size}`, { 'is-link': canLink }]"
  >
    <el-avatar :size="avatarSize" :src="user?.avatar || undefined" class="user-cell-avatar">
      {{ initial }}
    </el-avatar>
    <div class="user-cell-text">
      <div class="user-cell-name">{{ displayName }}</div>
      <div v-if="secondaryText" class="user-cell-secondary">{{ secondaryText }}</div>
    </div>
  </component>
</template>

<style scoped>
  .user-cell {
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    gap: 8px;
    vertical-align: middle;
  }

  .user-cell.is-link {
    cursor: pointer;
    color: inherit;
    text-decoration: none;
    border-radius: 4px;
  }

  .user-cell.is-link:focus-visible {
    outline: 2px solid var(--u-accent);
    outline-offset: 2px;
  }

  .user-cell-avatar {
    flex: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--u-accent-text);
    background: var(--u-accent-soft);
  }

  .user-cell-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    line-height: 1.3;
  }

  .user-cell-name,
  .user-cell-secondary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-cell-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--u-text-primary);
    transition: color 0.15s ease;
  }

  .user-cell.is-link:hover .user-cell-name {
    color: var(--u-accent);
  }

  .user-cell-secondary {
    font-size: 12px;
    color: var(--u-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .user-cell.is-md .user-cell-name {
    font-size: 14px;
  }

  .user-cell.is-lg {
    gap: 12px;
  }

  .user-cell.is-lg .user-cell-avatar {
    font-size: 18px;
  }

  .user-cell.is-lg .user-cell-name {
    font-size: 18px;
    font-weight: 600;
  }

  .user-cell.is-lg .user-cell-secondary {
    font-size: 13px;
  }
</style>
