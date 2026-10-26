<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiBadWords from '../api/badWords';
  import type { FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/security/sensitive-words'));
  usePageDoc(docUrl);

  const formInline = reactive({
    isSensitiveWordFilter: '',
    tencentTextStatus: '',
    tencentSecretId: '',
    tencentSecretKey: '',
    tencentRegion: '',
    tencentTextBizType: '',
    systemSensitiveStatus: '',
    selectedVocabularies: [] as string[],
  });

  const rules = ref<FormRules>({
    tencentSecretId: [{ required: true, trigger: 'blur', message: '请填写腾讯云 SecretId' }],
    tencentSecretKey: [{ required: true, trigger: 'blur', message: '请填写腾讯云 SecretKey' }],
  });

  const testLoading = ref(false);
  /** 已选词库在界面上是数组，配置里存 JSON 字符串 */
  function parseVocabularies(raw: string): string[] {
    try {
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  const { loadFailed, isReady, initFromConfig, markLoadFailed, saveField, saveFields, saving } =
    useConfigAutoSave({
      form: formInline,
      codecs: {
        selectedVocabularies: {
          toRaw: (value) => JSON.stringify(Array.isArray(value) ? value : []),
          fromRaw: parseVocabularies,
        },
      },
    });
  const vocabularies = ref<any[]>([]);
  /** 词库列表成功加载过才显示「还没有词库文件」，请求失败或加载中不误导 */
  const vocabulariesLoaded = ref(false);

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'isSensitiveWordFilter',
          'tencentTextStatus',
          'tencentSecretId',
          'tencentSecretKey',
          'tencentRegion',
          'tencentTextBizType',
          'systemSensitiveStatus',
          'selectedVocabularies',
        ],
      });
      Object.assign(formInline, res.data);
      // 解析已选择的词库
      formInline.selectedVocabularies = parseVocabularies(res.data.selectedVocabularies || '');
      await nextTick();
      // 已确认值记服务端的原始字符串（词库的 JSON 解析只在加载映射与 codec 里）
      initFromConfig(res.data);
    } catch {
      markLoadFailed();
    }
  }

  async function queryVocabularies() {
    try {
      const res = await apiBadWords.queryVocabularies();
      vocabularies.value = res.data.vocabularies || [];
      vocabulariesLoaded.value = true;
    } catch (error) {
      ElMessage.error('获取词库列表失败');
    }
  }

  /** 两种检测互斥：打开一种时把另一种关掉，两项一次保存（失败一起回滚） */
  async function handleTencentStatusChange(value: string) {
    if (value === '1') {
      formInline.systemSensitiveStatus = '0';
      await saveFields({
        tencentTextStatus: '1',
        systemSensitiveStatus: '0',
      });
      return;
    }
    await saveField('tencentTextStatus', '0');
  }

  async function handleSystemStatusChange(value: string) {
    if (value === '1') {
      formInline.tencentTextStatus = '0';
      await saveFields({
        systemSensitiveStatus: '1',
        tencentTextStatus: '0',
      });
      return;
    }
    await saveField('systemSensitiveStatus', '0');
  }

  async function testTencentTextConfig() {
    testLoading.value = true;
    try {
      const res = await apiBadWords.testTencentTextConfig();
      if (res.data?.success) {
        ElMessage.success({
          message: res.data.message,
          duration: 5000,
          showClose: true,
        });
      } else {
        ElMessage.error({
          message: res.data?.message || '配置测试失败',
          duration: 5000,
          showClose: true,
        });
      }
    } catch {
      // 请求失败已由 @/api 响应拦截器提示
    } finally {
      testLoading.value = false;
    }
  }

  // 计算已选词库的总词数
  const selectedWordCount = computed(() => {
    if (!formInline.selectedVocabularies?.length) return 0;
    return formInline.selectedVocabularies.reduce((sum, id) => {
      const vocab = vocabularies.value.find((v) => v.id === id);
      return sum + (vocab?.count || 0);
    }, 0);
  });

  onMounted(() => {
    queryAllConfig();
    queryVocabularies();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
      <page-panel>
        <div class="mb-4 flex items-center justify-end gap-2">
          <el-button
            type="primary"
            @click="testTencentTextConfig"
            :loading="testLoading"
            :disabled="formInline.tencentTextStatus !== '1'"
          >
            <AppIcon name="i-lucide:shield-check" />
            测试腾讯配置
          </el-button>
        </div>
        <el-form :rules="rules" :model="formInline" label-width="200px">
          <!-- 内容安全检测开关 -->
          <el-divider content-position="left">内容安全检测</el-divider>

          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="启用内容安全过滤">
                <el-tooltip
                  content="开启后，用户消息会按本页选择的腾讯云文本审核或本地敏感词库进行拦截。"
                  placement="top"
                  :show-after="500"
                >
                  <el-switch
                    :loading="saving('isSensitiveWordFilter')"
                    v-model="formInline.isSensitiveWordFilter"
                    active-value="1"
                    inactive-value="0"
                    @change="(val: any) => saveField('isSensitiveWordFilter', String(val))"
                  />
                </el-tooltip>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 腾讯云文本审核 -->
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="使用腾讯云文本审核">
                <el-tooltip
                  content="开启后将调用腾讯云文本内容安全 TMS。优先级高于本地敏感词库。"
                  placement="top"
                  :show-after="500"
                >
                  <el-switch
                    v-model="formInline.tencentTextStatus"
                    :loading="saving('tencentTextStatus') || saving('systemSensitiveStatus')"
                    active-value="1"
                    inactive-value="0"
                    @change="(val: any) => handleTencentStatusChange(String(val))"
                  />
                </el-tooltip>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 腾讯云配置（仅在使用腾讯云时显示） -->
          <template v-if="formInline.tencentTextStatus === '1'">
            <el-divider content-position="left">腾讯云配置</el-divider>

            <el-row>
              <el-col :xs="24" :md="20" :lg="15" :xl="12">
                <el-form-item label="SecretId" prop="tencentSecretId">
                  <el-input
                    v-model="formInline.tencentSecretId"
                    placeholder="请填写腾讯云 SecretId"
                    clearable
                    @blur="saveField('tencentSecretId', formInline.tencentSecretId)"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row>
              <el-col :xs="24" :md="20" :lg="15" :xl="12">
                <el-form-item label="SecretKey" prop="tencentSecretKey">
                  <el-input
                    v-model="formInline.tencentSecretKey"
                    placeholder="请填写腾讯云 SecretKey"
                    clearable
                    show-password
                    @blur="saveField('tencentSecretKey', formInline.tencentSecretKey)"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row>
              <el-col :xs="24" :md="20" :lg="15" :xl="12">
                <el-form-item label="地域">
                  <el-input
                    v-model="formInline.tencentRegion"
                    placeholder="默认 ap-guangzhou"
                    clearable
                    @blur="saveField('tencentRegion', formInline.tencentRegion)"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row>
              <el-col :xs="24" :md="20" :lg="15" :xl="12">
                <el-form-item label="策略 BizType">
                  <el-input
                    v-model="formInline.tencentTextBizType"
                    placeholder="可选，不填使用腾讯云默认策略"
                    clearable
                    @blur="saveField('tencentTextBizType', formInline.tencentTextBizType)"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </template>

          <template v-if="formInline.tencentTextStatus !== '1'">
            <!-- 本地敏感词库（部署者自备，放在服务端 data/vocabularies） -->
            <el-row>
              <el-col :xs="24" :md="20" :lg="15" :xl="12">
                <el-form-item label="使用本地敏感词库">
                  <el-tooltip
                    content="开启后用服务端 data/vocabularies 目录里自备的词库检测。白名单中的词语不会被过滤。"
                    placement="top"
                    :show-after="500"
                  >
                    <el-switch
                      v-model="formInline.systemSensitiveStatus"
                      :loading="saving('tencentTextStatus') || saving('systemSensitiveStatus')"
                      active-value="1"
                      inactive-value="0"
                      @change="(val: any) => handleSystemStatusChange(String(val))"
                    />
                  </el-tooltip>
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 词库选择（仅在使用本地敏感词库时显示） -->
            <template v-if="formInline.systemSensitiveStatus === '1'">
              <el-row>
                <el-col :xs="24" :md="24" :lg="18" :xl="16">
                  <el-form-item label="选择词库">
                    <el-empty
                      v-if="vocabulariesLoaded && !vocabularies.length"
                      :image-size="64"
                      description="还没有词库文件：把 UTF-8 文本词库（一行一个词，文件名即词库名，扩展名 .txt）放到服务端 data/vocabularies 目录，重启服务后刷新本页"
                    />
                    <div v-else class="w-full">
                      <el-checkbox-group
                        v-model="formInline.selectedVocabularies"
                        @change="(val: any) => saveField('selectedVocabularies', val)"
                      >
                        <div class="flex flex-wrap gap-3">
                          <el-checkbox
                            v-for="vocab in vocabularies"
                            :key="vocab.id"
                            :label="vocab.id"
                            :value="vocab.id"
                            border
                            class="vocab-checkbox"
                          >
                            <div class="flex items-center gap-2">
                              <span>{{ vocab.name }}</span>
                              <el-tag size="small" type="info"
                                >{{ vocab.count.toLocaleString() }}词</el-tag
                              >
                            </div>
                          </el-checkbox>
                        </div>
                      </el-checkbox-group>
                      <div class="mt-3 text-sm text-gray-500">
                        已选择 {{ formInline.selectedVocabularies?.length || 0 }} 个词库，共
                        {{ selectedWordCount.toLocaleString() }} 个敏感词（合并后去重）
                      </div>
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </template>
          </template>
        </el-form>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>

<style scoped>
  .vocab-checkbox {
    margin-right: 0 !important;
  }
</style>
