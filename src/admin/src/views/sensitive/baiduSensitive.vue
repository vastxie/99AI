<route lang="yaml">
meta:
  title: 百度云敏感词设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  baiduTextStatus: '',
  baiduTextApiKey: '',
  baiduTextSecretKey: '',
});

const rules = ref<FormRules>({
  baiduTextStatus: [
    { required: true, trigger: 'blur', message: '请选择是否启用百度文本审核' },
  ],
  baiduTextSecretKey: [
    { required: true, trigger: 'blur', message: '请填写百度文本审核SecretKey' },
  ],
  baiduTextApiKey: [
    { required: true, trigger: 'blur', message: '请填写百度文本审核APIKey' },
  ],
});

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: ['baiduTextStatus', 'baiduTextSecretKey', 'baiduTextApiKey'],
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
        <div class="flex items-center gap-4">百度文本审核参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            当前百度云免费5万条，可查看<a
              href="https://console.bce.baidu.com/ai/#/ai/antiporn/overview/index"
              target="_blank"
              >使用文档</a
            >，如果百度云敏感词与自定义敏感词都配置的情况，会先检测百度云后检测自定义的敏感词。
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
            <el-form-item label="开启此敏感词设置" prop="baiduTextStatus">
              <el-tooltip
                content="开启将打开敏感词检测、如果同时开启其他敏感词将会通过菜单顺序仅同时开启一个！"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.baiduTextStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="文本审核ApiKey" prop="baiduTextApiKey">
              <el-input
                v-model="formInline.baiduTextApiKey"
                placeholder="请填写百度文本审核ApiKey"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="文本审核SecretKey" prop="baiduTextSecretKey">
              <el-input
                v-model="formInline.baiduTextSecretKey"
                placeholder="请填写百度文本审核SecretKey"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
