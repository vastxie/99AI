<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { LoginConfigTab } from '@/auth/loginConfigTabs';
  import { packLoginConfigTabs } from '@/packs';
  import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/access/login-config'));
  usePageDoc(docUrl);

  /**
   * 内核只有「账号密码」页签；各登录渠道的页签由对应扩展包贡献，包关闭 / 删除时页签自然消失。
   */
  const packTabs: LoginConfigTab[] = packLoginConfigTabs();
  const packTabComponents = packTabs.map((tab) => ({
    ...tab,
    view: defineAsyncComponent(tab.component),
  }));
  const activeLoginTab = ref('password');

  const formInline = reactive({
    passwordRegisterStatus: '',
  });
  const configKeys = Object.keys(formInline);
  const { loadFailed, isReady, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      form: formInline,
    });

  /** 未配置时后端视为开放注册 */
  const registerSwitchValue = computed({
    get: () => (formInline.passwordRegisterStatus === '' ? '1' : formInline.passwordRegisterStatus),
    set: (value: string) => {
      formInline.passwordRegisterStatus = value;
    },
  });

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({ keys: configKeys });
      Object.assign(formInline, res.data);
      await nextTick();
      initFromConfig(res.data, configKeys);
    } catch {
      markLoadFailed();
    }
  }

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <div>
    <page-panel>
      <el-tabs v-model="activeLoginTab" class="login-channel-tabs admin-page-tabs">
        <el-tab-pane label="账号密码" name="password">
          <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
            <el-form :model="formInline" label-width="170px">
              <el-row>
                <el-col :xs="24" :md="20" :lg="15" :xl="12">
                  <el-form-item label="开放自助注册" prop="passwordRegisterStatus">
                    <el-tooltip
                      class="box-item"
                      effect="dark"
                      content="开启后，用户端可以直接用用户名和密码注册账号；关闭后只能通过其它登录方式或由管理员创建账号"
                      placement="right"
                    >
                      <el-switch
                        :loading="saving('passwordRegisterStatus')"
                        v-model="registerSwitchValue"
                        active-value="1"
                        inactive-value="0"
                        @change="(val: any) => saveField('passwordRegisterStatus', String(val))"
                      />
                    </el-tooltip>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row>
                <el-col :xs="24" :md="20" :lg="15" :xl="12">
                  <div class="text-sm text-gray-500">
                    账号密码登录始终可用；找回密码需要至少一个已开启的验证码登录渠道（邮箱 /
                    手机号）。
                  </div>
                </el-col>
              </el-row>
            </el-form>
          </ConfigLoadGuard>
        </el-tab-pane>
        <el-tab-pane
          v-for="tab in packTabComponents"
          :key="tab.name"
          :label="tab.label"
          :name="tab.name"
        >
          <component :is="tab.view" />
        </el-tab-pane>
      </el-tabs>
    </page-panel>
  </div>
</template>

<style scoped>
  .login-channel-tabs {
    max-width: 1100px;
  }

  .login-channel-tabs :deep(.el-tabs__header) {
    margin-bottom: 0;
  }

  .login-channel-tabs :deep(.el-tabs__content) {
    padding-top: 18px;
  }
</style>
