#!/usr/bin/env node
// 冒烟测试用的 OpenAI 兼容模型桩，只用 Node 内置模块。
// - 请求不带 tools（标题生成等辅助请求）：返回一句普通文本
// - 带 tools 但没有 bash：返回错误文本，让冒烟脚本明确失败（沙箱准备失败时工具会被静默移除）
// - 还没有 tool 结果：返回一次 bash 工具调用，把文件写进 $AGENT_OUTPUT_DIR/smoke.txt
// - 已有 tool 结果：返回最终文本
// - 最后一条用户消息带剧本标记（浏览器用例使用）：不调工具，[mock:slow] 分段慢速流出，[mock:table] 回复一张表格
// GET /__smoke/requests 返回收到的请求摘要，供冒烟脚本断言。
import { createServer } from 'node:http';
import { MOCK_SLOW_INTERVAL_MS, MOCK_SLOW_SEGMENTS, SMOKE_TOOL_COMMAND } from './constants.mjs';
import { contentText, decide, toolNames } from './mock-scenarios.mjs';

const PORT = Number(process.env.MOCK_MODEL_PORT || 18080);

const requests = [];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

function streamChunks(id, model, decision, callId) {
  const base = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
  };
  const choice = (delta, finishReason = null) => ({
    ...base,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
  if (decision.phase === 'tool_call') {
    const args = JSON.stringify({ command: SMOKE_TOOL_COMMAND });
    const cut = Math.floor(args.length / 2);
    return [
      choice({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            index: 0,
            id: callId,
            type: 'function',
            function: { name: 'bash', arguments: args.slice(0, cut) },
          },
        ],
      }),
      // 参数分两块到达，覆盖网关的工具参数拼接
      choice({ tool_calls: [{ index: 0, function: { arguments: args.slice(cut) } }] }),
      choice({}, 'tool_calls'),
    ];
  }
  const half = Math.ceil(decision.text.length / 2);
  return [
    choice({ role: 'assistant', content: decision.text.slice(0, half) }),
    choice({ content: decision.text.slice(half) }),
    choice({}, 'stop'),
  ];
}

async function handleCompletion(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: { message: 'invalid json body' } });
  }
  const decision = decide(body);
  const index = requests.length + 1;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastTool = [...messages].reverse().find((message) => message?.role === 'tool');
  requests.push({
    index,
    at: new Date().toISOString(),
    phase: decision.phase,
    stream: Boolean(body.stream),
    model: body.model,
    tools: toolNames(body.tools),
    roles: messages.map((message) => message?.role),
    lastToolResult: lastTool ? contentText(lastTool.content).slice(0, 8000) : null,
  });
  console.log(`[mock-openai] #${index} ${decision.phase} model=${body.model}`);

  const id = `chatcmpl-smoke-${index}`;
  const callId = `call_smoke_${index}`;
  const chunks = streamChunks(id, body.model, decision, callId);
  if (!body.stream) {
    const toolCall = decision.phase === 'tool_call';
    return sendJson(res, 200, {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [
        {
          index: 0,
          finish_reason: toolCall ? 'tool_calls' : 'stop',
          message: toolCall
            ? {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: callId,
                    type: 'function',
                    function: {
                      name: 'bash',
                      arguments: JSON.stringify({ command: SMOKE_TOOL_COMMAND }),
                    },
                  },
                ],
              }
            : { role: 'assistant', content: decision.text },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  if (decision.phase === 'slow') {
    // 分段慢速流出；客户端断开（用户停止、请求被中止）后不再继续
    let closed = false;
    res.on('close', () => (closed = true));
    for (let segment = 1; segment <= MOCK_SLOW_SEGMENTS && !closed; segment += 1) {
      const delta = {
        ...(segment === 1 ? { role: 'assistant' } : {}),
        content: `片段 ${segment}。`,
      };
      res.write(
        `data: ${JSON.stringify({ ...chunks[0], choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, MOCK_SLOW_INTERVAL_MS));
    }
    if (closed) return;
  }
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  if (body.stream_options?.include_usage) {
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    res.write(`data: ${JSON.stringify({ ...chunks[0], choices: [], usage })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://mock.local');
  if (req.method === 'GET' && url.pathname === '/__smoke/requests') {
    return sendJson(res, 200, requests);
  }
  if (req.method === 'GET' && url.pathname.endsWith('/models')) {
    return sendJson(res, 200, { object: 'list', data: [{ id: 'smoke-mock', object: 'model' }] });
  }
  if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
    return handleCompletion(req, res).catch((error) =>
      sendJson(res, 500, { error: { message: String(error?.message || error) } }),
    );
  }
  return sendJson(res, 404, { error: { message: `no route ${req.method} ${url.pathname}` } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-openai] listening on http://127.0.0.1:${PORT}`);
});
