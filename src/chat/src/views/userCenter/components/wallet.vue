<script setup lang="ts">
import { fetchGetRechargeLogAPI } from '@/api/balance';
import { fetchGetPackageAPI, fetchUseCramiAPI } from '@/api/crami';
import type { ResData } from '@/api/types';
import { RechargeTypeMap } from '@/constants';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore } from '@/store';
import {
  NButton,
  NCard,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NGrid,
  NGridItem,
  NInput,
  NSpace,
  useDialog,
  useMessage,
} from 'naive-ui';
import { computed, onMounted, reactive, ref } from 'vue';
const { isSmallMd, isMobile } = useBasicLayout();
const authStore = useAuthStore();
const ms = useMessage();
const dialog = useDialog();
interface RechargeLog {
  uid: string;
  rechargeType: number;
  usesLeft: number;
  paintCount: number;
  balance: number;
  createdAt: Date;
}

interface Rkg {
  name: string;
  coverImg: string;
  des: string;
  rechargeType: number;
  model3Count: number;
  model4Count: number;
  drawMjCount: number;
  expireDateCn: string;
  createdAt: Date;
  price: number;
}

const userBalance = computed(() => authStore.userBalance);
const loading = ref(false);
const code = ref('');
const showDrawer = ref(false);
const packageList = ref<Rkg[]>([]);
const rechargeLoading = ref(false);
const model3Name = computed(
  () => authStore.globalConfig.model3Name || t('usercenter.basicModelQuota')
);
const model4Name =
  computed(() => authStore.globalConfig.model4Name) ||
  t('usercenter.advancedModelQuota');
const drawMjName =
  computed(() => authStore.globalConfig.drawMjName) ||
  t('usercenter.mjDrawingQuota');
const isHideModel3Point = computed(
  () => Number(authStore.globalConfig.isHideModel3Point) === 1
);
const isHideModel4Point = computed(
  () => Number(authStore.globalConfig.isHideModel4Point) === 1
);
const isHideDrawMjPoint = computed(
  () => Number(authStore.globalConfig.isHideDrawMjPoint) === 1
);

const paginationReg = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (page: number) => {
    paginationReg.page = page;
    queryRechargeLog();
  },
  onUpdatePageSize: (pageSize: number) => {
    paginationReg.pageSize = pageSize;
    paginationReg.page = 1;
    queryRechargeLog();
  },
});

const columns = computed(() => {
  const cols = [
    {
      title: t('usercenter.orderNumber'),
      key: 'uid',
    },
    {
      title: t('usercenter.rechargeType'),
      key: 'rechargeType',
      render(row: RechargeLog) {
        return RechargeTypeMap[row.rechargeType];
      },
    },
    // Other columns remain unchanged
    {
      title: t('usercenter.validity'),
      key: 'expireDateCn',
    },
    {
      title: t('usercenter.rechargeTime'),
      key: 'createdAt',
      render(row: RechargeLog) {
        return row.createdAt;
      },
    },
  ];

  // Conditionally add columns based on computed properties
  if (!isHideModel3Point.value) {
    cols.splice(2, 0, {
      title: model3Name.value,
      key: 'model3Count',
    });
  }

  if (!isHideModel4Point.value) {
    cols.splice(3, 0, {
      title: model4Name.value,
      key: 'model4Count',
    });
  }

  if (!isHideDrawMjPoint.value) {
    cols.splice(4, 0, {
      title: drawMjName.value,
      key: 'drawMjCount',
    });
  }

  return cols;
});

const data = ref([]);

async function queryRechargeLog() {
  const res: ResData = await fetchGetRechargeLogAPI({
    page: paginationReg.page,
    size: paginationReg.pageSize,
  });
  const { rows } = res.data;
  data.value = rows;
}

async function useCrami() {
  ms.warning(t('usercenter.enterCardSecret'));
  try {
    loading.value = true;
    await fetchUseCramiAPI({ code: code.value });
    ms.success(t('usercenter.cardRedeemSuccess'));
    queryRechargeLog();
    authStore.getUserInfo();
    loading.value = false;
  } catch (error) {
    ms.error(t('usercenter.unknownError'));
    loading.value = false;
  }
}

function openDrawer() {
  showDrawer.value = true;
}

async function openDrawerAfter() {
  const res: ResData = await fetchGetPackageAPI({ status: 1, size: 30 });
  packageList.value = res.data.rows;
}

const buyCramiAddress = computed(() => authStore.globalConfig?.buyCramiAddress);

function buyPackage() {
  window.open(buyCramiAddress.value);
}

