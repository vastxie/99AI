<script setup lang="ts">
  import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs';
  import RouteProgress from '@/shell/RouteProgress.vue';
  import useThemeStore from '@/store/modules/theme';

  // 启动时就接管明暗模式：登录页等外壳之外的页面同样随「跟随系统」切换
  useThemeStore();
</script>

<template>
  <!-- 关掉按钮文字自动插空格：两个汉字的按钮会变成「重 置」，和多字按钮并排时对不齐 -->
  <el-config-provider :locale="zhCn" :button="{ autoInsertSpace: false }">
    <RouteProgress />
    <RouterView />
  </el-config-provider>
</template>
