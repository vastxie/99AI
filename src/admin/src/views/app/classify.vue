<route lang="yaml">
meta:
  title: App分类管理
</route>

<script lang="ts" setup>
import ApiApp from '@/api/modules/app';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import type { FormInstance, FormRules, UploadProps } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive } from 'vue';

import { ENABLE_STATUS_OPTIONS, QUESTION_STATUS_MAP } from '@/constants/index';

const formRef = ref<FormInstance>();
const total = ref(0);
const visible = ref(false);
const loading = ref(false);
const uploadUrl = ref(`${import.meta.env.VITE_APP_API_BASEURL}/upload/file`);

const formInline = reactive({
  name: '',
  status: '',
  page: 1,
  size: 10,
});

const formPackageRef = ref<FormInstance>();
const activeAppCatId = ref(0);
const formPackage = reactive({
  name: '',
  des: '',
  coverImg: '',
  order: 100,
  status: 0,
});

const rules = reactive<FormRules>({
  name: [{ required: true, message: '请填写分类名称', trigger: 'blur' }],
  des: [{ required: false, message: '请填写分类描述', trigger: 'blur' }],
  coverImg: [
    { required: false, message: '请填写分类封面图片地址', trigger: 'blur' },
  ],
  order: [{ required: false, message: '请填写排序ID', trigger: 'blur' }],
  status: [{ required: true, message: '请选择分类状态', trigger: 'change' }],
});

const tableData = ref([]);

const dialogTitle = computed(() => {
  return activeAppCatId.value ? '更新分类' : '新增分类';
});

const dialogButton = computed(() => {
  return activeAppCatId.value ? '确认更新' : '确认新增';
});

async function queryCatList() {
  try {
    loading.value = true;
    const res = await ApiApp.queryCats(formInline);
    const { rows, count } = res.data;
    loading.value = false;

    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

function handleUpdatePackage(row: any) {
  activeAppCatId.value = row.id;
  const { name, status, des, order, coverImg } = row;
  nextTick(() => {
    Object.assign(formPackage, { name, status, des, order, coverImg });
  });
  visible.value = true;
}

function handlerCloseDialog(formEl: FormInstance | undefined) {
  activeAppCatId.value = 0;
  formEl?.resetFields();
}

async function handleDeletePackage(row: any) {
  await ApiApp.deleteCats({ id: row.id });
  ElMessage.success('删除分类成功');
  queryCatList();
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryCatList();
}

const handleAvatarSuccess: UploadProps['onSuccess'] = (
  response,
  uploadFile
) => {
  formPackage.coverImg = response.data;
};

const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  if (!allowedTypes.includes(rawFile.type)) {
    ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、和 WebP 格式的图片!');
    return false;
  } else if (rawFile.size / 1024 > 300) {
    ElMessage.error('当前限制文件最大不超过 300KB!');
    return false;
  }
  return true;
};

function handlerSubmit(formEl: FormInstance | undefined) {
  formEl?.validate(async (valid) => {
    if (valid) {
      if (activeAppCatId.value) {
        await ApiApp.updateCats({ id: activeAppCatId.value, ...formPackage });
        ElMessage({ type: 'success', message: '更新分类成功！' });
      } else {
        await ApiApp.createCats(formPackage);
        ElMessage({ type: 'success', message: '创建新的分类成功！' });
      }
      visible.value = false;
      queryCatList();
    }
  });
}
onMounted(() => {
  queryCatList();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">应用分类配置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>应用分类可能会被多个用户收藏，一旦创建，不建议删除。</div>
        </div>
      </template>
      <HButton outline @click="visible = true">
        <SvgIcon name="ic:baseline-plus" />
        新增分类
      </HButton>
    </PageHeader>

    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="分类名称" prop="name">
          <el-input
            v-model="formInline.name"
            placeholder="分类名称[模糊搜索]"
            @keydown.enter.prevent="queryCatList"
          />
        </el-form-item>
        <el-form-item label="分类状态" prop="status">
          <el-select
            v-model="formInline.status"
            placeholder="请选择分类状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in ENABLE_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryCatList"> 查询 </el-button>
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
        <!-- <el-table-column prop="coverImg" label="分类封面" width="120">
          <template #default="scope">
            <el-image
              style="height: 50px"
              :src="scope.row.coverImg"
              fit="fill"
            />
          </template>
        </el-table-column> -->
        <el-table-column prop="name" label="分类名称" />
        <el-table-column prop="appCount" label="应用数量" />
        <el-table-column prop="order" label="排序ID" />
        <el-table-column prop="status" label="分类状态">
          <template #default="scope">
            <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
              {{ QUESTION_STATUS_MAP[scope.row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- <el-table-column prop="des" label="描述信息" width="300" /> -->
        <el-table-column prop="createdAt" label="创建时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
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
              title="确认删除此分类么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small">
                  删除分类
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
          @size-change="queryCatList"
          @current-change="queryCatList"
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
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="formPackage.name" placeholder="请填写分类名称" />
        </el-form-item>
        <el-form-item label="分类状态" prop="status">
          <el-switch
            v-model="formPackage.status"
            :active-value="1"
            :inactive-value="0"
          />
        </el-form-item>
        <el-form-item label="排序ID" prop="order">
          <el-input
            v-model.number="formPackage.order"
            placeholder="请填写排序ID[数字越大越靠前]"
          />
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
