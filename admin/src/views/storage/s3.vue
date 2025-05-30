<route lang="yaml">
meta:
  title: S3存储设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormInstance } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { onMounted, reactive, ref } from 'vue';

  const formInline = reactive({
    s3Status: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3Region: '',
    s3Bucket: '',
    s3Endpoint: '',
    s3CustomDomain: '',
  });

  const formRef = ref<FormInstance>();

  async function queryAllconfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        's3Status',
        's3AccessKeyId',
        's3SecretAccessKey',
        's3Region',
        's3Bucket',
        's3Endpoint',
        's3CustomDomain',
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
        required: Number(formInline.s3Status) === 1,
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
        <div class="flex items-center gap-4">S3存储参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            支持亚马逊S3存储协议，兼容AWS S3、MinIO、Wasabi、Backblaze B2等S3兼容服务。
            更多配置详见<a href="https://aws.amazon.com/s3/" target="_blank">AWS S3文档</a>
            。如果同时开启多个存储服务，服务优先级：本地存储 > S3存储 > 腾讯云COS > 阿里云OSS。
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
            <el-form-item label="服务启用状态" prop="s3Status">
              <el-switch v-model="formInline.s3Status" active-value="1" inactive-value="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AccessKeyId" prop="s3AccessKeyId" :rules="customRules">
              <el-input
                v-model="formInline.s3AccessKeyId"
                placeholder="请填写Access Key ID"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SecretAccessKey" prop="s3SecretAccessKey" :rules="customRules">
              <el-input
                v-model="formInline.s3SecretAccessKey"
                placeholder="请填写Secret Access Key"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="存储桶名称" prop="s3Bucket" :rules="customRules">
              <el-input v-model="formInline.s3Bucket" placeholder="请填写存储桶名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="所属地域" prop="s3Region">
              <el-input
                v-model="formInline.s3Region"
                placeholder="请填写所属地域(us-east-1)，可留空使用默认地域"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="自定义端点" prop="s3Endpoint">
              <el-input
                v-model="formInline.s3Endpoint"
                placeholder="自定义S3端点，如MinIO服务地址(https://minio.example.com)，AWS S3可留空"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="自定义域名" prop="s3CustomDomain">
              <el-input
                v-model="formInline.s3CustomDomain"
                placeholder="自定义访问域名，如CDN域名(cdn.example.com)，可留空使用默认域名"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
