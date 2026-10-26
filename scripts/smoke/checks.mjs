// 冒烟断言（纯函数，便于用 node:test 验证它们确实能拦住回归）
import { SMOKE_ARTIFACT_NAME, SMOKE_FINAL_TEXT, SMOKE_NO_BASH_TEXT } from './constants.mjs';

export const PRIMITIVE_TOOLS = ['read', 'write', 'edit', 'bash', 'ls'];

export class SmokeError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'SmokeError';
    this.detail = detail;
  }
}

export function check(condition, message, detail) {
  if (!condition) throw new SmokeError(message, detail);
}

/** bash 原语把退出码写在输出末尾的摘要里：[exit N，… ms]；取最后一个，避免命令输出里的同形文本冒充 */
export function bashExitCode(toolResult) {
  const matches = [...String(toolResult || '').matchAll(/\[exit (-?\d+)[，,\]]/g)];
  return matches.length ? Number(matches.at(-1)[1]) : undefined;
}

export function checkPositiveId(value, message) {
  const id = typeof value === 'number' ? value : Number.NaN;
  check(Number.isInteger(id) && id > 0, message, value);
  return id;
}

/** 一轮 Web 对话的事件：必须以 agent.end(completed) 结束，bash 成功且带回产物，最终文本正确 */
export function checkWebTurnEvents(events, cid) {
  const own = events.filter((event) => event?.chatId === cid);
  const trail = own.map((event) => event.type).join(' → ');
  const terminal = own.find((event) => event.type === 'agent.end' || event.type === 'agent.error');
  check(terminal, '没有收到 agent.end / agent.error', trail);
  check(terminal.type === 'agent.end', `轮次以 ${terminal.type} 结束`, terminal.data);
  const turnStatus = terminal.data?.turnStatus || terminal.data?.turn?.status;
  check(turnStatus === 'completed', `轮次状态为 ${turnStatus}`, terminal.data);

  const toolEnd = own.find((event) => event.type === 'tool.end');
  check(toolEnd, '没有收到 tool.end（模型的 bash 调用没有执行）', trail);
  check(
    toolEnd.data?.status === 'success',
    `bash 工具执行失败：${toolEnd.data?.status}`,
    toolEnd.data,
  );
  const asset = (toolEnd.data?.assets || []).find(
    (item) => item?.displayName === SMOKE_ARTIFACT_NAME,
  );
  check(asset?.fileId, 'tool.end 没有带回产物 fileId', toolEnd.data);

  const text = own
    .filter((event) => event.type === 'message.delta')
    .map((event) => event.data?.delta || '')
    .join('');
  check(!text.includes(SMOKE_NO_BASH_TEXT), '模型没有拿到 bash 工具（沙箱准备失败）', text);
  check(text.includes(SMOKE_FINAL_TEXT), '最终回复文本不符', text);
  return { fileId: asset.fileId, trail, eventCount: own.length };
}

/** chatList 中这一轮的助手消息：已完成、正文已落库、工具调用里有产物 fileId */
export function checkPersistedAssistant(rows, cid, fileId) {
  const list = Array.isArray(rows) ? rows : [];
  const assistant = list.find((row) => row?.role === 'assistant' && row?.cid === cid);
  check(assistant, '聊天记录里没有这一轮的助手消息', list);
  check(
    Number(assistant.status) === 3,
    `助手消息状态为 ${assistant.status}（期望 3 = 已完成）`,
    assistant,
  );
  check(
    String(assistant.content || '').includes(SMOKE_FINAL_TEXT),
    '助手正文没有落库',
    assistant.content,
  );
  let message;
  try {
    message =
      typeof assistant.message === 'string' ? JSON.parse(assistant.message) : assistant.message;
  } catch {
    throw new SmokeError('助手消息的 message 不是合法 JSON', assistant.message);
  }
  const persisted = (message?.rounds || [])
    .flatMap((round) => round?.toolCalls || [])
    .flatMap((call) => call?.assets || [])
    .map((item) => item?.fileId);
  check(persisted.includes(fileId), '落库的工具调用里没有产物 fileId', message);
}

/**
 * 模拟模型收到的请求：Agent 请求必须流式并带齐五个原语工具，
 * 每次工具结果都以退出码 0 结束；可选要求工具输出里的内核版本（gVisor），
 * 以及命令环境里两个代理例外变量的值（只有 Docker 驱动下发，本机驱动不检查）。
 */
export function checkModelRequests(requests, { expectKernel = '', expectNoProxy = '' } = {}) {
  const list = Array.isArray(requests) ? requests : [];
  check(!list.some((item) => item.phase === 'no_bash'), '存在没有 bash 工具的 Agent 请求', list);
  const agent = list.filter((item) => item.phase === 'tool_call' || item.phase === 'final');
  const toolCalls = agent.filter((item) => item.phase === 'tool_call');
  const finals = agent.filter((item) => item.phase === 'final');
  check(toolCalls.length > 0, '模拟模型没有收到带 bash 工具的请求', list);
  check(finals.length > 0, '模拟模型没有收到工具结果', list);
  for (const item of agent) {
    check(item.stream === true, `Agent 请求 #${item.index} 不是流式请求`, item);
    for (const name of PRIMITIVE_TOOLS) {
      check(
        item.tools.includes(name),
        `Agent 请求 #${item.index} 缺少原语工具 ${name}`,
        item.tools,
      );
    }
  }
  for (const item of finals) {
    const exitCode = bashExitCode(item.lastToolResult);
    check(exitCode === 0, `bash 退出码为 ${exitCode}（期望 0）`, item.lastToolResult);
    if (expectKernel) {
      check(
        String(item.lastToolResult).includes(expectKernel),
        `bash 工具没有运行在期望的内核里（期望包含 ${expectKernel}）`,
        item.lastToolResult,
      );
    }
    if (expectNoProxy) {
      const lines = String(item.lastToolResult).split('\n');
      for (const name of ['NO_PROXY', 'no_proxy']) {
        check(
          lines.includes(`${name}=${expectNoProxy}`),
          `bash 工具的环境里 ${name} 不是期望的回环例外（期望 ${expectNoProxy}）`,
          item.lastToolResult,
        );
      }
    }
  }
  return { total: list.length, agent: agent.length };
}
