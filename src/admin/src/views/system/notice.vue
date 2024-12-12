<route lang="yaml">
meta:
  title: 公告设置
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
  isAutoOpenNotice: '',
  noticeInfo: '',
  noticeTitle: '',
});

const theme = computed(() => {
  return settingsStore.settings.app.colorScheme;
});

const rules = ref<FormRules>({
  noticeTitle: [{ required: true, trigger: 'blur', message: '请填写公告标题' }],
  noticeInfo: [
    { required: true, trigger: 'blur', message: '请填写公告具体信息' },
  ],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: ['noticeInfo', 'noticeTitle', 'isAutoOpenNotice'],
  });
  const { noticeInfo, noticeTitle, isAutoOpenNotice } = res.data;
  noticeInfo &&
    Object.assign(formInline, { noticeInfo, noticeTitle, isAutoOpenNotice });
}

function handlerUpdateConfig() {
  formRef.value?.validate(async (valid: any) => {
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
            ElMessage.error('图片上传失败、请检查您的配置信息！');
          }
          resovle(res.data.data);
        } catch (error) {
          ElMessage.error(error || '图片上传失败、请检查您的配置信息！');
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
        <div class="flex items-center gap-4">公告设置说明</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            公告设置用于配置用户端显示的公告页面。支持使用Markdown语法或HTML标签来创建内容，为灵活的内容格式提供便利。
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
            <el-form-item label="公告标题" prop="noticeTitle">
              <el-input
                v-model="formInline.noticeTitle"
                :rows="1"
                placeholder="公告标题"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :offset="2" :xs="24" :md="20" :lg="15" :xl="10">
            <el-form-item label="自动打开公告" prop="isAutoOpenNotice">
              <el-tooltip
                content="设为自动打开则网站初始化会打开、用户仍可以选择24小时不再查看、选择关闭则不会主动打开！"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.isAutoOpenNotice"
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
            <el-form-item label="公告信息" prop="noticeInfo">
              <MdEditor
                v-model="formInline.noticeInfo"
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
