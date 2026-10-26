<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import useThemeStore from '@/store/modules/theme';
  import type { FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { MdEditor } from 'md-editor-v3';
  import 'md-editor-v3/lib/style.css';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useAssetUpload, { getUploadedUrl } from '@/utils/composables/useAssetUpload';
  import useConfigAutoSave, { normalizeConfigValue } from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/platform/announcement-settings'));
  usePageDoc(docUrl);

  const themeStore = useThemeStore();
  const activeTab = ref('notice');

  // 公告表单数据
  const noticeForm = reactive({
    // 默认为 0（关闭）
    isAutoOpenNotice: 0,
    noticeInfo: '',
    noticeTitle: '',
  });

  // 用户协议表单数据
  const agreementForm = reactive({
    // 默认为 0（关闭）
    isAutoOpenAgreement: 0,
    agreementInfo: '',
    agreementTitle: '',
  });

  /** 两个表单的字段名不重叠：保存结果写回各自的表单；开关在界面上是数字 */
  const switchCodec = {
    toRaw: (value: unknown) => normalizeConfigValue(value),
    fromRaw: (raw: string) => (raw ? Number(raw) : 0),
  };
  const formOf = (key: string): Record<string, any> =>
    key in noticeForm ? noticeForm : agreementForm;
  const { isReady, loadFailed, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      read: (key) =>
        key === 'isAutoOpenNotice' || key === 'isAutoOpenAgreement'
          ? switchCodec.toRaw(formOf(key)[key])
          : formOf(key)[key],
      write: (key, raw) => {
        formOf(key)[key] =
          key === 'isAutoOpenNotice' || key === 'isAutoOpenAgreement'
            ? switchCodec.fromRaw(raw)
            : raw;
      },
    });

  // 编辑器随当前实际生效的明暗模式（跟随系统时取系统当前的模式）
  const theme = computed(() => themeStore.scheme);

  // 公告表单验证规则
  const noticeRules = ref<FormRules>({
    noticeTitle: [{ required: true, trigger: 'blur', message: '请填写公告标题' }],
    noticeInfo: [{ required: true, trigger: 'blur', message: '请填写公告具体信息' }],
  });

  // 用户协议表单验证规则
  const agreementRules = ref<FormRules>({
    agreementTitle: [{ required: true, trigger: 'blur', message: '请填写用户协议标题' }],
    agreementInfo: [{ required: true, trigger: 'blur', message: '请填写用户协议具体内容' }],
  });

  // 内容配置状态
  interface ContentStatus {
    configured: boolean;
    title?: string;
    missing: string[];
  }

  const contentStatus = ref<Record<string, ContentStatus>>({
    notice: {
      configured: false,
      missing: [],
    },
    agreement: {
      configured: false,
      missing: [],
    },
  });

  // 查询所有配置
  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'noticeInfo',
          'noticeTitle',
          'isAutoOpenNotice',
          'agreementInfo',
          'agreementTitle',
          'isAutoOpenAgreement',
        ],
      });

      const {
        noticeInfo,
        noticeTitle,
        isAutoOpenNotice,
        agreementInfo,
        agreementTitle,
        isAutoOpenAgreement,
      } = res.data;

      // 更新公告表单
      Object.assign(noticeForm, {
        noticeInfo: noticeInfo || '',
        noticeTitle: noticeTitle || '',
        // 转换为数字类型，如果是字符串 "1" 转为 1，"0" 转为 0，空值默认为 0
        isAutoOpenNotice: isAutoOpenNotice ? Number(isAutoOpenNotice) : 0,
      });

      // 更新用户协议表单
      Object.assign(agreementForm, {
        agreementInfo: agreementInfo || '',
        agreementTitle: agreementTitle || '',
        // 转换为数字类型，如果是字符串 "1" 转为 1，"0" 转为 0，空值默认为 0
        isAutoOpenAgreement: isAutoOpenAgreement ? Number(isAutoOpenAgreement) : 0,
      });

      // 更新配置状态
      updateContentStatus();

      await nextTick();
      initFromConfig(res.data);
    } catch {
      markLoadFailed();
    }
  }

  // 更新内容配置状态
  function updateContentStatus() {
    // 检查公告协议
    const noticeMissing = [];
    if (!noticeForm.noticeTitle) noticeMissing.push('标题');
    if (!noticeForm.noticeInfo) noticeMissing.push('内容');

    contentStatus.value.notice = {
      configured: noticeMissing.length === 0,
      title: noticeForm.noticeTitle,
      missing: noticeMissing,
    };

    // 检查用户协议配置
    const agreementMissing = [];
    if (!agreementForm.agreementTitle) agreementMissing.push('标题');
    if (!agreementForm.agreementInfo) agreementMissing.push('内容');

    contentStatus.value.agreement = {
      configured: agreementMissing.length === 0,
      title: agreementForm.agreementTitle,
      missing: agreementMissing,
    };
  }

  const { uploadAsset } = useAssetUpload('system/others');

  // 图片上传处理（md-editor 多图上传回调）
  async function onUploadImg(files: File[], callback: (urls: string[]) => void) {
    try {
      const urls = await Promise.all(
        Array.from(files).map(async (file) => {
          const response = await uploadAsset(file);
          const url = getUploadedUrl(response?.data);
          if (!url) {
            throw new Error('Upload response missing url');
          }
          return url;
        }),
      );

      callback(urls);
      ElMessage.success('图片上传成功');
    } catch {
      ElMessage.error('图片上传失败，请检查上传配置或图片格式');
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
        <el-tabs v-model="activeTab">
          <!-- 公告设置 Tab -->
          <el-tab-pane name="notice">
            <template #label>
              <div class="tab-label">
                <app-icon name="i-lucide:clipboard-list" size="16" />
                <span>公告设置</span>
                <el-tag
                  v-if="contentStatus.notice"
                  :type="contentStatus.notice.configured ? 'success' : 'info'"
                  size="small"
                  class="ml-2"
                >
                  {{ contentStatus.notice.configured ? '已配置' : '未配置' }}
                </el-tag>
              </div>
            </template>

            <div class="content-panel">
              <el-form :model="noticeForm" :rules="noticeRules" label-width="160px">
                <el-row>
                  <el-col :xs="24" :md="24" :lg="20" :xl="18">
                    <el-form-item label="公告标题" prop="noticeTitle">
                      <el-input
                        v-model="noticeForm.noticeTitle"
                        placeholder="请输入公告标题"
                        clearable
                        @blur="saveField('noticeTitle', noticeForm.noticeTitle)"
                      />
                    </el-form-item>

                    <el-form-item label="自动弹出公告" prop="isAutoOpenNotice">
                      <el-switch
                        :loading="saving('isAutoOpenNotice')"
                        v-model="noticeForm.isAutoOpenNotice"
                        :active-value="1"
                        :inactive-value="0"
                        @change="(val: any) => saveField('isAutoOpenNotice', String(val))"
                      />
                      <div class="form-tip">开启后，用户进入系统时将自动弹出公告</div>
                    </el-form-item>

                    <el-form-item label="公告内容" prop="noticeInfo" class="editor-form-item">
                      <div class="editor-wrapper">
                        <MdEditor
                          v-model="noticeForm.noticeInfo"
                          :theme="theme"
                          :preview="true"
                          :toolbars-exclude="['github']"
                          @on-upload-img="onUploadImg"
                          @onBlur="saveField('noticeInfo', noticeForm.noticeInfo)"
                        />
                      </div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </el-tab-pane>

          <!-- 用户协议 Tab -->
          <el-tab-pane name="agreement">
            <template #label>
              <div class="tab-label">
                <app-icon name="i-lucide:scroll-text" size="16" />
                <span>用户协议</span>
                <el-tag
                  v-if="contentStatus.agreement"
                  :type="contentStatus.agreement.configured ? 'success' : 'info'"
                  size="small"
                  class="ml-2"
                >
                  {{ contentStatus.agreement.configured ? '已配置' : '未配置' }}
                </el-tag>
              </div>
            </template>

            <div class="content-panel">
              <el-form :model="agreementForm" :rules="agreementRules" label-width="160px">
                <el-row>
                  <el-col :xs="24" :md="24" :lg="20" :xl="18">
                    <el-form-item label="协议标题" prop="agreementTitle">
                      <el-input
                        v-model="agreementForm.agreementTitle"
                        placeholder="请输入用户协议标题"
                        clearable
                        @blur="saveField('agreementTitle', agreementForm.agreementTitle)"
                      />
                    </el-form-item>

                    <el-form-item label="展示用户协议" prop="isAutoOpenAgreement">
                      <el-switch
                        :loading="saving('isAutoOpenAgreement')"
                        v-model="agreementForm.isAutoOpenAgreement"
                        :active-value="1"
                        :inactive-value="0"
                        @change="(val: any) => saveField('isAutoOpenAgreement', String(val))"
                      />
                      <div class="form-tip">
                        开启后，登录 /
                        注册处显示「继续即视为同意」与协议链接，用户可点开阅读；不需要勾选
                      </div>
                    </el-form-item>

                    <el-form-item label="协议内容" prop="agreementInfo" class="editor-form-item">
                      <div class="editor-wrapper">
                        <MdEditor
                          v-model="agreementForm.agreementInfo"
                          :theme="theme"
                          :preview="true"
                          :toolbars-exclude="['github']"
                          @on-upload-img="onUploadImg"
                          @onBlur="saveField('agreementInfo', agreementForm.agreementInfo)"
                        />
                      </div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </el-tab-pane>
        </el-tabs>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .content-panel {
    padding: 20px 0;
  }

  .editor-form-item {
    :deep(.el-form-item__content) {
      display: block;
    }
  }

  .editor-wrapper {
    width: 100%;
    min-height: 500px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--u-radius-s);
    overflow: hidden;

    :deep(.md-editor) {
      height: 500px;
    }
  }

  .form-tip {
    margin-left: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  :deep(.el-tabs__content) {
    padding: 0;
  }

  :deep(.el-form-item) {
    margin-bottom: 22px;
  }

  :deep(.el-form-item__label) {
    font-weight: 500;
  }
</style>
