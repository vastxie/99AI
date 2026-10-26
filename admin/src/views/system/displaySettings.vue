<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormRules } from 'element-plus';
  import { nextTick, onMounted, reactive, ref, computed } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';
  import { ALL_LANGUAGES, parseEnabledLanguages, useLanguageSettings } from './languageSettings';

  const docUrl = computed(() => getDocUrl('/configuration/platform/display-settings'));
  usePageDoc(docUrl);

  const formInline = reactive({
    showWatermark: '',
    defaultLanguage: 'zh-CN',
    enabledLanguages: ['zh-CN', 'en-US'],
  });
  const rules = ref<FormRules>({
    enabledLanguages: [
      {
        required: true,
        type: 'array',
        min: 1,
        message: '请至少选择一种语言',
        trigger: 'change',
      },
    ],
    defaultLanguage: [{ required: true, message: '请选择默认语言', trigger: 'change' }],
  });

  const allLanguages = ALL_LANGUAGES;

  const autoSave = useConfigAutoSave({
    form: formInline,
    codecs: {
      enabledLanguages: {
        toRaw: (value) => JSON.stringify(parseEnabledLanguages(value)),
        fromRaw: (raw) => parseEnabledLanguages(raw),
      },
    },
  });
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField, saving } = autoSave;
  const { onEnabledLanguagesChange, onDefaultLanguageChange } = useLanguageSettings(
    formInline,
    autoSave,
  );

  // 计算属性：根据启用的语言动态生成默认语言的选项
  const availableDefaultLanguages = computed(() => {
    if (!formInline.enabledLanguages || formInline.enabledLanguages.length === 0) {
      return [];
    }
    return allLanguages.filter((lang) => formInline.enabledLanguages.includes(lang.value));
  });

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: ['showWatermark', 'defaultLanguage', 'enabledLanguages'],
      });
      Object.assign(formInline, res.data);
      formInline.enabledLanguages = parseEnabledLanguages(formInline.enabledLanguages);
      await nextTick();
      // 已确认值记服务端的原始字符串；界面的解析与默认值只在加载映射与 codecs 里
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
        <el-form :rules="rules" :model="formInline" label-width="150px">
          <el-divider content-position="left">语言设置</el-divider>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="启用的语言" prop="enabledLanguages">
                <el-checkbox-group
                  v-model="formInline.enabledLanguages"
                  @change="(val: any) => onEnabledLanguagesChange(val)"
                >
                  <el-checkbox v-for="lang in allLanguages" :key="lang.value" :value="lang.value">
                    {{ lang.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="默认语言" prop="defaultLanguage">
                <el-select
                  v-model="formInline.defaultLanguage"
                  placeholder="请选择默认语言"
                  :disabled="
                    !formInline.enabledLanguages || formInline.enabledLanguages.length === 0
                  "
                  @change="onDefaultLanguageChange"
                >
                  <el-option
                    v-for="lang in availableDefaultLanguages"
                    :key="lang.value"
                    :label="lang.label"
                    :value="lang.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">界面</el-divider>

          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="显示全局水印" prop="showWatermark">
                <el-switch
                  :loading="saving('showWatermark')"
                  v-model="formInline.showWatermark"
                  active-value="1"
                  inactive-value="0"
                  @change="(val: any) => saveField('showWatermark', String(val))"
                />
                <el-tooltip class="box-item" effect="dark" placement="right">
                  <template #content>
                    <div style="width: 250px">
                      <p>开启后将在对话页面显示用户名水印，增强内容安全性</p>
                    </div>
                  </template>
                  <el-icon class="admin-help-icon">
                    <AppIcon name="i-lucide:circle-help" />
                  </el-icon>
                </el-tooltip>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>
