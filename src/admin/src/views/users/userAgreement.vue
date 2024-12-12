<route lang="yaml">
meta:
  title: 用户协议
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import useSettingsStore from '@/store/modules/settings';
import axios from 'axios';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { computed, onMounted, reactive, ref } from 'vue';

const settingsStore = useSettingsStore();
const formInline = reactive({
  isAutoOpenAgreement: '',
  agreementInfo: '',
  agreementTitle: '',
});

const theme = computed(() => {
  return settingsStore.settings.app.colorScheme;
});

const rules = ref<FormRules>({
  agreementTitle: [
    { required: true, trigger: 'blur', message: '请填写用户协议标题' },
  ],
  agreementInfo: [
    { required: true, trigger: 'blur', message: '请填写用户协议具体内容' },
  ],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: ['agreementInfo', 'agreementTitle', 'isAutoOpenAgreement'],
  });
  const { agreementInfo, agreementTitle, isAutoOpenAgreement } = res.data;
  agreementInfo &&
    Object.assign(formInline, {
      agreementInfo,
      agreementTitle,
      isAutoOpenAgreement,
    });
}

function handlerUpdateConfig() {
  formRef.value?.validate(async (valid: any) => {
    if (valid) {
      try {
        await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
        ElMessage.success('变更用户协议信息成功');
      } catch (error) {}
      queryAllconfig();
    } else {
      ElMessage.error('请填写完整信息');
    }
  });
}

const uploadUrl = ref(
  `${import.meta.env.VITE_APP_API_BASEURL}/upload/file?dir=${encodeURIComponent(
    'system/others'
  )}`
);

function fotmatSetting(settings: any) {
  return Object.keys(settings).map((key) => {
    return {
      configKey: key,
      configVal: settings[key],
    };
  });
}

function onChange(val: any) {}

async function onUploadImg(
  files: Iterable<Blob> | ArrayLike<Blob>,
  callback: (arg0: unknown[]) => void
) {
  const res = await Promise.all(
    Array.from(files).map((file) => {
      return new Promise(async (resovle, reject) => {
        const form = new FormData();
        form.append('file', file);
        try {
          const res = await axios.post(uploadUrl.value, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (!res?.data?.data) {
            ElMessage.error('图片上传失败，请检查您的配置信息！');
          }
          resovle(res.data.data);
        } catch (error) {
          ElMessage.error(error || '图片上传失败，请检查您的配置信息！');
          reject(error);
        }
      });
    })
  );
  callback(res.map((item) => item));
  ElMessage({ message: '图片上传成功！', type: 'success' });
}

onMounted(() => {
  queryAllconfig();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">用户协议设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            用户协议设置用于配置用户端显示的用户协议页面。支持使用Markdown语法或HTML标签来创建内容，为灵活的内容格式提供便利。
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
        label-width="120px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="10">
            <el-form-item label="用户协议标题" prop="agreementTitle">
              <el-input
                v-model="formInline.agreementTitle"
                :rows="1"
                placeholder="用户协议标题"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="20" :lg="15" :xl="10">
            <el-form-item label="开启用户协议" prop="isAutoOpenAgreement">
              <el-tooltip
                content="开启后，用户在注册时将会弹出用户协议页面"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isAutoOpenAgreement"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
            <el-col :xs="24" :md="20" :lg="15" :xl="12" />
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-form-item label="用户协议内容" prop="agreementInfo">
              <MdEditor
                v-model="formInline.agreementInfo"
                style="min-height: 80vh"
                @on-change="onChange"
                @on-upload-img="onUploadImg"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
