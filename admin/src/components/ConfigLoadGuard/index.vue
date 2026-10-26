<script lang="ts" setup>
  /**
   * 配置页加载守卫(设计准则:配置页在配置加载完成前必须挡住编辑)。
   *
   * 配置页是字段级自动保存,`useConfigAutoSave` 在 isReady=false 时会静默丢弃修改。
   * 若此时控件仍可点击,用户就会遇到「能操作但存不进去」——本组件在加载期间用
   * inert + 遮罩挡住整片内容,
   * 加载失败时给出错误条与重试入口,而不是让页面一直转圈。
   *
   * 用法:
   *   <page-panel>
   *     <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
   *       ...页面原内容...
   *     </ConfigLoadGuard>
   *   </page-panel>
   */

  withDefaults(defineProps<{ ready: boolean; failed?: boolean }>(), { failed: false });

  const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div>
    <el-alert
      v-if="failed"
      type="error"
      :closable="false"
      show-icon
      title="配置加载失败，此页面的修改不会被保存"
      class="mb-4"
    >
      <el-button link type="primary" @click="emit('retry')">重新加载</el-button>
    </el-alert>

    <div
      v-loading="!ready && !failed"
      :inert="ready ? undefined : true"
      :class="{ 'config-guard-blocked': failed }"
      class="config-guard-body"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
  .config-guard-body {
    min-height: 120px;
  }

  /* 加载失败:内容置灰,避免看起来可编辑(inert 已阻断交互) */
  .config-guard-blocked {
    opacity: 0.6;
  }
</style>
