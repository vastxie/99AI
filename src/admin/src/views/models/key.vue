<route lang="yaml">
meta:
  title: 模型列表
</route>

<script lang="ts" setup>
import ApiModels from '@/api/modules/models';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import { Plus, QuestionFilled, Refresh } from '@element-plus/icons-vue';
import type { FormInstance, FormRules, UploadProps } from 'element-plus';
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive } from 'vue';

import {
  DEDUCTTYPELIST,
  MODEL_LIST,
  MODELSMAPLIST,
  MODELTYPELIST,
  MODELTYPEMAP,
  // ModelTypeLabelMap,
  QUESTION_STATUS_OPTIONS,
} from '@/constants/index';
import axios from 'axios';

const formBlukRef = ref<FormInstance>();
const formRef = ref<FormInstance>();
const total = ref(0);
const visible = ref(false);
const loading = ref(false);
const modelLoading = ref(false);
const bulkVisible = ref(false);

const formInline = reactive({
  keyType: '',
  model: '',
  status: undefined,
  page: 1,
  size: 10,
});

const formPackageRef = ref<FormInstance>();
const activeModelKeyId = ref(0);
const formPackage = reactive({
  keyType: 1,
  modelName: '',
  key: '',
  modelAvatar: '',
  // secret: null,
  status: true,
  model: '',
  // isDraw: false,
  isTokenBased: false,
  tokenFeeRatio: 1000,
  // keyWeight: 1,
  modelOrder: 0,
  maxModelTokens: 8000,
  // maxResponseTokens: 2000,
  proxyUrl: '',
  timeout: 300,
  deduct: 1,
  deductType: 1,
  maxRounds: 12,
  isFileUpload: 0,
  modelLimits: 50,
  modelDescription: '',
});

// const uploadUrl = ref(`${import.meta.env.VITE_APP_API_BASEURL}/upload/file`);
const uploadUrl = ref(
  `${import.meta.env.VITE_APP_API_BASEURL}/upload/file?dir=${encodeURIComponent(
    'system/models'
  )}`
);

const rules = reactive<FormRules>({
  keyType: [{ required: true, message: '请选择调用模型类型', trigger: 'blur' }],
  modelName: [
    { required: true, message: '请填写您的模型名称', trigger: 'blur' },
  ],
  key: [{ required: false, message: '请填写您的调用模型key', trigger: 'blur' }],
  // secret: [
  //   { required: true, message: '请填写您的调用模型的secret', trigger: 'blur' },
  // ],
  status: [
    { required: true, message: '请选择key的启用状态', trigger: 'change' },
  ],
  // isDraw: [
  //   {
  //     required: true,
  //     message: '请选择当前key是否作为基础绘画key',
  //     trigger: 'change',
  //   },
  // ],
  isFileUpload: [
    {
      required: false,
      message: '请选择当前模型是否开启文件上传及支持种类',
      trigger: 'change',
    },
  ],
  isTokenBased: [
    {
      required: true,
      message: '请选择当前key是否基于token计费',
      trigger: 'change',
    },
  ],
  tokenFeeRatio: [
    { required: false, message: 'token计费比例', trigger: 'change' },
  ],
  model: [
    {
      required: true,
      message: '请选择当前key需要绑定的模型',
      trigger: 'change',
    },
  ],
  modelOrder: [
    { required: true, message: '请填写当前模型排序', trigger: 'blur' },
  ],

  // keyWeight: [
  //   { required: true, message: '请填写key的权重值', trigger: 'blur' },
  // ],
  maxModelTokens: [
    { required: true, message: '请填写模型最大token数', trigger: 'blur' },
  ],
  // maxResponseTokens: [
  //   {
  //     required: true,
  //     message: '请填写允许用户使用的最大回复token数',
  //     trigger: 'blur',
  //   },
  // ],
  proxyUrl: [
    { required: false, message: '请填写指定代理地址', trigger: 'blur' },
  ],
  modelAvatar: [
    {
      required: false,
      message: '请填写AI模型使用的头像, 不填写使用系统默认',
      trigger: 'blur',
    },
  ],
  timeout: [
    {
      required: true,
      message: '请填写超时时间 默认 60 单位（秒）',
      trigger: 'blur',
    },
  ],
  deductType: [
    { required: true, message: '请选择当前模型扣费类型', trigger: 'change' },
  ],
  deduct: [
    {
      required: true,
      message: '请填写当前模型扣费金额（需要是正整数）',
      trigger: 'blur',
    },
  ],
  maxRounds: [
    {
      required: true,
      message: '请填写允许用户选择的最大上下文轮次',
      trigger: 'blur',
    },
  ],
  modelLimits: [
    {
      required: true,
      message: '请填写模型调用频率限制',
      trigger: 'blur',
    },
  ],
  modelDescription: [
    {
      required: false,
      message: '请填写模型描述',
      trigger: 'blur',
    },
  ],
});

