<route lang="yaml">
name: home
meta:
  title: 主页
</route>

<script lang="ts" setup>
  import apiDashboard from '@/api/modules/dashboard';
  import useSettingsStore from '@/store/modules/settings';
  import * as echarts from 'echarts';
  // import { ElNotification } from 'element-plus';
  import { ChatDotRound, Picture, ShoppingCart, TrendCharts, User } from '@element-plus/icons-vue';
  import { marked } from 'marked';
  import ResizeObserver from 'resize-observer-polyfill';
  import { computed, nextTick, onBeforeMount, onMounted, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  // 导入CHANGELOG.md文件内容
  import changelogMd from '@/assets/CHANGELOG.md?raw';

  const settingsStore = useSettingsStore();
  const router = useRouter();

  const colorScheme = computed(() => {
    return settingsStore.settings.app.colorScheme;
  });

  const feedbackUrl = 'https://github.com/vastxie/99AI';

  // 在新窗口打开问题反馈链接
  const openFeedbackInNewWindow = () => {
    window.open(feedbackUrl, '_blank');
  };

  const { pkg } = __SYSTEM_INFO__;

  // 处理更新日志内容
  const changelogHtml = computed(() => {
    return marked(changelogMd);
  });

  const baseInfo = ref({
    userCount: 0,
    newUserCount: 0,
    chatCount: 0,
    newChatCount: 0,
    drawCount: 0,
    newDrawCount: 0,
    orderCount: 0,
    newOrderCount: 0,
  });
  interface ApiDashboard {
    getBaseInfo: () => Promise<any>;
    getBaiduVisit: (params: any) => Promise<any>;
    getChatStatistic: (params: any) => Promise<any>;
    getObserverCharts: (params: any) => Promise<any>;
  }

  let charCharts: echarts.ECharts;
  let baiduCharts: echarts.ECharts;
  let observer: ResizeObserver;
  const chatDays = ref(30);
  const baiduDays = ref(30);
  const activeTab = ref('chat');

  const chatChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['对话数量', '绘画数量'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: true,
        data: [],
        splitLine: {
          show: true,
          lineStyle: {
            color: ['#ffffff1a'],
            width: 1,
            type: 'solid',
          },
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: {
          show: true,
          lineStyle: {
            width: 1,
            color: ['#ffffff1a'],
            type: 'solid',
          },
        },
      },
    ],
    series: [
      {
        name: '对话数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
      {
        name: '绘画数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
    ],
  };

  const baiduVisitChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['pv', 'uv', 'ip'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: [],
      splitLine: {
        show: true,
        lineStyle: {
          // 分隔线样式
          color: ['#ffffff1a'],
          width: 1,
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        show: true,
        lineStyle: {
          width: 1,
          color: ['#ffffff1a'],
          type: 'solid',
        },
      },
    },
    series: [
      {
        name: 'pv',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)',
        },
        data: [],
      },
      {
        name: 'uv',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)',
        },
        data: [],
      },
      {
        name: 'ip',
        type: 'bar',
        itemStyle: {
          color: 'rgba(255, 193, 7, 0.8)',
        },
        data: [],
      },
    ],
  };

  const daysList = [
    {
      label: 7,
      value: '最近七天',
    },
    {
      label: 15,
      value: '最近半月',
    },
    {
      label: 30,
      value: '最近一月',
    },
    {
      label: 90,
      value: '最近三月',
    },
  ];

  async function getBaseInfo() {
    const res = await apiDashboard.getBaseInfo();
    console.log(res.data);
    baseInfo.value = res.data;
  }

  async function getBaiduVisitInfo() {
    const res = await apiDashboard.getBaiduVisit({ days: baiduDays.value });

    const { data } = res;
    baiduVisitChartsOption.xAxis.data = data.items[0].map((t: Array<{}>) => t[0]);
    baiduVisitChartsOption.series.forEach((item, index) => {
      item.data = data.items[1].map((t: Array<{}>) => t[index]);
    });

    await nextTick();
    const chartDom = document.getElementById('baidu') as HTMLElement;
    if (baiduCharts) {
      baiduCharts.dispose();
    }
    baiduCharts = echarts.init(chartDom);
    baiduCharts.setOption(baiduVisitChartsOption);
    setTimeout(() => {
      baiduCharts.resize();
    }, 100);
  }

  async function getChatStatisticInfo() {
    const res = await apiDashboard.getChatStatistic({ days: chatDays.value });
    const { date, chat, draw } = res.data;
    chatChartsOption.xAxis[0].data = date;
    chatChartsOption.series[0].data = chat;
    chatChartsOption.series[1].data = draw;

    await nextTick();
    const chartDom = document.getElementById('chat') as HTMLElement;
    if (charCharts) {
      charCharts.dispose();
    }
    charCharts = echarts.init(chartDom);
    charCharts.setOption(chatChartsOption);
    setTimeout(() => {
      charCharts.resize();
    }, 100);
  }

  watch(colorScheme, () => {
    changeColorScheme();
  });

  function changeColorScheme() {
    const colorScheme = settingsStore.settings.app.colorScheme;
    const lineColor = colorScheme === 'dark' ? ['#ffffff1a'] : ['#0000001a'];
    chatChartsOption.yAxis[0].splitLine.lineStyle.color = lineColor;
    chatChartsOption.xAxis[0].splitLine.lineStyle.color = lineColor;
    charCharts && charCharts.setOption(chatChartsOption);
    baiduVisitChartsOption.yAxis.splitLine.lineStyle.color = lineColor;
    baiduVisitChartsOption.xAxis.splitLine.lineStyle.color = lineColor;
    baiduCharts && baiduCharts.setOption(baiduVisitChartsOption);
  }

  function handleTabChange(tabName: string | number) {
    activeTab.value = tabName as string;
    // 切换tab时重新调整图表大小
    setTimeout(() => {
      if (tabName === 'chat' && charCharts) {
        charCharts.resize();
      } else if (tabName === 'visitor' && baiduCharts) {
        baiduCharts.resize();
      }
    }, 100);
  }

  onMounted(async () => {
    await getBaseInfo();
    await Promise.all([getChatStatisticInfo(), getBaiduVisitInfo()]);
    changeColorScheme();
    // 添加通知
    // const h = document.createElement.bind(document);
    // ElNotification({
    //   title: '配置迁移提醒',
    //   message:
    //     '除对话页外的其他页面将不再维护。专业绘画、思维导图等页面的配置已移至其他设置中。',
    //   type: 'info',
    //   duration: 15000,
    // });
  });

  onMounted(() => {
    observer = new ResizeObserver(() => {
      charCharts && charCharts.resize();
      baiduCharts && baiduCharts.resize();
    });
    const chatElm = document.getElementById('chat');
    chatElm && observer?.observe(chatElm);
    const baiduElm = document.getElementById('baidu');
    baiduElm && observer?.observe(baiduElm);
  });

  onBeforeMount(() => {
    observer && observer.disconnect();
  });
