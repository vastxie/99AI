<script lang="ts" setup>
  import ApiPrivateFile from '@/api/modules/privateFile';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import useRemoteUserOptions from '@/utils/composables/useRemoteUserOptions';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';
  import type { FilterField } from '@/components/FilterBar/types';

  const docUrl = computed(() => getDocUrl('/configuration/ai/private-file-management'));
  usePageDoc(docUrl);

  const detailLoading = ref(false);
  const selectedRows = ref<any[]>([]);
  const detailVisible = ref(false);
  const currentFile = ref<any>(null);

  const filters = reactive({
    keyword: '',
    fileId: '',
    userId: '' as string | number,
    visibility: '',
    status: '',
    origin: '',
    page: 1,
    size: 20,
  });

  // 支持从用户详情页钻取链接（?userId=xxx）带入用户过滤
  const route = useRoute();
  {
    const drillDownUserId = Number(route.query.userId);
    if (Number.isInteger(drillDownUserId) && drillDownUserId > 0) {
      filters.userId = drillDownUserId;
    }
  }

  // 可见性是分类维度，不按语义色染色
  const visibilityOptions = [
    { label: '私有', value: 'private', type: 'info' },
    { label: '临时', value: 'temporary', type: 'info' },
    { label: '公开', value: 'public', type: 'info' },
  ];

  const statusOptions = [
    { label: '可用', value: 'active', type: 'success' },
    { label: '过期', value: 'expired', type: 'warning' },
    { label: '已清理', value: 'deleted', type: 'info' },
  ];

  const { fetchUserOptions, resolveUserLabel } = useRemoteUserOptions();
  const filterFields: FilterField[] = [
    {
      key: 'userId',
      label: '用户',
      type: 'remote-select',
      placeholder: '搜索用户：昵称 / 手机号 / 邮箱',
      fetchOptions: fetchUserOptions,
      resolveLabel: resolveUserLabel,
    },
    {
      key: 'visibility',
      label: '可见性',
      type: 'select',
      placeholder: '请选择可见性',
      options: visibilityOptions,
    },
    {
      key: 'status',
      label: '状态',
      type: 'select',
      placeholder: '请选择状态',
      options: statusOptions,
    },
    { key: 'origin', label: '来源标识', type: 'input', placeholder: '来源标识' },
  ];

  function formatBytes(value: number) {
    const size = Number(value) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function getOptionLabel(options: any[], value: string) {
    return options.find((item) => item.value === value)?.label || value || '-';
  }

  function getOptionType(options: any[], value: string) {
    return options.find((item) => item.value === value)?.type || 'info';
  }

  const {
    loading,
    total,
    tableData,
    query: queryFiles,
    search: searchFiles,
  } = usePagedTable(async () => {
    const res: any = await ApiPrivateFile.queryFiles({ ...filters });
    return { rows: res.data?.rows || [], count: res.data?.count || 0 };
  }, filters);

  // fileId 不在 FilterBar 字段里（由用户详情页钻取带入），重置时单独清掉
  function resetFilters() {
    filters.fileId = '';
    searchFiles();
  }

  function handleSelectionChange(rows: any[]) {
    selectedRows.value = rows;
  }

  async function openDetail(row: any) {
    detailLoading.value = true;
    detailVisible.value = true;
    try {
      const res: any = await ApiPrivateFile.getFile(row.fileId);
      currentFile.value = res.data || row;
    } finally {
      detailLoading.value = false;
    }
  }

  function showClearResultMessage(data: any, prefix = '已处理') {
    const matched = data?.matched || 0;
    const contentDeleted = data?.contentDeleted ?? data?.blobDeleted ?? 0;
    const markedDeleted = data?.markedDeleted || matched;
    const missingContent = data?.missingContent ?? data?.missingBlob ?? 0;
    const suffix = missingContent ? `，其中 ${missingContent} 个文件内容已不存在` : '';
    ElMessage.success(
      `${prefix} ${markedDeleted} 条记录，清空 ${contentDeleted} 个文件内容${suffix}`,
    );
  }

  /** 清理类操作共用一个提交中状态，避免并发触发 */
  const clearing = ref(false);
  const cleanupLoading = ref(false);
  async function batchDeleteSelected() {
    if (!selectedRows.value.length) {
      ElMessage.warning('请先选择需要清空的文件');
      return;
    }
    try {
      await ElMessageBox.confirm(
        `确定清空选中的 ${selectedRows.value.length} 个文件内容？文件记录会保留。`,
        '清空文件内容',
        { type: 'warning' },
      );
    } catch {
      return;
    }
    clearing.value = true;
    try {
      const res: any = await ApiPrivateFile.batchDelete({
        fileIds: selectedRows.value.map((item) => item.fileId),
      });
      showClearResultMessage(res.data, '已标记清理');
      await queryFiles();
    } finally {
      clearing.value = false;
    }
  }

  async function clearExpiredBlobs() {
    try {
      await ElMessageBox.confirm(
        '确定批量清空已过期文件内容？文件记录会保留。',
        '清空过期文件内容',
        { type: 'warning' },
      );
    } catch {
      return;
    }
    clearing.value = true;
    try {
      const res: any = await ApiPrivateFile.clearFiles({
        filters: { status: 'expired' },
        limit: 200,
        confirmText: 'CLEAR_FILE_ASSETS',
      });
      showClearResultMessage(res.data);
      await queryFiles();
    } finally {
      clearing.value = false;
    }
  }

  async function runCleanup() {
    try {
      await ElMessageBox.confirm(
        '立即执行一次过期文件清理任务？只清理已过期的文件内容。',
        '立即清理',
        {
          type: 'warning',
        },
      );
    } catch {
      return;
    }
    cleanupLoading.value = true;
    try {
      const res: any = await ApiPrivateFile.runCleanup();
      ElMessage.success(
        `清理完成：扫描 ${res.data?.scanned || 0} 条，清空 ${
          res.data?.contentDeleted ?? res.data?.blobDeleted ?? 0
        } 个文件内容`,
      );
      await queryFiles();
    } finally {
      cleanupLoading.value = false;
    }
  }

  onMounted(() => {
    queryFiles();
  });
</script>

<template>
  <div>
    <page-panel>
      <FilterBar
        v-model:keyword="filters.keyword"
        keyword-placeholder="文件名 / 文件 ID"
        :fields="filterFields"
        :filters="filters"
        class="mb-5"
        @update:filters="Object.assign(filters, $event)"
        @apply="searchFiles"
        @reset="resetFilters"
      >
        <el-button :loading="cleanupLoading" @click="runCleanup">立即清理</el-button>
        <el-button type="danger" plain :loading="clearing" @click="clearExpiredBlobs">
          清空过期内容
        </el-button>
        <el-button
          type="danger"
          plain
          :loading="clearing"
          :disabled="!selectedRows.length"
          @click="batchDeleteSelected"
        >
          清空选中内容
        </el-button>
      </FilterBar>

      <el-table
        v-loading="loading"
        border
        :data="tableData"
        empty-text="暂无私有文件"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="fileId" label="文件 ID" width="250" />
        <el-table-column prop="name" label="文件名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="userId" label="用户 ID" width="100" align="right" />
        <el-table-column prop="size" label="大小" width="110" align="right">
          <template #default="{ row }">{{ formatBytes(row.size) }}</template>
        </el-table-column>
        <el-table-column label="文件内容" width="120">
          <template #default="{ row }">
            <el-tag :type="row.contentAvailable ? 'success' : 'info'">
              {{ row.contentAvailable ? '可下载' : '已清空' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="visibility" label="可见性" width="100">
          <template #default="{ row }">
            <el-tag :type="getOptionType(visibilityOptions, row.visibility)">
              {{ getOptionLabel(visibilityOptions, row.visibility) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getOptionType(statusOptions, row.status)">
              {{ getOptionLabel(statusOptions, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mime" label="MIME" min-width="180" show-overflow-tooltip />
        <el-table-column prop="origin" label="来源标识" width="180" show-overflow-tooltip />
        <el-table-column prop="lastAccessedAt" label="最后访问" width="180">
          <template #default="{ row }">
            <span v-if="row.lastAccessedAt">
              {{ utcToShanghaiTime(row.lastAccessedAt, 'YYYY-MM-DD HH:mm:ss') }}
            </span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ utcToShanghaiTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <TablePager
        v-model:page="filters.page"
        v-model:size="filters.size"
        :total="total"
        @change="queryFiles"
      />
    </page-panel>

    <el-drawer v-model="detailVisible" title="文件详情" size="520px">
      <el-skeleton v-if="detailLoading" :rows="8" animated />
      <el-descriptions v-else-if="currentFile" :column="1" border>
        <el-descriptions-item label="文件 ID">
          {{ currentFile.fileId }}
        </el-descriptions-item>
        <el-descriptions-item label="文件名">{{ currentFile.name }}</el-descriptions-item>
        <el-descriptions-item label="用户 ID">{{ currentFile.userId }}</el-descriptions-item>
        <el-descriptions-item label="大小">{{
          formatBytes(currentFile.size)
        }}</el-descriptions-item>
        <el-descriptions-item label="文件内容">
          <el-tag :type="currentFile.contentAvailable ? 'success' : 'info'">
            {{ currentFile.contentAvailable ? '可下载' : '已清空' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="文件校验值">
          {{ currentFile.sha256 || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="过期时间">
          {{
            currentFile.expiresAt
              ? utcToShanghaiTime(currentFile.expiresAt, 'YYYY-MM-DD HH:mm')
              : '-'
          }}
        </el-descriptions-item>
        <el-descriptions-item label="附加信息">
          <pre class="private-file-detail-json">{{
            JSON.stringify(currentFile.metadata || {}, null, 2)
          }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<style scoped>
  .private-file-detail-json {
    max-height: 240px;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