function handlerCloseDialog(formEl: FormInstance | undefined) {
  activeModelKeyId.value = 0;
  formEl?.resetFields();
}

const modelList = computed(
  () => MODELSMAPLIST[formPackage.keyType as keyof typeof MODELSMAPLIST]
);

const dialogTitle = computed(() => {
  return activeModelKeyId.value ? '修改模型' : '新增模型';
});

// const labelKeyName = computed(() => ModelTypeLabelMap[formPackage.keyType]);

const dialogButton = computed(() => {
  return activeModelKeyId.value ? '确认更新' : '确认新增';
});

const tableData = ref([]);

async function queryModelsList() {
  try {
    loading.value = true;
    const res = await ApiModels.queryModels(formInline);
    loading.value = false;
    const { rows, count } = res.data;
    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

async function handleDeleteKey(row: any) {
  const { id } = row;
  await ApiModels.delModels({ id });
  ElMessage({ type: 'success', message: '操作完成！' });
  queryModelsList();
}

function handleEditKey(row: any) {
  activeModelKeyId.value = row.id;
  const {
    keyType,
    modelName,
    key,
    // secret,
    status,
    model,
    // keyWeight,
    modelOrder,
    maxModelTokens,
    // maxResponseTokens,
    proxyUrl,
    timeout,
    deductType,
    deduct,
    maxRounds,
    modelAvatar,
    // isDraw,
    isTokenBased,
    tokenFeeRatio,
    isFileUpload,
    modelLimits,
    modelDescription,
  } = row;
  nextTick(() => {
    Object.assign(formPackage, {
      keyType,
      modelName,
      key,
      // secret,
      status,
      model,
      // keyWeight,
      modelOrder,
      maxModelTokens,
      // maxResponseTokens,
      proxyUrl,
      timeout,
      deductType,
      deduct,
      maxRounds,
      modelAvatar,
      // isDraw,
      isTokenBased,
      tokenFeeRatio,
      isFileUpload,
      modelLimits,
      modelDescription,
    });
  });
  visible.value = true;
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryModelsList();
}

async function reuploadModelAvatar() {
  if (formPackage.modelAvatar) {
    const file = await downloadFile(formPackage.modelAvatar);
    uploadFile(file, handleAvatarSuccess);
  }
}

function uploadFile(file: any, successHandler: any) {
  const form = new FormData();
  form.append('file', file);

  axios
    .post(uploadUrl.value, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((response) => {
      successHandler(response.data);
    })
    .catch((error) => {
      console.error('上传失败', error);
    });
}

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

async function handlerSubmit(formEl: FormInstance | undefined) {
  formEl?.validate(async (valid) => {
    if (valid) {
      const params: any = JSON.parse(JSON.stringify(formPackage));
      delete params.id;
      activeModelKeyId.value && (params.id = activeModelKeyId.value);
      if (Number(formPackage.keyType) === 1) {
        const key = JSON.parse(JSON.stringify(formPackage.key));
        const formatKeyArr = key.split('\n');
        params.key = formatKeyArr;
      }
      await ApiModels.setModels(params);
      ElMessage({ type: 'success', message: '操作成功！' });
      activeModelKeyId.value = 0;
      visible.value = false;
      queryModelsList();
    }
  });
}

const handleAvatarSuccess: UploadProps['onSuccess'] = (
  response,
  uploadFile
) => {
  console.log('response: ', response.data);
  formPackage.modelAvatar = response.data;
};

const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  if (!allowedTypes.includes(rawFile.type)) {
    ElMessage.error('当前系统仅支持 PNG、JPEG、GIF 和 WebP 格式的图片!');
    return false;
  } else if (rawFile.size / 1024 > 300) {
    ElMessage.error('当前限制文件最大不超过 300KB!');
    return false;
  }
};

onMounted(() => {
  queryModelsList();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">模型配置说明</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>模型分为（基础对话｜创意模型｜特殊模型三类）。</div>
          <div>
            基础对话：用户可以在用户端选择的模型，用于对话、问答、聊天等功能，仅支持
            OpenAI Chat 格式，其他模型需自行使用分发程序适配。
          </div>
          <div>
            创意模型：用户端不展示，包含【Midjourney 绘图】【Dalle 绘图】【SDXL
            绘图】【Suno音乐】，用于插件调用。
          </div>
          <div>
            其中，其中 Midjourney 对接 Midjourney-Proxy-Plus
            格式，SDXL、LumaVideo 及 SunoMusic 适配
            <a href="https://api.openai.com" target="_blank">LightAi API</a>
            格式。
          </div>
          <div>特殊模型：用户端不展示，包含【TTS朗读】【GPTs】。</div>
        </div>
      </template>
      <HButton outline type="success" @click="visible = true">
        <SvgIcon name="i-ri:file-text-line" />
        添加模型
      </HButton>
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="模型类型" prop="model">
          <el-select
            v-model="formInline.keyType"
            filterable
            allow-create
            placeholder="请选择或填写绑定的模型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in MODELTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="使用模型" prop="model">
          <el-select
            v-model="formInline.model"
            filterable
            allow-create
            placeholder="请选择或填写绑定的模型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in MODEL_LIST"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="启用状态" prop="status">
          <el-select
            v-model="formInline.status"
            placeholder="请选择key启用状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in QUESTION_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryModelsList"> 查询 </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>
    <page-main style="width: 100%">
      <el-table
        v-loading="loading"
        border
        :data="tableData"
        style="width: 100%"
        size="large"
      >
        <el-table-column prop="keyType" label="模型类型" width="120">
          <template #default="scope">
            <el-tag type="success">
              {{ MODELTYPEMAP[scope.row.keyType as keyof typeof MODELTYPEMAP] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="modelOrder"
          label="模型排序"
          width="90"
          align="center"
        />
        <el-table-column
          prop="modelLimits"
          label="频率限制"
          width="90"
          align="center"
        />
        <el-table-column prop="modelName" label="模型名称" width="180" />
        <el-table-column
          prop="status"
          align="center"
          label="启用状态"
          width="90"
        >
          <template #default="scope">
            <el-tag :type="scope.row.status ? 'success' : 'danger'">
              {{ scope.row.status ? '使用中' : '已暂停' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="key" label="模型KEY" width="460">
          <template #default="scope">
            <div class="w-full overflow-y-scroll whitespace-nowrap">
              {{ scope.row.key }}
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="model"
          align="center"
          label="绑定模型"
          width="180"
        >
          <template #default="scope">
            <el-tag
              :type="scope.row.model.includes('gpt-4') ? 'success' : 'info'"
            >
              {{ scope.row.model }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="isTokenBased"
          align="center"
          label="Token计费"
          width="120"
        >
          <template #default="scope">
            <el-tag :type="scope.row.isTokenBased ? 'success' : 'danger'">
              {{ scope.row.isTokenBased ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="deductType"
          align="center"
          label="扣费类型"
          width="90"
        >
          <template #default="scope">
            <el-tag
              :type="
                scope.row.deductType === 1
                  ? 'success'
                  : scope.row.deductType === 2
                  ? 'warning'
                  : 'info'
              "
            >
              {{
                scope.row.deductType === 1
                  ? '普通积分'
                  : scope.row.deductType === 2
                  ? '高级积分'
                  : '绘画积分'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="deduct"
          align="center"
          label="单次扣除"
          width="90"
        >
          <template #default="scope">
            <el-tag :type="scope.row.deductType === 1 ? 'success' : 'warning'">
              {{ `${scope.row.deduct} 积分` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="useCount"
          align="center"
          label="调用次数"
          width="90"
        />
        <el-table-column
          prop="useToken"
          align="center"
          label="已使用Token"
          width="120"
        />
        <el-table-column
          prop="keyStatus"
          align="center"
          label="key状态"
          width="110"
        >
          <template #default="scope">
            <el-tag :type="scope.row.keyStatus === 1 ? 'success' : 'danger'">
              {{
                scope.row.keyStatus === 1
                  ? '正常工作'
                  : scope.row.keyStatus === -1
                  ? '已被封禁'
                  : '余额耗尽 '
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="maxModelTokens"
          align="center"
          label="模型最大上下文"
          width="140"
        >
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.maxModelTokens || '-' }}
            </el-button>
          </template>
        </el-table-column>

        <el-table-column
          prop="proxyUrl"
          align="center"
          label="绑定的代理地址"
          width="140"
        >
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.proxyUrl || '-' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column
          prop="proxyUrl"
          align="center"
          label="变更提示信息"
          width="180"
        >
          <template #default="scope">
            {{ scope.row.remark || '-' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="createdAt"
          align="center"
          label="添加时间"
          width="120"
        >
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="200">
          <template #default="scope">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleEditKey(scope.row)"
            >
              变更
            </el-button>
            <el-popconfirm
              title="确认删除此秘钥么?"
              width="180"
              icon-color="red"
              @confirm="handleDeleteKey(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small">
                  删除秘钥
                </el-button>
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
          @size-change="queryModelsList"
          @current-change="queryModelsList"
        />
      </el-row>
    </page-main>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="770"
      class="max-h-[90vh] overflow-y-auto rounded-md p-4"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        v-loading="modelLoading"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
      >
        <el-form-item label="模型类型选择" prop="keyType">
          <el-select
            v-model="formPackage.keyType"
            placeholder="请选择模型类型"
            style="width: 100%"
          >
            <el-option
              v-for="item in MODELTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="用户端显示"
          prop="status"
        >
          <el-switch v-model="formPackage.status" />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                关闭将在用户端隐藏此模型、但不会影响后台的调用
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="模型显示名称" prop="modelName">
          <el-input
            v-model="formPackage.modelName"
            placeholder="请填写模型显示名称（用户端看到的）"
          />
        </el-form-item>
        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="模型简介"
          prop="key"
        >
          <el-input
            v-model="formPackage.modelDescription"
            type="text"
            placeholder="请填写模型简介"
          />
        </el-form-item>
        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="模型图标"
          prop="modelAvatar"
        >
          <el-input
            v-model="formPackage.modelAvatar"
            placeholder="请填写或上传网站模型图标"
            clearable
          >
            <template #append>
              <el-upload
                class="avatar-uploader"
                :action="uploadUrl"
                :show-file-list="false"
                :on-success="handleAvatarSuccess"
                :before-upload="beforeAvatarUpload"
                style="
                  display: flex;
                  align-items: center;
                  justify-content: center;
                "
              >
                <img
                  v-if="formPackage.modelAvatar"
                  :src="formPackage.modelAvatar"
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
              <el-icon
                v-if="formPackage.modelAvatar"
                @click="reuploadModelAvatar"
                style="margin-left: 35px; width: 1rem"
              >
                <Refresh />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="模型排序" prop="modelOrder">
          <div class="input-with-text">
            <el-input-number
              v-model="formPackage.modelOrder"
              :max="999"
              :min="0"
              :step="10"
              class="input-number"
              style="margin-right: 10px"
            />
            <el-tooltip class="box-item" effect="dark" placement="right">
              <template #content>
                <div style="width: 250px">模型排序，越小越靠前。</div>
              </template>
              <el-icon class="ml-3 cursor-pointer">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </el-form-item>

        <el-form-item label="模型调用频率" prop="modelLimits">
          <div class="input-with-text">
            <el-input-number
              v-model="formPackage.modelLimits"
              :max="999"
              :min="0"
              :step="5"
              class="input-number"
              style="margin-right: 10px"
            />
            <span class="unit-text">次/小时</span>
          </div>
        </el-form-item>

        <el-form-item label="指定代理地址" prop="proxyUrl">
          <el-input
            v-model.number="formPackage.proxyUrl"
            placeholder="如需使用代理请填写、不填写默认使用全局配置！"
          />
        </el-form-item>
        <el-form-item label="模型密钥" prop="key">
          <el-input
            v-model="formPackage.key"
            type="text"
            placeholder="请填写模型Key"
          />
        </el-form-item>

        <el-form-item label="账号关联模型" prop="model">
          <el-select
            v-model="formPackage.model"
            filterable
            clearable
            placeholder="请选用或填写绑定的模型"
            allow-create
          >
            <el-option
              v-for="item in modelList"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                给定了部分可选的模型列表、你可以可以手动填写您需要调用的模型、请确保填写的模型是当前key支持的类型、否则可能会在调用中出现不可预知错误！
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>
        <el-form-item label="模型扣费类型" prop="deductType">
          <el-select
            v-model="formPackage.deductType"
            filterable
            allow-create
            clearable
            placeholder="请选用模型扣费类型"
          >
            <el-option
              v-for="item in DEDUCTTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                设置当前key的扣费类型、扣除普通积分或是高级积分。
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>

        <el-form-item label="单次扣除金额" prop="deduct">
          <el-input
            v-model.number="formPackage.deduct"
            placeholder="请填写单次调用此key的扣费金额！"
          />
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                设置当前key的单次调用扣除积分、建议同模型或名称key设置相同的金额、避免扣费发生异常！
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>
        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="上下文限制"
          prop="maxRounds"
        >
          <el-input
            v-model.number="formPackage.maxRounds"
            placeholder="请填写允许用户选择的最高上下文条数！"
          />
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                填写此配置可以限制用户在选择模型时候的高级配置中的最大上下文轮次、可以通过限制此数量减少token的损耗、减低上下文的损耗量、
                如果设置了模型的最大token和返回量、那么两个限制会同时生效！
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>
        <!-- <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="调用轮询权重"
          prop="keyWeight"
        >
          <el-input
            v-model.number="formPackage.keyWeight"
            placeholder="请填写key的权重、数字越大使用评率越高！"
            style="width: 80%"
          />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                当前轮询是根据模型下的列表按顺序调用、如果权重为2则表示轮到此key的时候会调用两次之后再轮询下一个key
                保证每个key的调用顺序以及限制每次调用的准确次数
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item> -->
        <el-form-item
          v-if="[1 || 3].includes(Number(formPackage.keyType))"
          label="模型最大Token"
          prop="maxModelTokens"
        >
          <el-input
            v-model.number="formPackage.maxModelTokens"
            placeholder="请填写模型最大Token、不填写默认使用默认！"
          />
        </el-form-item>

        <el-form-item label="调用超时时间" prop="timeout">
          <el-input
            v-model.number="formPackage.timeout"
            placeholder="请填写key的超时时间单位（秒）！"
          />
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="文件上传"
          prop="isFileUpload"
        >
          <el-radio-group v-model="formPackage.isFileUpload">
            <el-radio :label="0"> 不使用 </el-radio>
            <el-radio :label="1"> 逆向格式 </el-radio>
            <el-radio :label="2"> 4o格式 </el-radio>
            <el-radio :label="3"> 文件分析 </el-radio>
          </el-radio-group>
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                选择是否开启文件上传及其格式，逆向格式【直接附带链接，仅支持逆向渠道】，4o格式【OpenAI
                Chat
                的识图格式，仅支持图片】，文件分析【内置方式的文件分析，支持全模型分析带文字的文件】
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>
        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="token 关联计费"
          prop="isTokenBased"
        >
          <el-switch v-model="formPackage.isTokenBased" />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                关联 token 的梯度计费模型，每次扣除的积分 = 单次扣除金额
                *（token 消耗 / token 计费比例）结果向上取整【例如单次扣除金额为
                3 积分，token 计费比例为 1000，用户调用消耗 2500
                token，那么扣除的积分为 3 *（2500 / 1000）向上取整 9 积分】
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="token计费比例"
          prop="tokenFeeRatio"
        >
          <el-input
            v-model.number="formPackage.tokenFeeRatio"
            placeholder="请填写token计费比例"
            style="width: 80%"
          />
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                开启 Token 计费后生效，每积分等价于多少 Token
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer"><QuestionFilled /></el-icon>
          </el-tooltip> -->
        </el-form-item>
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
