import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const removed = [
  'interactionMode',
  'chooseInteractionMode',
  'workLoginRequired',
  'workTaskRunning',
  'ChatInteractionMode',
  'WorkProjectSummaryWire',
  'CommittedProjectChangeWire',
  'sourceAgentApp',
  'agent_app',
  'runtime_output',
  'agent_artifact',
  'legacyFlags',
  'CHANNEL_PACK_ENABLED',
  'VITE_CHANNEL_ENABLED',
  'legacyTabAlias',
  'agentChat',
  'privateSignedUrlTtlRuntimeSeconds',
  'privateSignedUrlTtlDocumentSeconds',
  'privateSignedUrlTtlMediaSeconds',
  'extractBusinessErrorCode',
  'agent_content',
  'agentAppUsage',
  'parentTaskId',
  'selectedApp',
  'isSelectedApp',
  'buildLegacySafeToolName',
  'converDeprecatedAttribute',
  'wechatApiUrlToken',
  'weChatApiUrlToken',
];
function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|vue|json)$/.test(path) &&
      !/\.(?:spec|test)\./.test(path) &&
      !path.includes('/fixtures/')
      ? [path]
      : [];
  });
}
const failures = [];
for (const base of ['server/src', 'web/src', 'admin/src', 'packages/contracts/src']) {
  for (const file of walk(resolve(root, base))) {
    const text = readFileSync(file, 'utf8');
    for (const token of removed)
      if (text.includes(token)) failures.push(`${relative(root, file)}: ${token}`);
  }
}
for (const path of [
  'web/src/types/agent-event.ts',
  'server/src/modules/chatLog/types/agent-event.types.ts',
  'admin/src/utils/presetAiPrompt.ts',
  'server/src/types/agent.ts',
])
  if (existsSync(resolve(root, path))) failures.push(`已移除入口仍存在：${path}`);
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write('当前合同检查通过：无已移除的内部模式、字段、开关与兼容入口。\n');
