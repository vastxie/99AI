<route lang="yaml">
meta:
  title: 卡券管理
</route>

<script lang="ts" setup>
import ApiPackage from '@/api/modules/package';
import { IS_OPTIONS, PACKAGE_TYPE_OPTIONS } from '@/constants/index';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import { Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules, UploadProps } from 'element-plus';
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';

// const uploadUrl = ref(`${import.meta.env.VITE_APP_API_BASEURL}/upload/file`);
const uploadUrl = ref(
  `${import.meta.env.VITE_APP_API_BASEURL}/upload/file?dir=${encodeURIComponent(
    'system/others'
  )}`
);

const formRef = ref<FormInstance>();
const total = ref(0);
const visible = ref(false);
const loading = ref(false);

const formInline = reactive({
  name: '',
  page: 1,
  size: 10,
  status: '',
});
const formPackageRef = ref<FormInstance>();
const activePackageId = ref(0);

interface Package {
  id?: number | null;
  name?: string | null;
  des?: string | null;
  coverImg?: string | null;
  price?: number | null;
  order?: number | null;
  status: number;
  weight?: number | null;
  days?: number | null;
  model3Count: number | null;
  model4Count: number | null;
  drawMjCount: number | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}

const formPackage: Package = reactive({
  name: null,
  des: null,
  coverImg: null,
  price: null,
  order: null,
  status: 0,
  weight: null,
  days: null,
  model3Count: null,
  model4Count: null,
  drawMjCount: null,
});

const rules = reactive<FormRules>({
  name: [{ required: true, message: '请填写套餐名称', trigger: 'blur' }],
  des: [{ required: true, message: '请填写套餐的详细描述', trigger: 'blur' }],
  deductionType: [
    { required: true, message: '请选择扣费形式', trigger: 'change' },
  ],
  coverImg: [
    { required: true, message: '请填写或上传封面图地址', trigger: 'blur' },
  ],
  price: [{ required: true, message: '请填写套餐价格', trigger: 'blur' }],
  order: [{ required: true, message: '请填写套餐排序', trigger: 'blur' }],
  status: [
    { required: true, message: '请选择套餐开启状态', trigger: 'change' },
  ],
  days: [{ required: true, message: '请填写套餐有效期天数', trigger: 'blur' }],
  model3Count: [
    {
      required: true,
      message: '请填写套餐中基础模型可使用次数',
      trigger: 'blur',
    },
  ],
  model4Count: [
    {
      required: true,
      message: '请填写套餐中高级模型可使用次数',
      trigger: 'blur',
    },
  ],
  drawMjCount: [
    { required: true, message: '请填写套餐中抽奖次数', trigger: 'blur' },
  ],
});

const tableData = ref([]);

async function queryAllUserList() {
  try {
    loading.value = true;

    const res = await ApiPackage.queryAllPackage(formInline);
    loading.value = false;

    const { rows, count } = res.data;
    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryAllUserList();
}

type Status = keyof typeof IS_OPTIONS;

const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  if (!allowedTypes.includes(rawFile.type)) {
    ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、和 WebP 格式的图片!');
    return false;
  } else if (rawFile.size / 1024 > 2000) {
    ElMessage.error('当前限制文件最大不超过 2000KB!');
    return false;
  }
  return true;
};

const handleAvatarSuccess: UploadProps['onSuccess'] = (
  response,
  uploadFile
) => {
  formPackage.coverImg = response.data;
};

async function handleDeletePackage(id: any) {
  await ApiPackage.delPackage({ id });
  ElMessage({ type: 'success', message: '删除套餐成功！' });
  queryAllUserList();
}

function handleUpdatePackage(row: Package) {
  activePackageId.value = row.id as number;
  nextTick(() => {
    Object.assign(formPackage, row);
    delete formPackage?.createdAt;
    delete formPackage?.updatedAt;
    delete formPackage?.deletedAt;
    delete formPackage?.id;
  });
  visible.value = true;
}

const dialogTitle = computed(() => {
  return activePackageId.value ? '更新套餐' : '新增套餐';
});

const dialogButton = computed(() => {
  return activePackageId.value ? '确认更新' : '确认新增';
});

function handleCreatePkg() {
  activePackageId.value = 0;
  visible.value = true;
  formPackageRef.value?.resetFields();
}

function handlerCloseDialog(formEl: FormInstance | undefined) {
  activePackageId.value = 0;
  formEl?.resetFields();
}

async function handlerSubmit(formEl: FormInstance | undefined) {
  formEl?.validate(async (valid) => {
    if (valid) {
      if (activePackageId.value) {
        await ApiPackage.updatePackage({
          id: activePackageId.value,
          ...formPackage,
        });
        ElMessage({ type: 'success', message: '更新套餐成功！' });
      } else {
        await ApiPackage.createPackage(formPackage);
        ElMessage({ type: 'success', message: '创建新的套餐成功！' });
      }
      visible.value = false;
      queryAllUserList();
    }
  });
}

