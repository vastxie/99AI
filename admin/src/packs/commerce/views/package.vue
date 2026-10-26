<script lang="ts" setup>
  import ApiPackage from '../api/package';
  import { IS_OPTIONS, PACKAGE_TYPE_OPTIONS } from '../constants';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import type { FilterField } from '@/components/FilterBar/types';

  type PlanType = 'membership' | 'credit_pack';
  type BillingCycle = 'day' | 'week' | 'month' | 'year' | 'one_time';
  type Status = keyof typeof IS_OPTIONS;

  interface PackageVariant {
    id?: number | null;
    name?: string | null;
    des?: string | null;
    planKey: string;
    planName: string;
    planDescription?: string | null;
    planIcon?: string | null;
    planType: PlanType;
    featureText?: string | null;
    variantName: string;
    billingCycle: BillingCycle;
    billingCycleCount: number;
    variantOrder?: number | null;
    isDefaultVariant?: number | null;
    badgeText?: string | null;
    price?: number | null;
    priceUsd?: number | null;
    order?: number | null;
    status?: number | null;
    weight?: number | null;
    days?: number | null;
    credits: number | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
  }

  interface PlanGroup {
    groupKey: string;
    planKey: string;
    planName: string;
    planDescription: string;
    planIcon: string;
    planType: PlanType;
    featureText: string;
    badgeText: string;
    order: number;
    variants: PackageVariant[];
  }

  const PLAN_TYPE_OPTIONS = [
    { value: 'membership', label: '会员' },
    { value: 'credit_pack', label: '积分' },
  ];

  const BILLING_CYCLE_OPTIONS = [
    { value: 'day', label: '天' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
    { value: 'year', label: '年' },
    { value: 'one_time', label: '一次性' },
  ];

  const filterFields: FilterField[] = [
    {
      key: 'status',
      label: '套餐状态',
      type: 'select',
      placeholder: '请选择套餐状态',
      options: PACKAGE_TYPE_OPTIONS,
    },
    {
      key: 'planType',
      label: '方案类型',
      type: 'select',
      placeholder: '请选择方案类型',
      options: PLAN_TYPE_OPTIONS,
    },
  ];

  const docUrl = computed(() => getDocUrl('/configuration/payment/package-settings'));
  usePageDoc(docUrl);

  // 会员方案不支持“一次性”周期（会被规范化回“月”），选项里直接隐藏避免误选
  const billingCycleOptions = computed(() =>
    formPackage.planType === 'credit_pack'
      ? BILLING_CYCLE_OPTIONS
      : BILLING_CYCLE_OPTIONS.filter((item) => item.value !== 'one_time'),
  );

  const formPackageRef = ref<FormInstance>();
  const visible = ref(false);
  const activePackageId = ref(0);

  const formInline = reactive({
    name: '',
    planType: '',
    status: '',
    page: 1,
    size: 100,
  });

  function createDefaultPackageForm() {
    return {
      name: '',
      des: '',
      planKey: '',
      planName: '',
      planDescription: '',
      planIcon: '',
      planType: 'membership' as PlanType,
      featureText: '',
      variantName: '',
      billingCycle: 'month' as BillingCycle,
      billingCycleCount: 1,
      variantOrder: 100,
      isDefaultVariant: 0,
      badgeText: '',
      price: null as number | null,
      priceUsd: null as number | null,
      order: 100,
      status: 1,
      weight: 0,
      days: 30,
      credits: 0,
    };
  }

  const formPackage = reactive(createDefaultPackageForm());

  const rules = reactive<FormRules>({
    planKey: [{ required: true, message: '请填写方案标识', trigger: 'blur' }],
    planName: [{ required: true, message: '请填写方案名称', trigger: 'blur' }],
    planType: [{ required: true, message: '请选择方案类型', trigger: 'change' }],
    variantName: [{ required: true, message: '请填写规格名称', trigger: 'blur' }],
    billingCycle: [{ required: true, message: '请选择周期', trigger: 'change' }],
    billingCycleCount: [{ required: true, message: '请填写周期数量', trigger: 'blur' }],
    price: [{ required: true, message: '请填写规格价格', trigger: 'blur' }],
    order: [{ required: true, message: '请填写方案排序', trigger: 'blur' }],
    status: [{ required: true, message: '请选择规格状态', trigger: 'change' }],
    credits: [{ required: true, message: '请填写积分额度', trigger: 'blur' }],
    weight: [{ required: true, message: '请填写会员等级', trigger: 'blur' }],
  });

  const groupedPlans = computed<PlanGroup[]>(() => {
    const map = new Map<string, PlanGroup>();
    tableData.value.forEach((item) => {
      const key = `${item.planType}:${item.planKey}`;
      if (!map.has(key)) {
        map.set(key, {
          groupKey: key,
          planKey: item.planKey,
          planName: item.planName,
          planDescription: item.planDescription || '',
          planIcon: item.planIcon || '',
          planType: item.planType,
          featureText: item.featureText || '',
          badgeText: item.badgeText || '',
          order: Number(item.order || 0),
          variants: [],
        });
      }
      const group = map.get(key)!;
      if (!group.featureText && item.featureText) {
        group.featureText = item.featureText;
      }
      if (!group.badgeText && item.badgeText) {
        group.badgeText = item.badgeText;
      }
      group.variants.push(item);
    });
    return Array.from(map.values()).toSorted((a, b) => b.order - a.order);
  });

  const dialogTitle = computed(() => (activePackageId.value ? '编辑规格' : '新增规格'));

  function planTypeLabel(value?: string) {
    return PLAN_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '—';
  }

  function billingCycleLabel(value?: string, count?: number) {
    const label = BILLING_CYCLE_OPTIONS.find((item) => item.value === value)?.label || value || '—';
    if (value === 'one_time') return '一次性';
    return `${count || 1}${label}`;
  }

  function normalizeQueryParams() {
    return Object.fromEntries(
      Object.entries(formInline).filter(([, value]) => value !== '' && value !== null),
    );
  }

  function calculateMembershipDays(cycle: BillingCycle, count: number) {
    const daysByCycle: Partial<Record<BillingCycle, number>> = {
      day: 1,
      week: 7,
      month: 30,
      year: 365,
    };
    return (daysByCycle[cycle] || 0) * (Number(count) || 1);
  }

  const {
    loading,
    total,
    tableData,
    query: queryAllUserList,
    search: searchPackage,
  } = usePagedTable<PackageVariant>(async () => {
    const res = await ApiPackage.queryAllPackage(normalizeQueryParams());
    return res.data;
  }, formInline);

  onMounted(() => {
    queryAllUserList();
  });

  async function handleDeletePackage(id: number) {
    await ApiPackage.delPackage({ id });
    ElMessage.success('规格已删除');
    queryAllUserList();
  }

  function normalizeFormByPlanType() {
    if (formPackage.planType === 'credit_pack') {
      formPackage.billingCycle = 'one_time';
      formPackage.billingCycleCount = 1;
      formPackage.days = 0;
      formPackage.weight = 0;
    } else if (formPackage.billingCycle === 'one_time') {
      formPackage.billingCycle = 'month';
      formPackage.days = calculateMembershipDays(
        formPackage.billingCycle,
        formPackage.billingCycleCount,
      );
    } else {
      formPackage.days = calculateMembershipDays(
        formPackage.billingCycle,
        formPackage.billingCycleCount,
      );
    }
  }

  watch(
    () => [formPackage.planType, formPackage.billingCycle, formPackage.billingCycleCount],
    normalizeFormByPlanType,
  );

  function resetPackageForm(row?: Partial<PackageVariant>) {
    Object.assign(formPackage, createDefaultPackageForm(), row || {});
    delete (formPackage as any).createdAt;
    delete (formPackage as any).updatedAt;
    delete (formPackage as any).deletedAt;
    delete (formPackage as any).id;
    normalizeFormByPlanType();
  }

  function handleUpdatePackage(row: PackageVariant) {
    activePackageId.value = row.id as number;
    visible.value = true;
    nextTick(() => {
      formPackageRef.value?.resetFields();
      resetPackageForm(row);
    });
  }

  function handleCreatePkg(group?: PlanGroup) {
    activePackageId.value = 0;
    visible.value = true;
    nextTick(() => {
      formPackageRef.value?.resetFields();
      resetPackageForm(
        group
          ? {
              planKey: group.planKey,
              planName: group.planName,
              planDescription: group.planDescription,
              planIcon: group.planIcon,
              planType: group.planType,
              featureText: group.featureText,
              badgeText: group.badgeText,
              order: group.order,
            }
          : undefined,
      );
    });
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activePackageId.value = 0;
    formEl?.resetFields();
    resetPackageForm();
  }

  const submitting = ref(false);
  async function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (!valid || submitting.value) return;
      normalizeFormByPlanType();
      const submitData = { ...formPackage, name: '', des: '' };
      submitting.value = true;
      try {
        if (activePackageId.value) {
          await ApiPackage.updatePackage({ id: activePackageId.value, ...submitData });
        } else {
          await ApiPackage.createPackage(submitData);
        }
        ElMessage.success('已保存');
        visible.value = false;
        queryAllUserList();
      } finally {
        submitting.value = false;
      }
    });
  }
