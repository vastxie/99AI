<route lang="yaml">
meta:
  title: 基础设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import { QuestionFilled } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  pluginUrl: '',
  pluginKey: '',
  siteRobotName: '',
  pluginFirst: '1',
  isHidePlugin: '0',
});

const rules = ref<FormRules>({
  pluginUrl: [{ required: true, trigger: 'blur', message: '请填写插件地址' }],
  pluginKey: [{ required: true, trigger: 'blur', message: '请填写插件key' }],
});

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

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: ['pluginUrl', 'pluginKey', 'pluginFirst', 'isHidePlugin'],
  });
  Object.assign(formInline, res.data);
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
        <div class="flex items-center gap-4">插件应用基础配置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            插件基础配置，包括联网插件地址、联网插件
            Key、隐藏插件、插件优先显示等。
          </div>
          <div>
            联网插件已支持多种方式：

            <a href="https://bigmodel.cn" target="_blank">智谱 web-search-pro</a
            >、
            <a href="https://open.bochaai.com" target="_blank"
              >博查 web-search</a
            >、
            <a href="https://app.tavily.com/home" target="_blank">Tavily</a>
            需自行登录以上网站，获取对应的 Key（多个Key用英文逗号隔开）。
          </div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form
        ref="formRef"
        :rules="rules"
        :model="formInline"
        label-width="150px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="联网插件地址" prop="pluginUrl">
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
            <el-form-item label="联网插件 Key" prop="pluginKey">
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
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏插件" prop="isHidePlugin">
              <el-switch
                v-model="formInline.isHidePlugin"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将隐藏插件功能</p>
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
            <el-form-item label="插件优先显示" prop="pluginFirst">
              <el-switch
                v-model="formInline.pluginFirst"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，对话页默认优先显示插件</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
