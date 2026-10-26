<script setup lang="ts">
  import { HOME_PATH } from '@/router/routes';

  /** 地址不存在：给出回首页与返回上一页两个出口，不自动跳走 */
  const router = useRouter();
  // 只在后台里有上一页时才给「返回上一页」（history.state.back 由 vue-router 写入），避免退回到别的网站
  const canGoBack = Boolean(window.history.state?.back);
</script>

<template>
  <main class="missing-page">
    <div class="missing-page__card">
      <p class="missing-page__code">404</p>
      <h1 class="missing-page__title">找不到这个页面</h1>
      <p class="missing-page__hint">地址可能有误，或者这个页面已经不在了。</p>
      <div class="missing-page__actions">
        <el-button type="primary" @click="router.push(HOME_PATH)">回到首页</el-button>
        <el-button v-if="canGoBack" @click="router.back()">返回上一页</el-button>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .missing-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    background-color: var(--u-bg-page);
  }

  .missing-page__card {
    width: 100%;
    max-width: 420px;
  }

  .missing-page__code {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: var(--u-accent);
  }

  .missing-page__title {
    margin: 8px 0 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .missing-page__hint {
    margin: 8px 0 24px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--u-text-secondary);
  }

  .missing-page__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .missing-page__actions .el-button + .el-button {
    margin-left: 0;
  }
</style>
