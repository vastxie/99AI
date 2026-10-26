<script lang="ts" setup>
  import { computed } from 'vue';
  import { groupRoutes } from '@/router/groups';
  import type { NavLink } from '@/router/navigation';
  import { buildNavGroups } from '@/router/navigation';
  import useUserStore from '@/store/modules/user';

  interface HomeSection {
    title: string;
    icon?: string;
    description: string;
    entries: NavLink[];
  }

  const feedbackUrl = 'https://github.com/vastxie/99AI/issues';

  /** 分组的一句话说明;扩展包新增的分组没有登记时退化为页面数量 */
  const sectionDescriptions: Record<string, string> = {
    平台设置: '站点信息、外观、公告与文件存储',
    'AI 能力': '模型接入、全局参数与私有文件',
    用户运营: '用户、对话、账户与策略',
    登录接入: '登录方式、微信与 Bot 通道',
    支付财务: '套餐、订单与支付渠道',
    安全风控: '内容审核、白名单与违规记录',
  };

  const user = useUserStore();

  /** 首页只做导航:与侧栏同一份分组列出各页面入口,扩展包关闭时对应分组自然消失 */
  const sections = computed<HomeSection[]>(() =>
    buildNavGroups(groupRoutes, user.hasRole).map((group) => ({
      title: group.title,
      icon: group.icon,
      description: sectionDescriptions[group.title] ?? `${group.links.length} 个页面`,
      entries: group.links,
    })),
  );

  function openFeedbackInNewWindow() {
    window.open(feedbackUrl, '_blank', 'noopener,noreferrer');
  }
</script>

<template>
  <div class="home min-h-full p-4">
    <div class="mb-4 flex flex-col gap-3 px-1 pt-1 md:flex-row md:items-end md:justify-between">
      <div class="min-w-0">
        <h1 class="m-0 text-xl text-[var(--u-text-primary)] font-semibold tracking-tight">
          AI 工作台
        </h1>
        <p class="m-0 mt-1 text-[13px] text-[var(--u-text-secondary)]">
          从这里进入模型、用户、平台设置与已装载扩展包的管理页面
        </p>
      </div>
      <el-button @click="openFeedbackInNewWindow">
        <AppIcon name="i-lucide:message-square-plus" class="mr-1.5" />
        问题反馈
      </el-button>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <section
        v-for="section in sections"
        :key="section.title"
        class="home-tile flex flex-col gap-3 border border-solid border-[var(--u-border)] rounded-[var(--u-radius-l)] bg-[var(--u-bg-container)] p-4 shadow-[var(--u-shadow-s)] transition-shadow hover-shadow-[var(--u-shadow-m)]"
      >
        <div class="flex items-start gap-3">
          <span
            class="h-9 w-9 flex flex-none items-center justify-center rounded-[var(--u-radius-m)] bg-[var(--u-accent-soft)] text-[var(--u-accent-text)]"
          >
            <AppIcon v-if="section.icon" :name="section.icon" :size="18" />
          </span>
          <div class="min-w-0">
            <h2 class="m-0 text-[15px] text-[var(--u-text-primary)] font-semibold">
              {{ section.title }}
            </h2>
            <p class="m-0 mt-0.5 text-xs text-[var(--u-text-secondary)]">
              {{ section.description }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <RouterLink
            v-for="entry in section.entries"
            :key="entry.path"
            :to="entry.path"
            class="inline-flex items-center gap-1.5 rounded-[var(--u-radius-s)] bg-[var(--u-bg-fill)] px-2 py-1 text-xs text-[var(--u-text-regular)] no-underline transition-colors hover-(bg-[var(--u-accent-soft)] text-[var(--u-accent-text)])"
          >
            <AppIcon v-if="entry.icon" :name="entry.icon" :size="13" class="text-current op-80" />
            <span>{{ entry.title }}</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
