<script lang="ts" setup>
  /**
   * 对话框底部（设计准则：取消在左、主按钮在右，footer 统一 `flex justify-end gap-2`）。
   *
   * 用法：
   *   <template #footer>
   *     <DialogFooter :loading="submitting" @cancel="visible = false" @confirm="handlerSubmit" />
   *   </template>
   * 文案有差异时传 confirmText / cancelText；主按钮 loading 期间由 el-button 自身禁用。
   */
  withDefaults(
    defineProps<{
      confirmText?: string;
      cancelText?: string;
      loading?: boolean;
      disabled?: boolean;
    }>(),
    { confirmText: '保存', cancelText: '取消', loading: false, disabled: false },
  );

  const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <span class="flex justify-end gap-2">
    <el-button @click="emit('cancel')">{{ cancelText }}</el-button>
    <el-button type="primary" :loading="loading" :disabled="disabled" @click="emit('confirm')">
      {{ confirmText }}
    </el-button>
  </span>
</template>
