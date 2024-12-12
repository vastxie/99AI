<route lang="yaml">
meta:
  title: 绘画管理
</route>

<script lang="ts" setup>
import ApiChat from '@/api/modules/chat';
import ApiUsre from '@/api/modules/user';
import { DRAW_MODEL_LIST } from '@/constants/index';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import type { FormInstance } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const loading = ref(false);
const formRef = ref<FormInstance>();
const total = ref(0);
const userList = ref();

const formInline = reactive({
  userId: '',
  rec: '',
  model: '',
  page: 1,
  size: 14,
});

interface Logitem {
  id: number;
  userId: number;
  answer: string;
  thumbImg: string;
  fileInfo: string;
  rec: number;
  model: number;
  createdAt: string;
  updatedAt: string;
  userInfo: {
    avatar: string;
    username: string;
    email: string;
  };
}

const tableData = ref<Logitem[]>([]);

async function queryAllDrawLog() {
  loading.value = true;
  try {
    const res = await ApiChat.queryDrawAll(formInline);
    const { rows, count } = res.data;
    loading.value = false;

    total.value = count;
    tableData.value = rows;
  } catch (error) {
    loading.value = false;
  }
}

async function recommendDrawImg(id: any) {
  const res = await ApiChat.recDrawImg({ id });
  ElMessage.success(res.data);
  queryAllDrawLog();
}

async function handlerSearchUser(val: string) {
  const res = await ApiUsre.queryAllUser({ size: 30, username: val });
  userList.value = res.data.rows;
}

function handlerReset(formEl: FormInstance | undefined) {
  formEl?.resetFields();
  queryAllDrawLog();
}
onMounted(() => {
  queryAllDrawLog();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">绘画记录</div>
      </template>
      <!-- <template #content>
        <div class="text-sm/6">
          <div>
            所有工单只可审核一次，请谨慎操作，打款请人工打款，确定打款后点击审核通过即可。
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
        <!-- <el-form-item label="图片状态" prop="rec">
          <el-select
            v-model="formInline.rec"
            placeholder="请选择图片状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in RECOMMEND_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item> -->
        <el-form-item label="绘画模型" prop="model">
          <el-select
            v-model="formInline.model"
            placeholder="请选择绘画模型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in DRAW_MODEL_LIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryAllDrawLog"> 查询 </el-button>
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
        <el-table-column prop="id" align="center" label="ID" width="70" />
        <el-table-column
          prop="userInfo.username"
          align="center"
          label="用户名"
          width="120"
        />
        <el-table-column
          prop="userInfo.email"
          align="center"
          label="用户邮箱"
          width="200"
        />
        <el-table-column
          prop="drawUrl"
          align="center"
          label="绘图结果"
          width="200"
        >
          <template #default="scope">
            <el-image
              style="height: 50px"
              preview-teleported
              fit="contain"
              :preview-src-list="[scope.row?.fileInfo]"
              :src="scope.row?.fileInfo"
              lazy
              hide-on-click-modal
            />
          </template>
        </el-table-column>

        <!-- <el-table-column
          prop="fileInfo.thumbImg"
          align="center"
          label="推荐状态"
          width="90"
        >
          <template #default="scope">
            <el-tag :type="scope.row.rec === 1 ? 'success' : 'info'">
              {{ scope.row.rec === 1 ? '已推荐' : '未推荐' }}
            </el-tag>
          </template>
        </el-table-column> -->
        <el-table-column prop="model" label="种类" width="180" align="center">
          <template #default="scope">
            <el-tag type="success">
              {{ scope.row.model }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- <el-table-column
          prop="status"
          align="center"
          label="绘图状态"
          width="105"
        >
          <template #default="scope">
            <el-tag :type="scope.row.status === 100 ? 'success' : 'info'">
              {{ DRAW_STATUS_MAP[scope.row.status] }}
            </el-tag>
          </template>
        </el-table-column> -->
        <el-table-column
          prop="prompt"
          label="绘图指令"
          align="center"
          width="250"
        >
          <template #default="scope">
            <el-popover placement="top" :width="400" trigger="click">
              <template #reference>
                <div class="answer">
                  {{ scope.row.prompt }}
                </div>
              </template>
              <div class="answer_container">
                {{ scope.row.prompt }}
              </div>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column
          prop="progress"
          align="center"
          label="绘图进度"
          width="90"
        />
        <el-table-column
          prop="createdAt"
          label="绘图时间"
          align="center"
          width="200"
        >
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>

        <!-- <el-table-column fixed="right" label="操作" width="200" align="center">
          <template #default="scope">
            <el-popconfirm
              :title="`确认${
                scope.row.rec === 1 ? '取消推荐' : '推荐'
              }图片吗！`"
              width="260"
              icon-color="red"
              @confirm="recommendDrawImg(scope.row.id)"
            >
              <template #reference>
                <el-button
                  link
                  :type="scope.row.rec === 1 ? 'success' : ''"
                  size="small"
                >
                  推荐图片
                </el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="`确认删除此条记录么！"
              width="260"
              icon-color="red"
              @confirm="handleDelChatLog(scope.row.id)"
            >
              <template #reference>
                <el-button type="warning" size="small"> 删除记录 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column> -->
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryAllDrawLog"
          @current-change="queryAllDrawLog"
        />
      </el-row>
    </page-main>

    <!-- <page-main v-loading="loading" style="width: 100%">
      <div class="draw_container flex">
        <div
          v-for="item in tableData"
          :key="item.id"
          style="width: 280px; height: 280px"
          class="draw_img_container flex border"
        >
          <div class="draw_head">
            <el-image
              fit="contain"
              :preview-src-list="[item.fileInfo]"
              :src="item.fileInfo"
              lazy
              class="draw_img"
              hide-on-click-modal
            />
          </div>
          <div class="draw_footer mt-3 flex items-center justify-between">
            <el-tag class="ml-2" :type="item.rec ? 'success' : 'info'">
              {{ item.rec ? '已推荐' : '未推荐' }}
            </el-tag>
            <el-button
              type="warning"
              plain
              size="small"
              @click="recommendDrawImg(item.id)"
            >
              {{ item.rec ? '取消推荐' : '加入推荐' }}
              <el-icon v-if="!item.rec">
                <Plus />
              </el-icon>
              <el-icon v-if="item.rec">
                <Minus />
              </el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryAllDrawLog"
          @current-change="queryAllDrawLog"
        />
      </el-row>
    </page-main> -->
  </div>
</template>

<style lang="less">
.draw_container {
  flex-wrap: wrap;
  min-height: 400px;
}

.draw_img_container {
  max-width: 18%;
  flex-direction: column;
  margin: 8px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 5px;
  .draw_head {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }
  .draw_img {
    width: 100%;
  }

  .draw_footer {
    height: 25px;
  }
}
</style>
