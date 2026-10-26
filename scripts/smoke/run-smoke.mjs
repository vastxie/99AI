#!/usr/bin/env node
// 真实启动冒烟：驱动一个已经启动的 server（已 db:init、连着 MySQL / Redis）和 mock-openai.mjs，走完
//   超管登录 → 建指向模拟模型的模型 → 注册用户 → 建对话 → Socket.IO 发起一轮（模型调用 bash 写文件）
//   → 核对工具事件、聊天记录落库、文件元信息与下载权限 → 渠道网关同步入口再跑一轮 → 核对模型请求。
// 只用 Node 24 自带的 fetch / WebSocket，不依赖任何包。CI 用法见 .github/workflows/smoke.yml。
//
// 环境变量：
//   SMOKE_BASE_URL          server 地址，默认 http://127.0.0.1:${PORT || 9520}
//   SMOKE_MOCK_URL          模拟模型地址，默认 http://127.0.0.1:${MOCK_MODEL_PORT || 18080}
//   ADMIN_INITIAL_PASSWORD  超管 super 的初始密码（与 server 相同）
//   CHANNEL_SERVICE_TOKEN   设置时额外验证渠道网关入口
//   SMOKE_TURN_TIMEOUT_MS   单轮等待上限，默认 180000
//   SMOKE_EXPECT_KERNEL     设置时要求 bash 工具输出的内核版本包含该值（gVisor 下为 gvisor）
//   SMOKE_EXPECT_NO_PROXY   设置时要求 bash 工具环境里的 NO_PROXY / no_proxy 等于该值（只有 Docker 驱动下发）
import { randomUUID } from 'node:crypto';
import {
  check,
  checkModelRequests,
  checkPersistedAssistant,
  checkPositiveId,
  checkWebTurnEvents,
  SmokeError,
} from './checks.mjs';
import { SMOKE_ARTIFACT_CONTENT, SMOKE_ARTIFACT_NAME, SMOKE_FINAL_TEXT } from './constants.mjs';
import { MiniSocketIo } from './socketio-client.mjs';

const BASE = (process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 9520}`).replace(
  /\/$/,
  '',
);
const MOCK = (
  process.env.SMOKE_MOCK_URL || `http://127.0.0.1:${process.env.MOCK_MODEL_PORT || 18080}`
).replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || '';
const CHANNEL_TOKEN = process.env.CHANNEL_SERVICE_TOKEN || '';
const TURN_TIMEOUT_MS = Number(process.env.SMOKE_TURN_TIMEOUT_MS || 180000);
const EXPECT_KERNEL = process.env.SMOKE_EXPECT_KERNEL || '';
const EXPECT_NO_PROXY = process.env.SMOKE_EXPECT_NO_PROXY || '';
const USERNAME = 'smoke_ci';
const USER_PASSWORD = 'smoke-pass-1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(`[smoke] ${message}`);

function preview(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text && text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
}

