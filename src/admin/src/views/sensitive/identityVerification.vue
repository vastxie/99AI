<route lang="yaml">
meta:
  title: 风控设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  appCode: '',
  openIdentity: '',
  openPhoneValidation: '', // 是否开启手机号验证
  phoneValidationMessageCount: '', // 多少消息后开启手机号验证
  identityVerificationMessageCount: '', // 多少消息后开启实名认证
  isSensitiveWordFilter: '', // 是否开启敏感词过滤
});

const rules = ref<FormRules>({
  appCode: [
    { required: true, trigger: 'blur', message: '请填写身份认证appCode' },
  ],
  openIdentity: [
    { required: true, trigger: 'blur', message: '请选择是否开启身份认证' },
  ],
  openPhoneValidation: [
    { required: true, trigger: 'blur', message: '请选择是否开启手机号验证' },
  ],
  phoneValidationMessageCount: [
    { required: true, trigger: 'blur', message: '请填写消息数量' },
  ],
  identityVerificationMessageCount: [
    { required: true, trigger: 'blur', message: '请填写消息数量' },
  ],
  isSensitiveWordFilter: [
    { required: true, trigger: 'blur', message: '请选择是否开启敏感词过滤' },
  ],
});

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'appCode',
      'openIdentity',
      'openPhoneValidation',
      'phoneValidationMessageCount',
      'identityVerificationMessageCount',
      'isSensitiveWordFilter',
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
        <div class="flex items-center gap-4">认证设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            实名认证接口使用阿里云<a
              href="https://market.aliyun.com/apimarket/detail/cmapi026109#sku=yuncode20109000025"
              target="_blank"
              >实名认证</a
            >，需自行开通并获取 appCode。
          </div>
          <div>
            开启实名认证/手机号验证后，当用户对话条数超过对应阈值时，将会触发实名认证/手机号验证。
          </div>
          <div>触发优先级：手机号验证 > 实名认证</div>
          <div>
            开启敏感词过滤后，将会对用户发送以及 AI 回复的消息进行敏感词过滤。
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
            <el-form-item label="开启实名验证" prop="openIdentity">
              <el-tooltip
                content="开启将打开实名验证"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.openIdentity"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="appCode" prop="appCode">
              <el-input
                v-model="formInline.appCode"
                placeholder="请填写实名认证 appCode"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启手机号验证" prop="openPhoneValidation">
              <el-switch
                v-model="formInline.openPhoneValidation"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="手机号验证阈值"
              prop="phoneValidationMessageCount"
            >
              <el-input
                v-model="formInline.phoneValidationMessageCount"
                placeholder="请填写消息数量"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="实名认证阈值"
              prop="identityVerificationMessageCount"
            >
              <el-input
                v-model="formInline.identityVerificationMessageCount"
                placeholder="请填写消息数量"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启敏感词过滤" prop="isSensitiveWordFilter">
              <el-switch
                v-model="formInline.isSensitiveWordFilter"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
