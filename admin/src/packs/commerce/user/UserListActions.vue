<script lang="ts" setup>
  import type { FormInstance } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, reactive, ref } from 'vue';
  import { formatMoney } from '@/utils/format';
  import apiPackage from '../api/package';
  import apiUserBalance from '../api/userBalance';

  /** 「用户管理」列表里商业包的行操作：调整积分、赠送套餐（自带两个弹窗） */
  interface UserRow {
    id: number;
    username: string;
    nickname?: string;
    billing?: { credits?: number } | null;
  }

  interface GrantPackageOption {
    value: number;
    label: string;
    detail: string;
    days: number;
    credits: number;
  }

  const props = defineProps<{ row: UserRow; refresh: () => void }>();

  const visibleRecharge = ref(false);
  const visibleGrantPackage = ref(false);
  const rechargeRef = ref<FormInstance>();
  const grantPackageSubmitting = ref(false);
  const rechargeSubmitting = ref(false);
  const grantPackageLoading = ref(false);
  const activeUserLabel = ref('');
  const formGrantPackage = reactive({ packageId: 0 });
  const grantPackageOptions = ref<GrantPackageOption[]>([]);
  // 当前积分与目标积分（用户直接编辑目标值，后端按差值调整）
  const currentUserBalance = reactive({ credits: 0 });
  const targetBalance = reactive({ credits: 0 });
  // 目标积分的下限：后台不能扣出欠款；对话结算透支后余额为负时，下限是当前余额（只能补、不能再扣）
  const creditsFloor = computed(() => Math.min(0, currentUserBalance.credits));

  const selectedGrantPackage = computed(() =>
    grantPackageOptions.value.find((item) => item.value === formGrantPackage.packageId),
  );

  function userLabel() {
    return props.row.nickname
      ? `${props.row.username}（${props.row.nickname}）`
      : props.row.username;
  }

  function handleRecharge() {
    visibleRecharge.value = true;
    activeUserLabel.value = userLabel();
    currentUserBalance.credits = props.row.billing?.credits || 0;
    targetBalance.credits = currentUserBalance.credits;
  }

  async function loadGrantPackageOptions() {
    try {
      grantPackageLoading.value = true;
      const res = await apiPackage.queryPackagePlans({ planType: 'membership' });
      const rows = res?.data?.rows || [];
      grantPackageOptions.value = rows.flatMap((plan: any) => {
        const variants = plan?.variants || [];
        return variants.map((variant: any) => {
          const label =
            [plan?.planName, variant?.variantName].filter(Boolean).join(' ').trim() ||
            plan?.planName ||
            variant?.name ||
            `套餐 #${variant?.id}`;
          const detailParts = [];
          if (variant?.badgeText) {
            detailParts.push(variant.badgeText);
          }
          detailParts.push(variant?.days > 0 ? `${variant.days} 天` : '永久');
          detailParts.push(`${variant?.credits || 0} 积分`);
          if (variant?.price !== undefined && variant?.price !== null) {
            detailParts.push(formatMoney(variant.price));
          }
          return {
            value: Number(variant.id),
            label,
            detail: detailParts.join(' · '),
            days: Number(variant?.days || 0),
            credits: Number(variant?.credits || 0),
          };
        });
      });

      if (!formGrantPackage.packageId && grantPackageOptions.value.length > 0) {
        formGrantPackage.packageId = grantPackageOptions.value[0].value;
      }
    } catch {
      // 请求层已统一提示错误
    } finally {
      grantPackageLoading.value = false;
    }
  }

  function handleGrantPackage() {
    visibleGrantPackage.value = true;
    activeUserLabel.value = userLabel();
    formGrantPackage.packageId = 0;
    grantPackageOptions.value = [];
    loadGrantPackageOptions();
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    formEl?.resetFields();
  }

  function handlerCloseGrantPackageDialog() {
    activeUserLabel.value = '';
    formGrantPackage.packageId = 0;
    grantPackageOptions.value = [];
  }

  function stepCredits(delta: number) {
    targetBalance.credits = Math.max(creditsFloor.value, (targetBalance.credits || 0) + delta);
  }

  async function handlerSubmitSend(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (!valid || rechargeSubmitting.value) {
        return;
      }
      // 计算实际的增减值（后端按差值调整：正数充值、负数扣减普通积分）
      const delta = targetBalance.credits - currentUserBalance.credits;
      if (delta === 0) {
        ElMessage.info('积分未发生变化');
        visibleRecharge.value = false;
        return;
      }
      // 扣费 / 充值都会立即写入账户明细，必须二次确认
      try {
        await ElMessageBox.confirm(
          `将为 ${activeUserLabel.value} ${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 积分，调整后为 ${targetBalance.credits}。`,
          '确认调整积分',
          { type: 'warning', confirmButtonText: '确认调整', cancelButtonText: '取消' },
        );
      } catch {
        return;
      }
      rechargeSubmitting.value = true;
      try {
        await apiUserBalance.rechargeUser({ credits: delta, userId: props.row.id });
        ElMessage.success('积分已调整');
        visibleRecharge.value = false;
        props.refresh();
      } finally {
        rechargeSubmitting.value = false;
      }
    });
  }

  async function handlerSubmitGrantPackage() {
    if (!formGrantPackage.packageId) {
      ElMessage.warning('请选择要赠送的套餐');
      return;
    }
    try {
      grantPackageSubmitting.value = true;
      await apiUserBalance.grantPackage({
        userId: props.row.id,
        packageId: formGrantPackage.packageId,
      });
      ElMessage.success('赠送套餐成功！');
      visibleGrantPackage.value = false;
      props.refresh();
    } finally {
      grantPackageSubmitting.value = false;
    }
  }
