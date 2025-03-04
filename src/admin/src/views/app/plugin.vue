<route lang="yaml">
meta:
  title: 插件管理
</route>

<script lang="ts" setup>
import ApiPlugin from '@/api/modules/plugin';
import { Plus, Refresh } from '@element-plus/icons-vue';
import type { FormInstance, FormRules, UploadProps } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive } from 'vue';

import { QUESTION_STATUS_MAP } from '@/constants/index';
import axios from 'axios';

const formRef = ref<FormInstance>();
const total = ref(0);
const visible = ref(false);
const loading = ref(false);

const parameterOptions: string[] = [
  'dall-e-3',
  'stable-diffusion',
  'flux-draw',
  'midjourney',
  'suno-music',
  'luma-video',
  'cog-video',
  'net-search',
  'mind-map',
];

const pluginType = 1; // 或者 0

const formInline = reactive({
  name: '',
  pluginImg: '',
  description: '',
  demoData: '',
  isEnabled: 1,
  parameters: '',
  sortOrder: 100,
  page: 1,
  size: 10,
});
// const uploadUrl = ref(`${import.meta.env.VITE_APP_API_BASEURL}/upload/file`);
const uploadUrl = ref(
  `${import.meta.env.VITE_APP_API_BASEURL}/upload/file?dir=${encodeURIComponent(
    'system/plugin'
  )}`
);

const formPackageRef = ref<FormInstance>();
const activeAppCatId = ref(0);
const isUserApp = ref(false);
const userAppStatus = ref(0);
const formPackage = reactive({
  name: '',
  pluginImg: '',
  description: '',
  demoData: '',
  isEnabled: 1,
  parameters: '',
  sortOrder: 100,
});

const rules = reactive<FormRules>({
  name: [{ required: true, message: '请填写App名称', trigger: 'blur' }],
  description: [
    {
      required: true,
      message: '请填写App介绍信息、用于对外展示',
      trigger: 'blur',
    },
  ],
  pluginImg: [{ required: false, message: '请上传插件封面', trigger: 'blur' }],
  demoData: [{ required: false, message: '请填写演示数据', trigger: 'blur' }],
  isEnabled: [
    {
      required: true,
      type: 'number',
      message: '请选择插件状态',
      trigger: 'change',
    },
  ],

  parameters: [{ required: true, message: '请填写调用参数', trigger: 'blur' }],
  sortOrder: [
    {
      required: true,
      type: 'number',
      message: '请填写排序值',
      trigger: 'change',
    },
  ],
});

const tableData = ref([]);

interface CatItem {
  id: number;
  name: string;
}
const catList: Ref<CatItem[]> = ref([]);

const dialogTitle = computed(() => {
  return activeAppCatId.value ? '更新插件' : '新增插件';
});

const dialogButton = computed(() => {
  return activeAppCatId.value ? '确认更新' : '确认新增';
});

async function queryAppList() {
  try {
    loading.value = true;
    const res = await ApiPlugin.pluginList(formInline);
    const { rows, count } = res.data;
    loading.value = false;
    total.value = count;
    tableData.value = rows.sort(
      (a: { order: number }, b: { order: number }) => b.order - a.order
    );
  } catch (error) {
    loading.value = false;
  }
}

function handleUpdatePackage(row: any) {
  activeAppCatId.value = row.id;
  isUserApp.value = row.role === 'user';
  userAppStatus.value = row.status;
  const {
    name,
    pluginImg,
    description,
    demoData,
    isEnabled,
    parameters,
    sortOrder,
  } = row;
  nextTick(() => {
    Object.assign(formPackage, {
      name,
      pluginImg,
      description,
      demoData,
      isEnabled,
      parameters,
      sortOrder,
    });
  });
  visible.value = true;
}

function handlerCloseDialog(formEl: FormInstance | undefined) {
  activeAppCatId.value = 0;
  formEl?.resetFields();
}

async function handleDeletePackage(row: any) {
  await ApiPlugin.delPlugin({ id: row.id });
  ElMessage.success('删除分类成功');
  queryAppList();
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryAppList();
}

const handleAvatarSuccess: UploadProps['onSuccess'] = (
  response,
  uploadFile
) => {
  console.log('response: ', response.data);
  formPackage.pluginImg = response.data;
};

