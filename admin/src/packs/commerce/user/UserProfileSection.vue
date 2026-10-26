<script lang="ts" setup>
  import { computed } from 'vue';
  import { formatDateTime as formatDate, formatMoney, formatNumber } from '@/utils/format';
  import AccountLogTable from './AccountLogTable.vue';

  /** 用户详情「权益与消费」页签：套餐与额度摘要（服务端 profile.sections.commerce）、沙箱档位与用量、该用户的账户明细 */
  interface CommerceBalance {
    packageId?: number | null;
    packageName?: string;
    planKey?: string;
    planName?: string;
    variantName?: string;
    expirationTime?: string | null;
    isMember: boolean;
    credits: number;
    memberCredits: number;
    availableCredits: number;
    usedCredits: number;
    usedTokens: number;
  }

  interface CommerceSection {
    balance: CommerceBalance;
    entitlement: CommerceBalance;
    orders: {
      totalCount: number;
      paidCount: number;
      totalPaidAmount: number;
      latestPaidAt?: string | null;
      platformTop: Array<{ platform: string; count: number; amount: number }>;
      recent: unknown[];
    };
    links: { orders: string; accountLogs: string };
    sandbox?: CommerceSandbox;
  }

  interface SandboxUsage {
    execMs: number;
    count: number;
  }

  /**
   * 沙箱档位（plan：套餐方案档；default：默认档；env：沿用环境变量；unavailable：配置无效或读取失败，
   * 此时该用户的沙箱操作会被拒绝）与命令用量，只记录不扣积分
   */
  interface CommerceSandbox {
    source: 'plan' | 'default' | 'env' | 'unavailable';
    planKey: string | null;
    tier: Partial<
      Record<
        | 'memoryMb'
        | 'cpus'
        | 'diskMaxMb'
        | 'workspaceMaxMb'
        | 'execTimeoutSec'
        | 'maxAccountSandboxes',
        number
      >
    > | null;
    last7Days: SandboxUsage;
    last30Days: SandboxUsage;
  }

  const props = defineProps<{
    profile: { basic?: { id?: number } } | null;
    section?: CommerceSection | null;
  }>();
  const router = useRouter();

  const section = computed(() => props.section ?? null);
  const balance = computed(() => section.value?.balance);
  const entitlement = computed(() => section.value?.entitlement);
  const orders = computed(() => section.value?.orders);
  const userId = computed(() => Number(props.profile?.basic?.id || 0));

  const tiles = computed(() => [
    {
      label: '可用额度',
      value: formatNumber(balance.value?.availableCredits),
      helper: `普通 ${formatNumber(balance.value?.credits)} · 会员 ${formatNumber(balance.value?.memberCredits)}`,
    },
    {
      label: '会员状态',
      value: entitlement.value?.isMember ? '会员有效' : '非会员',
      helper: entitlement.value?.isMember
        ? `到期 ${formatDate(entitlement.value?.expirationTime, '—')}`
        : '未开通套餐',
    },
    {
      label: '当前套餐',
      value: entitlement.value?.planName || entitlement.value?.packageName || '—',
      helper: entitlement.value?.variantName || '无规格',
    },
    {
      label: '累计实付',
      value: formatMoney(orders.value?.totalPaidAmount),
      helper: `已支付 ${formatNumber(orders.value?.paidCount)} / 共 ${formatNumber(orders.value?.totalCount)} 笔`,
    },
    {
      label: '已用额度',
      value: formatNumber(balance.value?.usedCredits),
      helper: `已用 Token ${formatNumber(balance.value?.usedTokens)}`,
    },
  ]);

  const TIER_PARTS = [
    ['memoryMb', '内存', ' MB'],
    ['cpus', 'CPU', ' 核'],
    ['diskMaxMb', '磁盘', ' MB'],
    ['workspaceMaxMb', '临时工作区', ' MB'],
    ['execTimeoutSec', '超时', ' 秒'],
    ['maxAccountSandboxes', '并发', ''],
  ] as const;
  const SANDBOX_SOURCE_LABELS = {
    plan: '套餐方案档',
    default: '默认档',
    env: '环境变量默认',
    unavailable: '暂不可用',
  };

  function formatDuration(ms?: number) {
    const seconds = Math.round(Number(ms || 0) / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
    return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
  }

  const sandbox = computed(() => section.value?.sandbox);
  const sandboxTiles = computed(() => {
    const tier = sandbox.value?.tier;
    const parts = TIER_PARTS.filter(([key]) => tier?.[key] !== undefined).map(
      ([key, label, unit]) => `${label} ${tier?.[key]}${unit}`,
    );
    return [
      {
        label: '沙箱档位',
        value: SANDBOX_SOURCE_LABELS[sandbox.value?.source ?? 'env'],
        helper:
          sandbox.value?.source === 'unavailable'
            ? '档位配置无效或读取失败，沙箱操作会被拒绝'
            : [sandbox.value?.source === 'plan' ? sandbox.value.planKey : '', parts.join(' · ')]
                .filter(Boolean)
                .join(' · ') || '沿用环境变量',
      },
      {
        label: '近 7 天沙箱命令',
        value: formatNumber(sandbox.value?.last7Days.count),
        helper: `执行耗时 ${formatDuration(sandbox.value?.last7Days.execMs)}`,
      },
      {
        label: '近 30 天沙箱命令',
        value: formatNumber(sandbox.value?.last30Days.count),
        helper: `执行耗时 ${formatDuration(sandbox.value?.last30Days.execMs)}`,
      },
    ];
  });

  function openLink(path?: string) {
    if (path) router.push(path);
  }
</script>

<template>
  <div>
    <SectionHead title="权益与消费" description="当前套餐、额度余额与订单摘要">
      <el-button size="small" @click="openLink(section?.links?.orders)">查看订单</el-button>
    </SectionHead>
    <el-empty v-if="!section" description="暂无权益数据" :image-size="64" />
    <template v-else>
      <StatTiles :items="tiles" :min-width="160" />
      <div class="mt-3 text-xs text-[var(--u-text-placeholder)]">
        最近支付：{{ formatDate(orders?.latestPaidAt, '暂无支付') }}
      </div>
    </template>

    <template v-if="sandbox">
      <el-divider class="my-5" />
      <SectionHead
        title="沙箱资源"
        description="新建沙箱使用的档位（运行中的沙箱沿用创建时的资源）与最近的命令用量，只记录不扣积分"
      />
      <StatTiles :items="sandboxTiles" :min-width="160" />
    </template>

    <el-divider class="my-5" />

    <SectionHead title="账户明细" description="该用户积分的每一次增减，正数入账、负数消费" />
    <AccountLogTable v-if="userId" :user-id="userId" />
  </div>
</template>
