<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';
  import { computed, onMounted, ref } from 'vue';
  import apiPackage from '../api/package';

  /**
   * 支付财务 → 沙箱资源：按套餐方案（planKey）给用户沙箱分配资源档位，服务端配置键 sandboxPlanPolicies。
   * 没有有效套餐的用户和访客用默认档；留空的项沿用服务端 SANDBOX_* 环境变量，整表为空即不按套餐区分。
   */
  const docUrl = computed(() => getDocUrl('/configuration/payment/sandbox-resources'));
  usePageDoc(docUrl);

  const CONFIG_KEY = 'sandboxPlanPolicies';
  /** 套餐列表接口单页上限 */
  const PAGE_SIZE = 100;
  const DEFAULT_ROW = '';
  const FIELDS = [
    { key: 'memoryMb', label: '内存（MB）', min: 128, max: 65536, step: 128, precision: 0 },
    { key: 'cpus', label: 'CPU（核）', min: 0.25, max: 64, step: 0.25, precision: 2 },
    { key: 'diskMaxMb', label: '磁盘（MB）', min: 256, max: 1048576, step: 1024, precision: 0 },
    {
      key: 'workspaceMaxMb',
      label: '临时工作区（MB）',
      min: 16,
      max: 102400,
      step: 64,
      precision: 0,
    },
    { key: 'execTimeoutSec', label: '单次超时（秒）', min: 5, max: 3600, step: 5, precision: 0 },
    { key: 'maxAccountSandboxes', label: '每账号并发', min: 1, max: 20, step: 1, precision: 0 },
  ] as const;

  type FieldKey = (typeof FIELDS)[number]['key'];
  type Tier = Partial<Record<FieldKey, number>>;
  interface StoredPolicies {
    default?: Tier;
    plans?: Record<string, Tier>;
  }
  interface TierRow {
    /** 空串表示默认档 */
    key: string;
    name: string;
    hint: string;
    tier: Tier;
  }

  const rows = ref<TierRow[]>([]);
  const saving = ref(false);
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField } = useConfigAutoSave({
    read: () => serialize(),
    // 整表编辑、点「保存」才提交：保存失败时保留表格里的修改，方便改正后重试，不回滚界面
    write: () => {},
  });

  function parseStored(raw: unknown): StoredPolicies {
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  /** 上架与下架的方案都列出：已购买下架方案的会员仍按它的方案标识取档位 */
  async function listPlans(): Promise<Map<string, { name: string; enabled: boolean }>> {
    const plans = new Map<string, { name: string; enabled: boolean }>();
    for (const status of [1, 0]) {
      for (let page = 1; ; page++) {
        const res = await apiPackage.queryAllPackage({ page, size: PAGE_SIZE, status });
        const items: any[] = res.data?.rows ?? [];
        for (const item of items) {
          if (!item.planKey || plans.has(item.planKey)) continue;
          plans.set(item.planKey, {
            name: item.planName || item.name || item.planKey,
            enabled: status === 1,
          });
        }
        if (items.length < PAGE_SIZE || page * PAGE_SIZE >= Number(res.data?.count ?? 0)) break;
      }
    }
    return plans;
  }

  async function queryAllConfig() {
    try {
      const [configRes, plans] = await Promise.all([
        apiConfig.queryConfig({ keys: [CONFIG_KEY] }),
        listPlans(),
      ]);
      const stored = parseStored(configRes.data?.[CONFIG_KEY]);
      const storedPlans = stored.plans ?? {};
      rows.value = [
        {
          key: DEFAULT_ROW,
          name: '默认档',
          hint: '没有有效套餐的用户与访客',
          tier: { ...stored.default },
        },
        ...[...plans].map(([key, plan]) => ({
          key,
          name: plan.name,
          hint: plan.enabled ? key : `${key} · 已下架`,
          tier: { ...storedPlans[key] },
        })),
        ...Object.keys(storedPlans)
          .filter((key) => !plans.has(key))
          .map((key) => ({
            key,
            name: key,
            hint: '没有对应的套餐方案',
            tier: { ...storedPlans[key] },
          })),
      ];
      initFromConfig(configRes.data ?? {}, [CONFIG_KEY]);
    } catch {
      markLoadFailed();
    }
  }

  function serialize(): string {
    let defaultTier: Tier | undefined;
    const plans: Array<[string, Tier]> = [];
    for (const row of rows.value) {
      const tier: Tier = {};
      for (const { key } of FIELDS) {
        const value = row.tier[key];
        if (typeof value === 'number' && Number.isFinite(value)) tier[key] = value;
      }
      if (!Object.keys(tier).length) continue;
      if (row.key === DEFAULT_ROW) defaultTier = tier;
      else plans.push([row.key, tier]);
    }
    if (!defaultTier && !plans.length) return '';
    // Object.fromEntries 生成自有键：__proto__ 之类的方案标识也能原样保存
    return JSON.stringify({
      ...(defaultTier ? { default: defaultTier } : {}),
      plans: Object.fromEntries(plans),
    });
  }

  async function save() {
    if (saving.value) return;
    saving.value = true;
    try {
      await saveField(CONFIG_KEY, serialize());
    } finally {
      saving.value = false;
    }
  }

  onMounted(queryAllConfig);
</script>

<template>
  <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
    <page-panel>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm text-[var(--u-text-secondary)]">
          留空的项沿用服务端环境变量 SANDBOX_*，整表留空即不按套餐区分
        </span>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
      <el-alert type="info" :closable="false" show-icon class="mb-4">
        登录用户每人一台沙箱电脑，多个对话共用。磁盘是用户的持久存储，调大在下次开机时扩容，调小不会缩小已分配的磁盘，只按新容量拒绝写入文件。内存、CPU
        与临时工作区在开机时确定：修改档位，或用户购买、到期后，运行中的沙箱闲置回收、下次开机时生效。临时工作区只用于访客与未启用持久磁盘的站点，须小于内存；每账号并发只对访客生效，且只能在
        SANDBOX_MAX_ACCOUNT_ACTIVE 以内收紧。
      </el-alert>
      <el-table :data="rows" border>
        <el-table-column label="方案" min-width="180">
          <template #default="{ $index }">
            <div>{{ rows[$index].name }}</div>
            <div class="text-xs text-[var(--u-text-placeholder)]">{{ rows[$index].hint }}</div>
          </template>
        </el-table-column>
        <el-table-column
          v-for="field in FIELDS"
          :key="field.key"
          :label="field.label"
          min-width="140"
          align="right"
        >
          <template #default="{ $index }">
            <el-input-number
              v-model="rows[$index].tier[field.key]"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :precision="field.precision"
              :controls="false"
              placeholder="默认"
              class="!w-full"
            />
          </template>
        </el-table-column>
      </el-table>
    </page-panel>
  </ConfigLoadGuard>
</template>
