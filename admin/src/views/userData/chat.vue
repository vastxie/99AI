<script lang="ts" setup>
  import ApiChat from '@/api/modules/chat';
  import { renderSafeMarkdown } from '@/utils/safeMarkdown';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useRemoteUserOptions from '@/utils/composables/useRemoteUserOptions';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import type { FilterField } from '@/components/FilterBar/types';

  const docUrl = computed(() => getDocUrl('/configuration/users/chat-records'));
  usePageDoc(docUrl);

  // 后端对话记录仅支持 userId 精确过滤：用户名模糊搜索走面板里的 remote-select
  const { fetchUserOptions, resolveUserLabel } = useRemoteUserOptions();

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
    direction?: string;
    channel?: string;
    channelMessageId?: string;
    visitorId?: string;
    totalTokens?: number;
    createdAt?: string;
    files?: any[];
    fileAssets?: any[];
    attachments?: any[];
    reasoning_content?: string;
    message?: string;
  }

  const modelOptions = ref<string[]>([]);

  const filterFields = computed<FilterField[]>(() => [
    {
      key: 'userId',
      label: '用户名称',
      type: 'remote-select',
      placeholder: '搜索用户：昵称 / 手机号 / 邮箱',
      fetchOptions: fetchUserOptions,
      resolveLabel: resolveUserLabel,
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      placeholder: '请选择模型',
      // 选项由最近记录推导
      options: modelOptions.value.map((model) => ({ label: model, value: model })),
    },
  ]);

  const sectionExpanded = ref<Record<string, boolean>>({});

  const formInline = reactive({
    userId: '',
    prompt: '',
    page: 1,
    size: 20,
    model: '',
  });

  // 支持从用户详情页钻取链接（?userId=xxx）带入用户过滤
  const route = useRoute();
  {
    const drillDownUserId = Number(route.query.userId);
    if (Number.isInteger(drillDownUserId) && drillDownUserId > 0) {
      formInline.userId = drillDownUserId as any;
    }
  }

  const detailsVisible = ref(false);
  const currentDetails = ref<ChatRecord | null>(null);
  const currentMessageData = computed(() => parseUnifiedMessage(currentDetails.value?.message));
  const currentMessageRounds = computed(() => parseMessageRounds(currentDetails.value?.message));
  const currentPrimaryContent = computed(() => {
    const content = currentDetails.value?.content || currentMessageData.value?.content || '';
    return typeof content === 'string' ? content.trim() : '';
  });
  const currentReasoningContent = computed(
    () => currentDetails.value?.reasoning_content?.trim() || '',
  );
  const currentMediaBuckets = computed(() =>
    collectRecordMedia(currentDetails.value, currentMessageRounds.value),
  );

  // 检查是否有额外信息
  const hasExtraInfo = computed(() => {
    const buckets = currentMediaBuckets.value;
    return (
      buckets.images.length > 0 ||
      buckets.videos.length > 0 ||
      buckets.audios.length > 0 ||
      buckets.files.length > 0
    );
  });

  /** 与后端 chatlog.type 注释一致：1 普通对话 2 图片生成 3 视频生成 4 音乐生成 5 其他类型 */
  const CHAT_TYPE_LABELS: Record<number, string> = {
    1: '普通对话',
    2: '图片生成',
    3: '视频生成',
    4: '音乐生成',
    5: '其他类型',
  };
  function getTypeLabel(type: number): string {
    return CHAT_TYPE_LABELS[type] || `类型 ${type}`;
  }

  function formatJson(jsonString: string | undefined): string {
    if (!jsonString) return '';
    try {
      return JSON.stringify(JSON.parse(jsonString), null, 2);
    } catch (e) {
      return jsonString;
    }
  }

  function parseJsonValue(value: string | undefined) {
    if (!value) return null;
    try {
      let parsed = JSON.parse(value);
      return parsed;
    } catch {
      return null;
    }
  }

  type MediaPreviewType = 'image' | 'video' | 'audio' | 'file';

  interface MediaPreviewItem {
    type: MediaPreviewType;
    url: string;
    title: string;
    name: string;
    mime?: string;
    mimeType?: string;
    fileId?: string;
    visibility?: string;
    role?: string;
    size?: number;
  }

  interface MediaBuckets {
    images: MediaPreviewItem[];
    videos: MediaPreviewItem[];
    audios: MediaPreviewItem[];
    files: MediaPreviewItem[];
  }

  function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function extractUrlFromMediaItem(item: any): string {
    if (typeof item === 'string') return item.trim();
    if (!isRecord(item)) return '';
    const explicitUrl = String(
      item.url ||
        item.previewUrl ||
        item.publicUrl ||
        item.downloadUrl ||
        item.href ||
        item.link ||
        '',
    ).trim();
    if (explicitUrl) return explicitUrl;

    const fileId = typeof item.fileId === 'string' ? item.fileId.trim() : '';
    return fileId ? `/api/files/${encodeURIComponent(fileId)}/preview` : '';
  }

  function getMediaTitle(item: any, fallbackUrl?: string): string {
    if (typeof item === 'string') return getFileName(item);
    if (!isRecord(item)) return fallbackUrl ? getFileName(fallbackUrl) : '未命名文件';
    return (
      String(item.title || item.name || item.filename || item.fileName || '').trim() ||
      (fallbackUrl ? getFileName(fallbackUrl) : '未命名文件')
    );
  }

  function parseMediaSource(value: unknown): any[] {
    if (value === null || value === undefined || value === '') return [];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return [value];
    if (typeof value !== 'string') return [];

    const trimmed = value.trim();
    if (!trimmed) return [];

    const parsed = parseJsonValue(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (isRecord(parsed)) return [parsed];

    if (/[,，\n]/u.test(trimmed) && !/^data:/iu.test(trimmed)) {
      return trimmed
        .split(/[\n,，]/u)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmed];
  }

  function inferMediaType(item: any, fallbackType?: MediaPreviewType): MediaPreviewType {
    const explicitType = String(
      (isRecord(item) && (item.type || item.fileType)) || '',
    ).toLowerCase();
    if (explicitType === 'image' || explicitType === 'video' || explicitType === 'audio') {
      return explicitType;
    }
    if (explicitType === 'document' || explicitType === 'file') return 'file';

    const mime = String((isRecord(item) && (item.mimeType || item.mime)) || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';

    const url = extractUrlFromMediaItem(item).toLowerCase();
    if (/\.(?:avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/iu.test(url)) return 'image';
    if (/\.(?:mp4|m4v|mov|webm|avi|mkv|mpeg|mpg|ogv)$/iu.test(url)) return 'video';
    if (/\.(?:aac|flac|m4a|mid|midi|mp3|oga|ogg|opus|wav)$/iu.test(url)) return 'audio';

    return fallbackType || 'file';
  }

  function normalizeMediaItem(item: any, fallbackType?: MediaPreviewType): MediaPreviewItem | null {
    const url = extractUrlFromMediaItem(item);
    if (!url) return null;
    const type = inferMediaType(item, fallbackType);
    const title = getMediaTitle(item, url);
    return {
      type,
      url,
      title,
      name: title,
      ...(isRecord(item) && typeof item.mime === 'string' ? { mime: item.mime } : {}),
      ...(isRecord(item) && typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {}),
      ...(isRecord(item) && typeof item.fileId === 'string' ? { fileId: item.fileId } : {}),
      ...(isRecord(item) && typeof item.visibility === 'string'
        ? { visibility: item.visibility }
        : {}),
      ...(isRecord(item) && typeof item.role === 'string' ? { role: item.role } : {}),
      ...(isRecord(item) && Number.isFinite(Number(item.size)) ? { size: Number(item.size) } : {}),
    };
  }

  function collectMediaItems(value: unknown, fallbackType?: MediaPreviewType): MediaPreviewItem[] {
    return parseMediaSource(value)
      .map((item) => normalizeMediaItem(item, fallbackType))
      .filter(Boolean) as MediaPreviewItem[];
  }

  function collectRoundMedia(rounds: any[] = []): MediaPreviewItem[] {
    const items: MediaPreviewItem[] = [];

    for (const round of rounds) {
      if (Array.isArray(round?.parts)) {
        for (const part of round.parts) {
          const fallbackType = String(part?.type || '').toLowerCase() as MediaPreviewType;
          items.push(...collectMediaItems(part, fallbackType));
        }
      }

      if (Array.isArray(round?.toolCalls)) {
        for (const toolCall of round.toolCalls) {
          const buckets = collectToolOutputMedia(toolCall?.output);
          items.push(...buckets.images, ...buckets.videos, ...buckets.audios, ...buckets.files);
        }
      }
    }

    return dedupeMediaItems(items);
  }

  function collectRecordMedia(record: ChatRecord | null, rounds: any[] = []): MediaBuckets {
    const items: MediaPreviewItem[] = [];
    if (record) {
      items.push(...collectMediaItems(record.files));
      items.push(...collectMediaItems(record.fileAssets));
      items.push(...collectMediaItems(record.attachments));
    }
    items.push(...collectRoundMedia(rounds));

    const buckets = groupMediaItems(dedupeMediaItems(items));
    return buckets;
  }

  // 模板中每个工具输出会多次调用本函数，缓存结果避免每次重渲染都重复 JSON 解析
  const toolOutputMediaCache = new Map<any, MediaBuckets>();

  function collectToolOutputMedia(output: any): MediaBuckets {
    const cached = toolOutputMediaCache.get(output);
    if (cached) return cached;
    const buckets = computeToolOutputMedia(output);
    if (toolOutputMediaCache.size > 500) {
      toolOutputMediaCache.clear();
    }
    toolOutputMediaCache.set(output, buckets);
    return buckets;
  }

  function computeToolOutputMedia(output: any): MediaBuckets {
    const items: MediaPreviewItem[] = [];
    if (!output) return groupMediaItems(items);

    const normalizedOutput = typeof output === 'string' ? parseJsonValue(output) || output : output;

    if (Array.isArray(normalizedOutput)) {
      items.push(...collectMediaItems(normalizedOutput));
      return groupMediaItems(dedupeMediaItems(items));
    }

    if (isRecord(normalizedOutput)) {
      items.push(...collectMediaItems(normalizedOutput.files));
      items.push(...collectMediaItems(normalizedOutput.fileAssets));
      items.push(...collectMediaItems(normalizedOutput.attachments));
      items.push(...collectMediaItems(normalizedOutput.filePreview, 'file'));
      items.push(...collectMediaItems(normalizedOutput.downloadUrl, 'file'));
      items.push(...collectMediaItems(normalizedOutput.preview?.downloadUrl, 'file'));
    } else {
      items.push(...collectMediaItems(normalizedOutput));
    }

    return groupMediaItems(dedupeMediaItems(items));
  }

  function hasToolOutputMedia(output: any): boolean {
    const buckets = collectToolOutputMedia(output);
    return (
      buckets.images.length > 0 ||
      buckets.videos.length > 0 ||
      buckets.audios.length > 0 ||
      buckets.files.length > 0
    );
  }

  function dedupeMediaItems(items: MediaPreviewItem[]): MediaPreviewItem[] {
    const seen = new Set<string>();
    const result: MediaPreviewItem[] = [];
    for (const item of items) {
      const key = `${item.type}:${item.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  function groupMediaItems(items: MediaPreviewItem[]): MediaBuckets {
    return {
      images: items.filter((item) => item.type === 'image'),
      videos: items.filter((item) => item.type === 'video'),
      audios: items.filter((item) => item.type === 'audio'),
      files: items.filter((item) => item.type === 'file'),
    };
  }

  // 解析 message 字段中的 rounds 结构
  function parseMessageRounds(messageStr: string | undefined) {
    return parseUnifiedMessage(messageStr)?.rounds || [];
  }

  function parseUnifiedMessage(messageStr: string | undefined) {
    const parsed = parseJsonValue(messageStr);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  // 从 rounds 中提取所有工具调用
  function getAllToolCalls(rounds: any[]) {
    const calls: any[] = [];
    for (const round of rounds) {
      if (round.toolCalls && Array.isArray(round.toolCalls)) {
        calls.push(...round.toolCalls);
      }
    }
    return calls;
  }

  function getRoundToolCalls(round: any): any[] {
    return Array.isArray(round?.toolCalls) ? round.toolCalls : [];
  }

  function getToolStatusType(status?: string): 'success' | 'danger' | 'info' | 'warning' {
    if (status === 'success') return 'success';
    if (status === 'error') return 'danger';
    if (status === 'loading') return 'info';
    return 'warning';
  }

  function getToolDurationText(duration?: number): string {
    const value = Number(duration || 0);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1000) return `${Math.round(value)}ms`;
    return `${(value / 1000).toFixed(1)}s`;
  }

  function normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .replaceAll(/<[^>]*>/gu, ' ')
      .replaceAll(/\s+/gu, ' ')
      .trim();
  }

  function shouldCollapseText(value: unknown, limit = 420, lineLimit = 10): boolean {
    if (value === null || value === undefined) return false;
    const raw = String(value);
    const text = normalizeText(raw);
    if (!text) return false;
    return text.length > limit || raw.split(/\r?\n/u).length > lineLimit;
  }

  function isSectionExpanded(key: string): boolean {
    return !!sectionExpanded.value[key];
  }

  function toggleSection(key: string): void {
    sectionExpanded.value[key] = !sectionExpanded.value[key];
  }

  function getRecordRoleLabel(row: ChatRecord | null): string {
    if (!row) return '消息内容';
    const role = row.role || currentMessageData.value?.role;
    if (row.direction === 'in' || role === 'user') return '用户输入';
    if (row.direction === 'out' || role === 'assistant') return 'AI 回复';
    return '消息内容';
  }

  function getRoundLabel(round: any, index: number | string): string {
    const roundIndex = Number(index) || 0;
    const parts: string[] = [];
    if (round?.thinking) parts.push('思考');
    if (round?.text) parts.push('回复');
    const toolCount = getRoundToolCalls(round).length;
    if (toolCount > 0) parts.push(`工具 ${toolCount}`);
    return parts.length > 0
      ? `第 ${roundIndex + 1} 轮 · ${parts.join(' / ')}`
      : `第 ${roundIndex + 1} 轮`;
  }

  function getFileName(url: string): string {
    if (!url) return '未知文件';
    const cleanedUrl = url.split(/[?#]/u)[0];
    const parts = cleanedUrl.split('/');
    return parts.at(-1) || '';
  }

  function showDetails(row: ChatRecord): void {
    currentDetails.value = row;
    sectionExpanded.value = {};
    detailsVisible.value = true;
  }

  const {
    loading,
    total,
    tableData,
    query: queryAllChatLog,
    search: searchChatLog,
  } = usePagedTable<ChatRecord>(async () => {
    const res = await ApiChat.queryChatAll(formInline);
    return res.data;
  }, formInline);

  // 获取模型列表
  async function fetchModelList(): Promise<void> {
    try {
      const res = await ApiChat.queryChatAll({
        page: 1,
        size: 100,
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

  onMounted(() => {
    queryAllChatLog();
    fetchModelList();
  });
</script>

<template>
  <div>
    <page-panel>
      <FilterBar
        v-model:keyword="formInline.prompt"
        keyword-placeholder="搜索提问内容"
        :fields="filterFields"
        :filters="formInline"
        class="mb-5"
        @update:filters="Object.assign(formInline, $event)"
        @apply="searchChatLog"
        @reset="searchChatLog"
      />
      <el-table v-loading="loading" border :data="tableData" style="width: 100%">
        <el-table-column fixed label="用户" width="170">
          <template #default="scope">
            <UserCell
              :user="{
                id: scope.row.userId,
                username: scope.row.username,
                nickname: scope.row.nickname,
              }"
            />
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" width="150" />
        <el-table-column label="类型" width="100" align="center">
          <template #default="scope">
            <el-tag type="info" size="small">{{ getTypeLabel(scope.row.type as number) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用户询问 / AI 回复" width="400">
          <template #default="scope">
            <el-popover placement="top" width="450" trigger="click">
              <template #reference>
                <div class="chat-answer">
                  {{ scope.row.content }}
                </div>
              </template>
              <div
                class="chat-answer-container"
                v-html="renderSafeMarkdown(scope.row.content || '')"
              />
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column prop="totalTokens" label="Token 用量" width="120" align="right">
          <template #default="scope">
            {{ scope.row.totalTokens || 0 }}
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button type="primary" link @click="showDetails(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 详情弹窗 -->
      <el-dialog
        v-model="detailsVisible"
        title="对话详情"
        fullscreen
        destroy-on-close
        class="chat-detail-dialog"
      >
        <div v-if="currentDetails" class="details-container">
          <div class="detail-stack">
            <section class="record-card">
              <div class="record-card-header">
                <div class="record-card-title">记录正文</div>
                <el-tag size="small" type="info">{{ getRecordRoleLabel(currentDetails) }}</el-tag>
              </div>
              <div v-if="currentPrimaryContent" class="record-body">
                <div
                  class="record-content"
                  :class="
                    shouldCollapseText(currentPrimaryContent) &&
                    !isSectionExpanded('record-primary-content')
                      ? 'is-collapsed'
                      : 'is-expanded'
                  "
                >
                  <div
                    class="record-markdown"
                    v-html="renderSafeMarkdown(currentPrimaryContent)"
                  ></div>
                </div>
                <button
                  v-if="shouldCollapseText(currentPrimaryContent)"
                  type="button"
                  class="record-toggle"
                  @click="toggleSection('record-primary-content')"
                >
                  <span>{{ isSectionExpanded('record-primary-content') ? '收起' : '展开' }}</span>
                </button>
              </div>
            </section>

            <section v-if="currentReasoningContent" class="record-card">
              <div class="record-card-header">
                <div class="record-card-title">推理内容</div>
                <el-tag size="small" type="info">可展开</el-tag>
              </div>
              <div class="record-subcards">
                <div class="record-subcard">
                  <div
                    class="record-content"
                    :class="
                      shouldCollapseText(currentReasoningContent) &&
                      !isSectionExpanded('record-thinking')
                        ? 'is-collapsed'
                        : 'is-expanded'
                    "
                  >
                    <div
                      class="record-markdown"
                      v-html="renderSafeMarkdown(currentReasoningContent)"
                    ></div>
                  </div>
                  <button
                    v-if="shouldCollapseText(currentReasoningContent)"
                    type="button"
                    class="record-toggle"
                    @click="toggleSection('record-thinking')"
                  >
                    <span>{{ isSectionExpanded('record-thinking') ? '收起' : '展开' }}</span>
                  </button>
                </div>
              </div>
            </section>

            <section v-if="currentMessageRounds.length > 0" class="record-card">
              <div class="record-card-header">
                <div class="record-card-title">Agent 轮次</div>
                <div class="flex items-center gap-2">
                  <el-tag size="small" type="info">{{ currentMessageRounds.length }} 轮</el-tag>
                  <el-tag size="small" type="info">
                    {{ getAllToolCalls(currentMessageRounds).length }} 次工具调用
                  </el-tag>
                </div>
              </div>
              <div class="record-round-list">
                <article
                  v-for="(round, rIdx) in currentMessageRounds"
                  :key="rIdx"
                  class="record-round-card"
                >
                  <div class="record-round-header">
                    <div class="record-round-title">{{ getRoundLabel(round, rIdx) }}</div>
                    <div class="record-round-badges">
                      <el-tag v-if="round.thinking" size="small" type="warning">思考</el-tag>
                      <el-tag v-if="round.text" size="small" type="success">回复</el-tag>
                      <el-tag v-if="getRoundToolCalls(round).length" size="small" type="info">
                        工具 {{ getRoundToolCalls(round).length }}
                      </el-tag>
                      <el-tag v-if="round.parts?.length" size="small" type="info">多模态</el-tag>
                      <el-tag v-if="round.interjections?.length" size="small" type="warning">
                        插话
                      </el-tag>
                    </div>
                  </div>

                  <div v-if="round.thinking" class="record-round-section">
                    <div class="record-round-section-title">推理</div>
                    <div
                      class="record-content"
                      :class="
                        shouldCollapseText(round.thinking) &&
                        !isSectionExpanded(`round-${rIdx}-thinking`)
                          ? 'is-collapsed'
                          : 'is-expanded'
                      "
                    >
                      <div
                        class="record-markdown"
                        v-html="renderSafeMarkdown(round.thinking)"
                      ></div>
                    </div>
                    <button
                      v-if="shouldCollapseText(round.thinking)"
                      type="button"
                      class="record-toggle"
                      @click="toggleSection(`round-${rIdx}-thinking`)"
                    >
                      <span>{{
                        isSectionExpanded(`round-${rIdx}-thinking`) ? '收起' : '展开'
                      }}</span>
                    </button>
                  </div>

                  <div v-if="round.text" class="record-round-section">
                    <div class="record-round-section-title">回复</div>
                    <div
                      class="record-content"
                      :class="
                        shouldCollapseText(round.text) && !isSectionExpanded(`round-${rIdx}-text`)
                          ? 'is-collapsed'
                          : 'is-expanded'
                      "
                    >
                      <div class="record-markdown" v-html="renderSafeMarkdown(round.text)"></div>
                    </div>
                    <button
                      v-if="shouldCollapseText(round.text)"
                      type="button"
                      class="record-toggle"
                      @click="toggleSection(`round-${rIdx}-text`)"
                    >
                      <span>{{ isSectionExpanded(`round-${rIdx}-text`) ? '收起' : '展开' }}</span>
                    </button>
                  </div>

                  <div v-if="getRoundToolCalls(round).length" class="record-round-section">
                    <div class="record-round-section-title">工具调用</div>
                    <div class="record-tool-chain">
                      <div
                        v-for="(tool, tIdx) in getRoundToolCalls(round)"
                        :key="tIdx"
                        class="record-tool-card"
                      >
                        <div class="record-tool-card-header">
                          <span class="record-tool-name">
                            {{ tool.displayName || tool.name || tool.toolName || '工具调用' }}
                          </span>
                          <el-tag :type="getToolStatusType(tool.status)" size="small">
                            {{ tool.status }}
                          </el-tag>
                          <span v-if="getToolDurationText(tool.duration)" class="record-tool-time">
                            {{ getToolDurationText(tool.duration) }}
                          </span>
                        </div>
                        <el-collapse class="mt-2">
                          <el-collapse-item title="输入参数">
                            <pre class="record-raw-pre">{{
                              formatJson(JSON.stringify(tool.arguments))
                            }}</pre>
                          </el-collapse-item>
                          <el-collapse-item title="输出结果">
                            <div v-if="tool.output?.thought" class="mb-2">
                              <div class="text-xs text-gray-500 mb-1">思考：</div>
                              <div
                                class="record-markdown"
                                v-html="renderSafeMarkdown(tool.output.thought)"
                              ></div>
                            </div>
                            <div v-if="tool.output?.error" class="mb-2">
                              <el-alert type="error" :closable="false">{{
                                tool.output.error
                              }}</el-alert>
                            </div>
                            <template
                              v-if="
                                !tool.output?.error &&
                                (collectToolOutputMedia(tool.output).images.length ||
                                  collectToolOutputMedia(tool.output).videos.length ||
                                  collectToolOutputMedia(tool.output).audios.length ||
                                  collectToolOutputMedia(tool.output).files.length)
                              "
                            >
                              <div
                                v-if="collectToolOutputMedia(tool.output).images.length"
                                class="mb-3"
                              >
                                <div class="flex flex-wrap gap-3">
                                  <a
                                    v-for="(mediaItem, mediaIdx) in collectToolOutputMedia(
                                      tool.output,
                                    ).images"
                                    :key="mediaIdx"
                                    :href="mediaItem.url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <img
                                      :src="mediaItem.url"
                                      :alt="mediaItem.title"
                                      :title="mediaItem.title"
                                      style="
                                        max-width: 180px;
                                        max-height: 160px;
                                        border-radius: 6px;
                                        border: 1px solid var(--el-border-color-lighter);
                                        object-fit: contain;
                                      "
                                      loading="lazy"
                                      @error="
                                        ($event.target as HTMLImageElement).style.display = 'none'
                                      "
                                    />
                                  </a>
                                </div>
                              </div>
                              <div
                                v-if="collectToolOutputMedia(tool.output).videos.length"
                                class="mb-3 flex flex-col gap-2"
                              >
                                <div
                                  v-for="(mediaItem, mediaIdx) in collectToolOutputMedia(
                                    tool.output,
                                  ).videos"
                                  :key="mediaIdx"
                                  class="record-media-block"
                                >
                                  <div class="record-subcard-title mb-2">
                                    {{ mediaItem.title }}
                                  </div>
                                  <video
                                    :src="mediaItem.url"
                                    controls
                                    class="record-media-player"
                                  />
                                </div>
                              </div>
                              <div
                                v-if="collectToolOutputMedia(tool.output).audios.length"
                                class="mb-3 flex flex-col gap-2"
                              >
                                <div
                                  v-for="(mediaItem, mediaIdx) in collectToolOutputMedia(
                                    tool.output,
                                  ).audios"
                                  :key="mediaIdx"
                                  class="record-media-block"
                                >
                                  <div class="record-subcard-title mb-2">
                                    {{ mediaItem.title }}
                                  </div>
                                  <audio :src="mediaItem.url" controls class="w-full" />
                                </div>
                              </div>
                              <div
                                v-if="collectToolOutputMedia(tool.output).files.length"
                                class="mb-3 flex flex-col gap-1"
                              >
                                <a
                                  v-for="(mediaItem, mediaIdx) in collectToolOutputMedia(
                                    tool.output,
                                  ).files"
                                  :key="mediaIdx"
                                  :href="mediaItem.url"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-[var(--u-accent)] text-sm break-all"
                                >
                                  {{ mediaItem.title }}
                                </a>
                              </div>
                            </template>
                            <div v-if="tool.output?.content">
                              <div
                                class="record-markdown"
                                v-html="renderSafeMarkdown(tool.output.content)"
                              ></div>
                            </div>
                            <div v-else-if="tool.output?.details">
                              <div
                                class="record-markdown"
                                v-html="
                                  renderSafeMarkdown(
                                    typeof tool.output.details === 'string'
                                      ? tool.output.details
                                      : JSON.stringify(tool.output.details),
                                  )
                                "
                              ></div>
                            </div>
                            <div
                              v-if="
                                tool.result &&
                                typeof tool.result === 'string' &&
                                !tool.output?.content
                              "
                            >
                              <div
                                class="record-markdown"
                                v-html="renderSafeMarkdown(tool.result)"
                              ></div>
                            </div>
                            <div
                              v-if="
                                tool.output &&
                                !tool.output.content &&
                                !tool.output.details &&
                                !tool.output.error &&
                                !tool.output.thought &&
                                !hasToolOutputMedia(tool.output)
                              "
                            >
                              <pre class="record-raw-pre">{{
                                formatJson(JSON.stringify(tool.output))
                              }}</pre>
                            </div>
                          </el-collapse-item>
                        </el-collapse>
                      </div>
                    </div>
                  </div>

                  <el-collapse
                    v-if="round.parts?.length || round.interjections?.length"
                    class="mt-3"
                  >
                    <el-collapse-item title="原始轮次数据">
                      <pre class="record-raw-pre">{{ formatJson(JSON.stringify(round)) }}</pre>
                    </el-collapse-item>
                  </el-collapse>
                </article>
              </div>
            </section>

            <section v-if="hasExtraInfo" class="record-card">
              <div class="record-card-header">
                <div class="record-card-title">媒体与附件</div>
                <el-tag size="small" type="info">完整保留</el-tag>
              </div>
              <div class="record-media-stack">
                <div class="record-media-block" v-if="currentMediaBuckets.images.length">
                  <div class="record-subcard-title mb-3">图片链接</div>
                  <div class="record-image-grid">
                    <div
                      v-for="(item, index) in currentMediaBuckets.images"
                      :key="index"
                      class="record-image-card"
                    >
                      <el-image
                        :src="item.url"
                        :preview-src-list="currentMediaBuckets.images.map((media) => media.url)"
                        :initial-index="index"
                        fit="contain"
                        class="record-image-preview"
                        :alt="item.title"
                        :title="item.title"
                      >
                        <template #error>
                          <div class="record-image-error">
                            <span class="text-sm">图片加载失败</span>
                          </div>
                        </template>
                      </el-image>
                      <div class="record-image-caption">
                        <div class="truncate font-medium text-gray-700" :title="item.title">
                          {{ item.title }}
                        </div>
                        <div class="text-gray-500">
                          {{ index + 1 }}/{{ currentMediaBuckets.images.length }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="mt-3" v-if="currentMediaBuckets.images.length > 1">
                    <el-tag type="info" size="small">
                      共 {{ currentMediaBuckets.images.length }} 张图片
                    </el-tag>
                  </div>
                </div>

                <div class="record-media-grid">
                  <div class="record-media-block" v-if="currentMediaBuckets.videos.length">
                    <div class="record-subcard-title mb-3">视频链接</div>
                    <div class="flex flex-col gap-2">
                      <div
                        v-for="(item, index) in currentMediaBuckets.videos"
                        :key="index"
                        class="flex flex-col gap-2"
                      >
                        <video :src="item.url" controls class="record-media-player"></video>
                        <a
                          :href="item.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[var(--u-accent)] text-sm break-all"
                        >
                          {{ item.title }}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div class="record-media-block" v-if="currentMediaBuckets.audios.length">
                    <div class="record-subcard-title mb-3">音频链接</div>
                    <div class="flex flex-col gap-2">
                      <div
                        v-for="(item, index) in currentMediaBuckets.audios"
                        :key="index"
                        class="flex flex-col gap-2"
                      >
                        <audio :src="item.url" controls class="w-full"></audio>
                        <a
                          :href="item.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[var(--u-accent)] text-sm break-all"
                        >
                          {{ item.title }}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div class="record-media-block" v-if="currentMediaBuckets.files.length">
                    <div class="record-subcard-title mb-3">文件链接</div>
                    <div class="flex flex-col gap-1">
                      <a
                        v-for="(item, index) in currentMediaBuckets.files"
                        :key="index"
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-[var(--u-accent)] text-sm break-all"
                      >
                        {{ item.title }}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="record-card">
              <div class="record-card-header">
                <div class="record-card-title">完整原始数据</div>
                <el-tag size="small" type="info">可折叠</el-tag>
              </div>
              <el-collapse class="record-raw-collapse">
                <el-collapse-item title="原始 Message 数据">
                  <pre class="record-raw-pre">{{ formatJson(currentDetails.message) }}</pre>
                </el-collapse-item>
                <el-collapse-item title="完整记录字段">
                  <pre class="record-raw-pre">{{ JSON.stringify(currentDetails, null, 2) }}</pre>
                </el-collapse-item>
              </el-collapse>
            </section>
          </div>
        </div>
      </el-dialog>

      <TablePager
        v-model:page="formInline.page"
        v-model:size="formInline.size"
        :total="total"
        @change="queryAllChatLog"
      />
    </page-panel>
  </div>
</template>

<style>
  /* 本页私有类名,避免与其它页面的全局样式互相覆盖 */
  .chat-answer {
    width: 100%;
    max-height: 40px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    cursor: pointer;
  }

  .chat-answer-container {
    max-height: 500px;
    overflow: overlay;
  }

  .chat-detail-dialog .el-dialog__body {
    height: calc(100vh - 56px);
    padding: 12px 16px 16px;
    overflow: hidden;
    background: var(--u-bg-page);
  }

  .details-container {
    height: 100%;
    padding: 0 2px 6px;
    overflow: auto;
  }

  .detail-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .record-card {
    border: 1px solid var(--u-border);
    border-radius: 10px;
    background: var(--u-bg-container);
    padding: 10px 12px;
    box-shadow: var(--u-shadow-s);
  }

  .record-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .record-card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .record-body {
    margin-top: 8px;
  }

  .record-content {
    position: relative;
    overflow: hidden;
    transition: max-height 240ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: max-height;
  }

  .record-content.is-collapsed {
    max-height: 8rem;
    /* 遮罩渐变只取 alpha 通道（黑 82% 透明），不是主题色 */
    --mask-end: color-mix(in srgb, black 82%, transparent);
    -webkit-mask-image: linear-gradient(to bottom, black 0%, black 84%, var(--mask-end) 100%);
    mask-image: linear-gradient(to bottom, black 0%, black 84%, var(--mask-end) 100%);
  }

  .record-content.is-expanded {
    max-height: 999rem;
  }

  .record-toggle {
    margin-top: 5px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--el-color-primary);
    font-size: 12px;
    cursor: pointer;
  }

  .record-subcards {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .record-subcard {
    border: 1px solid var(--u-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--u-bg-container) 95%, var(--u-bg-fill) 5%);
    padding: 9px 10px;
  }

  .record-subcard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }

  .record-subcard-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .record-round-list {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .record-round-card {
    border: 1px solid var(--u-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--u-bg-container) 94%, var(--u-bg-fill) 6%);
    padding: 9px 10px;
  }

  .record-round-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .record-round-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .record-round-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .record-round-section {
    margin-top: 8px;
  }

  .record-round-section-title {
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--u-text-secondary);
  }

  .record-tool-chain {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .record-tool-card {
    border: 1px solid var(--u-border);
    border-radius: 9px;
    padding: 8px 10px;
    background: var(--u-bg-container);
  }

  .record-tool-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .record-tool-name {
    font-weight: 600;
    color: var(--u-text-primary);
    font-size: 13px;
  }

  .record-tool-time {
    font-size: 12px;
    color: var(--u-text-secondary);
    margin-left: auto;
  }

  .record-raw-collapse {
    margin-top: 8px;
  }

  .record-raw-pre {
    max-height: 260px;
    overflow: auto;
    padding: 8px 10px;
    background-color: var(--u-bg-fill);
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .record-markdown {
    font-size: 14px;
    line-height: 1.6;
  }

  .record-markdown img {
    max-width: 100%;
  }

  .record-markdown pre {
    background-color: var(--u-bg-fill);
    border-radius: 3px;
    padding: 16px;
    overflow: auto;
  }

  .record-markdown code {
    background-color: var(--u-bg-fill);
    border-radius: 3px;
    padding: 0.2em 0.4em;
    font-family: monospace;
  }

  .record-media-stack {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .record-media-grid {
    display: grid;
    gap: 12px;
  }

  .record-media-block {
    border: 1px solid var(--u-border);
    border-radius: 10px;
    padding: 9px 10px;
    background: color-mix(in srgb, var(--u-bg-container) 95%, var(--u-bg-fill) 5%);
  }

  .record-image-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }

  .record-image-card {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--u-border);
    border-radius: 10px;
    background: var(--u-bg-container);
  }

  .record-image-preview {
    width: 100%;
    height: 160px;
  }

  .record-image-error {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--u-bg-fill);
    color: var(--u-text-secondary);
  }

  .record-image-caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--u-bg-container);
    padding: 6px 8px;
    font-size: 12px;
  }

  .record-media-player {
    max-width: 100%;
    width: 100%;
    border-radius: 8px;
  }

  .tool-chain {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tool-card {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    padding: 12px;
    background-color: var(--u-bg-fill);
  }

  .tool-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tool-name {
    font-weight: 600;
    color: var(--u-text-primary);
    font-size: 14px;
  }

  .tool-time {
    font-size: 12px;
    color: var(--u-text-secondary);
    margin-left: auto;
  }
</style>
