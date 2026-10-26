<script lang="ts" setup>
  /**
   * 表格分页(设计准则:列表页分页的唯一写法)。
   *
   * 右对齐 + 统一 page-sizes [20, 50, 100] + 统一 layout;
   * 每页条数变化时自动回到第 1 页,变更后只触发一次 change。
   *
   * 用法:
   *   <TablePager
   *     v-model:page="formInline.page"
   *     v-model:size="formInline.size"
   *     :total="total"
   *     @change="query"
   *   />
   *
   * 对话框内的轻量分页(无每页条数选择)用 simple:
   *   <TablePager v-model:page="userPage" :size="20" :total="userTotal" simple @change="loadUsers" />
   */

  const page = defineModel<number>('page', { required: true });
  const size = defineModel<number>('size', { default: 20 });

  withDefaults(
    defineProps<{
      total: number;
      /** 简版:只有总数与翻页,用于对话框内的列表 */
      simple?: boolean;
    }>(),
    { simple: false },
  );

  const emit = defineEmits<{ change: [] }>();

  const PAGE_SIZES = [20, 50, 100];

  function onSizeChange(value: number) {
    size.value = value;
    // 每页条数变化后旧页码可能越界,统一回到第 1 页
    page.value = 1;
    emit('change');
  }

  function onCurrentChange(value: number) {
    page.value = value;
    emit('change');
  }
</script>

<template>
  <div class="mt-5 flex justify-end">
    <el-pagination
      :current-page="page"
      :page-size="size"
      :page-sizes="PAGE_SIZES"
      :layout="simple ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
      :total="total"
      @size-change="onSizeChange"
      @current-change="onCurrentChange"
    />
  </div>
</template>
