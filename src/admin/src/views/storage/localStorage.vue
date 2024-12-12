<route lang="yaml">
meta:
  title: 本地存储配置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  localStorageStatus: '',
  siteUrl: '',
});

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: ['localStorageStatus', 'siteUrl'],
  });
  Object.assign(formInline, res.data);
}

const rules = ref<FormRules>({
  siteUrl: [{ required: true, message: '请输入网站地址', trigger: 'blur' }],
});

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
        <div class="flex items-center gap-4">本地存储参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            开启后将优先使用本地存储方式保存数据，有些场景需开启跨域访问，可能需额外自行解决读写权限问题。
          </div>
          <div>
            文件存储目录为 /public/file，更新迁移时请做好数据维护及备份。
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
        :model="formInline"
        label-width="120px"
        :rules="rules"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="启用状态" prop="localStorageStatus">
              <el-switch
                v-model="formInline.localStorageStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站地址" prop="siteUrl">
              <el-input
                v-model="formInline.siteUrl"
                placeholder="网站地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
