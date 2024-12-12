<route lang="yaml">
meta:
  title: 账户变更记录
</route>

<script lang="ts" setup>
import ApiUsre from '@/api/modules/user';
import type { UserStatus } from '@/constants/index';
import {
  RECHARGE_TYPE_MAP,
  RECHARGE_TYPE_OPTIONS,
  USER_STATUS_MAP,
  USER_STATUS_TYPE_MAP,
} from '@/constants/index';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import type { FormInstance, FormRules } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formRef = ref<FormInstance>();
const total = ref(0);
const loading = ref(false);

const formInline = reactive({
  userId: '',
  rechargeType: '',
  packageId: '',
  page: 1,
  size: 15,
});

type RechargeType = keyof typeof RECHARGE_TYPE_MAP;

interface BanlanceInfo {
  drawMjCount: number;
  createdAt: Date;
  updatedAt: Date;
  id: number;
  model4Count: number;
  useChats: number;
  usePaints: number;
  useTokens: number;
  userId: number;
  model3Count: number;
}

interface UserItem {
  avatar: string;
  email: string;
  id: number;
  inviteCode: string;
  lastLoginIp: string;
  role: string;
  sign: string;
  status: 1 | 2 | 3;
  username: string;
  createdAt: Date;
  updatedAt: Date;
  balanceInfo: BanlanceInfo;
}

const rules = reactive<FormRules>({
  model3Count: [
    { required: true, message: '请填写赠送基础模型额度', trigger: 'blur' },
  ],
  model4Count: [
    { required: true, message: '请填写赠送高级模型额度', trigger: 'blur' },
  ],
  drawMjCount: [
    { required: true, message: '请填写赠送绘画积分额度', trigger: 'blur' },
  ],
});

const userList = ref();
const tableData = ref<UserItem[]>([]);

async function queryAllAccountLog() {
  try {
    loading.value = true;
    const res = await ApiUsre.queryUserAccountLog(formInline);
    const { rows, count } = res.data;
    loading.value = false;
    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

async function handlerSearchUser(val: string) {
  const res = await ApiUsre.queryAllUser({ size: 30, keyword: val });
  userList.value = res.data.rows;
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryAllAccountLog();
}

onMounted(() => queryAllAccountLog());
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">账户明细</div>
      </template>
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="用户名称" prop="userId">
          <el-select
            v-model="formInline.userId"
            filterable
            clearable
            remote
            reserve-keyword
            placeholder="昵称|手机号|邮箱[模糊搜索]"
            remote-show-suffix
            :remote-method="handlerSearchUser"
            style="width: 200px"
          >
            <el-option
              v-for="item in userList"
              :key="item.id"
              :label="item.username"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="充值类型" prop="rechargeType">
          <el-select
            v-model="formInline.rechargeType"
            placeholder="请选择充值类型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in RECHARGE_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryAllAccountLog">
            查询
          </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>

    <page-main style="width: 100%">
      <el-table
        v-loading="loading"
        border
        :data="tableData"
        style="width: 100%"
        size="large"
      >
        <el-table-column prop="avatar" label="用户头像" width="120" fixed>
          <template #default="scope">
            <el-avatar :src="scope.row.avatar" />
          </template>
        </el-table-column>
        <el-table-column prop="username" label="用户名称" width="150" fixed />
        <el-table-column prop="userId" label="用户ID" width="80" />
        <el-table-column prop="uid" label="订单ID" width="130" />
        <el-table-column
          prop="email"
          label="用户邮箱"
          width="250"
          align="left"
        />
        <el-table-column
          prop="balanceInfo.useModel4Count"
          label="充值类型"
          width="160"
          align="center"
        >
          <template #default="scope">
            <el-tag type="success">
              {{
                scope.row?.rechargeType
                  ? RECHARGE_TYPE_MAP[scope.row?.rechargeType as RechargeType]
                  : '---'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="model3Count"
          label="基础模型额度"
          width="120"
          align="center"
        />
        <el-table-column
          prop="model4Count"
          label="高级模型额度"
          width="120"
          align="center"
        />
        <el-table-column
          prop="drawMjCount"
          label="绘画余额额度"
          width="120"
          align="center"
        />
        <el-table-column label="额度有效期" width="170" align="center">
          <template #default="scope">
            <el-tag type="success">
              {{ scope.row?.days <= 0 ? '永久时效' : `${scope.row?.days}天` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="status"
          label="用户状态"
          width="120"
          align="center"
        >
          <template #default="{ row }: { row: { status: UserStatus } }">
            <el-tag :type="USER_STATUS_TYPE_MAP[row.status]">
              {{ USER_STATUS_MAP[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="createdAt"
          label="充值时间"
          width="200"
          align="center"
        >
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[15, 30, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryAllAccountLog"
          @current-change="queryAllAccountLog"
        />
      </el-row>
    </page-main>
  </div>
</template>
