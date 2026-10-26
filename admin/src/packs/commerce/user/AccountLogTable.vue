<script lang="ts" setup>
  import apiUserBalance from '../api/userBalance';
  import { RECHARGE_TYPE_MAP, ALL_ACCOUNT_TYPE_OPTIONS } from '../constants';
  import { creditChangeTone, formatCreditChange, signedCreditChange } from '../accountLog';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { onMounted, reactive, watch } from 'vue';
  import useRemoteUserOptions from '@/utils/composables/useRemoteUserOptions';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import type { FilterField } from '@/components/FilterBar/types';

  /**
   * 账户明细表(商业包):积分每次增减的流水。
   * 传 userId 时固定为该用户(用户详情「权益与消费」页签),隐藏用户搜索与用户列;
   * 不传时为全站流水,关键词位用远程搜索把昵称 / 手机号 / 邮箱换成 userId。
   */
  const props = defineProps<{ userId?: number }>();

  const { fetchUserOptions, resolveUserLabel } = useRemoteUserOptions();
  const keywordSearch = { fetchOptions: fetchUserOptions, resolveLabel: resolveUserLabel };

  const filterFields: FilterField[] = [
    {
      key: 'rechargeType',
      label: '变更类型',
      type: 'select',
      placeholder: '请选择变更类型',
      options: ALL_ACCOUNT_TYPE_OPTIONS,
    },
  ];

  const formInline = reactive({
    userId: props.userId ? String(props.userId) : '',
    rechargeType: '',
    packageId: '',
    page: 1,
    size: 20,
  });

  type RechargeType = keyof typeof RECHARGE_TYPE_MAP;

  interface AccountLogRow {
    id: number;
    userId: number;
    username: string;
    nickname: string;
    avatar?: string;
    rechargeType: number;
    credits: number;
    uid: string;
    extent: string;
    relatedId: number;
    createdAt: string;
  }

  const {
    loading,
    total,
    tableData,
    query: queryAccountLog,
    search: searchAccountLog,
  } = usePagedTable<AccountLogRow>(async () => {
    const res = await apiUserBalance.queryUserAccountLog(formInline);
    return res.data;
  }, formInline);

  /** 积分带正负号,方向靠符号和文字颜色表达(都按带符号的数值),不用色块 */
  const CREDIT_TONE_COLOR = {
    income: 'var(--el-color-success)',
    expense: 'var(--el-color-danger)',
    neutral: 'var(--el-text-color-regular)',
  } as const;
  function creditChange(row: AccountLogRow) {
    return signedCreditChange(row?.rechargeType, row?.credits);
  }

  watch(
    () => props.userId,
    (id) => {
      formInline.userId = id ? String(id) : '';
      searchAccountLog();
    },
  );

  onMounted(() => queryAccountLog());
</script>

<template>
  <div>
    <FilterBar
      v-if="!userId"
      v-model:keyword="formInline.userId"
      keyword-placeholder="搜索用户：昵称 / 手机号 / 邮箱"
      :keyword-search="keywordSearch"
      :fields="filterFields"
      :filters="formInline"
      class="mb-4"
      @update:filters="Object.assign(formInline, $event)"
      @apply="searchAccountLog"
      @reset="searchAccountLog"
    />
    <FilterBar
      v-else
      :fields="filterFields"
      :filters="formInline"
      class="mb-4"
      hide-keyword
      @update:filters="Object.assign(formInline, $event)"
      @apply="searchAccountLog"
      @reset="searchAccountLog"
    />
    <el-table v-loading="loading" border :data="tableData" style="width: 100%">
      <el-table-column v-if="!userId" label="用户" width="220" fixed>
        <template #default="scope">
          <UserCell
            :user="{
              id: scope.row.userId,
              username: scope.row.username,
              nickname: scope.row.nickname,
              avatar: scope.row.avatar,
            }"
          />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="scope">
          {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
        </template>
      </el-table-column>
      <el-table-column prop="rechargeType" label="变更类型" width="130">
        <template #default="scope">
          <el-tag v-if="scope.row?.rechargeType" type="info">
            {{ RECHARGE_TYPE_MAP[scope.row.rechargeType as RechargeType] ?? '其他' }}
          </el-tag>
          <span v-else class="text-gray-400">—</span>
        </template>
      </el-table-column>
      <el-table-column label="变更积分" width="110" align="right">
        <template #default="scope">
          <span
            class="font-mono font-medium"
            :style="{
              color: CREDIT_TONE_COLOR[creditChangeTone(creditChange(scope.row as AccountLogRow))],
            }"
          >
            {{ formatCreditChange(creditChange(scope.row as AccountLogRow)) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="extent" label="变更说明" min-width="220">
        <template #default="scope">
          <span v-if="scope.row.extent" class="text-gray-600">{{ scope.row.extent }}</span>
          <span v-else class="text-gray-400">—</span>
        </template>
      </el-table-column>
      <el-table-column label="记录 ID" width="150">
        <template #default="scope">
          <span v-if="scope.row.relatedId || scope.row.uid" class="font-mono text-gray-600">
            {{ scope.row.relatedId || scope.row.uid }}
          </span>
          <span v-else class="text-gray-400">—</span>
        </template>
      </el-table-column>
    </el-table>
    <TablePager
      v-model:page="formInline.page"
      v-model:size="formInline.size"
      :total="total"
      @change="queryAccountLog"
    />
  </div>
</template>
