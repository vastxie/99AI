<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { computed, nextTick, onMounted, reactive } from 'vue';
  import { packUserPolicyCards } from '@/packs';
  import { resolvePackComponent } from '@/core/packs/resolve';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/users/user-settings'));
  usePageDoc(docUrl);

  /** 内核只管登录设备数；注册赠送 / 签到 / 访客额度等由扩展包以卡片形式贡献 */
  const formInline = reactive({
    maxDevices: '',
  });
  const policyCards = packUserPolicyCards().map((card) => ({
    id: card.id,
    view: resolvePackComponent(card.id, card.component),
  }));
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField } = useConfigAutoSave({
    form: formInline,
  });

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({ keys: ['maxDevices'] });
      Object.assign(formInline, res.data);
      await nextTick();
      initFromConfig(res.data);
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
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
      <page-panel>
        <el-form :model="formInline" label-width="auto">
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="最大登录设备数" prop="maxDevices">
                <el-input
                  v-model="formInline.maxDevices"
                  type="number"
                  placeholder="默认为3个设备"
                  clearable
                  @blur="saveField('maxDevices', formInline.maxDevices)"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </page-panel>
    </ConfigLoadGuard>
    <!-- 扩展包贡献的用户策略卡片（如注册赠送 / 签到 / 访客额度） -->
    <component v-for="card in policyCards" :key="card.id" :is="card.view" />
  </div>
</template>
