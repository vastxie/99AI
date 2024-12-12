<route lang="yaml">
meta:
  title: 用户管理
</route>

<script lang="ts" setup>
import ApiUsre from '@/api/modules/user';
import type { UserStatus } from '@/constants/index';
import { USER_STATUS_OPTIONS } from '@/constants/index';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formRef = ref<FormInstance>();
const total = ref(0);
const visible = ref(false);
const loading = ref(false);
const visibleCrami = ref(false);
const activeUserId = ref(0);
const cramiRef = ref<FormInstance>();

const form = reactive({
  status: '0',
  id: 0,
});

const formCrami = reactive({
  model3Count: 0,
  model4Count: 0,
  drawMjCount: 0,
});

const formInline = reactive({
  username: '',
  email: '',
  status: '',
  phone: '',
  page: 1,
  size: 15,
});

// 定义 USER_STATUS_MAP
const USER_STATUS_MAP: { [key in UserStatus]: string } = {
  0: 'Inactive',
  1: 'Active',
  2: 'Banned',
  3: 'Suspended',
};

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
  realName: string;
  idCard: string;
}

const rules = reactive<FormRules>({
  model3Count: [
    { required: true, message: '请填写调整的基础模型额度', trigger: 'blur' },
  ],
  model4Count: [
    { required: true, message: '请填写调整的高级模型额度', trigger: 'blur' },
  ],
  drawMjCount: [
    { required: true, message: '请填写调整的绘画积分额度', trigger: 'blur' },
  ],
});

const tableData = ref<UserItem[]>([]);