onMounted(() => {
  queryRechargeLog();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <NCard>
      <template #header>
        <div>{{ t('usercenter.userWalletBalance') }}</div>
      </template>
      <NGrid :x-gap="24" :y-gap="24" :cols="isSmallMd ? 1 : 2" class="mt-3">
        <NGridItem
          v-if="!isHideModel3Point"
          class="border dark:border-[#ffffff17] rounded-sm p-3"
        >
          <div class="text-[#95aac9] mb-2 text-base">
            {{ model3Name }}
          </div>
          <b class="text-3xl text-[#555]">
            {{
              userBalance.sumModel3Count > 99999
                ? '无限额度'
                : userBalance.sumModel3Count ?? 0
            }}
          </b>
          <span class="ml-4 text-[#989898]">{{
            t('usercenter.creditUsageNote')
          }}</span>
        </NGridItem>
        <NGridItem
          v-if="!isHideModel4Point"
          class="border dark:border-[#ffffff17] rounded-sm p-3"
        >
          <div class="text-[#95aac9] mb-2 text-base">
            {{ model4Name }}
          </div>
          <b class="text-3xl text-[#555]">{{
            userBalance.sumModel4Count > 99999
              ? '无限额度'
              : userBalance.sumModel4Count ?? 0
          }}</b>
          <span class="ml-4 text-[#989898]">{{
            t('usercenter.modelConsumptionNote')
          }}</span>
        </NGridItem>
        <NGridItem
          v-if="!isHideDrawMjPoint"
          class="border dark:border-[#ffffff17] rounded-sm p-3"
        >
          <div class="text-[#95aac9] mb-2 text-base">
            {{ drawMjName }}
          </div>
          <b class="text-3xl text-[#555]">{{
            userBalance.sumDrawMjCount > 99999
              ? '无限额度'
              : userBalance.sumDrawMjCount ?? 0
          }}</b>
          <span class="ml-4 text-[#989898]">{{
            t('usercenter.drawingConsumptionNote')
          }}</span>
        </NGridItem>
        <NGridItem class="border dark:border-[#ffffff17] rounded-sm p-3">
          <div class="text-[#95aac9] mb-2 text-base">
            {{ t('usercenter.cardRecharge') }}
          </div>
          <NSpace :wrap="false">
            <NInput
              v-model:value="code"
              :placeholder="t('usercenter.enterCardDetails')"
              class="mr-3"
              maxlength="128"
              show-count
              clearable
            />

            <NButton type="primary" :loading="loading" @click="useCrami">
              {{ t('usercenter.exchange') }}
            </NButton>
            <NButton v-if="buyCramiAddress" type="success" @click="openDrawer">
              {{ t('usercenter.buyCardSecret') }}
            </NButton>
          </NSpace>
        </NGridItem>
      </NGrid>
    </NCard>
    <NCard class="mt-5 flex-1">
      <template #header>
        <div>{{ t('usercenter.rechargeRecords') }}</div>
      </template>
      <NDataTable
        :columns="columns"
        :loading="rechargeLoading"
        :scroll-x="800"
        :data="data"
        max-height="280"
        :pagination="paginationReg"
      />
    </NCard>
    <NDrawer
      v-model:show="showDrawer"
      :width="isSmallMd ? '100%' : 502"
      :on-after-enter="openDrawerAfter"
    >
      <NDrawerContent title="{{ t('usercenter.packagePurchase') }}" closable>
        <NGrid :x-gap="15" :y-gap="15" :cols="isSmallMd ? 1 : 2" class="mt-3">
          <NGridItem v-for="(item, index) in packageList" :key="index">
            <NCard size="small" embedded>
              <template #header>
                <div class="relative">
                  <b>{{ item.name }}</b>
                </div>
              </template>
              <template #cover>
                <img :src="item.coverImg" />
              </template>
              <div>
                <p>{{ item.des }}</p>
                <div class="flex justify-between items-end min-h-28">
                  <span class="text-sm font-bold mr-1">{{ model3Name }}</span>
                  <span class="font-bold">{{ item.model3Count }}</span>
                </div>
                <div class="flex justify-between items-end min-h-28">
                  <span class="text-sm font-bold mr-1">{{ model4Name }}</span>
                  <span class="font-bold">{{ item.model4Count }}</span>
                </div>
                <div class="flex justify-between items-end min-h-28">
                  <span class="text-sm font-bold mr-1">{{ drawMjName }}</span>
                  <span class="font-bold">{{ item.drawMjCount }}</span>
                </div>
                <div class="flex justify-between items-end mt-5">
                  <i class="text-xl text-[red] font-bold">{{
                    `￥${item.price}`
                  }}</i>
                  <NButton
                    type="primary"
                    dashed
                    size="small"
                    @click="buyPackage"
                  >
                    {{ t('usercenter.buyPackage') }}
                  </NButton>
                </div>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
