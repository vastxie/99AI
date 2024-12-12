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
import ResizeObserver from 'resize-observer-polyfill';
import { computed, onBeforeMount, onMounted, watch } from 'vue';

const settingsStore = useSettingsStore();

const colorScheme = computed(() => {
  return settingsStore.settings.app.colorScheme;
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

const chatChartsOption = {
  title: {
    text: '对话统计',
    left: '2%',
    padding: [10, 0],
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',
      label: {
        backgroundColor: '#6a7985',
      },
    },
  },
  legend: {
    top: '30px',
    data: [
      {
        name: '对话数量',
        icon: 'rect',
        itemWidth: 10,
        itemHeight: 5,
      },
      {
        name: '绘画数量',
        icon: 'rect',
      },
    ],
  },
  toolbox: {
    feature: {
      saveAsImage: {},
      restore: {},
      magicType: {
        type: ['line', 'bar', 'stack'],
      },
    },
    right: '60px',
  },
  grid: {
    top: '80px',
    left: '2%',
    right: '4%',
    bottom: '3%',
    containLabel: true,
  },
  xAxis: [
    {
      type: 'category',
      boundaryGap: false,
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
      smooth: true,
      itemStyle: {},
      areaStyle: {
        color: 'rgba(17, 76, 255, 0.2)',
      },
      emphasis: {
        focus: 'series',
      },
      data: [],
    },
    {
      name: '绘画数量',
      type: 'bar',
      smooth: true,
      itemStyle: {},
      areaStyle: {
        color: '#00d7ff33',
      },
      emphasis: {
        focus: 'series',
      },
      data: [],
    },
  ],
};

const baiduVisitChartsOption = {
  title: {
    text: '访问量统计',
    left: '2%',
    padding: [10, 0],
  },
  tooltip: {
    trigger: 'axis',
  },
  legend: {
    data: ['pv', 'uv', 'ip'],
  },
  toolbox: {
    feature: {
      saveAsImage: {},
      restore: {},
      magicType: {
        type: ['line', 'bar', 'stack'],
      },
    },
    right: '60px',
  },
  grid: {
    top: '80px',
    left: '2%',
    right: '4%',
    bottom: '3%',
    containLabel: true,
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
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
      smooth: true,
      areaStyle: {
        color: 'rgba(17, 76, 255, 0.2)',
      },
      data: [],
    },
    {
      name: 'uv',
      type: 'bar',
      smooth: true,
      areaStyle: {
        color: '#00d7ff33',
      },
      data: [],
    },
    {
      name: 'ip',
      smooth: true,
      areaStyle: {
        color: 'rgba(0, 215, 255, 0.2)',
      },
      type: 'bar',
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
  const chartDom = document.getElementById('baidu') as HTMLElement;
  baiduCharts = echarts.init(chartDom);
  baiduCharts.setOption(baiduVisitChartsOption);
}

async function getChatStatisticInfo() {
  const res = await apiDashboard.getChatStatistic({ days: chatDays.value });
  const { date, chat, draw } = res.data;
  chatChartsOption.xAxis[0].data = date;
  chatChartsOption.series[0].data = chat;
  chatChartsOption.series[1].data = draw;
  const chartDom = document.getElementById('chat') as HTMLElement;
  charCharts = echarts.init(chartDom);
  charCharts.setOption(chatChartsOption);
}

watch(colorScheme, () => {
  changeColorScheme();
});

function changeColorScheme() {
  const colorScheme = settingsStore.settings.app.colorScheme;
  const lineColor = colorScheme === 'dark' ? ['#ffffff1a'] : ['#0000001a'];
  chatChartsOption.yAxis[0].splitLine.lineStyle.color = lineColor;
  chatChartsOption.xAxis[0].splitLine.lineStyle.color = lineColor;
  charCharts.setOption(chatChartsOption);
  baiduVisitChartsOption.yAxis.splitLine.lineStyle.color = lineColor;
  baiduVisitChartsOption.xAxis.splitLine.lineStyle.color = lineColor;
  baiduCharts.setOption(baiduVisitChartsOption);
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
  <div style="padding: 15px">
    <el-row :gutter="10">
      <el-col :lg="6" class="header-tongji mb-3">
        <el-card>
          <template #header>
            <div class="justify-between flex">
              <span class="ml-1 font-bold">今日新增用户数量</span>
              <b>{{ baseInfo?.newUserCount }}</b>
            </div>
          </template>
          <div class="flex justify-between">
            <span>总计用户数量：</span>
            <span>{{ baseInfo.userCount }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :lg="6" class="header-tongji mb-3">
        <el-card>
          <template #header>
            <div class="flex justify-between">
              <span class="font-bold">今日对话</span>
              <b>{{ baseInfo.newChatCount }}</b>
            </div>
          </template>
          <div class="flex justify-between">
            <span>总计对话</span>
            <span>{{ baseInfo.chatCount }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :lg="6" class="header-tongji mb-3">
        <el-card>
          <template #header>
            <div class="flex justify-between">
              <span class="ml-1 font-bold">今日绘画数量</span>
              <b>{{ baseInfo.newDrawCount }}</b>
            </div>
          </template>
          <div class="flex justify-between">
            <span>总计绘画数量：</span>
            <span>{{ baseInfo.drawCount }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :lg="6" class="header-tongji mb-3">
        <el-card>
          <template #header>
            <div class="justify-between flex">
              <span class="ml-1 font-bold">今日订单数量</span>
              <b>{{ baseInfo.newOrderCount }}</b>
            </div>
          </template>
          <div class="flex justify-between">
            <span>总计订单数量：</span>
            <span>{{ baseInfo.orderCount }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="width: 100%" class="mb-5">
      <template #header>
        <div class="align-center flex justify-between">
          <div>
            <el-icon><Histogram /></el-icon>
            <span class="ml-1 font-bold">对话信息统计</span>
          </div>
          <div>
            <el-radio-group v-model="chatDays" @change="getChatStatisticInfo">
              <el-radio-button
                v-for="item in daysList"
                :key="item.value"
                :label="item.label"
              >
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>
      <div id="chat" />
    </el-card>

    <el-card style="width: 100%" class="mb-5">
      <template #header>
        <div class="align-center flex justify-between">
          <div>
            <el-icon><Histogram /></el-icon>
            <span class="ml-1 font-bold">网站访客统计</span>
          </div>
          <div>
            <el-radio-group v-model="baiduDays" @change="getBaiduVisitInfo">
              <el-radio-button
                v-for="item in daysList"
                :key="item.value"
                :label="item.label"
              >
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>
      <div id="baidu" />
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
#chat,
#baidu {
  width: 100%;
  height: 350px;
  margin-top: 18px;
}
</style>
