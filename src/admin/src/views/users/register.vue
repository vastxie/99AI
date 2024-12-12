<route lang="yaml">
meta:
  title: 访问配置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  registerSendStatus: '',
  registerSendModel3Count: '',
  registerSendModel4Count: '',
  registerSendDrawMjCount: '',
  firstRegisterSendStatus: 0,
  firstRegisterSendRank: '',
  firstRregisterSendModel3Count: '',
  firstRregisterSendModel4Count: '',
  firstRregisterSendDrawMjCount: '',
  signInStatus: '',
  signInModel3Count: '',
  signInModel4Count: '',
  signInMjDrawToken: '',
  visitorModel3Num: null,
  visitorModel4Num: null,
  visitorMJNum: null,
});

const rules = ref<FormRules>({
  visitorModel3Num: [
    {
      required: true,
      trigger: 'blur',
      message: '请填写每日限制的基础模型积分',
    },
  ],
  visitorModel4Num: [
    {
      required: true,
      trigger: 'blur',
      message: '请填写每日限制的高级模型积分',
    },
  ],
  visitorMJNum: [
    {
      required: true,
      trigger: 'blur',
      message: '请填写每日限制的绘画额度积分',
    },
  ],
  signInStatus: [
    { required: true, trigger: 'blur', message: '请选择是否开启签到奖励' },
  ],
  signInModel3Count: [
    { required: true, trigger: 'blur', message: '请填写赠送的基础模型额度' },
  ],
  signInModel4Count: [
    { required: true, trigger: 'blur', message: '请填写赠送的高级模型额度' },
  ],
  signInMjDrawToken: [
    { required: true, trigger: 'blur', message: '请填写赠送的绘画Token数量' },
  ],

  registerSendStatus: [
    { required: true, trigger: 'change', message: '请确认是否开启注册赠送' },
  ],
  firstRegisterSendStatus: [
    {
      required: true,
      trigger: 'change',
      message: '请确认是否开启优先注册赠送',
    },
  ],
});
const formRef = ref<FormInstance>();
async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'visitorModel4Num',
      'visitorModel3Num',
      'visitorMJNum',
      'registerSendStatus',
      'registerSendModel3Count',
      'registerSendModel4Count',
      'registerSendDrawMjCount',
      'firstRegisterSendStatus',
      'firstRegisterSendRank',
      'firstRregisterSendModel3Count',
      'firstRregisterSendModel4Count',
      'firstRregisterSendDrawMjCount',
      'signInModel3Count',
      'signInModel4Count',
      'signInMjDrawToken',
      'signInStatus',
    ],
  });
  res.data.firstRegisterSendStatus &&
    (res.data.firstRegisterSendStatus = Number(
      res.data.firstRegisterSendStatus
    ));
  res.data.registerSendStatus &&
    (res.data.registerSendStatus = Number(res.data.registerSendStatus));

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

const firstSendRules = computed(() => {
  return [
    {
      required: formInline.firstRegisterSendStatus,
      message: '开启优先注册赠送选项后需填写此项',
      trigger: 'change',
    },
  ];
});
const registerSendRules = computed(() => {
  return [
    {
      required: formInline.registerSendStatus,
      message: '开启注册赠送选项后需填写此项',
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
        <div class="flex items-center gap-4">基础访问设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            注册与访问设置支持为新用户定义默认赠送额度，涵盖对话次数、普通绘画次数和高级绘画次数。
          </div>
          <div>
            系统还为最初注册的前x名用户提供额外奖励，同时允许通过邀请机制为新用户及邀请者设置特定的奖励额度。
          </div>
          <div>
            此外，管理员可配置签到奖励和为访客分配可使用的额度，以鼓励日常活跃和吸引更多用户体验平台。
          </div>
        </div>
      </template>
      <HButton outline text @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form
        ref="formRef"
        :rules="rules"
        :model="formInline"
        label-width="220px"
      >
        <h5>注册赠送</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="是否开启注册赠送" prop="registerSendStatus">
              <el-switch
                v-model="formInline.registerSendStatus"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="注册赠送基础模型对话额度"
              prop="registerSendModel3Count"
            >
              <el-input
                v-model="formInline.registerSendModel3Count"
                placeholder="首次注册赠基础模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="注册赠送高级模型对话额度"
              prop="registerSendModel4Count"
            >
              <el-input
                v-model="formInline.registerSendModel4Count"
                placeholder="首次注册赠高级模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="注册赠送绘画额度"
              prop="registerSendDrawMjCount"
            >
              <el-input
                v-model="formInline.registerSendDrawMjCount"
                placeholder="首次注册赠送MJ额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <h5>限定注册赠送</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="开启优先注册赠送"
              prop="firstRegisterSendStatus"
            >
              <el-switch
                v-model="formInline.firstRegisterSendStatus"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="前多少名获得奖励" prop="firstRegisterSendRank">
              <el-input
                v-model="formInline.firstRegisterSendRank"
                placeholder="设置优先注册前N名可以获得奖励"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="优先赠基础模型送对话额度"
              prop="firstRregisterSendModel3Count"
            >
              <el-input
                v-model="formInline.firstRregisterSendModel3Count"
                placeholder="优先注册用户额外赠送基础模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="优先赠高级模型送对话额度"
              prop="firstRregisterSendModel4Count"
            >
              <el-input
                v-model="formInline.firstRregisterSendModel4Count"
                placeholder="优先注册用户额外赠送高级模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="优先赠送绘画额度"
              prop="firstRregisterSendDrawMjCount"
            >
              <el-input
                v-model="formInline.firstRregisterSendDrawMjCount"
                placeholder="优先注册用户额外赠送MJ额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <h5>签到奖励</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启签到奖励" prop="signInStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用签到奖励、则用户端则可以通过每日签到获取额度！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.signInStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="赠送基础模型额度" prop="signInModel3Count">
              <el-input
                v-model="formInline.signInModel3Count"
                type="number"
                placeholder="请填写签到赠送的基础模型额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="赠送高级模型额度" prop="signInModel4Count">
              <el-input
                v-model="formInline.signInModel4Count"
                type="number"
                placeholder="请填写签到赠送的高级模型额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="赠送绘画额度" prop="signInMjDrawToken">
              <el-input
                v-model="formInline.signInMjDrawToken"
                type="number"
                placeholder="请填写签到赠送绘画额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <h5>访客设置</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="基础模型额度" prop="visitorModel3Num">
              <el-input
                v-model="formInline.visitorModel3Num"
                type="number"
                placeholder="请填写每日限制基础模型积分"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="高级模型额度" prop="visitorModel4Num">
              <el-input
                v-model="formInline.visitorModel4Num"
                type="number"
                placeholder="请填写每日限制的高级模型积分"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绘画积分额度" prop="visitorMJNum">
              <el-input
                v-model="formInline.visitorMJNum"
                type="number"
                placeholder="请填写每日限制的绘画额度积分"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>

<style>
.tips {
  font-size: 12px;
  color: #7a7474;
  margin-left: 14px;
}
</style>
