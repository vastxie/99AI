<script lang="ts" setup>
  import ApiUser from '@/api/modules/user';
  import { USER_STATUS_MAP, USER_STATUS_TAG_TYPE } from '@/constants';
  import { channelLabel, packUserDetailSections, providerLabel } from '@/packs';
  import { resolvePackComponent } from '@/core/packs/resolve';
  import { formatDateTime as formatDate, formatNumber } from '@/utils/format';
  import useUserStore from '@/store/modules/user';
  // 按需引入 echarts：仅注册柱状图与用到的组件，避免全量打包
  import * as echarts from 'echarts/core';
  import { BarChart } from 'echarts/charts';
  import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';

  echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

  type RangeValue = '7d' | '30d' | '90d' | 'all';
  type MetricValue = 'tokens' | 'requests';

  interface UserProfile {
    basic: {
      id: number;
      uid?: string;
      username: string;
      nickname?: string;
      avatar?: string;
      role: string;
      status: number;
      statusText?: string;
      emailMasked?: string;
      phoneMasked?: string;
      lastLoginIpMasked?: string;
      violationCount: number;
      createdAt: string;
      updatedAt: string;
    };
    usageSummary: {
      range: RangeValue;
      chatCount: number;
      requestCount: number;
      messageCount: number;
      conversationCount: number;
      activeConversationCount: number;
      activeDays: number;
      totalTokens: number;
      totalCredits: number;
      lastChatAt?: string | null;
      modelTop: Array<{ model: string; count: number; tokens: number }>;
      channelTop: Array<{ channel: string; count: number }>;
    };
    usageChart: {
      buckets: Array<{
        time: string;
        series: Array<{
          key: string;
          label: string;
          cost: number;
          tokens: number;
          requests: number;
        }>;
      }>;
      totals: { cost: number; tokens: number; requests: number };
      unavailableMetrics?: string[];
      unavailableReason?: string;
    };
    recentEvents: Array<{
      type: string;
      title: string;
      summary: string;
      occurredAt: string;
      link?: string;
    }>;
    links: Record<string, string>;
    identities: UserProfileIdentity[];
    botChannels: UserProfileBotChannel[];
    security?: {
      available: boolean;
      userStatus: number;
      violationCount: number;
      statusText?: string;
      signals: Array<{
        level: 'success' | 'warning' | 'info' | 'danger';
        title: string;
        summary: string;
      }>;
    };
    /** 扩展包贡献的片段，按片段 id 归组；包未装载时没有该键 */
    sections?: Record<string, unknown>;
  }

  interface UserProfileIdentity {
    id: number;
    provider: string;
    providerLabel?: string;
    scene?: string;
    providerUserIdMasked?: string;
    linkKeyMasked?: string;
    emailMasked?: string;
    emailVerified?: boolean;
    phoneMasked?: string;
    nickname?: string;
    avatar?: string;
    status: string;
    boundAt?: string | null;
    lastLoginAt?: string | null;
  }

  interface UserProfileBotChannel {
    id: number;
    channel: string;
    channelLabel?: string;
    status: number;
    statusText: string;
    channelUserIdMasked?: string;
    channelGroupId?: number | null;
    boundAt?: string | null;
    updatedAt?: string | null;
  }

  interface IdentityChannelRow {
    id: string;
    type: 'identity' | 'botChannel';
    typeLabel: string;
    sourceLabel: string;
    accountMasked: string;
    statusText: string;
    statusType: 'success' | 'warning' | 'info' | 'danger';
    lastActiveAt?: string | null;
    lastActiveLabel: string;
  }

  const route = useRoute();
  const router = useRouter();
  const account = useUserStore();
  const loading = ref(true);
  const profile = ref<UserProfile | null>(null);
  const range = ref<RangeValue>('30d');
  const metric = ref<MetricValue>('tokens');
  const chartRef = ref<HTMLElement>();
  let usageChart: echarts.ECharts | undefined;

  // 页签跟着地址走（?tab=<片段 id>），便于从其它页面直达某个扩展包片段
  const activeTab = ref(
    typeof route.query.tab === 'string' && route.query.tab ? route.query.tab : 'overview',
  );
  watch(activeTab, (tab) => {
    router.replace({ query: { ...route.query, tab: tab === 'overview' ? undefined : tab } });
    nextTick(() => usageChart?.resize());
  });

  const userId = computed(() => Number(route.params.id || 0));
  const basic = computed(() => profile.value?.basic);
  const usageSummary = computed(() => profile.value?.usageSummary);
  const usageChartData = computed(() => profile.value?.usageChart);
  const security = computed(() => profile.value?.security);
  const identityAndChannelRows = computed<IdentityChannelRow[]>(() => {
    if (!profile.value) return [];
    const identityRows = (profile.value.identities || []).map((identity) => ({
      id: `identity-${identity.id}`,
      type: 'identity' as const,
      typeLabel: '登录身份',
      sourceLabel: providerLabel(identity.provider),
      accountMasked: identity.providerUserIdMasked || '—',
      statusText: formatIdentityStatus(identity.status),
      statusType: identity.status === 'active' ? ('success' as const) : ('warning' as const),
      lastActiveAt: identity.lastLoginAt,
      lastActiveLabel: '最近登录',
    }));
    const channelRows = (profile.value.botChannels || []).map((channel) => ({
      id: `bot-${channel.id}`,
      type: 'botChannel' as const,
      typeLabel: 'Bot 通道',
      sourceLabel: channelLabel(channel.channel),
      accountMasked: channel.channelUserIdMasked || '—',
      statusText: channel.statusText || String(channel.status),
      statusType: channel.status === 1 ? ('success' as const) : ('warning' as const),
      lastActiveAt: channel.updatedAt,
      lastActiveLabel: '最近同步',
    }));
    return [...identityRows, ...channelRows];
  });

  const metricLabelMap: Record<MetricValue, string> = {
    tokens: 'Tokens',
    requests: '请求数',
  };

  const rangeOptions = [
    { label: '7 天', value: '7d' },
    { label: '30 天', value: '30d' },
    { label: '90 天', value: '90d' },
    { label: '全部', value: 'all' },
  ];

  const metricOptions = [
    { label: 'Tokens', value: 'tokens' },
    { label: '请求数', value: 'requests' },
  ];

  const rangeLabel = computed(
    () => rangeOptions.find((item) => item.value === range.value)?.label || '30 天',
  );

  const overviewTiles = computed(() => [
    {
      label: `${rangeLabel.value}请求`,
      value: formatNumber(usageSummary.value?.requestCount ?? usageSummary.value?.chatCount),
      helper: `${formatNumber(usageSummary.value?.activeDays)} 个活跃日`,
    },
    {
      label: `${rangeLabel.value} Tokens`,
      value: formatNumber(usageSummary.value?.totalTokens),
      helper: '所有模型请求合计',
    },
    {
      label: '会话',
      value: formatNumber(usageSummary.value?.conversationCount),
      helper: `活跃 ${formatNumber(usageSummary.value?.activeConversationCount)} 个`,
    },
    {
      label: '最近对话',
      value: usageSummary.value?.lastChatAt
        ? formatDate(usageSummary.value.lastChatAt).slice(5, 16)
        : '—',
      helper: usageSummary.value?.lastChatAt
        ? formatDate(usageSummary.value.lastChatAt).slice(0, 4)
        : '暂无对话',
    },
    {
      label: '内容过滤命中',
      value: formatNumber(security.value?.violationCount ?? basic.value?.violationCount),
      helper: '累计次数',
    },
  ]);

  const securityTiles = computed(() => [
    {
      label: '账号状态',
      value: security.value?.statusText || formatStatus(basic.value?.status),
      helper: '当前状态',
    },
    {
      label: '内容过滤命中',
      value: formatNumber(security.value?.violationCount ?? basic.value?.violationCount),
      helper: '累计次数',
    },
  ]);

  // 扩展包贡献的页签（权益与消费、内容安全等），按服务端 profile.sections 的键传数据
  const packTabs = packUserDetailSections().map((section) => ({
    id: section.id,
    title: section.title,
    view: resolvePackComponent(section.id, section.component),
  }));

  const topModels = computed(() => usageSummary.value?.modelTop?.slice(0, 5) || []);
  const topChannels = computed(() => usageSummary.value?.channelTop?.slice(0, 5) || []);

  const displayName = computed(() => {
    if (!basic.value) return '用户详情';
    return basic.value.nickname || basic.value.username;
  });
  const initial = computed(() => displayName.value.slice(0, 1).toUpperCase());
  const statusTagType = computed(
    () => USER_STATUS_TAG_TYPE[basic.value?.status as keyof typeof USER_STATUS_TAG_TYPE] || 'info',
  );
  const ROLE_LABELS: Record<string, string> = {
    super: '超级管理员',
    admin: '管理员',
    viewer: '普通用户',
    visitor: '访客',
  };
  const roleLabel = computed(
    () => ROLE_LABELS[basic.value?.role || ''] || basic.value?.role || '—',
  );
  const metaChips = computed(() => {
    const items: Array<{ label: string; value: string }> = [
      { label: 'ID', value: String(basic.value?.id ?? '—') },
    ];
    if (basic.value?.uid) items.push({ label: 'UID', value: basic.value.uid });
    if (basic.value?.emailMasked) items.push({ label: '邮箱', value: basic.value.emailMasked });
    if (basic.value?.phoneMasked) items.push({ label: '手机', value: basic.value.phoneMasked });
    if (basic.value?.lastLoginIpMasked) {
      items.push({ label: '最近 IP', value: basic.value.lastLoginIpMasked });
    }
    if (basic.value?.createdAt) {
      items.push({ label: '注册', value: formatDate(basic.value.createdAt).slice(0, 10) });
    }
    return items;
  });

  let profileRequestId = 0;
  async function loadProfile() {
    if (!userId.value) {
      ElMessage.error('用户 ID 无效');
      return;
    }
    const requestId = ++profileRequestId;
    loading.value = true;
    try {
      const res = await ApiUser.getUserProfile(userId.value, {
        range: range.value,
        recentLimit: 10,
      });
      // 丢弃迟到的旧响应，避免快速切换时间范围时旧数据覆盖新选择
      if (requestId !== profileRequestId) return;
      profile.value = res.data;
      await nextTick();
      renderUsageChart();
    } catch {
      // 请求层已提示错误，这里只保证空态与 loading 复位
    } finally {
      if (requestId === profileRequestId) {
        loading.value = false;
      }
    }
  }

  function renderUsageChart() {
    if (!chartRef.value || !usageChartData.value) return;
    if (!usageChart) {
      usageChart = echarts.init(chartRef.value);
    }

    const buckets = usageChartData.value.buckets || [];
    const xAxis = buckets.map((bucket) => bucket.time);
    const seriesKeys = Array.from(
      new Set(buckets.flatMap((bucket) => bucket.series.map((item) => item.key))),
    );
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--u-text-secondary').trim();
    const lineColor = styles.getPropertyValue('--u-border-light').trim();

    usageChart.setOption({
      color: ['#4176e6', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'],
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        type: 'scroll',
        textStyle: { color: textColor },
      },
      grid: {
        top: 36,
        right: 12,
        bottom: 24,
        left: 48,
      },
      xAxis: {
        type: 'category',
        data: xAxis,
        axisTick: { alignWithLabel: true },
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: lineColor } },
      },
      yAxis: {
        type: 'value',
        name: metricLabelMap[metric.value],
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: lineColor } },
      },
      series: seriesKeys.map((key) => ({
        name: key,
        type: 'bar',
        stack: 'usage',
        barMaxWidth: 28,
        emphasis: { focus: 'series' },
        data: buckets.map((bucket) => {
          const item = bucket.series.find((series) => series.key === key);
          return item ? item[metric.value] : 0;
        }),
      })),
    });
  }

  function formatStatus(status?: number) {
    if (status === undefined || status === null) return '—';
    return USER_STATUS_MAP[status as keyof typeof USER_STATUS_MAP] || String(status);
  }

  function formatIdentityStatus(status?: string) {
    const statusMap: Record<string, string> = {
      active: '正常',
      disabled: '已禁用',
      unbound: '已解绑',
    };
    return status ? statusMap[status] || status : '—';
  }

  function formatSignalType(level?: string): 'success' | 'warning' | 'info' | 'error' {
    if (level === 'danger') return 'error';
    const supported = ['success', 'warning', 'info', 'error'];
    return supported.includes(level || '')
      ? (level as 'success' | 'warning' | 'info' | 'error')
      : 'info';
  }

  function openLink(path?: string) {
    if (path) router.push(path);
  }

  function goBack() {
    router.push('/user/dashboard');
  }

  watch(range, loadProfile);
  watch(metric, () => nextTick(renderUsageChart));
  watch(
    () => usageChartData.value,
    () => nextTick(renderUsageChart),
  );

  // setOption 不会感知容器尺寸变化，必须调用 echarts 实例的 resize
  function handleWindowResize() {
    usageChart?.resize();
  }

  onMounted(() => {
    loadProfile();
    window.addEventListener('resize', handleWindowResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleWindowResize);
    usageChart?.dispose();
    usageChart = undefined;
  });