</script>

<template>
  <el-button link type="primary" @click="handleRecharge">调整积分</el-button>
  <el-button link type="primary" @click="handleGrantPackage">赠送套餐</el-button>

  <el-dialog
    v-model="visibleRecharge"
    title="调整用户积分"
    width="600px"
    @close="handlerCloseDialog(rechargeRef)"
  >
    <div class="mb-4 p-3 bg-gray-50 rounded">
      <div class="text-sm text-gray-600 mb-2">当前积分</div>
      <div class="text-sm">
        <span class="text-gray-500">积分：</span>
        <span class="font-bold">{{ currentUserBalance.credits }}</span>
      </div>
    </div>

    <el-form ref="rechargeRef" :model="targetBalance" label-width="auto">
      <el-form-item label="积分">
        <div class="flex items-center gap-2">
          <el-button size="small" @click="stepCredits(-100)">-100</el-button>
          <el-button size="small" @click="stepCredits(-10)">-10</el-button>
          <el-input-number
            v-model="targetBalance.credits"
            :min="creditsFloor"
            :max="99999999"
            :step="1"
            step-strictly
            class="mx-2"
            style="width: 150px"
          />
          <el-button size="small" @click="stepCredits(10)">+10</el-button>
          <el-button size="small" @click="stepCredits(100)">+100</el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <DialogFooter
        confirm-text="确认调整"
        :loading="rechargeSubmitting"
        @cancel="visibleRecharge = false"
        @confirm="handlerSubmitSend(rechargeRef)"
      />
    </template>
  </el-dialog>

  <el-dialog
    v-model="visibleGrantPackage"
    title="赠送套餐"
    width="700px"
    @close="handlerCloseGrantPackageDialog"
  >
    <div class="mb-4 rounded bg-gray-50 px-4 py-3 text-sm text-gray-600">
      当前用户：<span class="font-medium text-gray-900">{{ activeUserLabel }}</span>
      ，选择套餐后会直接发放会员权益。
    </div>

    <el-form :model="formGrantPackage" label-width="auto" v-loading="grantPackageLoading">
      <el-form-item label="套餐">
        <el-select
          v-model="formGrantPackage.packageId"
          placeholder="请选择要赠送的会员套餐"
          style="width: 100%"
          filterable
        >
          <el-option
            v-for="item in grantPackageOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          >
            <div class="flex flex-col py-1">
              <span class="font-medium">{{ item.label }}</span>
              <span class="text-xs text-gray-400">{{ item.detail }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item v-if="selectedGrantPackage" label="权益预览">
        <div class="rounded bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <div>
            有效期：{{ selectedGrantPackage.days > 0 ? `${selectedGrantPackage.days} 天` : '永久' }}
          </div>
          <div>会员积分：{{ selectedGrantPackage.credits }}</div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <DialogFooter
        confirm-text="确认赠送"
        :loading="grantPackageSubmitting"
        @cancel="visibleGrantPackage = false"
        @confirm="handlerSubmitGrantPackage"
      />
    </template>
  </el-dialog>
</template>
