<route lang="yaml">
meta:
  title: 应用管理
</route>

<script lang="ts" setup>
  import ApiApp from '@/api/modules/app';
  import ApiModels from '@/api/modules/models';
  import uploadApi from '@/api/modules/upload';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { Plus, Refresh } from '@element-plus/icons-vue';
  import type {
    FormInstance,
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { v4 as uuidv4 } from 'uuid';
  import { computed, onMounted, reactive, ref, watch } from 'vue';

  import PromptTemplateEditor from '@/components/PromptTemplateEditor/index.vue';
  import { QUESTION_STATUS_MAP } from '@/constants/index';
  import axios from 'axios';

  const formRef = ref<FormInstance>();
  const total = ref(0);
  const visible = ref(false);
  const loading = ref(false);

  const formInline = reactive({
    name: '',
    catId: '',
    page: 1,
    size: 10,
  });

  const formPackageRef = ref<FormInstance>();
  const activeAppCatId = ref(0);
  const isUserApp = ref(false);
  const userAppStatus = ref(0);
  const formPackage = reactive({
    id: '',
    name: '',
    catId: [] as string[],
    des: '',
    preset: '',
    coverImg: '',
    demoData: '',
    order: 100,
    status: 1,
    isGPTs: 0,
    gizmoID: '',
    isFixedModel: 0,
    appModel: '',
    isFlowith: 0,
    flowithId: '',
    flowithName: '',
    flowithKey: '',
    backgroundImg: '',
    prompt: '',
  });

  // 添加特殊模型类型
  const specialModelType = ref('none'); // none, gpts, flowith

  // 监听特殊模型类型变化
  watch(specialModelType, (newValue) => {
    if (newValue === 'none') {
      formPackage.isGPTs = 0;
      formPackage.isFlowith = 0;
    } else if (newValue === 'gpts') {
      formPackage.isGPTs = 1;
      formPackage.isFlowith = 0;
    } else if (newValue === 'flowith') {
      formPackage.isGPTs = 0;
      formPackage.isFlowith = 1;
    }
  });

  const rules = reactive<FormRules>({
    catId: [{ required: true, message: '请选择App分类', trigger: 'change' }],
    name: [{ required: true, message: '请填写App名称', trigger: 'blur' }],
    preset: [{ required: false, message: '请填写App预设信息', trigger: 'blur' }],
    des: [{ required: true, message: '请填写App描述', trigger: 'blur' }],
    coverImg: [{ required: false, message: '请填写App封面图片地址', trigger: 'blur' }],
    demoData: [{ required: false, message: '请填写App演示数据', trigger: 'blur' }],
    isGPTs: [{ required: true, message: '是否GPTs', trigger: 'blur' }],
    gizmoID: [{ required: false, message: 'GPTs 的ID', trigger: 'blur' }],
    order: [{ required: false, message: '请填写排序ID', trigger: 'blur' }],
    status: [{ required: true, message: '请选择App状态', trigger: 'change' }],
    isFixedModel: [{ required: true, message: '请选择App是否固定模型', trigger: 'blur' }],
    appModel: [{ required: false, message: '请选择App使用的模型', trigger: 'change' }],
    isFlowith: [{ required: true, message: '请选择是否使用flowith模型', trigger: 'blur' }],
    flowithId: [{ required: false, message: '请填写flowith模型ID', trigger: 'blur' }],
    flowithName: [{ required: false, message: '请填写flowith模型名称', trigger: 'blur' }],
    flowithKey: [{ required: false, message: '请填写flowith模型密钥', trigger: 'blur' }],
    backgroundImg: [{ required: false, message: '请填写App背景图URL', trigger: 'blur' }],
    prompt: [{ required: false, message: '请填写App提问模版', trigger: 'blur' }],
  });

  const tableData = ref([]);

  interface CatItem {
    id: number;
    name: string;
  }
  const catList: Ref<CatItem[]> = ref([]);

  const dialogTitle = computed(() => {
    return activeAppCatId.value ? '更新应用' : '新增应用';
  });

  const dialogButton = computed(() => {
    return activeAppCatId.value ? '确认更新' : '确认新增';
  });

  const modelOptions = ref<string[]>([]);

  async function queryAppList() {
    try {
      loading.value = true;
      // 处理catId，不再需要将数组转换为逗号分隔的字符串
      const params = { ...formInline };
      const res = await ApiApp.queryApp(params);
      const { rows, count } = res.data;
      loading.value = false;
      total.value = count;
      tableData.value = rows.sort(
        (a: { order: number }, b: { order: number }) => b.order - a.order,
      );
    } catch (error) {
      loading.value = false;
    }
  }

  async function queryCatList() {
    const res = await ApiApp.queryCats({ size: 100 });
    const { rows } = res.data;
    catList.value = rows;
  }

  // Helper function to check if a string is valid JSON template
  function isValidJsonTemplate(str: string): boolean {
    if (!str || !str.startsWith('[')) {
      return false;
    }
    try {
      const parsed = JSON.parse(str);
      // Basic check: is it an array? Does the first item look like our structure?
      return (
        Array.isArray(parsed) &&
        (!parsed.length ||
          (parsed[0] &&
            typeof parsed[0].type === 'string' &&
            typeof parsed[0].placeholder === 'string'))
      );
    } catch (e) {
      return false;
    }
  }

  function handleUpdatePackage(row: any) {
    activeAppCatId.value = row.id;
    isUserApp.value = row.role === 'user';
    userAppStatus.value = row.status;
    const {
      name,
      status,
      des,
      order,
      coverImg,
      catId,
      preset,
      demoData,
      isGPTs,
      gizmoID,
      isFixedModel,
      appModel,
      isFlowith,
      flowithId,
      flowithName,
      flowithKey,
      backgroundImg,
      prompt,
    } = row;

    // 设置特殊模型类型
    if (isGPTs === 1) {
      specialModelType.value = 'gpts';
    } else if (isFlowith === 1) {
      specialModelType.value = 'flowith';
    } else {
      specialModelType.value = 'none';
    }

    // 处理catId，确保它是字符串数组
    let processedCatId: string[] = [];
    if (typeof catId === 'string') {
      // 如果是逗号分隔的字符串，则拆分为数组
      processedCatId = catId.split(',').filter((id) => id.trim() !== '');
    } else if (Array.isArray(catId)) {
      // 如果已经是数组，则确保所有元素都是字符串
      processedCatId = catId.map((id) => id.toString());
    } else if (catId) {
      // 如果是单个值，则转换为包含一个元素的数组
      processedCatId = [catId.toString()];
    }

    nextTick(() => {
      Object.assign(formPackage, {
        name,
        status,
        des,
        order,
        coverImg,
        catId: processedCatId,
        preset,
        demoData,
        isGPTs,
        gizmoID,
        isFixedModel,
        appModel,
        isFlowith,
        flowithId,
        flowithName,
        flowithKey,
        backgroundImg,
        prompt,
      });

      // --- 新增：处理 prompt 模板 ---
      if (isValidJsonTemplate(formPackage.prompt)) {
        try {
          templateFields.value = JSON.parse(formPackage.prompt);
          templateFields.value.forEach((field) => {
            if (!field.id) field.id = uuidv4();
            if (field.title === undefined) field.title = '';
            if (field.type === 'select' && !field.options) field.options = [];
          });
          usePromptTemplate.value = 'template';
        } catch (e) {
          console.error('Failed to parse prompt template:', e);
          // 解析失败，回退到普通模式
          templateFields.value = [];
          usePromptTemplate.value = 'plain';
          // formPackage.prompt 保持原样，让用户看到原始文本
        }
      } else {
        templateFields.value = [];
        usePromptTemplate.value = 'plain';
      }
      // --- 结束：处理 prompt 模板 ---
    });
    visible.value = true;
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeAppCatId.value = 0;
    formEl?.resetFields();
    // --- 新增：重置模板状态 ---
    usePromptTemplate.value = 'plain';
    templateFields.value = [];
    // --- 结束：重置模板状态 ---
  }

  async function handleDeletePackage(row: any) {
    await ApiApp.deleteApp({ id: row.id });
    ElMessage.success('删除分类成功');
    queryAppList();
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    formInline.catId = '';
    queryAppList();
  }

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    console.log('response: ', response);
    if (response && response.data) {
      formPackage.coverImg = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  const handleBackgroundSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    console.log('response: ', response);
    if (response && response.data) {
      formPackage.backgroundImg = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
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
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP 和 ICO 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  async function reuploadAppAvatar() {
    if (formPackage.coverImg) {
      try {
        ElMessage.info('正在重新上传应用图标...');
        const originalValue = formPackage.coverImg; // 保存原始值
        const file = await downloadFile(formPackage.coverImg);
        uploadFile(file, handleAvatarSuccess, originalValue);
      } catch (error) {
        console.error('下载应用图标文件失败', error);
        ElMessage.error('重新上传应用图标失败，请检查链接是否有效');
      }
    }
  }

  async function reuploadBackgroundImg() {
    if (formPackage.backgroundImg) {
      try {
        ElMessage.info('正在重新上传背景图片...');
        const originalValue = formPackage.backgroundImg; // 保存原始值
        const file = await downloadFile(formPackage.backgroundImg);
        uploadFile(file, handleBackgroundSuccess, originalValue);
      } catch (error) {
        console.error('下载背景图片文件失败', error);
        ElMessage.error('重新上传背景图片失败，请检查链接是否有效');
      }
    }
  }

  function uploadFile(file: any, successHandler: any, originalValue?: string) {
    const form = new FormData();
    form.append('file', file);

    uploadApi
      .uploadFile(form, 'system/app')
      .then((response) => {
        // 创建模拟的响应对象，与el-upload期望的结构一致
        successHandler({
          data: response.data,
        });

        // 如果是重新上传场景（有原始值），显示成功消息
        if (originalValue) {
          if (successHandler === handleAvatarSuccess) {
            ElMessage.success('重新上传应用图标成功');
          } else if (successHandler === handleBackgroundSuccess) {
            ElMessage.success('重新上传背景图片成功');
          }
        }
      })
      .catch((error) => {
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        // 如果上传失败且有原始值，恢复原始值
        if (originalValue) {
          if (successHandler === handleAvatarSuccess) {
            formPackage.coverImg = originalValue;
          } else if (successHandler === handleBackgroundSuccess) {
            formPackage.backgroundImg = originalValue;
          }
        }
      });
  }

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    const form = new FormData();
    form.append('file', file);

    return uploadApi
      .uploadFile(form, 'system/app')
      .then((response) => {
        if (onSuccess) {
          // 对于普通上传（而非重新上传）显示上传成功的消息
          ElMessage.success('上传成功');
          onSuccess(response);
        }
        return response;
      })
      .catch((error) => {
        if (onError) {
          onError(error);
        }
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        return Promise.reject(error);
      });
  };

  async function downloadFile(url: string) {
    const response = await axios.get(url, { responseType: 'blob' });
    let fileName = 'downloaded_file';

    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const matches = /filename="([^"]+)"/.exec(contentDisposition);
      if (matches != null && matches[1]) {
        fileName = matches[1];
      }
    } else {
      fileName = getFileNameFromUrl(url);
    }

    return new File([response.data], fileName, { type: response.data.type });
  }

  function getFileNameFromUrl(url: string | URL) {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  }

  function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        // --- 新增：处理 prompt 模板提交 ---
        let finalPrompt = formPackage.prompt; // 默认使用文本框内容
        if (usePromptTemplate.value === 'template') {
          // 过滤掉选项为空的下拉框 和 占位符为空的字段（可选）
          const cleanedFields = templateFields.value
            .map((field) => ({
              ...field,
              options:
                field.type === 'select'
                  ? (field.options || []).filter((opt) => opt && opt.trim() !== '')
                  : undefined,
            }))
            .filter(
              (field) =>
                field.title &&
                field.title.trim() !== '' &&
                field.placeholder &&
                field.placeholder.trim() !== '',
            );

          if (cleanedFields.length > 0) {
            finalPrompt = JSON.stringify(cleanedFields);
          } else {
            finalPrompt = ''; // 如果模板为空，则提交空字符串
          }
        }
        // --- 结束：处理 prompt 模板提交 ---

        if (activeAppCatId.value) {
          const params = { ...formPackage, prompt: finalPrompt, id: activeAppCatId.value }; // 使用处理后的 prompt
          params.catId = params.catId.join(',') as any;
          isUserApp.value && Object.assign(params, { status: userAppStatus.value });
          await ApiApp.updateApp(params);
          ElMessage({ type: 'success', message: '更新应用成功！' });
        } else {
          const newApp = { ...formPackage, prompt: finalPrompt }; // 使用处理后的 prompt
          newApp.catId = newApp.catId.join(',') as any;
          await ApiApp.createApp(newApp);
          ElMessage({ type: 'success', message: '创建新的应用成功！' });
        }
        visible.value = false;
        queryAppList();
      }
    });
  }

  // 获取分类名称
  function getCategoryName(catId: string): string {
    const category = catList.value.find((item) => item.id.toString() === catId);
    return category ? category.name : '';
  }

  // 检查分类是否已被选择
  function isCategorySelected(catId: string): boolean {
    return formPackage.catId.includes(catId);
  }

  // 选择分类
  function selectCategory(catId: string): void {
    if (!isCategorySelected(catId)) {
      formPackage.catId.push(catId);
    }
  }

  // 移除特定分类
  function removeCategory(catId: string): void {
    const index = formPackage.catId.indexOf(catId);
    if (index !== -1) {
      formPackage.catId.splice(index, 1);
    }
  }

  // 清除所有分类选择
  function clearCategory(): void {
    formPackage.catId = [];
  }

  // 检查搜索分类是否已被选择
  function isSearchCategorySelected(catId: string): boolean {
    return formInline.catId === catId;
  }

  function showDevOnlyMessage() {
    ElMessage({ type: 'warning', message: '此功能仅开发版支持！' });
  }

  // 选择搜索分类
  function selectSearchCategory(catId: string): void {
    formInline.catId = catId;
  }

  // 移除特定搜索分类
  function removeSearchCategory(catId: string): void {
    if (formInline.catId === catId) {
      formInline.catId = '';
    }
  }

  // 清除所有搜索分类
  function clearSearchCategory(): void {
    formInline.catId = '';
  }

  // 获取模型列表
  async function fetchModelList() {
    try {
      const res = await ApiModels.queryModels({
        page: 1,
        size: 1000, // 获取较大的数量以确保获取所有模型
      });
      const { rows } = res.data;
      const uniqueModels = new Set<string>();
      rows.forEach((row: any) => {
        if (row.model) {
          uniqueModels.add(row.model);
        }
      });
      modelOptions.value = Array.from(uniqueModels);
    } catch (error) {
      console.error('获取模型列表失败:', error);
    }
  }

  // --- 新增状态 ---
  const usePromptTemplate = ref<'plain' | 'template'>('plain');
  const templateFields = ref<
    Array<{
      id: string;
      title: string;
      type: 'input' | 'select';
      placeholder: string;
      options?: string[];
    }>
  >([]);
  // --- 结束：新增状态 ---

  // --- Synchronization Watchers ---
  let isUpdatingInternally = false; // Flag to prevent recursive updates

  // Watch for changes in the template editor data
  watch(
    templateFields,
    (newFields) => {
      if (isUpdatingInternally) return;
      if (usePromptTemplate.value === 'template') {
        isUpdatingInternally = true;
        try {
          const cleanedFields = newFields
            .map(({ id, ...rest }) => ({
              // <-- Destructure to exclude id
              ...rest,
              options:
                rest.type === 'select'
                  ? (rest.options || []).filter((opt) => opt != null && opt.trim() !== '')
                  : undefined,
              title: rest.title || '',
              placeholder: rest.placeholder || '',
            }))
            .filter(
              (field) => field.type && field.title.trim() !== '' && field.placeholder.trim() !== '',
            ); // ID is no longer needed here

          if (cleanedFields.length > 0) {
            formPackage.prompt = JSON.stringify(cleanedFields, null, 2); // <-- Use pretty print with 2 spaces
          } else {
            formPackage.prompt = '';
          }
        } catch (e) {
          console.error('Error stringifying template fields:', e);
          formPackage.prompt = '';
        } finally {
          nextTick(() => {
            isUpdatingInternally = false;
          });
        }
      }
    },
    { deep: true },
  );

  // Watch for changes in the plain text prompt
  watch(
    () => formPackage.prompt,
    (newPrompt) => {
      if (isUpdatingInternally) return;
      if (usePromptTemplate.value === 'plain') {
        if (isValidJsonTemplate(newPrompt)) {
          isUpdatingInternally = true;
          try {
            const parsedFields = JSON.parse(newPrompt);
            if (Array.isArray(parsedFields)) {
              parsedFields.forEach((field) => {
                if (!field.id) field.id = uuidv4();
                if (field.title === undefined) field.title = '';
                if (field.placeholder === undefined) field.placeholder = '';
                if (field.type === 'select' && !Array.isArray(field.options)) field.options = [];
              });
              templateFields.value = parsedFields;
            } // else: Parsed but not array, do nothing to templateFields
          } catch (e) {
            console.error('Error parsing prompt JSON for template fields:', e);
            // templateFields.value = []; // Optionally clear on error
          } finally {
            nextTick(() => {
              isUpdatingInternally = false;
            });
          }
        }
        // else { // Optionally clear templateFields if plain text is not valid JSON
        //     templateFields.value = [];
        // }
      }
    },
  );

  // Refine the mode switch watcher for initial sync on switch
  watch(usePromptTemplate, (newValue, oldValue) => {
    isUpdatingInternally = true;
    if (newValue === 'template') {
      // Switching to template mode: Try to parse plain text content
      if (isValidJsonTemplate(formPackage.prompt)) {
        try {
          const parsedFields = JSON.parse(formPackage.prompt);
          if (Array.isArray(parsedFields)) {
            parsedFields.forEach((field) => {
              if (!field.id) field.id = uuidv4();
              if (field.title === undefined) field.title = '';
              if (field.placeholder === undefined) field.placeholder = '';
              if (field.type === 'select' && !Array.isArray(field.options)) field.options = [];
            });
            templateFields.value = parsedFields;
          } else {
            templateFields.value = [];
          }
        } catch (e) {
          templateFields.value = [];
        }
      } // else: Keep existing templateFields if plain text is invalid/empty
    } else {
      // newValue === 'plain'
      // Switching to plain mode: Stringify template editor content
      const cleanedFields = templateFields.value
        .map(({ id, ...rest }) => ({
          // <-- Destructure to exclude id
          ...rest,
          options:
            rest.type === 'select'
              ? (rest.options || []).filter((opt) => opt != null && opt.trim() !== '')
              : undefined,
          title: rest.title || '',
          placeholder: rest.placeholder || '',
        }))
        .filter(
          (field) => field.type && field.title.trim() !== '' && field.placeholder.trim() !== '',
        ); // ID is no longer needed here

      if (cleanedFields.length > 0) {
        formPackage.prompt = JSON.stringify(cleanedFields, null, 2); // <-- Use pretty print with 2 spaces
      } else {
        formPackage.prompt = '';
      }
    }
    nextTick(() => {
      isUpdatingInternally = false;
    });
  });
  // --- 结束：监听模板模式切换 ---

  // --- Computed property for placeholder ---
  const plainModePlaceholder = computed(() => {
    return `请按以下JSON格式输入模板，或切换到"模板模式"进行可视化编辑：
[
  {
    "type": "input",
    "title": "字段名称",
    "placeholder": "输入提示文字"
  },
  {
    "type": "select",
    "title": "下拉框名称",
    "placeholder": "下拉提示",
    "options": ["选项1", "选项2"]
  }
]`;
  });
  // --- End computed property ---

  onMounted(() => {
    queryAppList();
    queryCatList();
    fetchModelList();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">应用配置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>应用一旦创建，可能会被多处使用，请保持规范命名分类，后续尽量变更而不是删除。</div>
          <div>
            可自行选择应用是否固定模型。GPTs 需单独在特殊模型中配置 gpts 模型，并自行搜索填写
            gizmoID（例如：g-alKfVrz9K）。
          </div>
        </div>
      </template>
      <HButton outline @click="visible = true">
        <SvgIcon name="ic:baseline-plus" />
        新增应用
      </HButton>
    </PageHeader>

    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="App分类" prop="catId">
          <el-select
            v-model="formInline.catId"
            placeholder="请选择App分类"
            clearable
            style="width: 240px"
          >
            <el-option
              v-for="item in catList"
              :key="item.id"
              :label="item.name"
              :value="item.id.toString()"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="App名称" prop="name">
          <el-input
            v-model="formInline.name"
            placeholder="App名称[模糊搜索]"
            clearable
            @keydown.enter.prevent="queryAppList"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="queryAppList"> 查询 </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>

    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column prop="coverImg" label="应用封面" width="100">
          <template #default="scope">
            <el-image style="height: 50px" :src="scope.row.coverImg" fit="fill" />
          </template>
        </el-table-column>
        <el-table-column prop="catName" label="应用分类" width="120">
          <template #default="scope">
            <el-tooltip
              v-if="scope.row.catName && scope.row.catName.includes(',')"
              class="box-item"
              effect="dark"
              placement="top-start"
            >
              <template #content>
                <div :style="{ maxWidth: '250px' }">
                  {{ scope.row.catName }}
                </div>
              </template>
              <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
                {{ scope.row.catName }}
              </div>
            </el-tooltip>
            <span v-else>{{ scope.row.catName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="应用名称" width="120" />
        <el-table-column prop="status" label="应用状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
              {{ QUESTION_STATUS_MAP[scope.row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- <el-table-column prop="public" label="是否共享" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.public ? 'success' : 'info'">
              {{ scope.row.public ? '共享' : '私有' }}
            </el-tag>
          </template>
        </el-table-column> -->
        <!-- <el-table-column prop="public" label="应用创建角色" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.role === 'system' ? 'success' : 'info'">
              {{ scope.row.role === 'system' ? '系统' : '用户' }}
            </el-tag>
          </template>
        </el-table-column> -->
        <el-table-column prop="order" label="排序ID" /> />
        <el-table-column prop="preset" label="预设信息" width="400">
          <template #default="scope">
            <el-tooltip class="box-item" effect="dark" placement="top-start">
              <template #content>
                <div :style="{ maxWidth: '350px' }">
                  {{ scope.row.preset }}
                </div>
              </template>
              <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
                {{ scope.row.preset }}
              </div>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column prop="des" label="描述信息" width="300">
          <template #default="scope">
            <el-tooltip class="box-item" effect="dark" placement="top-start">
              <template #content>
                <div :style="{ maxWidth: '350px' }">
                  {{ scope.row.des }}
                </div>
              </template>
              <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
                {{ scope.row.des }}
              </div>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="120">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="scope">
            <el-button
              v-if="scope.row.role === 'system' || scope.row.public"
              link
              type="primary"
              size="small"
              @click="handleUpdatePackage(scope.row)"
            >
              编辑
            </el-button>
            <el-popconfirm
              v-if="scope.row.role === 'system'"
              title="确认删除此应用么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除应用 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryAppList"
          @current-change="queryAppList"
        />
      </el-row>
    </page-main>
    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="80%"
      top="5vh"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="100px"
        :model="formPackage"
        :rules="rules"
      >
        <el-row :gutter="20">
          <el-col :span="10">
            <el-form-item label="App名称" prop="name">
              <el-input v-model="formPackage.name" placeholder="请填写App名称" />
            </el-form-item>
            <el-form-item v-if="!isUserApp" label="App状态" prop="status">
              <el-switch v-model="formPackage.status" :active-value="1" :inactive-value="0" />
            </el-form-item>
            <el-form-item label="排序ID" prop="order">
              <el-input v-model.number="formPackage.order" placeholder="排序ID" />
            </el-form-item>
          </el-col>
          <el-col :span="14">
            <el-form-item label="App分类" prop="catId">
              <div class="category-selector" style="height: 100%">
                <div class="selected-categories mb-2">
                  <el-tag
                    v-for="catId in formPackage.catId"
                    :key="catId"
                    closable
                    class="mr-1 mb-1"
                    @close="removeCategory(catId)"
                  >
                    {{ getCategoryName(catId) }}
                  </el-tag>
                  <div v-if="formPackage.catId.length === 0" class="text-gray-400 text-sm">
                    请选择分类
                  </div>
                </div>
                <div class="category-options p-2 border rounded-md max-h-48 overflow-y-auto">
                  <div class="text-sm text-gray-500 mb-2">可选分类：</div>
                  <el-tag
                    v-for="item in catList"
                    :key="item.id"
                    :class="[
                      'mr-1 mb-1 cursor-pointer',
                      isCategorySelected(item.id.toString()) ? 'is-disabled' : '',
                    ]"
                    :effect="isCategorySelected(item.id.toString()) ? 'plain' : 'dark'"
                    @click="selectCategory(item.id.toString())"
                  >
                    {{ item.name }}
                  </el-tag>
                </div>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="App描述" prop="des">
              <el-input
                v-model="formPackage.des"
                type="textarea"
                placeholder="请填写App介绍信息..."
                :rows="3"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="示例内容" prop="demoData">
              <el-input
                v-model="formPackage.demoData"
                type="textarea"
                placeholder="请填写App的demo示例数据..."
                :rows="3"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item v-if="specialModelType !== 'gpts'" label="App预设" prop="preset">
              <el-input
                v-model="formPackage.preset"
                type="textarea"
                placeholder="请填写App预设信息..."
                :rows="3"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item v-if="!isUserApp" label="特殊模型" prop="specialModel">
              <el-radio-group v-model="specialModelType">
                <el-radio label="none">不使用</el-radio>
                <el-radio label="gpts">GPTs</el-radio>
                <el-radio label="flowith" :disabled="true" @click="showDevOnlyMessage"
                  >Flowith</el-radio
                >
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-row :gutter="10">
              <el-col :span="12">
                <el-form-item
                  label="固定模型"
                  prop="isFixedModel"
                  v-if="specialModelType === 'none'"
                >
                  <el-switch
                    v-model="formPackage.isFixedModel"
                    :active-value="1"
                    :inactive-value="0"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item
                  label="使用模型"
                  prop="appModel"
                  v-if="specialModelType === 'none' && Number(formPackage.isFixedModel) === 1"
                >
                  <el-select
                    v-model="formPackage.appModel"
                    filterable
                    allow-create
                    placeholder="选择模型"
                    clearable
                  >
                    <el-option
                      v-for="item in modelOptions"
                      :key="item"
                      :label="item"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </el-col>
          <el-col :span="12" v-if="specialModelType === 'gpts'">
            <el-form-item label="gizmoID" prop="gizmoID">
              <el-input v-model="formPackage.gizmoID" placeholder="请填写 GPTs 使用的 gizmoID" />
            </el-form-item>
          </el-col>
          <el-col :span="12" v-if="specialModelType === 'gpts'">
            <!-- Placeholder Column -->
          </el-col>
          <el-col :span="12">
            <el-form-item label="应用图标" prop="coverImg">
              <el-input v-model="formPackage.coverImg" placeholder="填写或上传图标" clearable>
                <template #append>
                  <!-- Upload Component -->
                  <el-upload
                    class="avatar-uploader"
                    :http-request="customUpload"
                    :show-file-list="false"
                    :on-success="handleAvatarSuccess"
                    :before-upload="beforeAvatarUpload"
                    style="
                      display: inline-flex;
                      align-items: center;
                      justify-content: center;
                      vertical-align: middle;
                    "
                  >
                    <img
                      v-if="formPackage.coverImg"
                      :src="formPackage.coverImg"
                      style="
                        max-width: 1.5rem;
                        max-height: 1.5rem;
                        margin: 5px 0;
                        object-fit: contain;
                      "
                    />
                    <el-icon v-else style="width: 1rem">
                      <Plus />
                    </el-icon>
                  </el-upload>
                  <!-- Re-upload Icon (Separate) -->
                  <el-icon
                    v-if="formPackage.coverImg"
                    @click="reuploadAppAvatar"
                    style="margin-left: 10px; width: 1rem; cursor: pointer; vertical-align: middle"
                    class="hover:text-primary"
                  >
                    <Refresh />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="App背景图" prop="backgroundImg">
              <el-input
                v-model="formPackage.backgroundImg"
                placeholder="填写或上传背景图"
                clearable
              >
                <template #append>
                  <!-- Upload Component -->
                  <el-upload
                    class="avatar-uploader"
                    :http-request="customUpload"
                    :show-file-list="false"
                    :on-success="handleBackgroundSuccess"
                    :before-upload="beforeAvatarUpload"
                    style="
                      display: inline-flex;
                      align-items: center;
                      justify-content: center;
                      vertical-align: middle;
                    "
                  >
                    <img
                      v-if="formPackage.backgroundImg"
                      :src="formPackage.backgroundImg"
                      style="
                        max-width: 1.5rem;
                        max-height: 1.5rem;
                        margin: 5px 0;
                        object-fit: contain;
                      "
                    />
                    <el-icon v-else style="width: 1rem">
                      <Plus />
                    </el-icon>
                  </el-upload>
                  <!-- Re-upload Icon (Separate) -->
                  <el-icon
                    v-if="formPackage.backgroundImg"
                    @click="reuploadBackgroundImg"
                    style="margin-left: 10px; width: 1rem; cursor: pointer; vertical-align: middle"
                    class="hover:text-primary"
                  >
                    <Refresh />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="提问模版" prop="prompt">
              <el-radio-group v-model="usePromptTemplate" size="small" class="mb-2">
                <el-radio-button label="plain">普通模式</el-radio-button>
                <el-radio-button label="template">模板模式</el-radio-button>
              </el-radio-group>

              <!-- Container for both modes, use v-show -->
              <div class="w-full mt-2">
                <!-- Plain Mode Textarea -->
                <el-input
                  v-show="usePromptTemplate === 'plain'"
                  v-model="formPackage.prompt"
                  type="textarea"
                  :placeholder="plainModePlaceholder"
                  :rows="8"
                />
                <!-- Template Mode Editor -->
                <div
                  v-show="usePromptTemplate === 'template'"
                  class="border rounded p-3 bg-gray-50"
                  style="min-height: 150px"
                >
                  <PromptTemplateEditor v-model="templateFields" />
                </div>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <span class="mr-5 flex justify-end">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  .category-selector {
    width: 100%;
  }

  .selected-categories {
    min-height: 32px;
    padding: 4px 0;
  }

  .category-options .el-tag {
    transition: all 0.3s;
  }

  .category-options .el-tag:not(.is-disabled):hover {
    transform: scale(1.05);
  }

  .category-options .el-tag.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
