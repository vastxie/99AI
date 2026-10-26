<script lang="ts" setup>
  import ApiMcp from '@/api/modules/mcp';
  import type {
    McpServer,
    McpServerInput,
    McpServerTestResult,
    McpServersView,
  } from '@/api/modules/mcp';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { canMutateMcpServers, isMcpDialogStale, saveFromSnapshot } from './mcpPageState';

  const docUrl = computed(() => getDocUrl('/configuration/ai/mcp'));
  usePageDoc(docUrl);

  interface KeyValue {
    key: string;
    value: string;
  }

  interface ServerForm {
    name: string;
    transport: 'http' | 'stdio';
    url: string;
    headers: KeyValue[];
    command: string;
    argsText: string;
    env: KeyValue[];
    cwd: string;
    enabled: boolean;
    timeoutSec: number;
    toolsCacheTtlSec: number;
    passIdentity: boolean;
    identitySecret: string;
    description: string;
    allowText: string;
    denyText: string;
  }

  const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

  const loading = ref(false);
  const saving = ref(false);
  /** 成功加载过一次；最近一次刷新失败 */
  const loaded = ref(false);
  const loadFailed = ref(false);
  /** 快照：最近一次成功的 GET / PUT 的结果（保存都以它为底、带它的修订号） */
  const view = ref<McpServersView>({
    servers: [],
    errors: [],
    stdio: { enabled: false, allowlist: [] },
    revision: '',
    storedErrors: [],
  });
  const canMutate = computed(() =>
    canMutateMcpServers({
      loaded: loaded.value,
      loading: loading.value,
      loadFailed: loadFailed.value,
      saving: saving.value,
    }),
  );
  /** 编辑弹窗打开时的修订号：快照变了就不再用这个表单提交 */
  const dialogRevision = ref<string | null>(null);

  const dialogVisible = ref(false);
  const editingName = ref<string | null>(null);
  const form = reactive<ServerForm>(emptyForm());

  const testVisible = ref(false);
  const testing = ref(false);
  const testTarget = ref('');
  const testResult = ref<McpServerTestResult | null>(null);

  function emptyForm(): ServerForm {
    return {
      name: '',
      transport: 'http',
      url: '',
      headers: [],
      command: '',
      argsText: '',
      env: [],
      cwd: '',
      enabled: true,
      timeoutSec: 60,
      toolsCacheTtlSec: 60,
      passIdentity: true,
      identitySecret: '',
      description: '',
      allowText: '',
      denyText: '',
    };
  }

  const toPairs = (record?: Record<string, string>): KeyValue[] =>
    Object.entries(record || {}).map(([key, value]) => ({ key, value }));

  function fromPairs(pairs: KeyValue[]): Record<string, string> | undefined {
    const entries = pairs
      .filter((pair) => pair.key.trim())
      .map((pair) => [pair.key.trim(), pair.value]);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  function toInput(server: McpServer): McpServerInput {
    const { source: _source, stdioAllowed: _allowed, overridesEnv: _overrides, ...input } = server;
    return { ...input, identitySecret: server.identitySecret || '' };
  }

  function fromForm(): McpServerInput {
    const allow = lines(form.allowText);
    const deny = lines(form.denyText);
    const http = form.transport === 'http';
    return {
      name: form.name.trim(),
      transport: form.transport,
      ...(http ? { url: form.url.trim(), headers: fromPairs(form.headers) } : {}),
      ...(!http
        ? {
            command: form.command.trim(),
            args: lines(form.argsText),
            env: fromPairs(form.env),
            ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
          }
        : {}),
      enabled: form.enabled,
      timeoutMs: Math.round(form.timeoutSec * 1000),
      toolsCacheTtlMs: Math.round(form.toolsCacheTtlSec * 1000),
      passIdentity: form.passIdentity,
      identitySecret: form.identitySecret,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(allow.length || deny.length ? { tools: { allow, deny } } : {}),
    };
  }

  async function load() {
    if (saving.value) return;
    loading.value = true;
    try {
      const res: any = await ApiMcp.listServers();
      view.value = res.data;
      loaded.value = true;
      loadFailed.value = false;
    } catch {
      // 请求层已提示；之后在重新加载成功之前不允许修改（否则会以过期或空的列表整表覆盖）
      loadFailed.value = true;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 以发起时的快照整表保存：build 拿这份快照里后台保存的服务器生成新列表，修订号与坏条目确认也来自它；
   * 确认丢弃期间快照变了就放弃。服务端 409（被别人改过、页面过期）时请求层已提示，这里重新加载。
   * 返回是否保存成功
   */
  async function persist(build: (servers: McpServer[]) => McpServerInput[]): Promise<boolean> {
    try {
      const outcome = await saveFromSnapshot({
        current: () => view.value,
        build: (snapshot) => build(snapshot.servers.filter((s) => s.source === 'config')),
        confirmDiscard: (storedErrors) =>
          ElMessageBox.confirm(
            `后台配置里有无法解析的条目，保存会把它们丢弃：${storedErrors.join('；')}`,
            '丢弃无法解析的条目',
            { type: 'warning', confirmButtonText: '丢弃并保存' },
          ).then(
            () => true,
            () => false,
          ),
        send: async (body) => ((await ApiMcp.saveServers(body)) as any).data,
      });
      if (outcome.status === 'stale') ElMessage.warning('配置已刷新，请重新操作');
      if (outcome.status !== 'saved') return false;
      view.value = outcome.view;
      return true;
    } catch (error: any) {
      if (error?.response?.status === 409) {
        saving.value = false;
        await load();
      }
      return false;
    }
  }

  function openCreate() {
    if (!canMutate.value) return;
    Object.assign(form, emptyForm());
    editingName.value = null;
    dialogRevision.value = view.value.revision;
    dialogVisible.value = true;
  }

  function openEdit(server: McpServer) {
    if (!canMutate.value) return;
    dialogRevision.value = view.value.revision;
    Object.assign(form, {
      ...emptyForm(),
      name: server.name,
      transport: server.transport,
      url: server.url || '',
      headers: toPairs(server.headers),
      command: server.command || '',
      argsText: (server.args || []).join('\n'),
      env: toPairs(server.env),
      cwd: server.cwd || '',
      enabled: server.enabled,
      timeoutSec: Math.round(server.timeoutMs / 1000),
      toolsCacheTtlSec: Math.round(server.toolsCacheTtlMs / 1000),
      passIdentity: server.passIdentity,
      identitySecret: server.identitySecret || '',
      description: server.description || '',
      allowText: (server.tools?.allow || []).join('\n'),
      denyText: (server.tools?.deny || []).join('\n'),
    });
    editingName.value = server.name;
    dialogVisible.value = true;
  }

  async function submit() {
    if (!canMutate.value) return;
    if (isMcpDialogStale(dialogRevision.value, view.value.revision)) {
      ElMessage.warning('配置已刷新，请重新打开编辑');
      dialogVisible.value = false;
      return;
    }
    const input = fromForm();
    if (!NAME_PATTERN.test(input.name)) {
      ElMessage.warning('名称只允许小写字母、数字、_ 和 -，最长 32 位');
      return;
    }
    if (input.transport === 'http' && !input.url) {
      ElMessage.warning('请填写服务地址');
      return;
    }
    if (input.transport === 'stdio' && !input.command) {
      ElMessage.warning('请填写命令的绝对路径');
      return;
    }
    const editing = editingName.value;
    saving.value = true;
    try {
      const saved = await persist((servers) => [
        ...servers.filter((server) => server.name !== editing).map(toInput),
        input,
      ]);
      if (saved) {
        dialogVisible.value = false;
        ElMessage.success('已保存');
      }
    } finally {
      saving.value = false;
    }
  }

  async function toggleEnabled(server: McpServer, enabled: boolean) {
    if (!canMutate.value) return;
    saving.value = true;
    try {
      const saved = await persist((servers) =>
        servers.map((item) => toInput(item.name === server.name ? { ...item, enabled } : item)),
      );
      if (saved) ElMessage.success(enabled ? '已启用' : '已停用');
    } finally {
      saving.value = false;
    }
  }

  async function remove(server: McpServer) {
    if (!canMutate.value) return;
    await ElMessageBox.confirm(
      server.overridesEnv
        ? `删除后恢复环境变量 MCP_SERVERS_JSON 里 ${server.name} 的配置，并按环境变量的设置启用或停用；只想停用请关闭「启用」开关。确认删除这项覆盖？`
        : `删除后模型将不能再调用 ${server.name} 的工具，确认删除？`,
      server.overridesEnv ? '删除覆盖' : '删除 MCP 服务器',
      {
        type: 'warning',
        confirmButtonText: '删除',
      },
    );
    if (!canMutate.value) {
      ElMessage.warning('配置正在刷新或保存，请稍后重新操作');
      return;
    }
    saving.value = true;
    try {
      const saved = await persist((servers) =>
        servers.filter((item) => item.name !== server.name).map(toInput),
      );
      if (saved) ElMessage.success('已删除');
    } finally {
      saving.value = false;
    }
  }

  async function test(server: McpServer) {
    testTarget.value = server.name;
    testResult.value = null;
    testVisible.value = true;
    testing.value = true;
    try {
      const res: any = await ApiMcp.testServer(server.name);
      testResult.value = res.data;
    } finally {
      testing.value = false;
    }
  }

  onMounted(load);
</script>

<template>
  <div>
    <page-panel>
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-[var(--el-text-color-secondary)]">stdio</span>
          <el-tag v-if="view.stdio.enabled" type="success">已启用</el-tag>
          <el-tag v-else type="info">未启用</el-tag>
          <span
            v-if="view.stdio.enabled && view.stdio.allowlist.length"
            class="font-mono text-[var(--el-text-color-secondary)]"
          >
            {{ view.stdio.allowlist.join('，') }}
          </span>
        </div>
        <div class="flex gap-2">
          <el-button :loading="loading" :disabled="saving" @click="load">刷新</el-button>
          <el-button type="primary" :disabled="!canMutate" @click="openCreate">
            <AppIcon name="i-lucide:plus" class="mr-1" />
            新增服务器
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="loadFailed"
        title="MCP 配置加载失败：重新加载成功之前不能修改，以免用不完整的列表覆盖后台配置"
        type="error"
        show-icon
        :closable="false"
        class="mb-3"
      >
        <template #default>
          <el-button size="small" :loading="loading" @click="load">重新加载</el-button>
        </template>
      </el-alert>

      <el-alert
        v-for="error in view.errors"
        :key="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-3"
      />

      <el-table
        v-loading="loading"
        border
        :data="view.servers"
        :empty-text="loaded ? '还没有配置 MCP 服务器' : loadFailed ? '加载失败' : '加载中'"
      >
        <el-table-column prop="name" label="名称" min-width="160">
          <template #default="{ row }">
            <div class="font-mono">{{ row.name }}</div>
            <div v-if="row.description" class="text-xs text-[var(--el-text-color-secondary)]">
              {{ row.description }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="130">
          <template #default="{ row }">
            <el-tag v-if="row.overridesEnv" type="warning">覆盖环境变量</el-tag>
            <el-tag v-else type="info">{{ row.source === 'env' ? '环境变量' : '后台' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="传输" width="90">
          <template #default="{ row }">
            <el-tag type="info">{{ row.transport }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="地址 / 命令" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-mono text-[13px]">{{
              row.transport === 'http' ? row.url : row.command
            }}</span>
            <el-tag
              v-if="row.transport === 'stdio' && !row.stdioAllowed"
              type="warning"
              class="ml-2"
            >
              未放行
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="透传身份" width="100">
          <template #default="{ row }">
            <span>{{ row.passIdentity ? (row.identitySecret ? '签名' : '不签名') : '关闭' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="超时" width="90" align="right">
          <template #default="{ row }">{{ Math.round(row.timeoutMs / 1000) }} 秒</template>
        </el-table-column>
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-switch
              v-if="row.source === 'config'"
              :model-value="row.enabled"
              :disabled="!canMutate"
              @change="
                (value: string | number | boolean) =>
                  toggleEnabled(row as McpServer, Boolean(value))
              "
            />
            <el-tag v-else :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="test(row as McpServer)">测试</el-button>
            <template v-if="row.source === 'config'">
              <el-button
                link
                type="primary"
                :disabled="!canMutate"
                @click="openEdit(row as McpServer)"
              >
                编辑
              </el-button>
              <el-button
                link
                type="danger"
                :disabled="!canMutate"
                @click="remove(row as McpServer)"
              >
                {{ row.overridesEnv ? '删除覆盖' : '删除' }}
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </page-panel>

    <el-dialog
      v-model="dialogVisible"
      :title="editingName ? '编辑 MCP 服务器' : '新增 MCP 服务器'"
      width="700px"
    >
      <el-form label-width="auto" label-position="right">
        <el-form-item label="名称" required>
          <el-input
            v-model="form.name"
            :disabled="Boolean(editingName)"
            placeholder="小写字母、数字、_ 和 -，如 docs"
          />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" maxlength="200" placeholder="给管理员看的用途说明" />
        </el-form-item>
        <el-form-item label="传输方式">
          <el-radio-group v-model="form.transport">
            <el-radio-button value="http">HTTP</el-radio-button>
            <el-radio-button value="stdio">stdio</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="form.transport === 'http'">
          <el-form-item label="服务地址" required>
            <el-input v-model="form.url" placeholder="https://mcp.example.com/mcp" />
          </el-form-item>
          <el-form-item label="请求头">
            <div class="w-full flex flex-col gap-2">
              <div v-for="(pair, index) in form.headers" :key="index" class="flex gap-2">
                <el-input v-model="pair.key" placeholder="名称，如 Authorization" class="flex-1" />
                <el-input
                  v-model="pair.value"
                  type="password"
                  show-password
                  placeholder="值"
                  class="flex-1"
                />
                <el-button link type="danger" @click="form.headers.splice(index, 1)"
                  >移除</el-button
                >
              </div>
              <div>
                <el-button @click="form.headers.push({ key: '', value: '' })">添加请求头</el-button>
              </div>
            </div>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="命令" required>
            <el-input v-model="form.command" placeholder="可执行文件的绝对路径" />
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              需同时在环境变量 MCP_STDIO_ENABLED 与 MCP_STDIO_COMMAND_ALLOWLIST 中放行
            </div>
          </el-form-item>
          <el-form-item label="参数">
            <el-input
              v-model="form.argsText"
              type="textarea"
              :rows="3"
              placeholder="每行一个参数"
            />
          </el-form-item>
          <el-form-item label="环境变量">
            <div class="w-full flex flex-col gap-2">
              <div v-for="(pair, index) in form.env" :key="index" class="flex gap-2">
                <el-input v-model="pair.key" placeholder="名称" class="flex-1" />
                <el-input
                  v-model="pair.value"
                  type="password"
                  show-password
                  placeholder="值"
                  class="flex-1"
                />
                <el-button link type="danger" @click="form.env.splice(index, 1)">移除</el-button>
              </div>
              <div>
                <el-button @click="form.env.push({ key: '', value: '' })">添加环境变量</el-button>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="工作目录">
            <el-input v-model="form.cwd" placeholder="可选，绝对路径" />
          </el-form-item>
        </template>
        <el-form-item label="透传用户身份">
          <el-switch v-model="form.passIdentity" />
        </el-form-item>
        <el-form-item v-if="form.passIdentity" label="身份签名密钥">
          <el-input
            v-model="form.identitySecret"
            type="password"
            show-password
            placeholder="可选；填写后附带 HMAC 签名，MCP 服务用同一密钥校验"
          />
        </el-form-item>
        <el-form-item label="允许的工具">
          <el-input
            v-model="form.allowText"
            type="textarea"
            :rows="2"
            placeholder="每行一个远端工具名，支持末尾 *；留空表示全部允许"
          />
        </el-form-item>
        <el-form-item label="禁用的工具">
          <el-input
            v-model="form.denyText"
            type="textarea"
            :rows="2"
            placeholder="每行一个，优先于允许列表"
          />
        </el-form-item>
        <el-form-item label="超时（秒）">
          <el-input-number v-model="form.timeoutSec" :min="1" :max="600" />
        </el-form-item>
        <el-form-item label="工具列表缓存（秒）">
          <el-input-number v-model="form.toolsCacheTtlSec" :min="1" :max="86400" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <DialogFooter :loading="saving" @confirm="submit" @cancel="dialogVisible = false" />
      </template>
    </el-dialog>

    <el-drawer v-model="testVisible" :title="`测试连接：${testTarget}`" size="600px">
      <el-skeleton v-if="testing" :rows="6" animated />
      <template v-else-if="testResult">
        <el-alert
          v-if="!testResult.ok"
          :title="testResult.message"
          type="error"
          show-icon
          :closable="false"
        />
        <template v-else>
          <el-alert
            :title="`连接成功，共 ${testResult.tools?.length || 0} 个工具`"
            type="success"
            show-icon
            :closable="false"
            class="mb-3"
          />
          <el-table border :data="testResult.tools" empty-text="该服务器没有提供工具">
            <el-table-column prop="name" label="远端工具" min-width="160" show-overflow-tooltip />
            <el-table-column label="模型可见名" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="font-mono text-[13px]">{{ row.exposedName }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.allowed ? 'success' : 'info'">
                  {{ row.allowed ? '可用' : '已过滤' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </template>
    </el-drawer>
  </div>
</template>
