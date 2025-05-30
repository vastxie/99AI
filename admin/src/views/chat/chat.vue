<route lang="yaml">
meta:
  title: 对话管理
</route>

<script lang="ts" setup>
  import ApiChat from '@/api/modules/chat';
  import ApiUser from '@/api/modules/user';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance } from 'element-plus';
  import { marked } from 'marked';
  import { computed, onMounted, reactive, ref } from 'vue';

  // 定义聊天记录的接口
  interface ChatRecord {
    id?: string | number;
    username?: string;
    nickname?: string;
    role?: string;
    model?: string;
    modelName?: string;
    type?: number;
    content?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    createdAt?: string;
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    fileUrl?: string;
    ttsUrl?: string;
    fileInfo?: string;
    reasoning_content?: string;
    tool_calls?: string;
    pluginParam?: string;
    networkSearchResult?: string;
  }

  const render = new marked.Renderer();
  marked.setOptions({
    renderer: render,
    gfm: true,
    pedantic: false,
  });
  const loading = ref(false);
  const userList = ref<any[]>([]);
  const modelOptions = ref<string[]>([]);

  const formRef = ref<FormInstance>();
  const total = ref(0);

  const formInline = reactive({
    userId: '',
    prompt: '',
    page: 1,
    size: 10,
    type: '',
    model: '',
  });

  const tableData = ref<ChatRecord[]>([]);
  const detailsVisible = ref(false);
  const currentDetails = ref<ChatRecord | null>(null);

  // 检查是否有额外信息
  const hasExtraInfo = computed(() => {
    if (!currentDetails.value) return false;
    return !!(
      currentDetails.value.imageUrl ||
      currentDetails.value.videoUrl ||
      currentDetails.value.audioUrl ||
      currentDetails.value.fileUrl ||
      currentDetails.value.ttsUrl ||
      currentDetails.value.fileInfo
    );
  });

  function getTypeLabel(type: number): string {
    switch (type) {
      case 1:
        return '普通对话';
      case 2:
        return '创意模型';
      case 3:
        return '特殊模型';
      default:
        return `类型${type}`;
    }
  }

  function formatJson(jsonString: string): string {
    try {
      return JSON.stringify(JSON.parse(jsonString), null, 2);
    } catch (e) {
      return jsonString;
    }
  }

  function getFileName(url: string): string {
    if (!url) return '未知文件';
    const parts = url.split('/');
    return parts[parts.length - 1];
  }

  function showDetails(row: ChatRecord): void {
    currentDetails.value = row;
    detailsVisible.value = true;
  }

  async function queryAllChatLog(): Promise<void> {
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

  // 获取模型列表
  async function fetchModelList(): Promise<void> {
    try {
      const res = await ApiChat.queryChatAll({
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

  async function handlerSearchUser(val: string): Promise<void> {
    const res = await ApiUser.queryAllUser({ size: 30, username: val });
    userList.value = res.data.rows;
  }

  function handlerReset(formEl: FormInstance | undefined): void {
    formEl?.resetFields();
    queryAllChatLog();
  }
  onMounted(() => {
    queryAllChatLog();
    fetchModelList();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">对话记录</div>
      </template>
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
        <el-form-item label="模型" prop="model">
          <el-select
            v-model="formInline.model"
            placeholder="选择模型"
            style="width: 160px"
            clearable
          >
            <el-option v-for="model in modelOptions" :key="model" :label="model" :value="model" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select
            v-model="formInline.type"
            placeholder="对话类型"
            style="width: 160px"
            clearable
          >
            <el-option label="基础对话" value="1" />
            <el-option label="创意模型" value="2" />
            <el-option label="特殊模型" value="3" />
          </el-select>
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
        <el-table-column fixed prop="username" label="用户信息" width="150">
          <template #default="scope">
            {{ scope.row.username }}
            <span v-if="scope.row.nickname">({{ scope.row.nickname }})</span>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" width="150" />
        <!-- <el-table-column prop="createdAt" label="角色" width="80">
          <template #default="scope">
            {{ scope.row.role === 'user' ? '用户' : '电脑' }}
          </template>
        </el-table-column> -->
        <el-table-column prop="answer" label="用户询问/AI回复" width="400">
          <template #default="scope">
            <el-popover placement="top" width="450" trigger="click">
              <template #reference>
                <div class="answer">
                  {{ scope.row.content }}
                </div>
              </template>
              <div class="answer_container" v-html="marked(scope.row.content || '')" />
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column prop="completionTokens" label="Token统计" width="200" align="center">
          <template #default="scope">
            {{
              scope.row.role === 'user'
                ? `提问: ${scope.row.promptTokens || 0}`
                : `回答: ${scope.row.completionTokens || 0}`
            }}
            / 总计: {{ scope.row.totalTokens || 0 }}
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button type="primary" link @click="showDetails(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 详情弹窗 -->
      <el-dialog v-model="detailsVisible" title="详细内容" width="70%" destroy-on-close>
        <div v-if="currentDetails" class="details-container">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="用户"
              >{{ currentDetails.username }}
              <span v-if="currentDetails.nickname"
                >({{ currentDetails.nickname }})</span
              ></el-descriptions-item
            >
            <el-descriptions-item label="角色">{{
              currentDetails.role === 'user' ? '用户' : '电脑'
            }}</el-descriptions-item>
            <el-descriptions-item label="模型">{{ currentDetails.model }}</el-descriptions-item>
            <el-descriptions-item label="模型名称">{{
              currentDetails.modelName
            }}</el-descriptions-item>
            <el-descriptions-item label="类型">
              {{ getTypeLabel(currentDetails.type as number) }}
            </el-descriptions-item>
            <el-descriptions-item label="时间">
              {{ utcToShanghaiTime(currentDetails.createdAt as string, 'YYYY-MM-DD hh:mm:ss') }}
            </el-descriptions-item>
          </el-descriptions>

          <el-tabs class="mt-4">
            <el-tab-pane label="内容">
              <div
                class="detail-content markdown-body"
                v-html="marked(currentDetails.content || '')"
              ></div>
            </el-tab-pane>
            <el-tab-pane label="推理内容" v-if="currentDetails.reasoning_content">
              <div
                class="detail-content markdown-body"
                v-html="marked(currentDetails.reasoning_content || '')"
              ></div>
            </el-tab-pane>
            <el-tab-pane label="工具调用" v-if="currentDetails.tool_calls">
              <pre class="tool-calls">{{ formatJson(currentDetails.tool_calls) }}</pre>
            </el-tab-pane>
            <el-tab-pane label="插件参数" v-if="currentDetails.pluginParam">
              <pre class="plugin-param">{{ formatJson(currentDetails.pluginParam) }}</pre>
            </el-tab-pane>
            <el-tab-pane label="联网搜索" v-if="currentDetails.networkSearchResult">
              <div
                class="detail-content markdown-body"
                v-html="marked(currentDetails.networkSearchResult || '')"
              ></div>
            </el-tab-pane>
            <el-tab-pane label="其他信息" v-if="hasExtraInfo">
              <div class="media-links" v-if="currentDetails.imageUrl">
                <h4>图片链接:</h4>
                <el-image
                  :src="currentDetails.imageUrl"
                  :preview-src-list="[currentDetails.imageUrl]"
                  fit="contain"
                  style="width: 200px; height: 200px"
                ></el-image>
              </div>
              <div class="media-links" v-if="currentDetails.videoUrl">
                <h4>视频链接:</h4>
                <video :src="currentDetails.videoUrl" controls style="max-width: 100%"></video>
              </div>
              <div class="media-links" v-if="currentDetails.audioUrl">
                <h4>音频链接:</h4>
                <audio :src="currentDetails.audioUrl" controls></audio>
              </div>
              <div class="media-links" v-if="currentDetails.fileUrl">
                <h4>文件链接:</h4>
                <a :href="currentDetails.fileUrl" target="_blank">{{
                  getFileName(currentDetails.fileUrl)
                }}</a>
              </div>
              <div class="media-links" v-if="currentDetails.ttsUrl">
                <h4>对话语音链接:</h4>
                <audio :src="currentDetails.ttsUrl" controls></audio>
              </div>
              <div v-if="currentDetails.fileInfo">
                <h4>文件信息:</h4>
                <pre>{{ formatJson(currentDetails.fileInfo) }}</pre>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-dialog>

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

  .details-container {
    padding: 10px;
  }

  .detail-content {
    max-height: 400px;
    overflow: auto;
    padding: 10px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background-color: #f9f9f9;
  }

  .media-links {
    margin-bottom: 15px;
  }

  .tool-calls,
  .plugin-param {
    max-height: 400px;
    overflow: auto;
    padding: 10px;
    background-color: #f5f7fa;
    border-radius: 4px;
    font-family: monospace;
    white-space: pre-wrap;
  }

  .markdown-body {
    font-size: 14px;
    line-height: 1.6;
  }

  .markdown-body img {
    max-width: 100%;
  }

  .markdown-body pre {
    background-color: #f6f8fa;
    border-radius: 3px;
    padding: 16px;
    overflow: auto;
  }

  .markdown-body code {
    background-color: rgba(27, 31, 35, 0.05);
    border-radius: 3px;
    padding: 0.2em 0.4em;
    font-family: monospace;
  }
</style>
