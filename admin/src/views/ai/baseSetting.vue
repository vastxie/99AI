<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormRules } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave, { numberConfigCodec } from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/ai/advanced-config'));
  usePageDoc(docUrl);

  const formInline = reactive({
    systemPreMessage: '',
    maxToolCallsPerRequest: 25,
    modelFirstResponseTimeoutSec: 120,
    maxInputLength: 20000,
  });

  const configKeys = [
    'systemPreMessage',
    'maxToolCallsPerRequest',
    'modelFirstResponseTimeoutSec',
    'maxInputLength',
  ];

  const rules = ref<FormRules>({
    maxToolCallsPerRequest: [{ required: false, trigger: 'blur', message: '请填写单次调用上限' }],
    maxInputLength: [{ required: false, trigger: 'blur', message: '请填写输入框字符上限' }],
  });
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField } = useConfigAutoSave({
    form: formInline,
    codecs: {
      maxToolCallsPerRequest: numberConfigCodec(25),
      modelFirstResponseTimeoutSec: numberConfigCodec(120),
      maxInputLength: numberConfigCodec(20000),
    },
  });

  async function queryAllConfig() {
    try {
      await loadAllConfig();
    } catch {
      markLoadFailed();
    }
  }

  async function loadAllConfig() {
    const res = await apiConfig.queryConfig({ keys: configKeys });
    const { systemPreMessage, maxToolCallsPerRequest = 25, maxInputLength = 20000 } = res.data;
    Object.assign(formInline, {
      systemPreMessage,
      maxToolCallsPerRequest: Number(maxToolCallsPerRequest) || 25,
      modelFirstResponseTimeoutSec: Number(res.data.modelFirstResponseTimeoutSec) || 120,
      maxInputLength: Number(maxInputLength) || 20000,
    });
    // 记录原始值用于变更检测
    await nextTick();
    initFromConfig(res.data, configKeys);
  }

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
      <page-panel>
        <el-form :rules="rules" :model="formInline" label-width="auto">
          <el-divider content-position="left">Agent 设置</el-divider>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="工具调用轮次上限" prop="maxToolCallsPerRequest">
                <div class="config-field-inline">
                  <el-input-number
                    v-model="formInline.maxToolCallsPerRequest"
                    controls-position="right"
                    :min="1"
                    :max="50"
                    :step="1"
                    placeholder="单次任务最多调用多少轮工具，默认25"
                    @change="(val: any) => saveField('maxToolCallsPerRequest', String(val))"
                  />
                  <el-tooltip effect="dark" placement="right">
                    <template #content>
                      <div style="width: 250px">
                        <p>单次对话中工具的最大调用轮次，默认25次</p>
                        <p>增加次数可以执行更复杂的任务，但会增加响应时间和成本</p>
                        <p>达到上限会停止本轮并提示用户，用户可继续追问接着做</p>
                      </div>
                    </template>
                    <el-icon class="admin-help-icon">
                      <AppIcon name="i-lucide:circle-help" />
                    </el-icon>
                  </el-tooltip>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="模型首次响应等待上限" prop="modelFirstResponseTimeoutSec">
                <div class="config-field-inline">
                  <el-input-number
                    v-model="formInline.modelFirstResponseTimeoutSec"
                    controls-position="right"
                    :min="10"
                    :max="600"
                    :step="10"
                    :value-on-clear="120"
                    placeholder="单位：秒，默认120"
                    @change="(val: any) => saveField('modelFirstResponseTimeoutSec', String(val))"
                  />
                  <el-tooltip effect="dark" placement="right">
                    <template #content>
                      <div style="width: 250px">
                        <p>发出请求后等模型开始响应的最长时间，单位秒，默认 120</p>
                        <p>推理模型或经转换网关接入的模型常被提示「模型响应超时」时调大</p>
                        <p>回复开始后连续 10 分钟没有任何输出也会中断，这一项不可调</p>
                      </div>
                    </template>
                    <el-icon class="admin-help-icon">
                      <AppIcon name="i-lucide:circle-help" />
                    </el-icon>
                  </el-tooltip>
                </div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">其他配置</el-divider>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="输入框字符上限" prop="maxInputLength">
                <el-input-number
                  v-model="formInline.maxInputLength"
                  controls-position="right"
                  :min="1000"
                  :max="100000"
                  :step="1000"
                  placeholder="输入框字符上限，默认20000"
                  @change="(val: any) => saveField('maxInputLength', String(val))"
                />
                <el-tooltip class="box-item" effect="dark" placement="right">
                  <template #content>
                    <div style="width: 250px">
                      <p>用户输入框字符数上限，防止过长的输入导致系统错误</p>
                    </div>
                  </template>
                  <el-icon class="admin-help-icon">
                    <AppIcon name="i-lucide:circle-help" />
                  </el-icon>
                </el-tooltip>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="全局头部预设" prop="systemPreMessage">
                <el-input
                  v-model="formInline.systemPreMessage"
                  type="textarea"
                  :rows="8"
                  placeholder="请填写模型全局头部预设"
                  clearable
                  @blur="saveField('systemPreMessage', formInline.systemPreMessage)"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>

<style scoped>
  .config-field-inline {
    display: inline-flex;
    gap: 12px;
    align-items: center;
  }
</style>
