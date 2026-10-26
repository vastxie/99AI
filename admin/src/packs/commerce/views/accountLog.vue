<script lang="ts" setup>
  /**
   * 账户明细已并入用户详情的「权益与消费」页签；本路由只为兼容旧链接
   * （服务端 profile 里的 /user/account-log?userId= 与历史书签）做跳转。
   */
  const route = useRoute();
  const router = useRouter();

  const userId = Number(route.query.userId);
  router.replace(
    Number.isInteger(userId) && userId > 0
      ? { path: `/user/detail/${userId}`, query: { tab: 'commerce' } }
      : { path: '/user/dashboard' },
  );
</script>

<template>
  <div />
</template>