async function request(method, path, { token, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return fetch(`${BASE}${path}`, init);
}

/** 调用 server 接口并要求 HTTP 200 + { success: true }，返回 data */
async function api(method, path, options) {
  const res = await request(method, path, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  check(
    res.status === 200 && json?.success === true,
    `${method} ${path} 失败（HTTP ${res.status}）`,
    text,
  );
  return json.data;
}

async function waitForReady(timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/config/queryFront`);
      if (res.status === 200) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = error?.cause?.code || error?.message || String(error);
    }
    await sleep(1000);
  }
  throw new SmokeError(`server 在 ${timeoutMs} ms 内没有就绪（${BASE}）`, last);
}

async function setupModel(adminToken) {
  const model = await api('POST', '/api/models/setModel', {
    token: adminToken,
    body: {
      modelName: 'Smoke Mock',
      model: 'smoke-mock',
      protocol: 'openai_chat_completions',
      baseUrl: MOCK,
      key: 'smoke-key',
      status: true,
      deduct: 0,
      modelOrder: 1,
    },
  });
  return checkPositiveId(model?.id, '创建模型没有返回正整数 id');
}

/** 按 Web 端协议走 Socket.IO：chat:start → 收集 agent:event 直到 agent.end / agent.error */
async function runWebTurn(userToken, gid, modelId) {
  const socket = new MiniSocketIo(BASE, { path: '/api/socket.io', auth: { token: userToken } });
  const events = [];
  socket.on('agent:event', (event) => events.push(event));
  try {
    await socket.connect();
    const payload = {
      prompt: 'Create the smoke artifact',
      gid,
      submissionId: randomUUID(),
      modelId,
    };
    let ack;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      [ack] = await socket.emitWithAck('chat:start', [payload]);
      // CONNECT 确认先于异步鉴权返回，过早发起会得到 UNAUTHORIZED；同一 submissionId 重试是幂等的
      if (ack?.ok || ack?.code !== 'UNAUTHORIZED') break;
      await sleep(500 * attempt);
    }
    check(ack?.ok === true && ack.data?.accepted === true, 'chat:start 没有被接受', ack);
    const { cid, turnId } = ack.data;
    log(`web 轮次已受理：cid=${cid} turnId=${turnId}`);

    const deadline = Date.now() + TURN_TIMEOUT_MS;
    const finished = () =>
      events.some(
        (event) =>
          event?.chatId === cid && (event.type === 'agent.end' || event.type === 'agent.error'),
      );
    while (!finished() && Date.now() < deadline && !socket.transportClosed) await sleep(200);
    check(
      finished(),
      socket.transportClosed
        ? '实时连接在轮次结束前断开'
        : `等待 agent.end 超时（${TURN_TIMEOUT_MS} ms）`,
      events.filter((event) => event?.chatId === cid).map((event) => event.type),
    );
    const result = checkWebTurnEvents(events, cid);
    log(`web 轮次完成：${result.trail}`);
    return { cid, turnId, fileId: result.fileId, eventCount: result.eventCount };
  } finally {
    socket.close();
  }
}

async function verifyChatLog(userToken, gid, cid, fileId) {
  const data = await api('GET', `/api/chatLog/chatList?gid=${encodeURIComponent(gid)}`, {
    token: userToken,
  });
  checkPersistedAssistant(data?.rows, cid, fileId);
}

async function verifyFileAccess(ownerToken, fileId) {
  const meta = await api('GET', `/api/files/${encodeURIComponent(fileId)}/meta`, {
    token: ownerToken,
  });
  check(meta?.name === SMOKE_ARTIFACT_NAME, `文件名为 ${meta?.name}`, meta);
  check(meta?.visibility === 'private', `文件可见性为 ${meta?.visibility}`, meta);

  const path = `/api/files/${encodeURIComponent(fileId)}/download`;
  const download = await request('GET', path, { token: ownerToken });
  const content = await download.text();
  check(download.status === 200, `本人下载失败（HTTP ${download.status}）`, content);
  check(content === SMOKE_ARTIFACT_CONTENT, '下载内容与模型写入的不一致', content);

  const anonymous = await request('GET', path);
  check(anonymous.status === 401, `未登录下载应为 401，实际 ${anonymous.status}`);

  const visitorToken = await api('POST', '/api/auth/visitor-session', {
    body: { deviceId: `smoke-${randomUUID()}` },
  });
  const other = await request('GET', path, { token: visitorToken });
  check(other.status === 403, `他人下载应为 403，实际 ${other.status}`);
}

async function runChannelTurn(adminToken) {
  const users = await api('GET', `/api/user/queryAll?username=${USERNAME}`, { token: adminToken });
  const userId = checkPositiveId(
    users?.rows?.find((row) => row?.username === USERNAME)?.id,
    '没有查到冒烟用户的数字 id',
  );
  const data = await api('POST', '/api/channel-gateway/inbound', {
    headers: { 'x-channel-service-token': CHANNEL_TOKEN },
    body: {
      channel: 'smoke',
      userId,
      text: 'Create the smoke artifact via the channel gateway',
      timeoutMs: TURN_TIMEOUT_MS,
    },
  });
  check(!data?.error && data?.timedOut === false, '渠道网关轮次失败', data);
  check(String(data?.text || '').includes(SMOKE_FINAL_TEXT), '渠道网关回复文本不符', data);
  const file = (data?.files || []).find((item) => item?.displayName === SMOKE_ARTIFACT_NAME);
  check(file?.fileId, '渠道网关没有带回产物', data);
  const download = await request('GET', `/api/files/${encodeURIComponent(file.fileId)}/download`, {
    token: adminToken,
  });
  const content = await download.text();
  check(download.status === 200 && content === SMOKE_ARTIFACT_CONTENT, '渠道产物下载失败', {
    status: download.status,
    content,
  });
  return { chatId: data.chatId, fileId: file.fileId };
}

async function main() {
  check(ADMIN_PASSWORD, '缺少 ADMIN_INITIAL_PASSWORD（与 server 使用同一个值）');
  log(`等待 server 就绪：${BASE}`);
  await waitForReady();

  const adminToken = await api('POST', '/api/auth/login', {
    body: { username: 'super', password: ADMIN_PASSWORD },
  });
  const modelId = await setupModel(adminToken);
  log(`模型已创建：id=${modelId} → ${MOCK}`);

  const userToken = await api('POST', '/api/auth/register', {
    body: { username: USERNAME, password: USER_PASSWORD, nickname: 'Smoke' },
  });
  const group = await api('POST', '/api/group/create', {
    token: userToken,
    body: { title: 'smoke' },
  });
  check(group?.gid, '建对话没有返回 gid', group);

  const web = await runWebTurn(userToken, group.gid, modelId);
  await verifyChatLog(userToken, group.gid, web.cid, web.fileId);
  await verifyFileAccess(userToken, web.fileId);
  log('聊天记录与正文落库、产物元信息与下载权限核对通过');

  let channel = null;
  if (CHANNEL_TOKEN) {
    channel = await runChannelTurn(adminToken);
    log(`渠道网关轮次完成：chatId=${channel.chatId}`);
  } else {
    log('未设置 CHANNEL_SERVICE_TOKEN，跳过渠道网关');
  }

  const requests = await (await fetch(`${MOCK}/__smoke/requests`)).json();
  const modelRequests = checkModelRequests(requests, {
    expectKernel: EXPECT_KERNEL,
    expectNoProxy: EXPECT_NO_PROXY,
  });
  log(`模型请求核对通过：共 ${modelRequests.total} 个，Agent 流式请求 ${modelRequests.agent} 个`);
  console.log(JSON.stringify({ ok: true, web, channel, modelRequests }, null, 2));
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error.message}`);
  if (error.detail !== undefined) console.error(`[smoke] 详情：${preview(error.detail)}`);
  if (!(error instanceof SmokeError) && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
