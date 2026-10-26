<script lang="ts" setup>
  import { computed } from 'vue';
  import { formatDateTime as formatDate, formatNumber } from '@/utils/format';

  /** 用户详情「内容安全」页签：违规统计与最近违规摘要（服务端 profile.sections.contentSafety） */
  interface ContentSafetySection {
    totalViolationRecords: number;
    rangeViolationCount: number;
    latestViolationAt?: string | null;
    recentViolations: Array<{
      id: number;
      source: string;
      typeLabels: string[];
      summary: string;
      occurredAt: string;
      link?: string;
    }>;
    sourceTop: Array<{ source: string; count: number }>;
    recentTypeTop: Array<{ type: string; count: number }>;
    link?: string;
  }

  const props = defineProps<{ profile: unknown; section?: ContentSafetySection | null }>();
  const router = useRouter();

  const section = computed(() => props.section ?? null);
  const tiles = computed(() => [
    {
      label: '违规记录',
      value: formatNumber(section.value?.totalViolationRecords),
      helper: '累计条数',
    },
    {
      label: '范围内违规',
      value: formatNumber(section.value?.rangeViolationCount),
      helper: '当前时间范围',
    },
    {
      label: '最近违规',
      value: formatDate(section.value?.latestViolationAt, '暂无'),
      helper: '最近一次命中时间',
    },
  ]);

  function openLink(path?: string) {
    if (path) router.push(path);
  }
</script>

<template>
  <div>
    <SectionHead title="内容安全" description="违规次数、来源与最近违规摘要，不展示完整违规内容">
      <el-button size="small" @click="openLink(section?.link)">查看违规记录</el-button>
    </SectionHead>
    <el-empty v-if="!section" description="暂无内容安全数据" :image-size="64" />
    <template v-else>
      <StatTiles :items="tiles" :min-width="160" />
      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="lg:col-span-1">
          <div class="mb-2 text-[13px] text-[var(--u-text-primary)] font-medium">违规来源</div>
          <el-empty v-if="!section.sourceTop?.length" description="暂无违规来源" :image-size="56" />
          <div v-else class="flex flex-col gap-2">
            <div
              v-for="item in section.sourceTop"
              :key="item.source"
              class="flex items-center justify-between gap-3 text-[13px]"
            >
              <span class="truncate text-[var(--u-text-regular)]">{{ item.source }}</span>
              <strong class="flex-none text-[var(--u-text-primary)] font-semibold">
                {{ formatNumber(item.count) }} 次
              </strong>
            </div>
          </div>
        </div>
        <div class="lg:col-span-2">
          <div class="mb-2 text-[13px] text-[var(--u-text-primary)] font-medium">最近违规摘要</div>
          <el-table :data="section.recentViolations || []" border size="small">
            <el-table-column prop="source" label="来源" min-width="120" />
            <el-table-column label="类型摘要" min-width="180">
              <template #default="scope">
                {{ scope.row.typeLabels?.join(' / ') || '—' }}
              </template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="scope">
                {{ formatDate(scope.row.occurredAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" fixed="right">
              <template #default="scope">
                <el-button link type="primary" @click="openLink(scope.row.link)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </template>
  </div>
</template>
