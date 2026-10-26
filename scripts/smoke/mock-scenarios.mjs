// 模拟模型按请求内容选择剧本（纯函数，mock-openai.mjs 与自测共用）
import {
  MOCK_SLOW_FINAL_TEXT,
  MOCK_SLOW_MARKER,
  MOCK_TABLE_MARKER,
  MOCK_TABLE_TEXT,
  SMOKE_FINAL_TEXT,
  SMOKE_NO_BASH_TEXT,
  SMOKE_TITLE_TEXT,
} from './constants.mjs';

export function toolNames(tools) {
  return (Array.isArray(tools) ? tools : [])
    .map((tool) => tool?.function?.name || tool?.name)
    .filter(Boolean);
}

export function contentText(content) {
  if (typeof content === 'string') return content;
  return JSON.stringify(content ?? '');
}

export function decide(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const names = toolNames(body.tools);
  if (names.length === 0) return { phase: 'plain', text: SMOKE_TITLE_TEXT };
  const lastUser = [...messages].reverse().find((message) => message?.role === 'user');
  const prompt = contentText(lastUser?.content);
  if (prompt.includes(MOCK_SLOW_MARKER)) return { phase: 'slow', text: MOCK_SLOW_FINAL_TEXT };
  if (prompt.includes(MOCK_TABLE_MARKER)) return { phase: 'table', text: MOCK_TABLE_TEXT };
  if (!names.includes('bash')) return { phase: 'no_bash', text: SMOKE_NO_BASH_TEXT };
  if (!messages.some((message) => message?.role === 'tool')) return { phase: 'tool_call' };
  return { phase: 'final', text: SMOKE_FINAL_TEXT };
}
