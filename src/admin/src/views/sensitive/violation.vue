<route lang="yaml">
meta:
  title: 违规记录
</route>

<script lang="ts" setup>
import ApiBadWords from '@/api/modules/badWords';
import ApiUsre from '@/api/modules/user';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import type { FormInstance } from 'element-plus';
import { ElMessage } from 'element-plus';
import { marked } from 'marked';
import { onMounted, reactive } from 'vue';
// import 'highlight.js/styles/github.css'
import {
  TYPEORIGINLIST,
  USER_STATUS_MAP,
  USER_STATUS_OPTIONS,
  USER_STATUS_TYPE_MAP,
  UserStatus,
} from '@/constants/index';

const render = new marked.Renderer();
marked.setOptions({
  renderer: render,
  gfm: true,
  pedantic: false,
  // highlight: (code, lang) => hljs.highlight(code, { language: lang || 'javascript' }).value,
});
const loading = ref(false);
const userList = ref();

const formRef = ref<FormInstance>();
const total = ref(0);

const formInline = reactive({
  userId: '',
  typeOriginCn: '',
  page: 1,
  size: 10,
});

const tableData = ref([]);
const visible = ref(false);
const form = reactive({
  status: '0',
  id: 0,
});

function handleUpdateStatus(row: any) {
  visible.value = true;
  form.status = row.status.toString();
  form.id = row.userId;
}

async function handlerUpateUserStatus() {
  const res: any = await ApiUsre.updateUserStatus(form);
  res.success && ElMessage({ type: 'success', message: '变更用户状态成功！' });
  visible.value = false;
}

async function queryAllLog() {
  loading.value = true;
  try {
    const res = await ApiBadWords.queryViolation(formInline);
    loading.value = false;
    const { rows, count } = res.data;
    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

async function handlerSearchUser(val: string) {
  const res = await ApiUsre.queryAllUser({ size: 30, username: val });
  userList.value = res.data.rows;
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryAllLog();
}
onMounted(() => {
  queryAllLog();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">违规检测记录</div>
      </template>
      <!-- <template #content>
        <div class="text-sm/6">
          <div>
            触发敏感词将自动拦截，如配置过三方平台、自定义检测将在三方平台通过后最后进行检测！
          </div>
        </div>
      </template> -->
    </PageHeader>

    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="用户名称" prop="userId">
          <el-select
            v-model="formInline.userId"
            filterable
            clearable
            remote
            reserve-keyword
            placeholder="用户姓名[模糊搜索]"
            remote-show-suffix
            :remote-method="handlerSearchUser"
            style="width: 160px"
          >
            <el-option
              v-for="item in userList"
              :key="item.id"
              :label="item.username"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="检测平台" prop="typeOriginCn">
          <el-select
            v-model="formInline.typeOriginCn"
            placeholder="请选择检测平台"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in TYPEORIGINLIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryAllLog"> 查询 </el-button>
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
        :tooltip-options="{}"
      >
        <el-table-column
          fixed
          prop="userInfo.username"
          label="用户名称"
          width="150"
        />
        <el-table-column prop="userInfo.avatar" label="头像" width="120">
          <template #default="scope">
            <img :src="scope.row?.userInfo?.avatar" style="height: 50px" />
          </template>
        </el-table-column>
        <el-table-column prop="userInfo.email" label="邮箱" width="200" />
        <el-table-column
          prop="status"
          label="用户状态"
          width="120"
          align="center"
        >
          <template #default="{ row }: { row: any }">
            <el-tag
              :type="USER_STATUS_TYPE_MAP[row.userInfo.status as UserStatus]"
            >
              {{ USER_STATUS_MAP[row.userInfo.status as UserStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="userInfo.violationCount"
          label="累计次数"
          width="90"
          align="center"
        />
        <el-table-column label="违规类型">
          <template #default="scope">
            <el-tag type="danger">
              {{
                scope.row?.typeCn
                  ? JSON.parse(scope.row?.typeCn).join('  |  ')
                  : ''
              }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="违规关键词">
          <template #default="scope">
            {{
              scope.row?.words ? JSON.parse(scope.row?.words).join('  |  ') : ''
            }}
          </template>
        </el-table-column>
        <el-table-column prop="typeOriginCn" label="违规检测来源" width="120">
          <template #default="scope">
            <el-tag type="success">
              {{ scope.row.typeOriginCn }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="answer" label="违规内容" width="200">
          <template #default="scope">
            <el-popover placement="top" :width="400" trigger="click">
              <template #reference>
                <div class="answer">
                  {{ scope.row.content }}
                </div>
              </template>
              <div
                class="answer_container"
                v-html="marked(scope.row.content || '')"
              />
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="违规时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="120" align="center">
          <template #default="scope">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleUpdateStatus(scope.row)"
            >
              变更用户状态
            </el-button>
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
          @size-change="queryAllLog"
          @current-change="queryAllLog"
        />
      </el-row>
    </page-main>

    <el-dialog v-model="visible" title="变更用户状态" width="500px">
      <el-form :model="form" :inline="true">
        <el-form-item label="用户状态" label-width="90px">
          <el-select
            v-model="form.status"
            placeholder="请选择用户状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in USER_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handlerUpateUserStatus">
            确认变更
          </el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<style>
.prompt,
.answer {
  width: 100%;
  max-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  cursor: pointer;
}

.answer_container {
  max-height: 500px;
  overflow: overlay;
}
</style>