</script>

<template>
  <div>
    <page-panel v-loading="loading">
      <el-empty v-if="!profile && !loading" description="用户详情加载失败" />

      <template v-if="profile">
        <div class="profile-head">
          <div class="profile-identity">
            <el-avatar :size="48" :src="basic?.avatar || undefined" class="profile-avatar">
              {{ initial }}
            </el-avatar>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="profile-name">{{ displayName }}</h2>
                <span v-if="basic?.nickname && basic?.username" class="profile-username">
                  @{{ basic.username }}
                </span>
                <el-tag size="small" type="info">{{ roleLabel }}</el-tag>
                <el-tag size="small" :type="statusTagType">
                  {{ basic?.statusText || formatStatus(basic?.status) }}
                </el-tag>
              </div>
              <div class="profile-meta">
                <span v-for="chip in metaChips" :key="chip.label" class="profile-meta-item">
                  <span class="profile-meta-label">{{ chip.label }}</span>
                  <span class="profile-meta-value">{{ chip.value }}</span>
                </span>
              </div>
            </div>
          </div>
          <div class="profile-tools">
            <el-button link type="primary" @click="goBack">返回列表</el-button>
            <el-segmented v-model="range" :options="rangeOptions" size="small" />
            <el-button size="small" :loading="loading" @click="loadProfile">刷新</el-button>
            <el-button size="small" @click="openLink(profile.links.chats)">对话记录</el-button>
            <el-button
              v-if="account.hasRole(['super'])"
              size="small"
              @click="openLink(profile.links.artifacts)"
            >
              私有文件
            </el-button>
          </div>
        </div>
        <StatTiles :items="overviewTiles" :min-width="140" class="mt-4" />
      </template>
    </page-panel>

    <page-panel v-if="profile" class="profile-tabs">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="概览" name="overview">
          <SectionHead title="使用趋势" :description="`${rangeLabel}内的模型请求量与主要入口`">
            <el-segmented v-model="metric" :options="metricOptions" size="small" />
          </SectionHead>
          <div ref="chartRef" class="usage-chart" />
          <el-empty
            v-if="usageChartData?.buckets?.length === 0"
            class="chart-empty"
            description="当前范围暂无模型请求数据"
            :image-size="64"
          />
          <div class="overview-grid mt-2">
            <div class="overview-block">
              <div class="overview-block-title">常用模型</div>
              <el-empty v-if="!topModels.length" description="暂无模型请求" :image-size="48" />
              <div v-else class="overview-list">
                <div v-for="item in topModels" :key="item.model" class="overview-row">
                  <span class="truncate">{{ item.model }}</span>
                  <strong>{{ formatNumber(item.count) }} 次</strong>
                </div>
              </div>
            </div>
            <div class="overview-block">
              <div class="overview-block-title">主要渠道</div>
              <el-empty v-if="!topChannels.length" description="暂无渠道请求" :image-size="48" />
              <div v-else class="overview-list">
                <div v-for="item in topChannels" :key="item.channel" class="overview-row">
                  <span class="truncate">{{ item.channel }}</span>
                  <strong>{{ formatNumber(item.count) }} 次</strong>
                </div>
              </div>
            </div>
            <div class="overview-block overview-block-wide">
              <div class="overview-block-title">最近动态</div>
              <el-empty
                v-if="profile.recentEvents.length === 0"
                description="暂无最近事件"
                :image-size="48"
              />
              <el-timeline v-else class="event-timeline">
                <el-timeline-item
                  v-for="event in profile.recentEvents"
                  :key="`${event.type}-${event.occurredAt}-${event.summary}`"
                  :timestamp="formatDate(event.occurredAt)"
                  placement="top"
                >
                  <div class="event-item">
                    <div class="min-w-0">
                      <span class="event-title">{{ event.title }}</span>
                      <span class="event-summary">{{ event.summary }}</span>
                    </div>
                    <el-button
                      v-if="event.link"
                      link
                      type="primary"
                      size="small"
                      @click="openLink(event.link)"
                    >
                      查看
                    </el-button>
                  </div>
                </el-timeline-item>
              </el-timeline>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane v-for="tab in packTabs" :key="tab.id" :label="tab.title" :name="tab.id">
          <component :is="tab.view" :profile="profile" :section="profile.sections?.[tab.id]" />
        </el-tab-pane>

        <el-tab-pane label="登录身份与通道" name="identities">
          <SectionHead
            title="登录身份与通道"
            description="第三方登录身份与 Bot / 外部消息通道，外部标识已脱敏"
          />
          <el-empty
            v-if="identityAndChannelRows.length === 0"
            description="暂无登录身份或 Bot 通道"
            :image-size="64"
          />
          <el-table v-else :data="identityAndChannelRows" border size="small" row-key="id">
            <el-table-column label="类型" width="110">
              <template #default="scope">
                <el-tag :type="scope.row.type === 'identity' ? 'success' : 'info'" size="small">
                  {{ scope.row.typeLabel }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="sourceLabel" label="来源" min-width="150" />
            <el-table-column prop="accountMasked" label="外部标识" min-width="190" />
            <el-table-column label="状态" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.statusType" size="small">
                  {{ scope.row.statusText }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="最近活动" width="190">
              <template #default="scope">
                <span>{{ formatDate(scope.row.lastActiveAt, '—') }}</span>
                <span class="ml-1 text-xs text-gray-400">{{ scope.row.lastActiveLabel }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="安全与风险" name="security">
          <SectionHead
            title="安全与风险"
            description="账号状态与内容过滤命中；具体违规记录由内容安全扩展包提供"
          />
          <StatTiles :items="securityTiles" :min-width="160" />
          <div class="mt-4">
            <div class="overview-block-title">异常信号</div>
            <el-empty
              v-if="!security?.signals?.length"
              description="暂无明显异常信号"
              :image-size="64"
            />
            <div v-else class="signal-list">
              <el-alert
                v-for="signal in security.signals"
                :key="`${signal.title}-${signal.summary}`"
                :type="formatSignalType(signal.level)"
                :title="signal.title"
                :description="signal.summary"
                :closable="false"
                show-icon
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </page-panel>
  </div>
</template>

<style scoped>
  .profile-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 24px;
  }

  .profile-identity {
    display: flex;
    min-width: 0;
    flex: 1 1 360px;
    align-items: center;
    gap: 14px;
  }

  .profile-avatar {
    flex: none;
    font-size: 20px;
    font-weight: 600;
    color: var(--u-accent-text);
    background: var(--u-accent-soft);
  }

  .profile-name {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 26px;
    color: var(--u-text-primary);
  }

  .profile-username {
    font-size: 13px;
    color: var(--u-text-secondary);
  }

  .profile-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 4px;
    font-size: 12px;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
  }

  .profile-meta-label {
    margin-right: 4px;
    color: var(--u-text-placeholder);
  }

  .profile-meta-value {
    color: var(--u-text-regular);
  }

  .profile-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .profile-tabs :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }

  .usage-chart {
    height: 260px;
    min-height: 260px;
  }

  .chart-empty {
    height: 240px;
    margin-top: -240px;
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .overview-block {
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--u-border-light);
    border-radius: var(--u-radius-m);
  }

  .overview-block-wide {
    grid-column: 1 / -1;
  }

  .overview-block-title {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .overview-list {
    display: grid;
    gap: 6px;
  }

  .overview-row {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    color: var(--u-text-regular);
  }

  .overview-row strong {
    flex: 0 0 auto;
    font-weight: 600;
    color: var(--u-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .event-timeline {
    padding-left: 2px;
  }

  .event-timeline :deep(.el-timeline-item) {
    padding-bottom: 12px;
  }

  .event-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .event-title {
    font-weight: 500;
    color: var(--u-text-primary);
  }

  .event-summary {
    margin-left: 8px;
    color: var(--u-text-secondary);
  }

  .signal-list {
    display: grid;
    gap: 8px;
  }

  @media (max-width: 768px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }

    .profile-tools {
      justify-content: flex-start;
    }
  }
</style>
