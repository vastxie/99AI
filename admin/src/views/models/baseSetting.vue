<route lang="yaml">
meta:
  title: 基础设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { QuestionFilled } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';

  const formInline = reactive({
    openaiBaseUrl: '',
    openaiBaseKey: '',
    deepThinkingModel: 'deepseek-reasoner',
    deepThinkingUrl: '',
    deepThinkingKey: '',
    openaiBaseModel: 'gpt-4o-mini',
    isGeneratePromptReference: 0,
    isConvertToBase64: 0,
    openaiVoice: '',
    systemPreMessage: '',
    isModelInherited: 1,
    pluginUrl: '',
    pluginKey: '',
    openaiTemperature: 1,
    vectorUrl: '',
    vectorKey: '',
    vectorModel: 'text-embedding-3-small',
    vectorAnalysisThreshold: 1000,
    maxUrlTextLength: 100000,
    toolCallUrl: '',
    toolCallKey: '',
    toolCallModel: '',
    imageAnalysisUrl: '',
    imageAnalysisKey: '',
    imageAnalysisModel: '',
  });

  const options = [
    {
      value: 'https://api.deepseek.com',
      label: '【DeepSeek 官方】https://api.deepseek.com',
    },
    {
      value: 'https://dashscope.aliyuncs.com/compatible-mode',
      label: '【阿里云百炼】https://dashscope.aliyuncs.com/compatible-mode',
    },
    {
      value: 'https://api.lkeap.cloud.tencent.com',
      label: '【腾讯云知识引擎】https://api.lkeap.cloud.tencent.com',
    },
    {
      value: 'https://api.lightai.io',
      label: '【LightAI API】https://api.lightai.io',
    },
    {
      value: '',
      label: '【其他】填写后选择',
    },
  ];

  const voiceOptions = ref<VoiceOption[]>([
    { label: 'Alloy', value: 'alloy' },
    { label: 'Echo', value: 'echo' },
    { label: 'Fable', value: 'fable' },
    { label: 'Onyx', value: 'onyx' },
    { label: 'Nova', value: 'nova' },
    { label: 'Shimmer', value: 'shimmer' },
  ]);

  const netWorkOptions = [
    {
      value: 'https://open.bigmodel.cn/api/paas/v4/tools',
      label: '【智谱 web-search-pro】',
    },
    {
      value: 'https://api.bochaai.com/v1/web-search',
      label: '【博查 web-search】',
    },
    {
      value: 'https://api.tavily.com/search',
      label: '【Tavily 1000 次/月（免费）】',
    },
  ];

  const vectorOptions = [
    {
      value: 'text-embedding-3-small',
      label: 'text-embedding-3-small',
    },
    {
      value: 'text-embedding-3-large',
      label: 'text-embedding-3-large',
    },
    {
      value: 'text-embedding-ada-002',
      label: 'text-embedding-ada-002',
    },
  ];

  type VoiceOption = { label: string; value: string };

  const rules = ref<FormRules>({
    openaiBaseUrl: [{ required: true, trigger: 'blur', message: '请填写 AI 的请求地址' }],
    openaiBaseKey: [{ required: true, trigger: 'blur', message: '请填写模型全局 Key' }],
    openaiBaseModel: [
      { required: true, trigger: 'blur', message: '请填写全局模型，用于后台一些静默性赋能操作' },
    ],
    isGeneratePromptReference: [
      { required: false, trigger: 'blur', message: '是否生成提示词参考' },
    ],
    isModelInherited: [{ required: false, trigger: 'blur', message: '是否继承模型' }],
    pluginUrl: [{ required: false, trigger: 'blur', message: '请填写联网插件地址' }],
    pluginKey: [{ required: false, trigger: 'blur', message: '请填写联网插件 Key' }],
    openaiTemperature: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写模型 Temperature 设置，默认1',
      },
    ],
    deepThinkingUrl: [{ required: false, trigger: 'blur', message: '请填写深度思考模型地址' }],
    deepThinkingKey: [{ required: false, trigger: 'blur', message: '请填写深度思考模型 Key' }],
    deepThinkingModel: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写深度思考模型名称',
      },
    ],
    vectorUrl: [{ required: false, trigger: 'blur', message: '请填写向量模型地址' }],
    vectorKey: [{ required: false, trigger: 'blur', message: '请填写向量模型 Key' }],
    vectorModel: [{ required: false, trigger: 'blur', message: '请填写向量模型名称' }],
    vectorAnalysisThreshold: [
      { required: false, trigger: 'blur', message: '请填写文件启用向量分析阈值' },
    ],
    maxUrlTextLength: [{ required: false, trigger: 'blur', message: '请填写文件最大字符限制' }],
    toolCallUrl: [{ required: false, trigger: 'blur', message: '请填写工具调用模型地址' }],
    toolCallKey: [{ required: false, trigger: 'blur', message: '请填写工具调用模型 Key' }],
    toolCallModel: [{ required: false, trigger: 'blur', message: '请填写工具调用模型名称' }],
    imageAnalysisUrl: [{ required: false, trigger: 'blur', message: '请填写图片解析模型地址' }],
    imageAnalysisKey: [{ required: false, trigger: 'blur', message: '请填写图片解析模型 Key' }],
    imageAnalysisModel: [{ required: false, trigger: 'blur', message: '请填写图片解析模型名称' }],
  });
  const formRef = ref<FormInstance>();

  async function queryAllconfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiBaseModel',
        'systemPreMessage',
        'isGeneratePromptReference',
        'isConvertToBase64',
        'openaiVoice,',
        'isModelInherited',
        'pluginUrl',
        'pluginKey',
        'openaiTemperature',
        'deepThinkingUrl',
        'deepThinkingKey',
        'deepThinkingModel',
        'vectorUrl',
        'vectorKey',
        'vectorModel',
        'vectorAnalysisThreshold',
        'maxUrlTextLength',
        'openaiVoice',
        'toolCallUrl',
        'toolCallKey',
        'toolCallModel',
        'imageAnalysisUrl',
        'imageAnalysisKey',
        'imageAnalysisModel',
      ],
    });
    const {
      openaiBaseUrl = '',
      openaiBaseKey = '',
      openaiBaseModel = 'gpt-4o-mini',
      isGeneratePromptReference = 0,
      systemPreMessage,
      pluginUrl,
      pluginKey,
      openaiTemperature = 1,
      deepThinkingUrl,
      deepThinkingKey,
      deepThinkingModel,
      isModelInherited,
      vectorUrl,
      vectorKey,
      isConvertToBase64,
      openaiVoice,
      vectorModel = 'text-embedding-3-small',
      vectorAnalysisThreshold = 10000,
      maxUrlTextLength = 500000,
      toolCallUrl,
      toolCallKey,
      toolCallModel = '',
      imageAnalysisUrl,
      imageAnalysisKey,
      imageAnalysisModel = '',
    } = res.data;
    Object.assign(formInline, {
      openaiBaseUrl,
      openaiBaseKey,
      isGeneratePromptReference,
      isConvertToBase64,
      openaiVoice,
      openaiBaseModel,
      systemPreMessage,
      pluginUrl,
      pluginKey,
      openaiTemperature,
      deepThinkingKey,
      deepThinkingUrl,
      deepThinkingModel,
      isModelInherited,
      vectorUrl,
      vectorKey,
      vectorModel,
      vectorAnalysisThreshold,
      maxUrlTextLength,
      toolCallUrl,
      toolCallKey,
      toolCallModel,
      imageAnalysisUrl,
      imageAnalysisKey,
      imageAnalysisModel,
    });
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
          ElMessage.success('变更配置信息成功');
        } catch (error) {}
        queryAllconfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  function fotmatSetting(settings: any) {
    return Object.keys(settings).map((key) => {
      return {
        configKey: key,
        configVal: settings[key],
      };
    });
  }

  onMounted(() => {
    queryAllconfig();
  });

  /**
   * 规范化API基础URL
   * @param baseUrl - 需要规范化的API基础URL
   * @returns 规范化后的URL字符串
   */
  const correctApiBaseUrl = (baseUrl: string): string => {
    if (!baseUrl) return '';

    // 去除两端空格
    let url = baseUrl.trim();

    // 如果URL以斜杠'/'结尾，则移除这个斜杠
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // 检查URL是否已包含任何版本标记，包括常见的模式如/v1, /v1beta, /v1alpha等
    if (!/\/v\d+(?:beta|alpha)?/.test(url)) {
      // 如果不包含任何版本号，添加 /v1
      return `${url}/v1`;
    }

    return url;
  };

  // Computed properties for actual URLs
  const actualOpenaiBaseUrl = computed(() => correctApiBaseUrl(formInline.openaiBaseUrl));
  const actualDeepThinkingUrl = computed(() => correctApiBaseUrl(formInline.deepThinkingUrl));
  const actualVectorUrl = computed(() => correctApiBaseUrl(formInline.vectorUrl));
  const actualToolCallUrl = computed(() => correctApiBaseUrl(formInline.toolCallUrl));
  const actualImageAnalysisUrl = computed(() => correctApiBaseUrl(formInline.imageAnalysisUrl));
  const actualPluginUrl = computed(() => correctApiBaseUrl(formInline.pluginUrl));
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">基础设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            全局配置用于对话标题生成、生成提问建议、提示词翻译等内置操作。模型不配置 Url 或 Key
            时，也会使用全局配置。
          </div>
          <div>
            <strong>重要提示：</strong
            >向量模型、工具调用模型、图片解析模型和深度思考模型如果没有单独设置，系统将默认使用全局模型的地址和
            Key，请确保全局配置正确填写。
          </div>
          <div>
            API 中转推荐
            <a href="https://api.lightai.io" target="_blank" style="margin-right: 5px"
              >https://api.lightai.io</a
            >，提供 AI 接口聚合管理服务，一站式接入各种 AI 模型，无强制绑定关系，可按需选择。
          </div>
          <div>深度思考模型用于模型的深度思考，需在模型配置中开启深度思考模式。</div>
          <div>
            联网插件已支持多种方式：

            <a href="https://bigmodel.cn" target="_blank">智谱 web-search-pro</a>、
            <a href="https://open.bochaai.com" target="_blank">博查 web-search</a>、
            <a href="https://app.tavily.com/home" target="_blank">Tavily</a>
            需自行登录以上网站，获取对应的 Key（多个Key用英文逗号隔开）。
          </div>
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="220px">
        <h3 class="font-bold text-lg mb-4">基础配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局地址" prop="openaiBaseUrl" label-width="120px" required>
              <el-input
                v-model="formInline.openaiBaseUrl"
                placeholder="例如 https://api.openai.com，未显式指定 /v1 等版本时将自动添加 /v1"
                clearable
              />
              <div v-if="actualOpenaiBaseUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualOpenaiBaseUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局 Key" prop="openaiBaseKey" label-width="120px" required>
              <el-input
                v-model="formInline.openaiBaseKey"
                placeholder="请填写模型全局 Key 信息，当模型 Key 为空时调用"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局模型" prop="openaiBaseModel" label-width="120px" required>
              <el-input
                v-model="formInline.openaiBaseModel"
                placeholder="全局模型配置，用于后台一些静默赋能操作"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">深度思考配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="深度思考地址" prop="deepThinkingUrl" label-width="120px">
              <el-select
                v-model="formInline.deepThinkingUrl"
                placeholder="选择或输入地址，未指定 /v1 等版本时将自动添加 /v1"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="option in options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <div v-if="actualDeepThinkingUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualDeepThinkingUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="深度思考 Key" prop="deepThinkingKey" label-width="120px">
              <el-input
                v-model="formInline.deepThinkingKey"
                placeholder="请填写深度思考模型 Key"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="深度思考模型" prop="deepThinkingModel" label-width="120px">
              <el-input
                v-model="formInline.deepThinkingModel"
                placeholder="请选择深度思考模型"
                clearable
              >
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">联网配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="联网搜索地址" label-width="120" prop="pluginUrl">
              <el-select
                v-model="formInline.pluginUrl"
                placeholder="请选择或输入联网搜索使用的地址"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="option in netWorkOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="联网搜索 Key" label-width="120" prop="pluginKey">
              <el-input
                v-model="formInline.pluginKey"
                placeholder="插件 Key"
                clearable
                password
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">其他配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="继承对话模型" prop="isModelInherited" label-width="120">
              <el-switch
                v-model="formInline.isModelInherited"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，新建对话模型将继承上一次对话所使用的模型</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="生成提问建议" prop="isGeneratePromptReference" label-width="120">
              <el-switch
                v-model="formInline.isGeneratePromptReference"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将使用全局模型在每次对话后，生成提问建议</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="Base64 识图" prop="isConvertToBase64" label-width="120">
              <el-switch
                v-model="formInline.isConvertToBase64"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>
                      开启后，识图时将使用 base64 格式，对于本地/存储桶 链接 API
                      端无法访问时建议开启
                    </p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="TTS 音色" prop="openaiVoice" label-width="120px">
              <el-select
                v-model="formInline.openaiVoice"
                placeholder="选择或输入 openai 语音合成的默认发音人"
                clearable
                filterable
                allow-create
              >
                <!-- 预定义选项 -->
                <el-option
                  v-for="voice in voiceOptions"
                  :key="voice.value"
                  :label="voice.label"
                  :value="voice.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="Temperature" prop="openaiTemperature" label-width="120px">
              <el-input-number
                v-model="formInline.openaiTemperature"
                controls-position="right"
                :min="0"
                :max="2"
                :step="0.1"
                placeholder="模型 Temperature 设置，默认1"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>模型 Temperature 设置，一般情况无需调整</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局头部预设" prop="systemPreMessage" label-width="120px">
              <el-input
                v-model="formInline.systemPreMessage"
                type="textarea"
                :rows="8"
                placeholder="请填写模型全局头部预设信息！"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
