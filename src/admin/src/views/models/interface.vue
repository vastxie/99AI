<route lang="yaml">
meta:
  title: 接口请求设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import { QuestionFilled } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  openaiBaseUrl: '',
  openaiBaseKey: '',
  openaiTimeout: '',
  openaiBaseModel: 'gpt-4o-mini',
  openaiTemperature: 1,
  isGeneratePromptReference: 0,
  mjNotSaveImg: 0,
  mjProxyImgUrl: '',
  systemPreMessage: '',
  mjNotUseProxy: 1,
  isMjTranslate: 0,
  mjTranslatePrompt: '',
  isDalleChat: 1,
  isModelInherited: 1,
  openaiVoice: '',
  isConvertToBase64: 0,
});

type VoiceOption = { label: string; value: string };
const voiceOptions = ref<VoiceOption[]>([
  { label: 'Alloy', value: 'alloy' },
  { label: 'Echo', value: 'echo' },
  { label: 'Fable', value: 'fable' },
  { label: 'Onyx', value: 'onyx' },
  { label: 'Nova', value: 'nova' },
  { label: 'Shimmer', value: 'shimmer' },
]);

const rules = ref<FormRules>({
  openaiBaseUrl: [
    { required: false, trigger: 'blur', message: '请填写openai的请求地址' },
  ],
  isMjTranslate: [
    { required: false, trigger: 'blur', message: '是否开启翻译/联想' },
  ],
  isGeneratePromptReference: [
    { required: false, trigger: 'blur', message: '是否生成提示词参考' },
  ],
  isDalleChat: [
    { required: false, trigger: 'blur', message: '是否开启连续绘画' },
  ],
  isModelInherited: [
    { required: false, trigger: 'blur', message: '是否继承模型' },
  ],
  openaiTimeout: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写openai的超时时间（单位ms）',
    },
  ],
  openaiBaseModel: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写全局模型，用于后台一些静默性赋能操作',
    },
  ],
  openaiTemperature: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写温度',
    },
  ],
  mjTranslatePrompt: [
    {
      required: false,
      trigger: 'blur',
      message: '用于翻译 / 联想的提示词',
    },
  ],
  openaiVoice: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写openai的语音音色',
    },
  ],
  isConvertToBase64: [
    {
      required: false,
      trigger: 'blur',
      message: '是否转换为base64',
    },
  ],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'openaiBaseUrl',
      'openaiBaseKey',
      'openaiTimeout',
      'openaiBaseModel',
      'openaiTemperature',
      'mjNotSaveImg',
      'mjProxyImgUrl',
      'systemPreMessage',
      'mjNotUseProxy',
      'isMjTranslate',
      'isGeneratePromptReference',
      'mjTranslatePrompt',
      'isDalleChat',
      'isModelInherited',
      'openaiVoice',
      'isConvertToBase64',
    ],
  });
  const {
    openaiBaseUrl = '',
    openaiBaseKey = '',
    openaiTimeout = 300,
    openaiBaseModel = 'gpt-4o-mini',
    openaiTemperature = 1,
    isMjTranslate = '',
    isGeneratePromptReference = 0,
    // openaiaAtoDowngrade,
    mjNotSaveImg,
    mjProxyImgUrl,
    systemPreMessage,
    mjNotUseProxy,
    mjTranslatePrompt,
    isDalleChat,
    isModelInherited,
    openaiVoice,
    isConvertToBase64,
  } = res.data;
  Object.assign(formInline, {
    openaiBaseUrl,
    openaiBaseKey,
    openaiTimeout,
    isMjTranslate,
    isGeneratePromptReference,
    openaiTemperature,
    // openaiaAtoDowngrade: Number(openaiaAtoDowngrade),
    openaiBaseModel,
    mjNotSaveImg,
    mjProxyImgUrl,
    systemPreMessage,
    mjNotUseProxy,
    mjTranslatePrompt,
    isDalleChat,
    isModelInherited,
    openaiVoice,
    isConvertToBase64,
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
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">全局参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            系统默认的请求地址是
            <a href="https://api.openai.com" target="_blank"
              >https://api.openai.com</a
            >，国内服务器可能无法访问，需使用自己的代理或中转。
          </div>
          <div>
            此处配置为全局配置，一些系统内置的自动服务会使用到该模型。另外，当模型不配置
            Key 以及 Url 时，会使用全局配置。
          </div>
          <div>
            API 中转推荐
            <a
              href="https://api.lightai.io"
              target="_blank"
              style="margin-right: 10px"
              >https://api.lightai.io</a
            >，支持OpenAI，Midjourney
            以及多种国内外模型，无强制绑定关系，可按需选择。
          </div>
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form
        ref="formRef"
        :rules="rules"
        :model="formInline"
        label-width="220px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="请求地址"
              prop="openaiBaseUrl"
              label-width="120px"
            >
              <el-input
                v-model="formInline.openaiBaseUrl"
                placeholder="默认地址: https://api.openai.com 第三方代理推荐：https://api.lightai.io"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="全局key"
              prop="openaiBaseKey"
              label-width="120px"
            >
              <el-input
                v-model="formInline.openaiBaseKey"
                placeholder="请填写模型全局 Key 信息，当模型 Key 为空时调用"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="全局模型"
              prop="openaiBaseModel"
              label-width="120px"
            >
              <el-input
                v-model="formInline.openaiBaseModel"
                placeholder="全局模型配置，用于后台一些静默赋能操作"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="继承对话模型"
              prop="isModelInherited"
              label-width="120"
            >
              <el-switch
                v-model="formInline.isModelInherited"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后、对话模型将会继承上一次对话的模型、默认开启</p>
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
            <el-form-item
              label="base64 识图"
              prop="isConvertToBase64"
              label-width="120"
            >
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
            <el-form-item
              label="生成提问建议"
              prop="isGeneratePromptReference"
              label-width="120"
            >
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
            <el-form-item label="连续绘画" prop="isDalleChat" label-width="120">
              <el-switch
                v-model="formInline.isDalleChat"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    开启连续绘画会在使用 Dalle
                    绘图的时候,调用全局模型,根据上文总结绘画要求
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
            <el-form-item
              label="提示词优化"
              prop="isMjTranslate"
              label-width="120"
            >
              <el-switch
                v-model="formInline.isMjTranslate"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    开启优化后, MJ 提示词默认会使用全局模型进行翻译/联想,
                    不再单独扣费, 一般中转会自带翻译, 请根据实际情况选择。
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row v-if="[1].includes(Number(formInline.isMjTranslate))">
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="优化提示词"
              prop="mjTranslatePrompt"
              label-width="120px"
            >
              <el-input
                type="textarea"
                :rows="5"
                v-model="formInline.mjTranslatePrompt"
                placeholder="Midjourney 翻译/联想提示词"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="不存储图片"
              prop="mjNotSaveImg"
              label-width="120"
            >
              <el-switch
                v-model="formInline.mjNotSaveImg"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    默认会存储图片到配置的存储中、如果开启此选择则表示不保存原图到我们配置的存储上、直接反代访问原始图片、这样可以进一步节省空间、但访问速度及稳定性可能有所降低！
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
            <el-form-item
              label="不使用代理"
              prop="mjNotUseProxy"
              label-width="120"
            >
              <el-switch
                v-model="formInline.mjNotUseProxy"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    开启不使用代理将直接使用重中转获取到的链接、原生discord地址国内无法访问!
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="[0].includes(Number(formInline.mjNotUseProxy))">
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="反代地址"
              prop="mjProxyImgUrl"
              label-width="120px"
            >
              <el-input
                v-model="formInline.mjProxyImgUrl"
                placeholder="Midjourney 反代地址，为空将直接使用原链接"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="Temperature"
              prop="openaiTemperature"
              label-width="120px"
            >
              <el-input-number
                v-model="formInline.openaiTemperature"
                controls-position="right"
                :min="0"
                :max="2"
                :step="0.1"
                placeholder="模型 Temperature 设置，默认1"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="TTS 音色"
              prop="openaiVoice"
              label-width="120px"
            >
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
            <el-form-item
              label="超时时间"
              prop="openaiTimeout"
              label-width="120px"
            >
              <el-input
                v-model="formInline.openaiTimeout"
                placeholder="openai超时时间设置、默认300s 单位：秒（s）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="全局头部预设"
              prop="systemPreMessage"
              label-width="120px"
            >
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
        <!-- <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="是否自动降级"
              prop="openaiaAtoDowngrade"
              label-width="120"
            >
              <el-tooltip
                class="box-item"
                effect="dark"
                content="开启自动降级后、如果用户没有4的权限、将会自动降级为基础模型、并扣除3的余额！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.openaiaAtoDowngrade"
                  :active-value="1"
                  :inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row> -->
        <!-- <el-divider /> -->
      </el-form>
    </el-card>
  </div>
</template>