async function queryAllUserList() {
  try {
    loading.value = true;
    const res = await ApiUsre.queryAllUser(formInline);
    const { rows, count } = res.data;
    loading.value = false;
    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

function handleUpdateStatus(row: UserItem) {
  visible.value = true;
  form.status = row.status.toString();
  form.id = row.id;
}

function handleSendCrami(row: UserItem) {
  visibleCrami.value = true;
  activeUserId.value = row.id;
}

async function handlerUpateUserStatus() {
  const res: any = await ApiUsre.updateUserStatus(form);
  res.success && ElMessage({ type: 'success', message: '变更用户状态成功！' });
  visible.value = false;
  queryAllUserList();
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryAllUserList();
}

async function handlerResetUserPass(row: any) {
  const { id, email } = row;
  const res: any = await ApiUsre.resetUserPassword({ id });
  res.success &&
    ElMessage({
      type: 'success',
      message: `重置用户[${email}密码为初始密码为[123456]完成！`,
    });
}

function handlerCloseDialog(formEl: FormInstance | undefined) {
  activeUserId.value = 0;
  formEl?.resetFields();
}

async function handlerSubmitSend(formEl: FormInstance | undefined) {
  formEl?.validate(async (valid) => {
    if (!valid) {
      return;
    }
    await ApiUsre.sendUserCrami({ ...formCrami, userId: activeUserId.value });
    ElMessage.success('调整成功！');
    visibleCrami.value = false;
    queryAllUserList();
  });
}

onMounted(() => queryAllUserList());
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">用户信息列表</div>
      </template>
      <!-- <template #content>
        <div class="text-sm/6">
          <div>
            所有工单只可审核一次，请谨慎操作，打款请人工打款，确定打款后点击审核通过即可。
          </div>
        </div>
      </template> -->
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="用户名称" prop="username">
          <el-input
            v-model="formInline.username"
            placeholder="用户姓名[模糊搜索]"
            clearable
          />
        </el-form-item>
        <el-form-item label="用户邮箱" prop="email">
          <el-input
            v-model="formInline.email"
            placeholder="用户邮箱[模糊搜索]"
            clearable
          />
        </el-form-item>
        <el-form-item label="手机号码" prop="phone">
          <el-input
            v-model="formInline.phone"
            placeholder="手机号码[模糊搜索]"
            clearable
          />
        </el-form-item>
        <el-form-item label="用户状态" prop="status">
          <el-select
            v-model="formInline.status"
            placeholder="请选择用户状态"
            style="width: 160px"
            clearable
          >
            <el-option
              v-for="item in USER_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryAllUserList"> 查询 </el-button>
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
        <el-table-column prop="avatar" label="用户头像" fixed width="120">
          <template #default="scope">
            <el-avatar :src="scope.row.avatar" />
          </template>
        </el-table-column>
        <el-table-column fixed prop="username" label="用户名称" width="150" />
        <el-table-column
          prop="email"
          label="用户邮箱"
          width="250"
          align="left"
        />
        <el-table-column
          prop="phone"
          label="用户手机号"
          width="250"
          align="left"
        >
          <template #default="scope">
            {{ scope.row?.phone || '未绑定手机号' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="realName"
          label="真实姓名"
          width="150"
          align="center"
        >
          <template #default="scope">
            {{ scope.row?.realName || '未实名认证' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="idCard"
          label="身份证号"
          width="200"
          align="center"
        >
          <template #default="scope">
            {{ scope.row?.idCard || '未实名认证' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="status"
          label="用户状态"
          width="120"
          align="center"
        >
          <template #default="{ row }: { row: { status: UserStatus } }">
            <el-tag type="success">
              {{ USER_STATUS_MAP[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="balanceInfo.model3Count"
          label="基础模型"
          width="120"
          align="center"
        />
        <el-table-column
          prop="balanceInfo.model4Count"
          label="高级模型"
          width="120"
          align="center"
        />
        <el-table-column
          prop="balanceInfo.drawMjCount"
          label="绘画余额"
          width="120"
          align="center"
        />expirationTime
        <el-table-column
          prop="balanceInfo.drawMjCount"
          label="会员到期时间"
          width="170"
          align="center"
        >
          <template #default="scope">
            <el-tag type="success">
              {{
                scope.row?.balanceInfo?.expirationTime
                  ? utcToShanghaiTime(
                      new Date(
                        scope.row?.balanceInfo?.expirationTime
                      ).toString()
                    )
                  : '非会员'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="balanceInfo.memberModel3Count"
          label="基础模型[会员]"
          width="120"
          align="center"
        />
        <el-table-column
          prop="balanceInfo.memberModel4Count"
          label="高级模型[会员]"
          width="120"
          align="center"
        />
        <el-table-column
          prop="balanceInfo.memberDrawMjCount"
          label="绘画余额[会员]"
          width="120"
          align="center"
        />
        <el-table-column
          prop="balanceInfo.useModel3Count"
          label="已用基础模型"
          width="160"
          align="center"
        >
          <template #default="scope">
            {{
              `${scope.row.balanceInfo?.useModel3Count || 0}次 | ${
                scope.row.balanceInfo?.useModel3Token || 0
              } Token`
            }}
          </template>
        </el-table-column>
        <el-table-column
          prop="balanceInfo.useModel4Count"
          label="已用高级模型"
          width="160"
          align="center"
        >
          <template #default="scope">
            {{
              `${scope.row.balanceInfo?.useModel4Count || 0}次 | ${
                scope.row.balanceInfo?.useModel4Token || 0
              } Token`
            }}
          </template>
        </el-table-column>
        <el-table-column
          prop="balanceInfo.useDrawMjToken"
          label="已用绘画积分"
          width="160"
          align="center"
        >
          <template #default="scope">
            {{ `${scope.row.balanceInfo?.useDrawMjToken || 0} Token` }}
          </template>
        </el-table-column>
        <!-- <el-table-column prop="lastLoginIp" label="最后登录IP" width="140" align="center" /> -->
        <el-table-column
          prop="createdAt"
          label="注册时间"
          width="200"
          align="center"
        >
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="250" align="center">
          <template #default="scope">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleUpdateStatus(scope.row)"
            >
              修改状态
            </el-button>
            <el-popconfirm
              title="确认重置此用户密码为【123456】?"
              confirm-button-text="确认重置"
              @confirm="handlerResetUserPass(scope.row)"
            >
              <template #reference>
                <el-button link type="danger"> 重置密码 </el-button>
              </template>
            </el-popconfirm>
            <el-button
              link
              type="primary"
              size="small"
              @click="handleSendCrami(scope.row)"
            >
              调整积分
            </el-button>
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
          @size-change="queryAllUserList"
          @current-change="queryAllUserList"
        />
      </el-row>
    </page-main>

    <el-dialog v-model="visible" title="变更用户状态" width="500px">
      <el-form :model="form" :inline="true">
        <el-form-item label="用户状态" label-width="90px">
          <el-select
            v-model="form.status"
            placeholder="请选择用户状态"
            style="width: 160px"
            clearable
          >
            <el-option
              v-for="item in USER_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handlerUpateUserStatus">
            确认变更
          </el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <el-dialog
      v-model="visibleCrami"
      title="调整用户积分（赠送/扣除）"
      width="450px"
      @close="handlerCloseDialog(cramiRef)"
    >
      <el-form
        ref="cramiRef"
        :model="formCrami"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="基础积分" prop="modelLimits">
          <div class="input-with-text">
            <el-input-number
              v-model="formCrami.model3Count"
              :max="99999"
              :min="-99999"
              :step="1"
              step-strictly
              class="input-number"
              style="margin-right: 10px"
            />
          </div>
        </el-form-item>
        <el-form-item label="高级积分" prop="modelLimits">
          <div class="input-with-text">
            <el-input-number
              v-model="formCrami.model4Count"
              :max="99999"
              :min="-99999"
              :step="1"
              step-strictly
              class="input-number"
              style="margin-right: 10px"
            />
          </div>
        </el-form-item>
        <el-form-item label="绘画积分" prop="modelLimits">
          <div class="input-with-text">
            <el-input-number
              v-model="formCrami.drawMjCount"
              :max="99999"
              :min="-99999"
              :step="1"
              step-strictly
              class="input-number"
              style="margin-right: 10px"
            />
          </div>
        </el-form-item>

        <!-- <el-form-item class="flex justify-end" /> -->
      </el-form>
      <template #footer>
        <el-button @click="visibleCrami = false"> 取消 </el-button>
        <el-button type="primary" @click="handlerSubmitSend(cramiRef)">
          确认调整
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