</script>

<template>
  <div>
    <page-panel>
      <FilterBar
        v-model:keyword="formInline.name"
        keyword-placeholder="搜索方案或规格"
        :fields="filterFields"
        :filters="formInline"
        class="mb-5"
        @update:filters="Object.assign(formInline, $event)"
        @apply="searchPackage"
        @reset="searchPackage"
      >
        <el-button type="primary" @click="handleCreatePkg()">
          <AppIcon name="i-lucide:plus" class="mr-1" />
          新增规格
        </el-button>
      </FilterBar>
      <el-table
        v-loading="loading"
        :data="groupedPlans"
        row-key="groupKey"
        default-expand-all
        border
        style="width: 100%"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="py-3 pl-10 pr-4">
              <el-table :data="row.variants" border size="default">
                <el-table-column prop="variantName" label="规格" min-width="120" />
                <el-table-column label="周期" width="100">
                  <template #default="scope">
                    {{ billingCycleLabel(scope.row.billingCycle, scope.row.billingCycleCount) }}
                  </template>
                </el-table-column>
                <el-table-column prop="price" label="价格 (¥)" width="100" align="right" />
                <el-table-column prop="priceUsd" label="价格 ($)" width="100" align="right">
                  <template #default="scope">
                    <span v-if="scope.row.priceUsd">{{ scope.row.priceUsd }}</span>
                    <span v-else class="text-gray-400">—</span>
                  </template>
                </el-table-column>
                <el-table-column prop="days" label="有效期" width="110">
                  <template #default="scope">
                    {{ scope.row.days > 0 ? `${scope.row.days}天` : '不限会员期' }}
                  </template>
                </el-table-column>
                <el-table-column prop="credits" label="积分" width="100" align="right" />
                <el-table-column prop="weight" label="等级" width="80" align="right" />
                <el-table-column prop="status" label="状态" width="90">
                  <template #default="scope">
                    <el-tag :type="scope.row.status === 1 ? 'success' : 'info'">
                      {{ IS_OPTIONS[scope.row.status as Status] }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="isDefaultVariant" label="默认" width="90">
                  <template #default="scope">
                    <el-tag v-if="scope.row.isDefaultVariant === 1" type="success">默认</el-tag>
                    <span v-else class="text-gray-400">—</span>
                  </template>
                </el-table-column>
                <el-table-column prop="createdAt" label="创建时间" width="180">
                  <template #default="scope">
                    {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
                  </template>
                </el-table-column>
                <el-table-column fixed="right" label="操作" width="170">
                  <template #default="scope">
                    <el-button
                      link
                      type="primary"
                      size="small"
                      @click="handleUpdatePackage(scope.row as PackageVariant)"
                    >
                      编辑
                    </el-button>
                    <el-popconfirm
                      title="删除后不可恢复，确认删除此规格？"
                      width="240"
                      @confirm="handleDeletePackage(scope.row.id)"
                    >
                      <template #reference>
                        <el-button link type="danger" size="small"> 删除 </el-button>
                      </template>
                    </el-popconfirm>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="planName" label="方案" min-width="160">
          <template #default="{ row }">
            <div class="font-medium">{{ row.planName }}</div>
            <div class="text-xs text-gray-400">{{ row.planKey }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="planType" label="类型" width="120">
          <template #default="{ row }">
            <el-tag type="info">{{ planTypeLabel(row.planType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="规格数" width="90">
          <template #default="{ row }">{{ row.variants.length }}</template>
        </el-table-column>
        <el-table-column prop="featureText" label="用户端权益" min-width="280">
          <template #default="{ row }">
            <span class="line-clamp-2 whitespace-pre-line">{{ row.featureText || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleCreatePkg(row as PlanGroup)">
              新增规格
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <TablePager
        v-model:page="formInline.page"
        v-model:size="formInline.size"
        :total="total"
        @change="queryAllUserList"
      />
    </page-panel>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="1000px"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
      >
        <el-divider content-position="left">方案信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="方案标识" prop="planKey">
              <el-input v-model="formPackage.planKey" placeholder="如 pro、team、credits" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="方案名称" prop="planName">
              <el-input v-model="formPackage.planName" placeholder="如 专业版" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="方案类型" prop="planType">
              <el-select v-model="formPackage.planType" class="w-full">
                <el-option
                  v-for="item in PLAN_TYPE_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="角标" prop="badgeText">
              <el-input v-model="formPackage.badgeText" placeholder="如 推荐、省 20%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="权益列表" prop="featureText">
              <el-input
                v-model="formPackage.featureText"
                type="textarea"
                :rows="4"
                placeholder="用户端展示的权益列表，每行一条"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="方案说明" prop="planDescription">
              <el-input
                v-model="formPackage.planDescription"
                type="textarea"
                :rows="2"
                placeholder="可选，用户端方案卡片的简短说明"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">规格信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="规格名称" prop="variantName">
              <el-input v-model="formPackage.variantName" placeholder="如 月付、年付、1000积分" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="启用" prop="status">
              <el-switch v-model="formPackage.status" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="默认规格" prop="isDefaultVariant">
              <el-switch
                v-model="formPackage.isDefaultVariant"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>

          <el-col :span="8">
            <el-form-item label="周期" prop="billingCycle">
              <el-select
                v-model="formPackage.billingCycle"
                class="w-full"
                :disabled="formPackage.planType === 'credit_pack'"
              >
                <el-option
                  v-for="item in billingCycleOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="formPackage.planType !== 'credit_pack'" :span="8">
            <el-form-item label="周期数量" prop="billingCycleCount">
              <el-input-number v-model="formPackage.billingCycleCount" :min="1" :max="1200" />
            </el-form-item>
          </el-col>

          <el-col :span="8">
            <el-form-item label="价格(CNY)" prop="price">
              <el-input-number v-model="formPackage.price" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="价格(USD)" prop="priceUsd">
              <el-input-number v-model="formPackage.priceUsd" :min="0" :precision="2" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="积分额度" prop="credits">
              <el-input-number v-model="formPackage.credits" :min="0" />
            </el-form-item>
          </el-col>

          <el-col :span="8">
            <el-form-item label="会员等级" prop="weight">
              <div class="w-full">
                <el-input-number
                  v-model="formPackage.weight"
                  :min="0"
                  :disabled="formPackage.planType === 'credit_pack'"
                />
                <div class="mt-1 text-xs leading-5 text-gray-400">
                  用于判断会员高低，数字越大等级越高；积分方案不生效。
                </div>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="方案排序" prop="order">
              <el-input-number v-model="formPackage.order" :min="0" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="规格排序" prop="variantOrder">
              <el-input-number v-model="formPackage.variantOrder" :min="0" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <DialogFooter
          :loading="submitting"
          @cancel="visible = false"
          @confirm="handlerSubmit(formPackageRef)"
        />
      </template>
    </el-dialog>
  </div>
</template>