async function reuploadPluginAvatar() {
  if (formPackage.pluginImg) {
    const file = await downloadFile(formPackage.pluginImg);
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

function handlerSubmit(formEl: FormInstance | undefined) {
  formEl?.validate(async (valid) => {
    if (valid) {
      if (activeAppCatId.value) {
        const params = { id: activeAppCatId.value, ...formPackage };
        /* 如果是用户的app 不能修改状态 保持原样返回 */
        await ApiPlugin.updatePlugin(params);
        ElMessage({ type: 'success', message: '更新插件成功！' });
      } else {
        await ApiPlugin.createPlugin(formPackage);
        ElMessage({ type: 'success', message: '创建新的插件成功！' });
      }
      visible.value = false;
      queryAppList();
    }
  });
}

onMounted(() => {
  queryAppList();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">插件设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            可自定义插件名称、描述和头像用于前端显示，同时需要设置对应的插件参数。
          </div>
          <div>插件系统包含，内置插件和普通插件两种。</div>
          <div>
            插件已支持Suno音乐（参数：suno-music）、Midjourney绘图（参数：midjourney）、Stable
            Diffusion绘图（参数：stable-diffusion）、
          </div>
          <div>
            Dalle绘画（参数：dall-e-3）、LumaVideo（参数：luma-video）、CogVideoX（参数：cog-video）、Flux绘画（参数：flux-draw），均需通过创意模型配置对应模型。
          </div>
          <div>
            联网插件(参数：net-search)、思维导图(参数：mind-map)。联网插件需在
            插件应用基础配置 中单独配置联网地址。
          </div>
          <div>
            若内置插件参数不在支持列表内，将以插件参数作为模型，调用对应模型。
          </div>
        </div>
      </template>
      <HButton outline @click="visible = true">
        <SvgIcon name="ic:baseline-plus" />
        添加插件
      </HButton>
    </PageHeader>

    <page-main style="width: 100%">
      <el-table
        v-loading="loading"
        border
        :data="tableData"
        style="width: 100%"
        size="large"
      >
        <el-table-column prop="pluginImg" label="封面" width="100">
          <template #default="scope">
            <el-image
              style="height: 50px"
              :src="scope.row.pluginImg"
              fit="fill"
            />
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="120" /> />
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column prop="parameters" label="调用参数" width="120" />
        <el-table-column prop="description" label="描述信息">
          <template #default="scope">
            <template>
              <div :style="{ maxWidth: '350px' }">
                {{ scope.row.description }}
              </div>
            </template>
            <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
              {{ scope.row.description }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="isEnabled" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.isEnabled === 1 ? 'success' : 'danger'">
              {{ QUESTION_STATUS_MAP[scope.row.isEnabled] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200">
          <template #default="scope">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleUpdatePackage(scope.row)"
            >
              编辑
            </el-button>
            <el-popconfirm
              title="确认删除此插件么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-row class="flex justify-end mt-5">
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
      width="570"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="100px"
        :model="formPackage"
        :rules="rules"
      >
        <el-form-item label="插件名称" prop="name">
          <el-input v-model="formPackage.name" placeholder="请填写插件名称" />
        </el-form-item>
        <el-form-item label="插件状态" prop="isEnabled">
          <el-switch
            v-model="formPackage.isEnabled"
            :active-value="1"
            :inactive-value="0"
          />
        </el-form-item>
        <el-form-item label="插件描述" prop="description">
          <el-input
            v-model="formPackage.description"
            type="textarea"
            placeholder="请填写插件描述、用于对外展示..."
            :rows="4"
          />
        </el-form-item>
        <el-form-item label="插件参数" prop="parameters">
          <el-select
            v-model="formPackage.parameters"
            placeholder="请选择或填写插件参数"
            filterable
            allow-create
            default-first-option
            clearable
          >
            <el-option
              v-for="item in parameterOptions"
              :key="item"
              :label="item"
              :value="item"
            ></el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="插件图标" prop="pluginImg">
          <el-input
            v-model="formPackage.pluginImg"
            placeholder="请填写或上传插件图标"
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
                  v-if="formPackage.pluginImg"
                  :src="formPackage.pluginImg"
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
                v-if="formPackage.pluginImg"
                @click="reuploadPluginAvatar"
                style="margin-left: 35px; width: 1rem"
              >
                <Refresh />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="排序ID" prop="sortOrder">
          <el-input
            v-model.number="formPackage.sortOrder"
            placeholder="请填写排序ID[数字越大越靠前]"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="flex justify-end mr-5">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>
