<route lang="yaml">
meta:
  title: 欢迎页设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  clientHomePath: '',
  homeHtml: '',
});
const rules = ref<FormRules>({
  siteName: [{ required: true, trigger: 'blur', message: '请填写网站名称' }],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: ['clientHomePath', 'homeHtml'],
  });
  Object.assign(formInline, res.data);
}

function handlerUpdateConfig() {
  formRef.value?.validate(async (valid) => {
    if (valid) {
      try {
        await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
        ElMessage.success('变更欢迎页设置成功');
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
        <div class="flex items-center gap-4">欢迎页设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            欢迎页设置支持配置访问首页时的默认显示内容。可以启用欢迎页，或直接跳转到聊天页面。
          </div>
          <div>若启用欢迎页，可以在此处自定义欢迎页面内容。</div>
          <div class="mt-2 text-gray-500">
            <strong>推荐：</strong> 您可以在其他专业的 HTML 编辑器（如 VS
            Code、Sublime
            Text）中编辑欢迎页面内容并复制粘贴到此处，以获得更好的编辑体验。
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
          <el-col :xs="24" :md="24" :lg="24" :xl="24">
            <el-form-item label="开启欢迎页" prop="clientHomePath">
              <el-switch
                v-model="formInline.clientHomePath"
                :active-value="'/home'"
                :inactive-value="'/chat'"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row v-if="formInline.clientHomePath === '/home'">
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="欢迎页（HTML）" prop="homeHtml">
              <el-input
                v-model="formInline.homeHtml"
                placeholder="请输入自定义欢迎页内容"
                type="textarea"
                :rows="10"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-col :xs="28" :md="24" :lg="20" :xl="12" style="margin-top: 20px">
          <el-form-item label="预览">
            <iframe
              class="w-full h-100 border border-gray-200 rounded-md bg-gray-100"
              :srcdoc="formInline.homeHtml"
              sandbox="allow-same-origin allow-scripts"
            ></iframe>
          </el-form-item>
        </el-col>
      </el-form>
    </el-card>
  </div>
</template>
