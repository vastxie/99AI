<route lang="yaml">
meta:
  title: 对话管理
</route>

<script lang="ts" setup>
import ApiChat from '@/api/modules/chat';
import ApiUsre from '@/api/modules/user';
import { utcToShanghaiTime } from '@/utils/utcformatTime';
import type { FormInstance } from 'element-plus';
import { marked } from 'marked';
import { onMounted, reactive } from 'vue';

const render = new marked.Renderer();
marked.setOptions({
  renderer: render,
  gfm: true,
  pedantic: false,
});
const loading = ref(false);
const userList = ref();

const formRef = ref<FormInstance>();
const total = ref(0);

const formInline = reactive({
  userId: '',
  prompt: '',
  page: 1,
  size: 10,
});

const tableData = ref([]);

async function queryAllChatLog() {
  loading.value = true;
  try {
    const res = await ApiChat.queryChatAll(formInline);
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
  queryAllChatLog();
}
onMounted(() => {
  queryAllChatLog();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">对话记录</div>
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
        <el-form-item label="用户询问的问题" prop="prompt">
          <el-input
            v-model="formInline.prompt"
            placeholder="提问问题[模糊搜索]"
            @keydown.enter.prevent="queryAllChatLog"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryAllChatLog"> 查询 </el-button>
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
        <el-table-column fixed prop="username" label="用户名称" width="150" />
        <el-table-column prop="createdAt" label="角色" width="80">
          <template #default="scope">
            {{ scope.row.role === 'user' ? '用户' : '电脑' }}
          </template>
        </el-table-column>
        <el-table-column prop="email" label="用户邮箱" width="200" />
        <!-- <el-table-column prop="prompt" label="询问问题" width="150">
          <template #default="scope">
            <el-popover placement="top" :width="400" trigger="click">
              <template #reference>
                <div class="answer">
                  {{ scope.row.prompt }}
                </div>
              </template>
              <div class="answer_container" v-html="marked(scope.row.prompt || '')" />
            </el-popover>
          </template>
        </el-table-column> -->
        <el-table-column prop="answer" label="用户询问/AI回复" width="400">
          <template #default="scope">
            <el-popover placement="top" width="450" trigger="click">
              <template #reference>
                <div class="answer">
                  {{
                    scope.row.role === 'user'
                      ? scope.row.prompt
                      : scope.row.answer
                  }}
                </div>
              </template>
              <div
                class="answer_container"
                v-html="
                  marked(
                    scope.row.role === 'user'
                      ? scope.row.prompt
                      : scope.row.answer || ''
                  )
                "
              />
            </el-popover>
          </template>
        </el-table-column>
        <!-- <el-table-column prop="promptTokens" label="提问Token" width="110" /> -->
        <el-table-column
          prop="completionTokens"
          label="提问/回答Token"
          width="140"
          align="center"
        >
          <template #default="scope">
            {{
              scope.row.role === 'user'
                ? scope.row.promptTokens
                : scope.row.completionTokens
            }}
          </template>
        </el-table-column>
        <el-table-column
          prop="totalTokens"
          label="总计Token"
          width="110"
          align="center"
        />
        <el-table-column prop="model" label="模型" width="200" />
        <el-table-column prop="createdAt" label="提问时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
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
          @size-change="queryAllChatLog"
          @current-change="queryAllChatLog"
        />
      </el-row>
    </page-main>
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
