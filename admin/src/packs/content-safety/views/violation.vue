<script lang="ts" setup>
  import ApiBadWords from '../api/badWords';
  import ApiUser from '@/api/modules/user';
  import { renderSafeMarkdown } from '@/utils/safeMarkdown';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useRemoteUserOptions from '@/utils/composables/useRemoteUserOptions';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import type { FilterField } from '@/components/FilterBar/types';

  const docUrl = computed(() => getDocUrl('/configuration/security/violation-records'));
  usePageDoc(docUrl);
  import {
    USER_STATUS_CHANGE_OPTIONS,
    USER_STATUS_MAP,
    USER_STATUS_TAG_TYPE,
    UserStatus,
  } from '@/constants';
  import { TYPEORIGINLIST } from '../constants';

  // 后端违规记录仅支持 userId 精确过滤：关键词位用远程搜索把昵称/手机号/邮箱换成 userId
  const { fetchUserOptions, resolveUserLabel } = useRemoteUserOptions();
  const keywordSearch = { fetchOptions: fetchUserOptions, resolveLabel: resolveUserLabel };

  const filterFields: FilterField[] = [
    {
      key: 'typeOriginCn',
      label: '检测平台',
      type: 'select',
      placeholder: '请选择检测平台',
      options: TYPEORIGINLIST,
    },
  ];

  const formInline = reactive({
    userId: '',
    typeOriginCn: '',
    page: 1,
    size: 20,
  });

  // 支持从用户详情页钻取链接（?userId=xxx）带入用户过滤
  const route = useRoute();
  {
    const drillDownUserId = Number(route.query.userId);
    if (Number.isInteger(drillDownUserId) && drillDownUserId > 0) {
      formInline.userId = drillDownUserId as any;
    }
  }

  const visible = ref(false);
  const form = reactive({
    status: 0,
    id: 0,
  });

  function handleUpdateStatus(row: any) {
    // 用户状态挂在 userInfo 上；后端 DTO 要求 status 为数值
    form.status = Number(row?.userInfo?.status ?? 0);
    form.id = row.userId;
    visible.value = true;
  }

  const submitting = ref(false);
  async function handlerUpateViolationStatus() {
    if (submitting.value) return;
    submitting.value = true;
    try {
      await ApiUser.updateUserStatus(form);
      ElMessage.success('用户状态已更新');
      visible.value = false;
      queryAllLog();
    } finally {
      submitting.value = false;
    }
  }

  /** typeCn / words 由后端以 JSON 字符串保存；脏数据不能让整张表渲染失败 */
  function parseList(raw?: string): string[] {
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value.map(String) : [String(value)];
    } catch {
      return [raw];
    }
  }

  const {
    loading,
    total,
    tableData,
    query: queryAllLog,
    search: searchViolation,
  } = usePagedTable(async () => {
    const res = await ApiBadWords.queryViolation(formInline);
    return res.data;
  }, formInline);
  onMounted(() => {
    queryAllLog();
  });
</script>

<template>
  <div>
    <page-panel>
      <FilterBar
        v-model:keyword="formInline.userId"
        keyword-placeholder="搜索用户：昵称 / 手机号 / 邮箱"
        :keyword-search="keywordSearch"
        :fields="filterFields"
        :filters="formInline"
        class="mb-5"
        @update:filters="Object.assign(formInline, $event)"
        @apply="searchViolation"
        @reset="searchViolation"
      />
      <el-table
        v-loading="loading"
        border
        :data="tableData"
        style="width: 100%"
        :tooltip-options="{}"
      >
        <el-table-column fixed label="用户" min-width="220">
          <template #default="scope">
            <UserCell
              v-if="scope.row.userInfo"
              :user="{ id: scope.row.userId, ...scope.row.userInfo }"
              secondary="email"
              :link="!scope.row.userInfo.isVisitor && !scope.row.userInfo.isDeleted"
            />
            <span v-else class="text-gray-400">未知用户</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="用户状态" width="120">
          <template #default="{ row }: { row: any }">
            <el-tag
              :type="
                row.userInfo.isVisitor
                  ? 'warning'
                  : USER_STATUS_TAG_TYPE[row.userInfo.status as UserStatus]
              "
              v-if="row.userInfo"
            >
              <!-- 优先使用后端返回的 statusText，特别是针对游客 -->
              {{
                row.userInfo.isVisitor
                  ? row.userInfo.statusText || '游客'
                  : USER_STATUS_MAP[row.userInfo.status as UserStatus]
              }}
            </el-tag>
            <span v-else>未知用户</span>
          </template>
        </el-table-column>
        <el-table-column prop="userInfo.violationCount" label="累计次数" width="90" align="right" />
        <el-table-column label="违规类型" min-width="160">
          <template #default="scope">
            <span v-if="parseList(scope.row?.typeCn).length">
              {{ parseList(scope.row?.typeCn).join(' / ') }}
            </span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column label="违规关键词" min-width="160">
          <template #default="scope">
            <span v-if="parseList(scope.row?.words).length">
              {{ parseList(scope.row?.words).join(' / ') }}
            </span>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="typeOriginCn" label="检测来源" width="120" />
        <el-table-column prop="content" label="违规内容" width="200">
          <template #default="scope">
            <el-popover placement="top" :width="400" trigger="click">
              <template #reference>
                <div class="violation-answer">
                  {{ scope.row.content }}
                </div>
              </template>
              <div
                class="violation-answer-container"
                v-html="renderSafeMarkdown(scope.row.content || '')"
              />
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="违规时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="120">
          <template #default="scope">
            <el-button
              v-if="scope.row.userInfo && !scope.row.userInfo.isVisitor"
              link
              type="primary"
              @click="handleUpdateStatus(scope.row)"
            >
              变更状态
            </el-button>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
      </el-table>
      <TablePager
        v-model:page="formInline.page"
        v-model:size="formInline.size"
        :total="total"
        @change="queryAllLog"
      />
    </page-panel>

    <el-dialog v-model="visible" title="变更用户状态" width="500px">
      <el-form :model="form" label-width="auto">
        <el-form-item label="用户状态">
          <el-select v-model="form.status" placeholder="请选择用户状态" style="width: 160px">
            <el-option
              v-for="item in USER_STATUS_CHANGE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <DialogFooter
          :loading="submitting"
          @cancel="visible = false"
          @confirm="handlerUpateViolationStatus"
        />
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  .violation-answer {
    width: 100%;
    max-height: 40px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    cursor: pointer;
  }

  .violation-answer-container {
    max-height: 500px;
    overflow: overlay;
  }
</style>
