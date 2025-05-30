<route lang="yaml">
meta:
  title: 卡券管理
</route>

<script lang="ts" setup>
  import ApiApp from '@/api/modules/app';
  import ApiPackage from '@/api/modules/package';
  import { IS_OPTIONS, PACKAGE_TYPE_OPTIONS } from '@/constants/index';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance, FormRules, UploadProps } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';

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
    status?: number | null;
    weight?: number | null;
    days?: number | null;
    model3Count: number | null;
    model4Count: number | null;
    drawMjCount: number | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
    appCats?: string | null;
  }

  const status = ref(0);
  const formPackage = reactive({
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
    appCats: '',
  });

  const rules = reactive<FormRules>({
    name: [{ required: true, message: '请填写套餐名称', trigger: 'blur' }],
    des: [{ required: true, message: '请填写套餐的详细描述', trigger: 'blur' }],
    deductionType: [{ required: true, message: '请选择扣费形式', trigger: 'change' }],
    coverImg: [{ required: true, message: '请填写或上传封面图地址', trigger: 'blur' }],
    appCats: [
      {
        required: false,
        message: '请填写套餐包含的应用，多个用逗号隔开',
        trigger: 'blur',
      },
    ],
    price: [{ required: true, message: '请填写套餐价格', trigger: 'blur' }],
    order: [{ required: true, message: '请填写套餐排序', trigger: 'blur' }],
    status: [{ required: true, message: '请选择套餐开启状态', trigger: 'change' }],
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
    drawMjCount: [{ required: true, message: '请填写套餐中抽奖次数', trigger: 'blur' }],
  });

  const tableData = ref([]);

  // 获取分类名称列表
  async function queryCatList() {
    const res = await ApiApp.queryCats({ size: 100 });
    const { rows } = res.data;
    // 只保留 isMember 为 1 的分类，并且只保留名称
    appList.value = rows
      .filter((cat: any) => cat.isMember === 1)
      .map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        isMember: cat.isMember,
      }));
  }

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

  interface AppCat {
    id: string;
    name: string;
    isMember: number;
  }

  const appList = ref<AppCat[]>([]);

  onMounted(() => {
    queryCatList();
    queryAllUserList();
  });

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    formPackage.coverImg = response.data;
  };

  async function handleDeletePackage(id: any) {
    await ApiPackage.delPackage({ id });
    ElMessage({ type: 'success', message: '删除套餐成功！' });
    queryAllUserList();
  }

  function handleUpdatePackage(row: Package) {
    activePackageId.value = row.id as number;
    // 确保分类列表已加载
    if (appList.value.length === 0) {
      queryCatList();
    }

    nextTick(() => {
      // 先重置表单
      formPackageRef.value?.resetFields();
      // 然后赋值
      Object.assign(formPackage, row as any);
      // 确保appCats字段正确设置
      formPackage.appCats = row.appCats || '';
      // 移除不需要的字段
      delete (formPackage as any).createdAt;
      delete (formPackage as any).updatedAt;
      delete (formPackage as any).deletedAt;
      delete (formPackage as any).id;
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
    // 确保分类列表已加载
    queryCatList().then(() => {
      console.log('分类列表加载完成:', appList.value); // 添加日志便于调试
    });

    visible.value = true;
    // 重置表单
    nextTick(() => {
      formPackageRef.value?.resetFields();
      // 确保初始化时appCats为空字符串而不是null
      formPackage.appCats = '';
      console.log('初始化appCats:', formPackage.appCats); // 添加日志便于调试
    });
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activePackageId.value = 0;
    formEl?.resetFields();
  }

  async function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        const submitData = {
          ...formPackage,
        };

        if (activePackageId.value) {
          await ApiPackage.updatePackage({
            id: activePackageId.value,
            ...submitData,
          });
          ElMessage({ type: 'success', message: '更新套餐成功！' });
        } else {
          await ApiPackage.createPackage(submitData);
          ElMessage({ type: 'success', message: '创建新的套餐成功！' });
        }
        visible.value = false;
        queryAllUserList();
      }
    });
  }

  // 检查分类是否已被选择
  function isCategorySelected(catId: string): boolean {
    if (!formPackage.appCats || formPackage.appCats === '') return false;
    return formPackage.appCats.split(',').includes(String(catId));
  }

  // 选择分类
  function selectCategory(catId: string, catName: string): void {
    console.log('选择分类:', catId, catName); // 添加日志便于调试
    if (!formPackage.appCats || formPackage.appCats === '') {
      formPackage.appCats = String(catId);
    } else if (!formPackage.appCats.split(',').includes(String(catId))) {
      formPackage.appCats = `${formPackage.appCats},${catId}`;
    }
    console.log('选择后的appCats:', formPackage.appCats); // 添加日志便于调试
  }

  // 移除分类
  function removeCategory(catId: string): void {
    console.log('移除分类:', catId); // 添加日志便于调试
    if (!formPackage.appCats) return;
    const appCats = formPackage.appCats.split(',');
    const index = appCats.indexOf(String(catId));
    if (index !== -1) {
      appCats.splice(index, 1);
      formPackage.appCats = appCats.join(',');
    }
    console.log('移除后的appCats:', formPackage.appCats); // 添加日志便于调试
  }

  // 根据ID获取分类名称
  function getCategoryNameById(catId: string): string {
    if (!catId || catId === '') return '';

    // 确保appList.value已加载
    if (appList.value.length === 0) {
      return catId; // 如果分类列表未加载，暂时返回ID
    }

    // 尝试查找匹配的分类，使用字符串比较确保类型一致
    const category = appList.value.find((item) => String(item.id) === String(catId));
    if (category) {
      return category.name;
    } else {
      console.warn('未找到对应ID的分类:', catId);
      return catId; // 如果找不到对应的分类，则返回ID本身
    }
  }
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
          <div>如果充值的套餐等级高于或等于当前套餐等级，则叠加充值额度并延长会员到期时间。</div>
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
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column fixed prop="name" label="套餐名称" width="150" />
        <el-table-column prop="order" label="排序ID" align="center" width="100" />
        <el-table-column prop="appCats" label="套餐应用" width="200" align="center">
          <template #default="scope">
            <el-tag
              v-for="appId in scope.row.appCats && scope.row.appCats !== ''
                ? scope.row.appCats.split(',').filter((id: string) => id && id !== '')
                : []"
              :key="appId"
              class="mr-1"
              size="small"
            >
              {{ getCategoryNameById(appId) }}
            </el-tag>
            <span v-if="!scope.row.appCats || scope.row.appCats === ''" class="text-gray-400">
              无分类
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="price" label="套餐价格" width="100" align="center" />
        <el-table-column prop="weight" label="套餐等级" width="100" align="center" />
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
            <el-button link type="primary" size="small" @click="handleUpdatePackage(scope.row)">
              修改套餐
            </el-button>
            <el-popconfirm
              title="确认删除此套餐么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row.id)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除套餐 </el-button>
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
              <el-input v-model="formPackage.name" placeholder="请填写套餐名称" />
            </el-form-item>
          </el-col>
          <el-col :span="3" :offset="2">
            <el-form-item label="套餐开启状态" prop="status">
              <el-switch v-model="formPackage.status" :active-value="1" :inactive-value="0" />
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
          <el-col :span="11">
            <el-form-item label="App分类" prop="appCats">
              <div class="category-selector">
                <!-- 已选择的分类 -->
                <div class="selected-categories mb-2 min-h-[36px] flex items-center flex-wrap">
                  <el-tag
                    v-for="catId in formPackage.appCats && formPackage.appCats !== ''
                      ? formPackage.appCats.split(',').filter((id: string) => id && id !== '')
                      : []"
                    :key="catId"
                    closable
                    class="mr-1 mb-1"
                    @close="removeCategory(catId)"
                  >
                    {{ getCategoryNameById(catId) }}
                  </el-tag>
                  <div
                    v-if="!formPackage.appCats || formPackage.appCats === ''"
                    class="text-gray-400 text-sm py-1"
                  >
                    请从下方选择分类
                  </div>
                </div>

                <!-- 分类选择区域 -->
                <div class="category-options p-2 border rounded-md max-h-40 overflow-y-auto">
                  <div class="text-sm text-gray-500 mb-2">可选分类：</div>
                  <div class="flex flex-wrap">
                    <el-tag
                      v-for="item in appList"
                      :key="item.id"
                      :class="[
                        'mr-1 mb-1 cursor-pointer',
                        isCategorySelected(String(item.id)) ? 'is-disabled' : '',
                      ]"
                      :effect="isCategorySelected(String(item.id)) ? 'plain' : 'dark'"
                      @click.stop="
                        isCategorySelected(String(item.id))
                          ? null
                          : selectCategory(String(item.id), item.name)
                      "
                    >
                      {{ item.name }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </el-form-item>
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
