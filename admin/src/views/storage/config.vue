<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';
  import { BRAND_COLORS } from '@/constants/brand-colors';
  import type {
    StorageField,
    StorageProviderContribution,
    StorageScope,
    StorageSection,
  } from '@/storage/storageConfigFields';
  import { packStorageProviders } from '@/packs';

  const docUrl = computed(() => getDocUrl('/configuration/platform/storage-config'));
  usePageDoc(docUrl);

  const loading = ref(false);
  const activeTab = ref('local');
  /** 配置项所在的存储与字段定义（各存储的字段键互不重复） */
  function locateField(key: string): { storageKey: string; field: StorageField } | undefined {
    for (const storageKey of Object.keys(storageConfigs)) {
      const field = storageConfigs[storageKey].fields.find((item) => item.key === key);
      if (field) return { storageKey, field };
    }
    return undefined;
  }

  const {
    isReady,
    loadFailed,
    initFromConfig,
    markLoadFailed,
    saveField: saveConfigField,
    saving,
  } = useConfigAutoSave({
    read: (key) => {
      const located = locateField(key);
      return located ? storageSettings[located.storageKey][key] : undefined;
    },
    write: (key, raw) => {
      const located = locateField(key);
      if (located)
        storageSettings[located.storageKey][key] = normalizeFieldValue(located.field, raw);
    },
  });

  /**
   * 内核只自带本地目录；对象存储厂商各是一个存储包，贡献下拉选项与配置字段，
   * 包关闭 / 删除时选项与字段一并消失。
   */
  const storageProviders: StorageProviderContribution[] = packStorageProviders();
  const providerOptions = (localLabel: string) => [
    { label: localLabel, value: 'local' },
    ...storageProviders.map((item) => ({ label: item.label, value: item.value })),
  ];
  const providerFields = (scope: StorageScope): StorageField[] =>
    storageProviders.flatMap((item) => item.fields(scope));

  // 各存储服务的配置字段
  const storageConfigs: Record<string, StorageSection> = {
    local: {
      name: '基础配置',
      icon: 'i-lucide:hard-drive',
      iconColor: BRAND_COLORS.localStorage,
      fields: [
        {
          key: 'siteUrl',
          label: '网站地址',
          type: 'input',
          required: true,
          placeholder: 'https://您的域名',
          helpText: '本地公开文件与用户端访问地址都以此为准。',
        },
        {
          key: 'uploadFileLimit',
          label: '文件上传数量限制',
          type: 'input',
          required: false,
          placeholder: '默认：5个',
        },
      ],
    },
    userFiles: {
      name: '用户文件管理',
      icon: 'i-lucide:folders',
      iconColor: BRAND_COLORS.userFiles,
      fields: [
        {
          key: 'fileAssetMaxFileSizeMb',
          label: '单文件上限 MB',
          type: 'number',
          required: false,
          defaultValue: '50',
          min: 1,
          max: 1024,
          helpText: '用户上传、AI 生成、工具输出和渠道 Bot 收到的文件都会遵守此上限。',
        },
        {
          key: 'fileAssetPreviewMaxFileSizeMb',
          label: '在线预览上限 MB',
          type: 'number',
          required: false,
          defaultValue: '20',
          min: 1,
          max: 1024,
          helpText: '超过该大小的文件仍可下载，但不会通过预览接口直接打开。',
        },
        {
          key: 'fileAssetUserQuotaMb',
          label: '单用户占用上限 MB',
          type: 'number',
          required: false,
          defaultValue: '1024',
          min: 0,
          max: 102400,
          helpText: '默认 1024 MB，包含上传、成果、技能及处理中和待清理的私有文件；0 表示不限制。',
        },
        {
          key: 'fileAssetVisitorQuotaMb',
          label: '访客占用上限 MB',
          type: 'number',
          required: false,
          defaultValue: '200',
          min: 0,
          max: 102400,
          helpText: '按访客身份计量私有文件总占用；访客身份可无限签发，不建议设为 0。',
        },
        {
          key: 'fileAssetTemporaryRetentionHours',
          label: '临时文件保留小时',
          type: 'number',
          required: false,
          defaultValue: '24',
          min: 1,
          max: 8760,
          helpText: '用于 Agent 应用中间文件，到期后由清理任务处理。',
        },
        {
          key: 'fileAssetPrivateRetentionDays',
          label: '私有文件保留天数',
          type: 'number',
          required: false,
          defaultValue: '30',
          min: 0,
          max: 3650,
          helpText: '0 表示普通私有文件不按天数自动过期。',
        },
        {
          key: 'fileAssetCleanupBatchSize',
          label: '每轮清理数量',
          type: 'number',
          required: false,
          defaultValue: '50',
          min: 1,
          max: 500,
          helpText: '控制清理任务每轮最多处理多少条过期文件记录。',
        },
      ],
    },
    public: {
      name: '公共存储',
      icon: 'i-lucide:cloud',
      iconColor: BRAND_COLORS.publicStorage,
      fields: [
        {
          key: 'publicStorageProvider',
          label: '公共文件存储',
          type: 'select',
          required: true,
          defaultValue: 'local',
          placeholder: '请选择公共文件存储',
          options: providerOptions('本地公开目录'),
          helpText: '站点 Logo、favicon、公告图片、公开头像等可直接访问的资源。',
        },
        {
          key: 'publicLocalBasePath',
          label: '本地公开目录',
          type: 'input',
          required: false,
          placeholder: '默认：server/public/file',
          showCondition: (settings) => settings.publicStorageProvider === 'local',
          helpText: '经 /file 公开访问；改目录后需同步调整静态资源映射。',
        },
        ...providerFields('public'),
      ],
    },
    private: {
      name: '私有存储',
      icon: 'i-lucide:lock',
      iconColor: BRAND_COLORS.privateStorage,
      fields: [
        {
          key: 'privateStorageProvider',
          label: '私有文件存储',
          type: 'select',
          required: true,
          defaultValue: 'local',
          placeholder: '请选择私有文件存储',
          options: providerOptions('本地私有目录'),
          helpText: '用户上传、聊天附件、知识库和 AI 生成文件默认走私有存储。',
        },
        {
          key: 'privateLocalBasePath',
          label: '本地私有目录',
          type: 'input',
          required: false,
          placeholder: '默认：server/storage/private',
          showCondition: (settings) => settings.privateStorageProvider === 'local',
          helpText: '私有目录不会通过 /file 公开访问。',
        },
        {
          key: 'privateSignedUrlTtlSeconds',
          label: '签名链接有效期',
          type: 'input',
          required: false,
          defaultValue: '600',
          placeholder: '默认：600 秒',
          helpText: '对象存储私有文件预览 / 下载时临时生成，不会保存到数据库。',
        },
        ...providerFields('private'),
      ],
    },
  };

  // 存储设置数据 - 初始化时就创建所有存储的设置对象
  const storageSettings: Record<string, any> = reactive({});

  // 初始化所有存储的空对象
  Object.keys(storageConfigs).forEach((storageKey) => {
    storageSettings[storageKey] = {};
  });

  // 存储状态
  const storageStatus = ref<Record<string, { configured: boolean; missing: string[] }>>({});

  // 获取所有存储配置键
  function getAllStorageKeys() {
    const keys: string[] = [];
    Object.values(storageConfigs).forEach((config) => {
      config.fields.forEach((field) => {
        if (!keys.includes(field.key)) {
          keys.push(field.key);
        }
      });
    });
    return keys;
  }

  function normalizeFieldValue(field: StorageField, rawValue: any) {
    const value = rawValue ?? field.defaultValue ?? '';
    if (field.type !== 'number') return value;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const fallback = Number(field.defaultValue);
    return Number.isFinite(fallback) ? fallback : undefined;
  }

  // 获取存储配置
  async function fetchStorageConfig() {
    loading.value = true;
    try {
      const keys = getAllStorageKeys();
      const res = await apiConfig.queryConfig({ keys });

      // 填充所有存储的设置值（类型转换与默认值只在这里和 write 里）；已确认值记服务端的原始字符串
      Object.keys(storageConfigs).forEach((storageKey) => {
        storageConfigs[storageKey].fields.forEach((field) => {
          storageSettings[storageKey][field.key] = normalizeFieldValue(field, res.data[field.key]);
        });
      });
      await nextTick();
      initFromConfig(res.data, keys);
    } catch (error) {
      console.error('获取存储配置失败:', error);
      markLoadFailed();
    } finally {
      loading.value = false;
    }
  }

  // 查询存储状态
  async function fetchStorageStatus() {
    try {
      // 查询所有配置并检查存储是否已配置
      const res = await apiConfig.queryAllConfig();
      // 确保 configs 是数组
      let configs = res.data || [];

      // 如果返回的是对象，尝试转换为数组
      if (!Array.isArray(configs)) {
        // 如果是对象，可能是 {rows: [...]} 或 {list: [...]} 格式
        if (configs.rows && Array.isArray(configs.rows)) {
          configs = configs.rows;
        } else if (configs.list && Array.isArray(configs.list)) {
          configs = configs.list;
        } else if (typeof configs === 'object' && configs !== null) {
          // 如果是键值对对象，转换为数组
          configs = Object.entries(configs).map(([key, value]) => ({
            configKey: key,
            configVal: value,
          }));
        } else {
          configs = [];
        }
      }

      const status: Record<string, { configured: boolean; missing: string[] }> = {};

      // 检查每个存储是否已配置
      const configMap = new Map(configs.map((item: any) => [item.configKey, item.configVal]));

      Object.keys(storageConfigs).forEach((storageKey) => {
        const storage = storageConfigs[storageKey];
        const missingFields: string[] = [];
        const currentSettings = storage.fields.reduce((result: Record<string, any>, field) => {
          result[field.key] = normalizeFieldValue(field, configMap.get(field.key));
          return result;
        }, {});

        // 基础配置、私有存储和用户文件策略不依赖启用开关判断
        if (['local', 'userFiles', 'public', 'private'].includes(storageKey)) {
          const requiredFields = storage.fields.filter(
            (f) => f.required && (!f.showCondition || f.showCondition(currentSettings)),
          );
          requiredFields.forEach((field) => {
            const value = currentSettings[field.key];
            if (!value) {
              missingFields.push(field.label);
            }
          });
          status[storageKey] = {
            configured: missingFields.length === 0,
            missing: missingFields,
          };
        } else {
          // 其他存储需要检查启用状态
          const statusKey = storage.fields.find((f) => f.type === 'switch')?.key;
          const statusConfig = configs.find((c: any) => c.configKey === statusKey);
          const isEnabled = statusConfig?.configVal === '1';

          if (isEnabled) {
            const requiredFields = storage.fields.filter((f) => f.required && f.key !== statusKey);
            requiredFields.forEach((field) => {
              const value = currentSettings[field.key];
              if (!value) {
                missingFields.push(field.label);
              }
            });
            status[storageKey] = {
              configured: missingFields.length === 0,
              missing: missingFields,
            };
          } else {
            // 未启用的存储直接标记为未配置
            status[storageKey] = {
              configured: false,
              missing: [],
            };
          }
        }
      });

      storageStatus.value = status;
    } catch (error) {
      console.error('查询存储状态失败:', error);
    }
  }

  // 字段级自动保存，保存成功后刷新存储状态
  async function saveField(key: string, value: any) {
    await saveConfigField(key, value, { onSaved: () => void fetchStorageStatus() });
  }

  // 判断字段是否应该显示
  function shouldShowField(field: StorageField, storageKey: string) {
    if (!field.showCondition) {
      return true;
    }
    return field.showCondition(storageSettings[storageKey]);
  }

  onMounted(() => {
    fetchStorageConfig();
    fetchStorageStatus();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="fetchStorageConfig">
      <page-panel>
        <el-tabs v-model="activeTab">
          <el-tab-pane v-for="(config, key) in storageConfigs" :key="key" :name="key">
            <template #label>
              <div class="tab-label">
                <app-icon
                  v-if="config.icon"
                  :name="config.icon"
                  :color="config.iconColor"
                  size="16"
                />
                <span>{{ config.name }}</span>
                <el-tag
                  v-if="storageStatus[key]"
                  :type="storageStatus[key].configured ? 'success' : 'info'"
                  size="small"
                  class="ml-2"
                >
                  {{ storageStatus[key].configured ? '已配置' : '未配置' }}
                </el-tag>
              </div>
            </template>

            <div class="storage-content">
              <el-form label-width="160px">
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <template v-for="field in config.fields" :key="field.key">
                      <el-form-item
                        v-if="shouldShowField(field, key)"
                        :label="field.label"
                        :required="field.required"
                      >
                        <!-- Switch类型 -->
                        <div v-if="field.type === 'switch'" class="flex items-center">
                          <el-switch
                            :loading="saving(field.key)"
                            v-model="storageSettings[key][field.key]"
                            active-value="1"
                            inactive-value="0"
                            :active-text="field.activeText"
                            :inactive-text="field.inactiveText"
                            @change="(val: any) => saveField(field.key, String(val))"
                          />
                          <el-tooltip
                            v-if="field.tooltip?.length"
                            class="box-item"
                            effect="dark"
                            placement="right"
                          >
                            <template #content>
                              <div style="width: 280px">
                                <p v-for="item in field.tooltip" :key="item">{{ item }}</p>
                              </div>
                            </template>
                            <el-icon class="ml-3 cursor-pointer">
                              <AppIcon name="i-lucide:circle-help" />
                            </el-icon>
                          </el-tooltip>
                        </div>
                        <!-- Select类型 -->
                        <el-select
                          v-else-if="field.type === 'select'"
                          v-model="storageSettings[key][field.key]"
                          :placeholder="field.placeholder"
                          @change="(val: any) => saveField(field.key, String(val))"
                        >
                          <el-option
                            v-for="opt in field.options"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                          />
                        </el-select>
                        <!-- Textarea类型 -->
                        <el-input
                          v-else-if="field.type === 'textarea'"
                          v-model="storageSettings[key][field.key]"
                          type="textarea"
                          :rows="4"
                          :placeholder="field.placeholder"
                          @blur="saveField(field.key, storageSettings[key][field.key])"
                        />
                        <!-- Password类型 -->
                        <el-input
                          v-else-if="field.type === 'password'"
                          v-model="storageSettings[key][field.key]"
                          type="password"
                          show-password
                          :placeholder="field.placeholder"
                          @blur="saveField(field.key, storageSettings[key][field.key])"
                        />
                        <!-- Number类型 -->
                        <el-input-number
                          v-else-if="field.type === 'number'"
                          v-model="storageSettings[key][field.key]"
                          :min="field.min"
                          :max="field.max"
                          controls-position="right"
                          @change="(val: any) => saveField(field.key, val)"
                        />
                        <!-- Input类型 -->
                        <el-input
                          v-else
                          v-model="storageSettings[key][field.key]"
                          :placeholder="field.placeholder"
                          @blur="saveField(field.key, storageSettings[key][field.key])"
                        />
                        <div v-if="field.helpText" class="text-xs text-gray-400 mt-1">
                          {{ field.helpText }}
                        </div>
                      </el-form-item>
                    </template>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </el-tab-pane>
        </el-tabs>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>

<style scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .storage-content {
    padding-top: 20px;
  }
</style>
