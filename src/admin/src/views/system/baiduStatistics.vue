<route lang="yaml">
meta:
  title: 百度统计
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  baiduCode: '',
  baiduSiteId: '',
  baiduToken: '',
  baiduApiKey: '',
  baiduSecretKey: '',
  baiduRefreshToken: '',
});
const rules = ref<FormRules>({});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'baiduCode',
      'baiduSiteId',
      'baiduToken',
      'baiduApiKey',
      'baiduSecretKey',
      'baiduRefreshToken',
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

onMounted(() => {
  queryAllconfig();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">百度统计设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>百度统计主要用于展示，实际的统计数据将在网站首页显示。</div>
          <div>
            为获取更精确的数据分析，请参考<a
              href="https://tongji.baidu.com/api/manual/Chapter2/openapi.html"
              target="_blank"
              >百度统计接口说明</a
            >，申请专属于您网站的 siteId 、key 以及 token 等信息。
          </div>
          <div>
            百度统计提供的是一项免费服务，如果您选择不使用这项服务，只需将相关设置项留空即可。
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
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="siteId" prop="baiduSiteId">
              <el-input
                v-model="formInline.baiduSiteId"
                placeholder="请填写百度site_id"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="ApiKey" prop="baiduApiKey">
              <el-input
                v-model="formInline.baiduApiKey"
                placeholder="请填写百度apiKey"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SecretKey" prop="baiduSecretKey">
              <el-input
                v-model="formInline.baiduSecretKey"
                placeholder="请填写百度 secretKey"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AccessToken" prop="baiduToken">
              <el-input
                v-model="formInline.baiduToken"
                placeholder="请填写百度 access_token"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="RefreshToken" prop="baiduRefreshToken">
              <el-input
                v-model="formInline.baiduRefreshToken"
                placeholder="请填写百度 refresh_token"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="统计代码" prop="baiduCode">
              <el-input
                v-model="formInline.baiduCode"
                placeholder="填写百度统计代码可统计每日访问量详情，如果没有使用用请查看详细文档！"
                type="textarea"
                :rows="12"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
