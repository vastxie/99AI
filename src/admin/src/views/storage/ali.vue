<route lang="yaml">
meta:
  title: 阿里云oss设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  aliOssStatus: '',
  aliOssAccessKeyId: '',
  aliOssAccessKeySecret: '',
  aliOssRegion: '',
  aliOssBucket: '',
  aliOssAcceleratedDomain: '',
});

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'aliOssAccessKeySecret',
      'aliOssRegion',
      'aliOssBucket',
      'aliOssAccessKeyId',
      'aliOssStatus',
      'aliOssAcceleratedDomain',
    ],
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

const customRules = computed(() => {
  return [
    {
      required: Number(formInline.aliOssStatus) === 1,
      message: '开启配置后请填写此项',
      trigger: 'change',
    },
  ];
});

onMounted(() => {
  queryAllconfig();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">阿里云OSS参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            需前往阿里云申请对象存储服务，更多配置及申请详见<a
              href="https://oss.console.aliyun.com"
              target="_blank"
              >阿里云OSS</a
            >
            。如果同时开启多个存储服务，腾讯云优先级高于阿里云。
          </div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :model="formInline" label-width="120px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="服务启用状态" prop="aliOssStatus">
              <el-switch
                v-model="formInline.aliOssStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="accessKeyId"
              prop="aliOssAccessKeyId"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.aliOssAccessKeyId"
                placeholder="请填写SecretId"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="keySecret"
              prop="aliOssAccessKeySecret"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.aliOssAccessKeySecret"
                placeholder="请填写SecretKey"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="存储桶名称"
              prop="aliOssBucket"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.aliOssBucket"
                placeholder="请填写存储桶名称"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="所属地域"
              prop="aliOssRegion"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.aliOssRegion"
                placeholder="请填写所属地域(oss-cn-shanghai)"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全球加速域名" prop="aliOssAcceleratedDomain">
              <el-input
                v-model="formInline.aliOssAcceleratedDomain"
                placeholder="如您是国外服务器可开启全球加速域名得到更快响应速度、同理也会更高计费！"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
