<route lang="yaml">
meta:
  title: 腾讯云cos设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  tencentCosStatus: '',
  cosSecretId: '',
  cosSecretKey: '',
  cosBucket: '',
  cosRegion: '',
  tencentCosAcceleratedDomain: '',
});

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'cosSecretKey',
      'cosBucket',
      'cosRegion',
      'cosSecretId',
      'tencentCosStatus',
      'tencentCosAcceleratedDomain',
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
      required: Number(formInline.tencentCosStatus) === 1,
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
        <div class="flex items-center gap-4">腾讯云COS参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            需前往腾讯云申请对象存储服务，更多配置及申请详见<a
              href="https://console.cloud.tencent.com/cos"
              target="_blank"
              >腾讯云COS</a
            >
            。
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
            <el-form-item label="启用状态" prop="tencentCosStatus">
              <el-switch
                v-model="formInline.tencentCosStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="SecretId"
              prop="cosSecretId"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.cosSecretId"
                placeholder="请填写SecretId"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="SecretKey"
              prop="cosSecretKey"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.cosSecretKey"
                placeholder="请填写SecretKey"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="存储桶名称"
              prop="cosBucket"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.cosBucket"
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
              prop="cosRegion"
              :rules="customRules"
            >
              <el-input
                v-model="formInline.cosRegion"
                placeholder="请填写所属地域(ap-guangzhou)"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="全球加速域名"
              prop="tencentCosAcceleratedDomain"
            >
              <el-input
                v-model="formInline.tencentCosAcceleratedDomain"
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
