<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type {
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useBrandStore from '@/store/modules/brand';
  import useAssetUpload, { getUploadedUrl } from '@/utils/composables/useAssetUpload';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/platform/base-configuration'));
  usePageDoc(docUrl);

  const formInline = reactive({
    siteName: '',
    filingNumber: '',
    publicSecurityFilingNumber: '',
    companyName: '',
    siteUrl: '',
    clientFaviconPath: '',
    clientLogoPath: '',
    siteTitle: '',
    siteDescription: '',
    siteKeywords: '',
  });
  const rules = ref<FormRules>({
    siteName: [{ required: true, trigger: 'blur', message: '请填写网站名称' }],
  });
  const {
    isReady,
    loadFailed,
    initFromConfig,
    markLoadFailed,
    saveField: saveConfigField,
  } = useConfigAutoSave({ form: formInline });

  // 站点名称与标识改了之后同步到侧栏的品牌区
  const brand = useBrandStore();

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'siteName',
          'filingNumber',
          'publicSecurityFilingNumber',
          'companyName',
          'clientLogoPath',
          'clientFaviconPath',
          'siteUrl',
          'siteTitle',
          'siteDescription',
          'siteKeywords',
        ],
      });
      Object.assign(formInline, res.data);
      await nextTick();
      initFromConfig(res.data);
    } catch {
      markLoadFailed();
    }
  }

  async function saveField(key: string, value: string) {
    await saveConfigField(key, value, {
      // 用这次保存成功的值同步侧栏：输入框里可能已经是还没保存的新内容
      onSaved: (saved) => {
        if ('siteName' in saved) brand.siteName = saved.siteName;
      },
    });
  }

  const { uploadAsset, reuploadAsset } = useAssetUpload('system/others');

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    return uploadAsset(file)
      .then((response) => {
        const url = getUploadedUrl(response.data);
        onSuccess?.({ data: url });
        ElMessage.success('上传成功');
        return response;
      })
      .catch((error) => {
        // 请求失败已由 @/api 响应拦截器提示
        onError?.(error);
        console.error('上传失败', error);
        throw error;
      });
  };

  const handleLogoSuccess: UploadProps['onSuccess'] = (response) => {
    const url = getUploadedUrl(response?.data);
    if (url) {
      formInline.clientLogoPath = url;
      saveField('clientLogoPath', url);
    } else {
      ElMessage.error('上传成功但未获取到图片地址');
    }
  };

  async function reuploadLogo() {
    if (!formInline.clientLogoPath) return;
    try {
      formInline.clientLogoPath = await reuploadAsset(formInline.clientLogoPath);
      await saveField('clientLogoPath', formInline.clientLogoPath);
    } catch (error) {
      console.error('重新上传 LOGO 失败', error);
      ElMessage.error('重新上传 LOGO 失败，请检查图片链接是否有效');
    }
  }

  const handleFaviconSuccess: UploadProps['onSuccess'] = (response) => {
    const url = getUploadedUrl(response?.data);
    if (url) {
      formInline.clientFaviconPath = url;
      saveField('clientFaviconPath', url);
    } else {
      ElMessage.error('上传成功但未获取到图片地址');
    }
  };

  async function reuploadFavicon() {
    if (!formInline.clientFaviconPath) return;
    try {
      formInline.clientFaviconPath = await reuploadAsset(formInline.clientFaviconPath);
      await saveField('clientFaviconPath', formInline.clientFaviconPath);
    } catch (error) {
      console.error('重新上传网站图标失败', error);
      ElMessage.error('重新上传网站图标失败，请检查图片链接是否有效');
    }
  }

  const beforeLogoUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.slice(Math.max(0, fileName.lastIndexOf('.')));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('仅支持 PNG、JPEG、GIF、WebP 和 ICO 格式的图片文件');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('文件大小不能超过 3MB');
      return false;
    }
    return true;
  };

  watch(
    () => formInline.clientLogoPath,
    (url) => {
      brand.logoUrl = url || '';
    },
  );

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
      <page-panel>
        <el-form :rules="rules" :model="formInline" label-width="auto">
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站名称" prop="siteName">
                <el-input
                  v-model="formInline.siteName"
                  placeholder="请输入网站名称，如：99Agent"
                  clearable
                  @blur="saveField('siteName', formInline.siteName)"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站地址" prop="siteUrl">
                <el-input
                  v-model="formInline.siteUrl"
                  placeholder="请输入网站完整地址，如：https://www.example.com"
                  clearable
                  @blur="saveField('siteUrl', formInline.siteUrl)"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="公司/组织名称" prop="companyName">
                <el-input
                  v-model="formInline.companyName"
                  placeholder="请输入公司或组织的完整名称"
                  clearable
                  @blur="saveField('companyName', formInline.companyName)"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站备案号" prop="filingNumber">
                <el-input
                  v-model="formInline.filingNumber"
                  placeholder="请输入备案号，如：京ICP备2023000001号"
                  clearable
                  @blur="saveField('filingNumber', formInline.filingNumber)"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="公安备案号" prop="publicSecurityFilingNumber">
                <el-input
                  v-model="formInline.publicSecurityFilingNumber"
                  placeholder="请输入公安备案号，如：浙公网安备33090202000608号"
                  clearable
                  @blur="
                    saveField('publicSecurityFilingNumber', formInline.publicSecurityFilingNumber)
                  "
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站 LOGO" prop="clientLogoPath">
                <el-input
                  v-model="formInline.clientLogoPath"
                  placeholder="请输入 LOGO 图片链接或点击右侧上传"
                  clearable
                  @blur="saveField('clientLogoPath', formInline.clientLogoPath)"
                >
                  <template #append>
                    <el-upload
                      class="avatar-uploader"
                      :show-file-list="false"
                      :http-request="customUpload"
                      :on-success="handleLogoSuccess"
                      :before-upload="beforeLogoUpload"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico"
                      style="display: flex; align-items: center; justify-content: center"
                    >
                      <img
                        v-if="formInline.clientLogoPath"
                        :src="formInline.clientLogoPath"
                        style="
                          max-width: 1.5rem;
                          max-height: 1.5rem;
                          margin: 5px 0;
                          object-fit: contain;
                        "
                      />
                      <el-icon v-else style="width: 1rem">
                        <AppIcon name="i-lucide:plus" />
                      </el-icon>
                    </el-upload>
                    <el-tooltip
                      v-if="formInline.clientLogoPath"
                      content="重新上传：把外链图片转存到本站"
                      placement="top"
                    >
                      <el-button link class="ml-3" @click="reuploadLogo">
                        <AppIcon name="i-lucide:refresh-cw" />
                      </el-button>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站图标 (Favicon)" prop="clientFaviconPath">
                <el-input
                  v-model="formInline.clientFaviconPath"
                  placeholder="请输入网站图标链接或点击右侧上传"
                  clearable
                  @blur="saveField('clientFaviconPath', formInline.clientFaviconPath)"
                >
                  <template #append>
                    <el-upload
                      class="avatar-uploader"
                      :show-file-list="false"
                      :http-request="customUpload"
                      :on-success="handleFaviconSuccess"
                      :before-upload="beforeLogoUpload"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,image/x-icon,image/vnd.microsoft.icon"
                      style="display: flex; align-items: center; justify-content: center"
                    >
                      <img
                        v-if="formInline.clientFaviconPath"
                        :src="formInline.clientFaviconPath"
                        style="
                          max-width: 1.5rem;
                          max-height: 1.5rem;
                          margin: 5px 0;
                          object-fit: contain;
                        "
                      />
                      <el-icon v-else style="width: 1rem">
                        <AppIcon name="i-lucide:plus" />
                      </el-icon>
                    </el-upload>
                    <el-tooltip
                      v-if="formInline.clientFaviconPath"
                      content="重新上传：把外链图片转存到本站"
                      placement="top"
                    >
                      <el-button link class="ml-3" @click="reuploadFavicon">
                        <AppIcon name="i-lucide:refresh-cw" />
                      </el-button>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站标题" prop="siteTitle">
                <el-input
                  v-model="formInline.siteTitle"
                  placeholder="请输入网站标题，将显示在浏览器标签页，如：99Agent - 智能助手平台"
                  clearable
                  @blur="saveField('siteTitle', formInline.siteTitle)"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站描述" prop="siteDescription">
                <el-input
                  v-model="formInline.siteDescription"
                  type="textarea"
                  :rows="3"
                  placeholder="请输入网站描述，用于搜索引擎优化(SEO)，如：99Agent 是一个集成化的人工智能服务站点，帮助用户高效完成各种任务。"
                  clearable
                  @blur="saveField('siteDescription', formInline.siteDescription)"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="网站关键词" prop="siteKeywords">
                <el-input
                  v-model="formInline.siteKeywords"
                  placeholder="请输入网站关键词，多个关键词用逗号分隔，如：AI, 助手, 智能助手, 任务管理, 高效, 智能问答"
                  clearable
                  @blur="saveField('siteKeywords', formInline.siteKeywords)"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>
