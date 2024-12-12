<script lang="ts" setup>
import { NButton } from 'naive-ui';
import { useRouter } from 'vue-router';

const router = useRouter();

function goHome() {
  router.replace('/');
}
</script>

<template>
  <div class="flex h-full bg-white dark:bg-gray-900">
    <div class="px-4 m-auto space-y-4 text-center max-[400px]">
      <h1 class="text-4xl text-slate-800 dark:text-neutral-200">
        404 - 页面迷路了！
      </h1>
      <p class="text-base text-slate-500 dark:text-neutral-400">
        哎呀！页面好像迷路了，找不到了。
      </p>
      <div class="flex items-center justify-center text-center">
        <div class="w-[300px]">
          <img class="w-full" src="../../../icons/404.svg" alt="404" />
        </div>
      </div>
      <NButton type="primary" @click="goHome"> Go to Home </NButton>
    </div>
  </div>
</template>