</script>

<template>
  <div class="p-4 h-[90vh] overflow-hidden">
    <!-- 主要内容区域 -->
    <div class="flex gap-5 h-full">
      <!-- 左侧：更新日志 + 问题反馈 -->
      <div class="flex-1 flex flex-col gap-4 min-w-0">
        <!-- 更新日志 -->
        <div
          class="flex-[4] bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden"
        >
          <div
            class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
          >
            <span class="text-base font-semibold text-gray-800 dark:text-gray-200">项目说明</span>
            <span
              class="text-xs text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded"
              >{{ pkg.version }}</span
            >
          </div>
          <div
            class="flex-1 p-5 overflow-y-auto overflow-x-hidden markdown-body hide-h1"
            v-html="changelogHtml"
          ></div>
        </div>

        <!-- 问题反馈 -->
        <div class="h-20 flex justify-start">
          <div
            class="w-full h-full bg-white dark:bg-gray-800 rounded-lg shadow-md cursor-pointer relative overflow-hidden group"
            @click="openFeedbackInNewWindow"
          >
            <div class="p-4 flex flex-col justify-between h-full">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">开源地址</span>
                <el-icon class="text-blue-500 text-lg"><ChatDotRound /></el-icon>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-xs text-gray-600 dark:text-gray-400"
                  >https://github.com/vastxie/99AI</span
                >
                <span class="text-xs text-blue-500 font-medium">点击</span>
              </div>
            </div>
            <div
              class="absolute inset-0 bg-black bg-opacity-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            >
              <div class="flex flex-col items-center gap-2 text-white">
                <el-icon class="text-4xl"><ChatDotRound /></el-icon>
                <span class="text-sm font-medium">新窗口打开</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：统计数据 + 图表 -->
      <div class="flex-[2] flex flex-col gap-4 min-w-0">
        <!-- 统计卡片 -->
        <div class="grid grid-cols-2 grid-rows-2 gap-4 h-55">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-indigo-500 to-purple-600"
            >
              <el-icon><User /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日新增用户</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo?.newUserCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.userCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-pink-400 to-red-500"
            >
              <el-icon><ChatDotRound /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日对话</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newChatCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.chatCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-blue-400 to-cyan-400"
            >
              <el-icon><Picture /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日绘画</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newDrawCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.drawCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-green-400 to-teal-400"
            >
              <el-icon><ShoppingCart /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日订单</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newOrderCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.orderCount || 0 }}
              </div>
            </div>
          </div>
        </div>

        <!-- 图表区域 -->
        <div
          class="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden"
        >
          <div
            class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
          >
            <el-tabs v-model="activeTab" @tab-change="handleTabChange">
              <el-tab-pane label="对话统计" name="chat">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><ChatDotRound /></el-icon>
                    <span>对话统计</span>
                  </div>
                </template>
              </el-tab-pane>
              <el-tab-pane label="访客统计" name="visitor">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><TrendCharts /></el-icon>
                    <span>访客统计</span>
                  </div>
                </template>
              </el-tab-pane>
            </el-tabs>

            <el-radio-group
              v-if="activeTab === 'chat'"
              v-model="chatDays"
              @change="getChatStatisticInfo"
              size="small"
            >
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>

            <el-radio-group v-else v-model="baiduDays" @change="getBaiduVisitInfo" size="small">
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="flex-1 p-5 relative">
            <div id="chat" class="w-full h-full" v-show="activeTab === 'chat'" />
            <div id="baidu" class="w-full h-full" v-show="activeTab === 'visitor'" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /* Tab样式优化 - 移除Tab之间的间距 */
  :deep(.el-tabs__nav) {
    gap: 0 !important;
  }

  :deep(.el-tabs__item) {
    margin-right: 0 !important;
    padding: 0 !important;
  }

  /* Markdown样式 */
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    word-wrap: break-word;
  }

  /* 隐藏顶级标题 */
  .hide-h1 :deep(h1:first-child) {
    display: none;
  }

  .markdown-body :deep(h1) {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 12px;
    margin-top: 16px;
  }

  .markdown-body :deep(h2) {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
    margin-top: 16px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e0e0e0;
  }

  .markdown-body :deep(h3) {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
    margin-top: 12px;
  }

  .markdown-body :deep(ul) {
    list-style-type: disc;
    padding-left: 16px;
    margin-bottom: 12px;
  }

  .markdown-body :deep(p) {
    margin-bottom: 12px;
  }

  .markdown-body :deep(code) {
    background: #f5f5f5;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .markdown-body :deep(pre) {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow-x: auto;
  }

  .markdown-body :deep(a) {
    color: #1890ff;
    text-decoration: none;
  }

  .markdown-body :deep(a:hover) {
    text-decoration: underline;
  }

  /* 暗色模式下的markdown样式 */
  :deep(.dark) .markdown-body {
    color: #d1d5db;
  }

  :deep(.dark) .markdown-body :deep(h2) {
    border-bottom-color: #4b5563;
  }

  :deep(.dark) .markdown-body :deep(code),
  :deep(.dark) .markdown-body :deep(pre) {
    background: #374151;
  }
</style>
