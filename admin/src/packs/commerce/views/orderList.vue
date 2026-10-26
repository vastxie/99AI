<script lang="ts" setup>
  import ApiOrder from '../api/order';
  import {
    PAY_PLATFORM_LIST,
    PAY_PLATFORM_MAP,
    PAY_STATUS_MAP,
    PAY_STATUS_OPTIONS,
  } from '../constants';
  import { resolvePageAfterRemoval } from '@/utils/pagination';
  import { formatMoney } from '@/utils/format';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useRemoteUserOptions from '@/utils/composables/useRemoteUserOptions';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import type { FilterField } from '@/components/FilterBar/types';

  const docUrl = computed(() => getDocUrl('/configuration/payment/order-list'));
  usePageDoc(docUrl);

  // 后端订单查询仅支持 userId 精确过滤：关键词位用远程搜索把昵称/手机号/邮箱换成 userId
  const { fetchUserOptions, resolveUserLabel } = useRemoteUserOptions();
  const keywordSearch = { fetchOptions: fetchUserOptions, resolveLabel: resolveUserLabel };

  const filterFields: FilterField[] = [
    {
      key: 'platform',
      label: '支付平台',
      type: 'select',
      placeholder: '请选择支付平台',
      options: PAY_PLATFORM_LIST,
    },
    {
      key: 'status',
      label: '支付状态',
      type: 'select',
      placeholder: '请选择支付状态',
      options: PAY_STATUS_OPTIONS,
    },
  ];

  interface GoodsInfo {
    coverImg: string;
    id: number;
    des: string;
    name: string;
  }

  type PayPlatform = keyof typeof PAY_PLATFORM_MAP;

  interface UserInfo {
    username: string;
    id: number;
    email: string;
  }

  interface OrderItem {
    count: number;
    createdAt: Date;
    updatedAt: Date;
    goodsId: number;
    id: number;
    orderId: string;
    paydAt: Date;
    price: number;
    status: number;
    total: number;
    tradeId: string;
    userId: number;
    payPlatform?: string;
    goodsInfo: GoodsInfo;
    userInfo: UserInfo;
  }

  const delLoading = ref(false);
  const totalPrice = ref(0);

  const formInline = reactive({
    userId: '',
    platform: '',
    status: '',
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

  function buildOrderQueryParams() {
    return Object.fromEntries(
      Object.entries(formInline).filter(([, value]) => value !== '' && value != null),
    );
  }

  const {
    loading,
    total,
    tableData,
    query: queryAllOrder,
    search: searchOrder,
  } = usePagedTable<OrderItem>(async ({ isCurrent }) => {
    const res = await ApiOrder.queryAllOrder(buildOrderQueryParams());
    // 合计金额跟着表格走：被更新的查询取代的旧响应不写
    if (isCurrent()) totalPrice.value = Number(res.data.total_price) || 0;
    return res.data;
  }, formInline);

  // 按新筛选条件查询时回到第一页，避免停留在超出新结果范围的页码上
  const deletingOrderId = ref('');
  async function handleDeleteOrder(row: OrderItem) {
    const { orderId } = row;
    deletingOrderId.value = orderId;
    try {
      await ApiOrder.deleteOrder({ orderId });
      ElMessage.success('订单已删除');
      formInline.page = resolvePageAfterRemoval(formInline.page, formInline.size, total.value);
      await queryAllOrder();
    } finally {
      deletingOrderId.value = '';
    }
  }

  async function handleDelNotPayOrder() {
    delLoading.value = true;
    try {
      await ApiOrder.deleteNotPay();
      ElMessage.success('未支付订单已删除');
      formInline.page = 1;
      await queryAllOrder();
    } finally {
      delLoading.value = false;
    }
  }

  /** 1 已支付 success；0 未支付中性；2 失败 danger；3 超时 warning */
  const PAY_STATUS_TAG_TYPE: Record<number, 'success' | 'info' | 'warning' | 'danger'> = {
    0: 'info',
    1: 'success',
    2: 'danger',
    3: 'warning',
  };
  onMounted(() => {
    queryAllOrder();
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
        @apply="searchOrder"
        @reset="searchOrder"
      >
        <div class="flex items-center gap-2">
          <span class="text-sm text-[var(--u-text-secondary)]">总金额</span>
          <span class="font-semibold text-[var(--u-text-primary)]">{{
            formatMoney(totalPrice)
          }}</span>
        </div>
        <el-popconfirm
          title="删除后不可恢复，确认删除所有未支付订单？"
          width="260"
          @confirm="handleDelNotPayOrder"
        >
          <template #reference>
            <el-button type="danger" plain :loading="delLoading">删除所有未支付订单</el-button>
          </template>
        </el-popconfirm>
      </FilterBar>
      <el-table
        v-loading="loading"
        border
        :data="tableData"
        style="width: 100%"
        :tooltip-options="{}"
      >
        <el-table-column fixed prop="orderId" label="订单ID" width="315" />
        <el-table-column label="用户" min-width="220">
          <template #default="scope">
            <UserCell
              v-if="scope.row.userInfo"
              :user="{ ...scope.row.userInfo, id: scope.row.userInfo.id || scope.row.userId }"
              secondary="email"
            />
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="goodsInfo.name" label="套餐名称" width="140" />
        <el-table-column prop="price" label="单价" width="110" align="right">
          <template #default="scope">{{ formatMoney(scope.row.price) }}</template>
        </el-table-column>
        <el-table-column prop="count" label="数量" width="80" align="right" />
        <el-table-column prop="total" label="总价" width="110" align="right">
          <template #default="scope">{{ formatMoney(scope.row.total) }}</template>
        </el-table-column>
        <el-table-column prop="payPlatform" label="支付平台" width="100">
          <template #default="scope">
            {{ PAY_PLATFORM_MAP[scope.row.payPlatform as PayPlatform] || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="支付状态" width="90">
          <template #default="scope">
            <el-tag :type="PAY_STATUS_TAG_TYPE[scope.row.status] || 'info'">
              {{ PAY_STATUS_MAP[scope.row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="订单时间" width="170">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="100">
          <template #default="scope">
            <el-popconfirm
              title="删除后不可恢复，确认删除此订单？"
              width="240"
              @confirm="handleDeleteOrder(scope.row as OrderItem)"
            >
              <template #reference>
                <el-button link type="danger" :loading="deletingOrderId === scope.row.orderId">
                  删除
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <TablePager
        v-model:page="formInline.page"
        v-model:size="formInline.size"
        :total="total"
        @change="queryAllOrder"
      />
    </page-panel>
  </div>
</template>