onMounted(() => {
  queryAllUserList();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">套餐设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            套餐分为不限时套餐和限时套餐。不限时充值积分永不过期，限时套餐在规定时间未使用完毕将清空剩余积分。
          </div>
          <div>
            如果充值的套餐等级高于或等于当前套餐等级，则叠加充值额度并延长会员到期时间。
          </div>
          <div>
            如果充值的套餐等级低于当前套餐等级，则只叠加充值额度，不延长会员到期时间也不改变会员等级。
          </div>
          请仔细阅读以上内容并合理配置，套餐有效时间设为-1即为不限时套餐。
        </div>
      </template>
      <HButton outline @click="handleCreatePkg">
        <SvgIcon name="ic:baseline-plus" />
        创建套餐
      </HButton>
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="套餐状态" prop="status">
          <el-select
            v-model="formInline.status"
            placeholder="请选择套餐状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in PACKAGE_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="queryAllUserList"> 查询 </el-button>
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
        <el-table-column fixed prop="name" label="套餐名称" width="150" />
        <el-table-column
          prop="order"
          label="排序ID"
          align="center"
          width="100"
        />
        <el-table-column
          prop="coverImg"
          label="套餐封面"
          width="150"
          align="center"
        >
          <template #default="scope">
            <el-image
              style="height: 50px"
              :src="scope.row.coverImg"
              fit="fill"
            />
          </template>
        </el-table-column>
        <el-table-column
          prop="price"
          label="套餐价格"
          width="100"
          align="center"
        />
        <el-table-column
          prop="weight"
          label="套餐等级"
          width="100"
          align="center"
        />
        <el-table-column prop="status" label="套餐状态" width="100">
          <template #default="scope">
            <el-tag type="info">
              {{ IS_OPTIONS[scope.row.status as Status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="days" label="套餐有效期" width="120">
          <template #default="scope">
            {{ scope.row.days > 0 ? `${scope.row.days}天` : '永久' }}
          </template>
        </el-table-column>
        <el-table-column prop="model3Count" label="基础模型额度" width="100" />
        <el-table-column prop="model4Count" label="高级模型额度" width="100" />
        <el-table-column prop="drawMjCount" label="绘画额度" width="100" />
        <el-table-column prop="des" label="套餐描述" width="300" />
        <el-table-column prop="createdAt" label="创建时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="200">
          <template #default="scope">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleUpdatePackage(scope.row)"
            >
              修改套餐
            </el-button>
            <el-popconfirm
              title="确认删除此套餐么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small">
                  删除套餐
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
          @size-change="queryAllUserList"
          @current-change="queryAllUserList"
        />
      </el-row>
    </page-main>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="970"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
      >
        <el-row>
          <el-col :span="11">
            <el-form-item label="套餐详细名称" prop="name">
              <el-input
                v-model="formPackage.name"
                placeholder="请填写套餐名称"
              />
            </el-form-item>
          </el-col>
          <el-col :span="3" :offset="2">
            <el-form-item label="套餐开启状态" prop="status">
              <el-switch
                v-model="formPackage.status"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-form-item label="套餐等级" prop="status">
              <el-input
                v-model.number="formPackage.weight"
                type="number"
                placeholder="设置套餐等级"
              />
            </el-form-item>
          </el-col>
          <el-col :span="11">
            <el-form-item label="设置套餐价格" prop="price">
              <el-input
                v-model.number="formPackage.price"
                placeholder="请填写套餐价格(￥)最多两位小数"
                type="number"
              />
            </el-form-item>
          </el-col>
          <el-col :span="11" :offset="2">
            <el-form-item label="套餐有效时间" prop="days">
              <el-input
                v-model.number="formPackage.days"
                type="number"
                placeholder="自卡密生成之日有效天数、-1为永久"
              />
            </el-form-item>
          </el-col>
          <el-col :span="9">
            <el-form-item label="设置套餐封面" prop="coverImg">
              <el-input
                v-model="formPackage.coverImg"
                class="flex-1"
                placeholder="填写封面地址或点击上传"
              />
            </el-form-item>
          </el-col>
          <el-col :span="2">
            <el-upload
              class="avatar-uploader"
              :action="uploadUrl"
              :show-file-list="false"
              :on-success="handleAvatarSuccess"
              :before-upload="beforeAvatarUpload"
            >
              <el-button>
                <el-icon>
                  <Plus />
                </el-icon>
              </el-button>
            </el-upload>
          </el-col>
          <el-col :span="11" :offset="2">
            <el-form-item label="设置套餐排序" prop="order">
              <el-input
                v-model.number="formPackage.order"
                type="number"
                placeholder="排序数字越大越靠前|套餐权重等级则反之"
              />
            </el-form-item>
          </el-col>

          <el-col :span="11">
            <el-form-item label="设置套餐描述" prop="des">
              <el-input
                v-model="formPackage.des"
                type="textarea"
                placeholder="请填写套餐详细介绍信息、用于对外展示、建议控制套餐价格字数以便于用户端对齐格式..."
                :rows="6"
              />
            </el-form-item>
          </el-col>

          <el-col :span="11" :offset="2">
            <el-form-item label="基础模型积分" prop="model3Count">
              <el-input
                v-model.number="formPackage.model3Count"
                type="number"
                placeholder="基础模型积分"
              />
            </el-form-item>
            <el-form-item label="高级模型积分" prop="model4Count">
              <el-input
                v-model.number="formPackage.model4Count"
                type="number"
                placeholder="高级模型积分"
              />
            </el-form-item>
            <el-form-item label="绘画模型积分" prop="drawMjCount">
              <el-input
                v-model.number="formPackage.drawMjCount"
                type="number"
                placeholder="绘画模型积分"
              />
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
