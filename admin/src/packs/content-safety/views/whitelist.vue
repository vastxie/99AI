<script lang="ts" setup>
  import apiBadWords from '../api/badWords';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FilterField } from '@/components/FilterBar/types';

  const docUrl = computed(() => getDocUrl('/configuration/security/whitelist'));
  usePageDoc(docUrl);

  const filterFields: FilterField[] = [];

  const saveLoading = ref(false);
  const visible = ref(false);
  const dialogTitle = ref('添加白名单');

  const formData = reactive({
    id: undefined,
    word: '',
    remark: '',
  });

  const queryForm = reactive({
    page: 1,
    size: 20,
    word: '',
  });

  const {
    loading: tableLoading,
    total,
    tableData,
    query: queryWhitelist,
    search: searchWhitelist,
  } = usePagedTable(async () => {
    const res = await apiBadWords.queryWhitelist(queryForm);
    return res.data;
  }, queryForm);

  const batchVisible = ref(false);
  const batchWords = ref('');

  function openDialog() {
    dialogTitle.value = '添加白名单';
    formData.id = undefined;
    formData.word = '';
    formData.remark = '';
    visible.value = true;
  }

  function openEdit(row: any) {
    dialogTitle.value = '编辑白名单';
    formData.id = row.id;
    formData.word = row.word;
    formData.remark = row.remark || '';
    visible.value = true;
  }

  async function saveWhitelist() {
    if (!formData.word || formData.word.trim().length === 0) {
      ElMessage.error('请输入白名单词语');
      return;
    }

    saveLoading.value = true;
    try {
      if (formData.id) {
        await apiBadWords.updateWhitelist({
          id: formData.id,
          word: formData.word,
          remark: formData.remark,
        });
        ElMessage.success('修改成功');
      } else {
        await apiBadWords.addWhitelist({
          word: formData.word,
          remark: formData.remark,
        });
        ElMessage.success('添加成功');
      }
      visible.value = false;
      queryWhitelist();
    } catch {
      // 请求层已统一提示错误
    } finally {
      saveLoading.value = false;
    }
  }

  async function deleteWhitelist(row: any) {
    try {
      await ElMessageBox.confirm(`确认删除白名单词语"${row.word}"吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      await apiBadWords.delWhitelist({ id: row.id });
      ElMessage.success('删除成功');
      queryWhitelist();
    } catch {
      // 取消确认，或请求失败（请求层已提示）
    }
  }

  function openBatchDialog() {
    batchWords.value = '';
    batchVisible.value = true;
  }

  async function handleBatchAdd() {
    if (!batchWords.value || batchWords.value.trim().length === 0) {
      ElMessage.error('请输入白名单词语');
      return;
    }

    saveLoading.value = true;
    try {
      const res = await apiBadWords.batchAddWhitelist({ words: batchWords.value });
      const { message, total: totalWords, success, skipped } = res.data;
      ElMessage.success(`${message}，共${totalWords}个，成功${success}个，跳过${skipped}个`);
      batchVisible.value = false;
      queryWhitelist();
    } catch {
      // 请求层已统一提示错误
    } finally {
      saveLoading.value = false;
    }
  }

  onMounted(() => {
    queryWhitelist();
  });
</script>

<template>
  <div>
    <page-panel v-loading="tableLoading">
      <FilterBar
        v-model:keyword="queryForm.word"
        keyword-placeholder="请输入词语"
        :fields="filterFields"
        :filters="queryForm"
        class="mb-5"
        @update:filters="Object.assign(queryForm, $event)"
        @apply="searchWhitelist"
        @reset="searchWhitelist"
      >
        <el-button type="primary" @click="openDialog">
          <AppIcon name="i-lucide:plus" class="mr-1" />
          添加词语
        </el-button>
        <el-button @click="openBatchDialog">
          <AppIcon name="i-lucide:list-plus" class="mr-1" />
          批量添加
        </el-button>
      </FilterBar>

      <!-- 表格 -->
      <el-table :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="word" label="白名单词语" min-width="200" />
        <el-table-column prop="remark" label="备注" min-width="200">
          <template #default="{ row }">
            {{ row.remark || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ utcToShanghaiTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="deleteWhitelist(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <TablePager
        v-model:page="queryForm.page"
        v-model:size="queryForm.size"
        :total="total"
        @change="queryWhitelist"
      />
    </page-panel>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="visible" :title="dialogTitle" width="500px" :close-on-click-modal="false">
      <el-form :model="formData" label-width="100px">
        <el-form-item label="白名单词语" required>
          <el-input v-model="formData.word" placeholder="请输入白名单词语" clearable />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="formData.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <DialogFooter
          confirm-text="确定"
          :loading="saveLoading"
          @cancel="visible = false"
          @confirm="saveWhitelist"
        />
      </template>
    </el-dialog>

    <!-- 批量添加对话框 -->
    <el-dialog
      v-model="batchVisible"
      title="批量添加白名单"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="白名单词语" required>
          <el-input
            v-model="batchWords"
            type="textarea"
            :rows="10"
            placeholder="请输入白名单词语，多个词语可用空格或换行分隔（单次最多添加10000个）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <DialogFooter
          confirm-text="确定"
          :loading="saveLoading"
          @cancel="batchVisible = false"
          @confirm="handleBatchAdd"
        />
      </template>
    </el-dialog>
  </div>
</template>
