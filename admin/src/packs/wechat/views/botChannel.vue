<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiBotChannel from '../api/botChannel';
  import { WECHAT_BRAND_COLORS } from '../brand-colors';
  import ApiModels from '@/api/modules/models';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';
  import { formatDateTime } from '@/utils/format';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';

  const docUrl = computed(() => getDocUrl('/configuration/access/bot-channel'));
  usePageDoc(docUrl);

  const loading = ref(false);
  const activeTab = ref('weixin');

  /* ==================== 微信 Bot 配置 ==================== */
  const weixinForm = reactive({
    weixinBotStatus: '0',
    weixinBotModelId: '',
    weixinBotVoiceStatus: '0',
    tencentSecretId: '',
    tencentSecretKey: '',
    tencentRegion: '',
  });
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      form: weixinForm,
    });
  const modelOptions = ref<any[]>([]);
  const modelLoading = ref(false);

  /* ==================== 通道统计 ==================== */
  const stats = reactive<Record<string, any>>({});

  async function loadStats() {
    try {
      const res = await apiBotChannel.fetchBotChannelStats();
      if (res.data) {
        Object.assign(stats, res.data);
      }
    } catch {}
  }

  /* ==================== 绑定用户列表 ==================== */
  const userTableVisible = ref(false);
  const userQuery = reactive({ page: 1, size: 20 });

  const {
    loading: userLoading,
    total: userTotal,
    tableData: userList,
    query: loadUsers,
    search: searchUsers,
  } = usePagedTable<any>(async () => {
    const res = await apiBotChannel.fetchChannelUsers(activeTab.value, {
      page: userQuery.page,
      size: userQuery.size,
    });
    return { rows: res.data?.rows || [], count: res.data?.count || 0 };
  }, userQuery);

  function showUsers() {
    userTableVisible.value = true;
    searchUsers();
  }

  async function toggleUserStatus(row: any) {
    const action = row.status === 1 ? '禁用' : '启用';
    try {
      await ElMessageBox.confirm(`确定${action}该用户的 Bot 通道绑定？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });
      if (row.status === 1) {
        await apiBotChannel.disableChannelUser(activeTab.value, row.userId);
      } else {
        await apiBotChannel.enableChannelUser(activeTab.value, row.userId);
      }
      ElMessage.success(`${action}成功`);
      loadUsers();
      loadStats();
    } catch {}
  }

  /* ==================== 配置保存 ==================== */
  async function loadConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'weixinBotStatus',
          'weixinBotModelId',
          'weixinBotVoiceStatus',
          'tencentSecretId',
          'tencentSecretKey',
          'tencentRegion',
        ],
      });
      if (res.data) {
        weixinForm.weixinBotStatus = res.data.weixinBotStatus || '0';
        weixinForm.weixinBotModelId = res.data.weixinBotModelId || '';
        weixinForm.weixinBotVoiceStatus = res.data.weixinBotVoiceStatus || '0';
        weixinForm.tencentSecretId = res.data.tencentSecretId?.trim() || '';
        weixinForm.tencentSecretKey = res.data.tencentSecretKey?.trim() || '';
        weixinForm.tencentRegion = res.data.tencentRegion?.trim() || '';
        await nextTick();
        initFromConfig(res.data);
      }
    } catch {
      markLoadFailed();
    }
  }

  async function loadModelOptions() {
    modelLoading.value = true;
    try {
      const res = await ApiModels.queryModels({
        page: 1,
        size: 1000,
      });
      modelOptions.value = res.data?.rows || [];
    } catch {
      modelOptions.value = [];
    } finally {
      modelLoading.value = false;
    }
  }

  function saveConfig(key: string, value: string) {
    return saveField(key, value);
  }

  /* ==================== 生命周期 ==================== */
  onMounted(async () => {
    loading.value = true;
    await Promise.all([loadConfig(), loadStats(), loadModelOptions()]);
    loading.value = false;
  });

  const statusMap: Record<number, { label: string; type: string }> = {
    0: { label: '未绑定', type: 'info' },
    1: { label: '正常', type: 'success' },
    2: { label: '已过期', type: 'warning' },
    3: { label: '异常', type: 'danger' },
  };
</script>

<template>
  <div>
    <page-panel>
      <el-tabs v-model="activeTab" class="admin-page-tabs">
        <!-- 微信 Bot -->
        <el-tab-pane name="weixin">
          <template #label>
            <div class="tab-label">
              <app-icon
                name="i-simple-icons:wechat"
                :color="WECHAT_BRAND_COLORS.wechat"
                size="16"
              />
              <span>微信 Bot</span>
            </div>
          </template>

          <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="loadConfig">
            <div v-loading="loading" class="channel-content">
              <el-row :gutter="20">
                <!-- 功能配置 -->
                <el-col :xs="24" :sm="12" :lg="8" style="margin-bottom: 20px">
                  <div class="config-item">
                    <div class="config-header">
                      <div class="config-icon wechat">
                        <app-icon name="i-simple-icons:wechat" size="28" />
                      </div>
                      <span class="config-title">微信 Bot 功能</span>
                    </div>
                    <el-form label-position="top">
                      <el-form-item label="启用状态">
                        <el-switch
                          v-model="weixinForm.weixinBotStatus"
                          :loading="saving('weixinBotStatus')"
                          active-value="1"
                          inactive-value="0"
                          active-text="开启"
                          inactive-text="关闭"
                          @change="(val: any) => saveConfig('weixinBotStatus', String(val))"
                        />
                      </el-form-item>
                      <el-form-item>
                        <span class="config-desc">
                          开启后，用户可在账户管理中绑定微信 Bot，通过微信与 AI 对话
                        </span>
                      </el-form-item>
                      <el-form-item label="微信 Bot 使用模型">
                        <el-select
                          v-model="weixinForm.weixinBotModelId"
                          filterable
                          clearable
                          :loading="modelLoading"
                          placeholder="请选择微信 Bot 默认模型"
                          style="width: 100%"
                          @change="(val: any) => saveConfig('weixinBotModelId', String(val || ''))"
                        >
                          <el-option
                            v-for="item in modelOptions"
                            :key="item.id"
                            :label="`${item.modelName}（ID: ${item.id} / ${item.model}${
                              item.status ? '' : ' / 未开启'
                            }）`"
                            :value="String(item.id)"
                          />
                        </el-select>
                        <div class="config-desc mt-6">
                          微信 Bot
                          渠道会优先使用该模型；即使模型未开启前台展示也可作为通道专用模型。
                        </div>
                      </el-form-item>
                    </el-form>
                  </div>
                </el-col>

                <!-- 语音识别配置 -->
                <el-col :xs="24" :sm="12" :lg="8" style="margin-bottom: 20px">
                  <div class="config-item">
                    <div class="config-header">
                      <div class="config-icon voice">
                        <app-icon name="i-lucide:mic" size="28" />
                      </div>
                      <span class="config-title">语音消息识别</span>
                    </div>
                    <el-form label-position="top">
                      <el-form-item label="启用状态">
                        <el-switch
                          v-model="weixinForm.weixinBotVoiceStatus"
                          :loading="saving('weixinBotVoiceStatus')"
                          active-value="1"
                          inactive-value="0"
                          active-text="开启"
                          inactive-text="关闭"
                          @change="(val: any) => saveConfig('weixinBotVoiceStatus', String(val))"
                        />
                      </el-form-item>
                      <template v-if="weixinForm.weixinBotVoiceStatus === '1'">
                        <el-form-item label="SecretId">
                          <el-input
                            v-model="weixinForm.tencentSecretId"
                            placeholder="腾讯云 API SecretId"
                            clearable
                            @blur="saveConfig('tencentSecretId', weixinForm.tencentSecretId)"
                          />
                        </el-form-item>
                        <el-form-item label="SecretKey">
                          <el-input
                            v-model="weixinForm.tencentSecretKey"
                            type="password"
                            show-password
                            placeholder="腾讯云 API SecretKey"
                            clearable
                            @blur="saveConfig('tencentSecretKey', weixinForm.tencentSecretKey)"
                          />
                        </el-form-item>
                        <el-form-item label="Region">
                          <el-input
                            v-model="weixinForm.tencentRegion"
                            placeholder="默认 ap-guangzhou"
                            clearable
                            @blur="saveConfig('tencentRegion', weixinForm.tencentRegion)"
                          />
                        </el-form-item>
                        <el-form-item>
                          <span class="config-desc">
                            使用腾讯云一句话识别，中文准确率 95-97%，每月 5000
                            次免费。密钥在腾讯云控制台「访问管理 → API 密钥管理」获取。
                          </span>
                        </el-form-item>
                      </template>
                    </el-form>
                  </div>
                </el-col>

                <!-- 通道状态 -->
                <el-col :xs="24" :sm="12" :lg="8" style="margin-bottom: 20px">
                  <div class="config-item">
                    <div class="config-header">
                      <div class="config-icon stats">
                        <app-icon name="i-lucide:chart-column" size="28" />
                      </div>
                      <span class="config-title">通道状态</span>
                      <el-button
                        type="primary"
                        link
                        size="small"
                        @click="loadStats()"
                        class="ml-auto"
                      >
                        刷新
                      </el-button>
                    </div>
                    <div v-if="stats.weixin" class="stats-grid">
                      <div class="stat-item">
                        <div class="stat-value">{{ stats.weixin.bound }}</div>
                        <div class="stat-label">绑定用户</div>
                      </div>
                      <div class="stat-item">
                        <div class="stat-value">{{ stats.weixin.active }}</div>
                        <div class="stat-label">活跃用户</div>
                      </div>
                      <div class="stat-item">
                        <div class="stat-value">{{ stats.weixin.expired }}</div>
                        <div class="stat-label">过期用户</div>
                      </div>
                      <div class="stat-item">
                        <div class="stat-value">{{ stats.weixin.error }}</div>
                        <div class="stat-label">异常用户</div>
                      </div>
                    </div>
                    <el-empty v-else description="暂无数据" :image-size="60" />
                    <div class="mt-2.5">
                      <el-button type="primary" size="small" @click="showUsers"
                        >查看用户列表</el-button
                      >
                    </div>
                  </div>
                </el-col>
              </el-row>
            </div>
          </ConfigLoadGuard>
        </el-tab-pane>

        <!-- Telegram Bot (占位) -->
        <el-tab-pane name="telegram" disabled>
          <template #label>
            <div class="tab-label">
              <app-icon name="i-simple-icons:telegram" size="16" />
              <span>Telegram Bot</span>
            </div>
          </template>
          <el-empty description="即将支持，敬请期待" />
        </el-tab-pane>

        <!-- Discord Bot (占位) -->
        <el-tab-pane name="discord" disabled>
          <template #label>
            <div class="tab-label">
              <app-icon name="i-simple-icons:discord" size="16" />
              <span>Discord Bot</span>
            </div>
          </template>
          <el-empty description="即将支持，敬请期待" />
        </el-tab-pane>
      </el-tabs>
    </page-panel>

    <!-- 用户列表弹窗 -->
    <el-dialog v-model="userTableVisible" title="绑定用户列表" width="700px">
      <el-table :data="userList" v-loading="userLoading" stripe>
        <el-table-column prop="userId" label="用户ID" width="80" />
        <el-table-column prop="channelUserId" label="通道用户ID" width="160" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusMap[row.status]?.type as any" size="small">
              {{ statusMap[row.status]?.label || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="boundAt" label="绑定时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.boundAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 1"
              type="danger"
              link
              size="small"
              @click="toggleUserStatus(row)"
            >
              禁用
            </el-button>
            <el-button v-else type="success" link size="small" @click="toggleUserStatus(row)">
              启用
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="flex justify-end mt-4">
        <TablePager
          v-model:page="userQuery.page"
          :size="userQuery.size"
          :total="userTotal"
          simple
          @change="loadUsers"
        />
      </div>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .channel-content {
    padding: 10px 0;
  }

  .config-item {
    padding: 15px;
    border: 1px solid var(--u-border-light);
    border-radius: 8px;
    height: 100%;

    .config-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--u-border-light);

      .config-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--u-text-primary);
      }
    }

    .config-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 6px;

      &.wechat {
        background: color-mix(in srgb, v-bind('WECHAT_BRAND_COLORS.wechat') 10%, transparent);
        color: v-bind('WECHAT_BRAND_COLORS.wechat');
      }

      &.voice {
        background: var(--u-accent-soft);
        color: var(--el-color-primary);
      }

      &.stats {
        background: var(--el-color-warning-light-9);
        color: var(--el-color-warning);
      }
    }
  }

  .config-desc {
    font-size: 12px;
    color: var(--u-text-secondary);
    line-height: 1.6;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-top: 10px;

    .stat-item {
      text-align: center;
      padding: 8px;
      background: var(--u-bg-fill);
      border-radius: 6px;

      .stat-value {
        font-size: 22px;
        font-weight: 600;
        color: var(--u-text-primary);
      }

      .stat-label {
        font-size: 12px;
        color: var(--u-text-secondary);
        margin-top: 4px;
      }
    }
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.el-form-item__label) {
    margin-bottom: 4px;
    font-size: 13px;
    color: var(--u-text-regular);
  }
</style>
