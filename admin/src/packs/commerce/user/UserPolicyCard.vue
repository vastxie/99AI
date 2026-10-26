<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormRules } from 'element-plus';
  import { nextTick, onMounted, reactive, ref } from 'vue';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  /** 「用户策略」页的商业包卡片：注册赠送、签到奖励、访客额度 */
  const formInline = reactive({
    registerSendStatus: '' as string | number,
    registerSendCredits: '',
    signInStatus: '',
    signInCredits: '',
    visitorCreditsNum: '',
  });

  /**
   * 访客功能开关（不单独保存）：由额度推导——额度大于 0 即开启。
   * 跟随保存成功与回滚后的额度（见下面的 write），不跟随正在输入的额度（输入 0 时那一行不会立刻消失）
   */
  const visitorEnabled = ref(false);

  const rules = ref<FormRules>({
    visitorCreditsNum: [{ required: true, trigger: 'blur', message: '请填写每日限制的积分额度' }],
    signInStatus: [{ required: true, trigger: 'blur', message: '请选择是否开启签到奖励' }],
    registerSendStatus: [{ required: true, trigger: 'change', message: '请确认是否开启注册赠送' }],
  });
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      read: (key) => (formInline as Record<string, unknown>)[key],
      write: (key, raw) => {
        // 注册赠送开关在界面上是数字（1 / 0），没配置过时保持空
        (formInline as Record<string, unknown>)[key] =
          key === 'registerSendStatus' && raw !== '' ? Number(raw) : raw;
        if (key === 'visitorCreditsNum') {
          visitorEnabled.value = Number(raw) > 0;
          if (visitorEnabled.value) lastVisitorCredits = raw;
        }
      },
    });

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'visitorCreditsNum',
          'registerSendStatus',
          'registerSendCredits',
          'signInCredits',
          'signInStatus',
        ],
      });
      Object.assign(formInline, {
        ...res.data,
        registerSendStatus: res.data.registerSendStatus ? Number(res.data.registerSendStatus) : '',
      });
      visitorEnabled.value = Number(formInline.visitorCreditsNum) > 0;
      if (visitorEnabled.value) lastVisitorCredits = String(formInline.visitorCreditsNum);
      await nextTick();
      // 已确认值记服务端的原始字符串，不记转换后的数字（否则与保存时的字符串永远比不上）
      initFromConfig(res.data);
    } catch {
      markLoadFailed();
    }
  }

  // 访客开关只写 0 / 恢复上次额度，不把管理员设好的额度覆盖成 1
  let lastVisitorCredits = '';
  function handleVisitorToggle(enabled: string | number | boolean) {
    if (enabled) {
      formInline.visitorCreditsNum = lastVisitorCredits || '1';
    } else {
      if (Number(formInline.visitorCreditsNum) > 0) {
        lastVisitorCredits = String(formInline.visitorCreditsNum);
      }
      formInline.visitorCreditsNum = '0';
    }
    saveField('visitorCreditsNum', formInline.visitorCreditsNum);
  }

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
    <page-panel title="额度与赠送">
      <el-form :rules="rules" :model="formInline" label-width="auto">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="是否开启注册赠送" prop="registerSendStatus">
              <el-switch
                :loading="saving('registerSendStatus')"
                v-model="formInline.registerSendStatus"
                :active-value="1"
                :inactive-value="0"
                @change="(val: any) => saveField('registerSendStatus', String(val))"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="注册赠送积分" prop="registerSendCredits">
              <el-input
                v-model="formInline.registerSendCredits"
                placeholder="首次注册赠送积分额度"
                clearable
                @blur="saveField('registerSendCredits', formInline.registerSendCredits)"
              />
            </el-form-item>
          </el-col>
        </el-row>
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
                  :loading="saving('signInStatus')"
                  v-model="formInline.signInStatus"
                  active-value="1"
                  inactive-value="0"
                  @change="(val: any) => saveField('signInStatus', String(val))"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="签到赠送积分" prop="signInCredits">
              <el-input
                v-model="formInline.signInCredits"
                type="number"
                placeholder="请填写签到赠送积分"
                clearable
                @blur="saveField('signInCredits', formInline.signInCredits)"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启访客功能">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="开启后，未登录的访客可以在限定额度内体验平台功能"
                placement="right"
              >
                <el-switch
                  v-model="visitorEnabled"
                  :loading="saving('visitorCreditsNum')"
                  @change="handleVisitorToggle"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <template v-if="visitorEnabled">
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="每日积分额度" prop="visitorCreditsNum">
                <el-input
                  v-model="formInline.visitorCreditsNum"
                  type="number"
                  placeholder="请填写访客每日积分额度"
                  clearable
                  @blur="saveField('visitorCreditsNum', formInline.visitorCreditsNum)"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>
    </page-panel>
  </ConfigLoadGuard>
</template>
