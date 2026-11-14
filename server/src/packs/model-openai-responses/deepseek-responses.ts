import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { parseDataUrl, stringifyContent } from '@/common/utils/model-content.util';
import { isBlockedNetworkAddress, isCloudMetadataHost } from '@/common/utils/safe-download.util';
import type {
  ModelGatewayCapabilities,
  ModelGatewayMessage,
  ModelGatewayNativeWebSearchConfig,
  ModelGatewayReasoningControl,
  ModelGatewayReasoningEffort,
  ModelGatewayRequest,
  ModelGatewayUsage,
} from '@/modules/modelGateway/model-gateway.types';
import {
  mapModelGatewayReasoningEffort,
  shouldApplyModelGatewayReasoningEffort,
} from '@/modules/modelGateway/model-gateway.types';
import type { ModelStreamEvent } from '@/modules/modelGateway/model-stream';
import {
  mapGatewayMessagesToResponsesInput,
  mapOpenAIChatToolsToResponsesTools,
} from './responses-message.mapper';

export const DEEPSEEK_WEB_SEARCH_TOOL_NAME = 'deepseek_web_search';
export const DEEPSEEK_READ_URL_TOOL_NAME = 'deepseek_read_url';
export const MAX_DEEPSEEK_HOSTED_WEB_STEPS = 6;

const MAX_FILE_CACHE_ENTRIES = 128;
const FILE_CACHE_TTL_MS = 50 * 60 * 1000;
const DEEPSEEK_FILE_EXPIRES_SECONDS = '3600';
const FILE_UPLOAD_TIMEOUT_MS = 120_000;
const WEB_TOOL_TIMEOUT_MS = 30_000;
const MAX_FETCH_MARKDOWN_CHARS = 24_000;
const MAX_SEARCH_QUERIES_PER_CALL = 4;
const MAX_SEARCH_QUERY_CODEPOINTS = 128;

interface CachedDeepSeekFileEntry {
  fileId: string;
  expiresAtMs: number;
}

const deepSeekFileIdCache = new Map<string, CachedDeepSeekFileEntry>();

export const DEEPSEEK_RESPONSES_REASONING_CONTROL: ModelGatewayReasoningControl = {
  levels: ['off', 'low', 'high', 'max'],
  defaultLevel: 'high',
};

export interface DeepSeekResponsesProviderState {
  protocol: 'openai_responses';
  vendor: 'deepseek';
  model: string;
  /** 同一次助手轮中在客户端工具调用之前已内部闭环的原生联网子轮项（每轮含自身 reasoning + call + output） */
  priorSubturnItems: any[];
  /** 当前客户端工具调用子轮自身的非空 reasoning 输入项 */
  currentReasoningItem?: Record<string, unknown>;
  /** 与客户端工具调用同响应并发产生的内部原生联网 function_call 项 */
  coEmittedHostedCalls?: any[];
  /** 与客户端工具调用同响应并发产生的内部原生联网 function_call_output 项 */
  coEmittedHostedOutputs?: any[];
  /** 当前助手轮所有子轮是否均具备非空 reasoning_text */
  hasNonEmptyReasoning: boolean;
}

export interface DeepSeekPreparedRequest {
  body: any;
  /** 是否注入了由适配器内部代执的联网工具（客户端 function tools 存在时启用） */
  hostedWebToolNames: Set<string>;
}

export interface DeepSeekHostedWebExecutionResult {
  outputText: string;
  ok: boolean;
  queries: string[];
  sources: Array<{ type?: string; title?: string; url?: string }>;
}

export function clearDeepSeekFileCacheForTests(): void {
  deepSeekFileIdCache.clear();
}

export function isDeepSeekModelId(model: unknown): boolean {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();
  return /^deepseek-/i.test(normalized);
}

export function isDeepSeekFlashModel(model: unknown): boolean {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();
  return /^deepseek-(?:flash|v4(?:\.1)?-flash)/i.test(normalized);
}

export function isDeepSeekThinkingCapableModel(model: unknown, baseUrl?: unknown): boolean {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (/^deepseek-(?:chat|coder)(?:-|$)/i.test(normalized)) return false;
  return isDeepSeekModelId(normalized) || isDeepSeekBaseUrl(baseUrl);
}

export function isDeepSeekBaseUrl(baseUrl: unknown): boolean {
  const raw = String(baseUrl || '').trim();
  if (!raw) return false;
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    return hostname === 'api.deepseek.com' || hostname.endsWith('.deepseek.com');
  } catch {
    return raw.toLowerCase().includes('api.deepseek.com');
  }
}

export function isDeepSeekResponsesRequest(request: ModelGatewayRequest): boolean {
  return isDeepSeekModelId(request.config.model) || isDeepSeekBaseUrl(request.config.baseUrl);
}

export function isDeepSeekWebSearchAllowed(
  request: ModelGatewayRequest,
  nativeWebSearch?: ModelGatewayNativeWebSearchConfig,
): boolean {
  if (!nativeWebSearch?.enabled || nativeWebSearch.mode === 'off') return false;
  if (
    request.purpose === 'context_compaction' ||
    request.purpose === 'test_connection' ||
    request.purpose === 'chat_title' ||
    request.purpose === 'memory_write_extract'
  ) {
    return false;
  }
  if (request.toolChoice === 'none' || request.disableThinking === true) {
    return false;
  }
  return true;
}

export function isDeepSeekResponsesProviderState(
  value: unknown,
  expectedModel?: string,
): value is DeepSeekResponsesProviderState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DeepSeekResponsesProviderState>;
  if (candidate.protocol !== 'openai_responses' || candidate.vendor !== 'deepseek') return false;
  if (!Array.isArray(candidate.priorSubturnItems)) return false;
  if (typeof candidate.hasNonEmptyReasoning !== 'boolean') return false;
  if (
    expectedModel &&
    typeof candidate.model === 'string' &&
    candidate.model.trim().toLowerCase() !== expectedModel.trim().toLowerCase()
  ) {
    return false;
  }
  return true;
}

export function mapDeepSeekResponsesInput(
  messages: ModelGatewayMessage[],
  model: string,
): {
  instructions?: string;
  input: any[];
  activeToolContinuationMissingReasoning: boolean;
} {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  const instructions: string[] = [];
  const input: any[] = [];
  let activeToolContinuationMissingReasoning = false;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === 'system') {
      const content = stringifyContent(message.content);
      if (content) instructions.push(content);
      continue;
    }

    if (message.role === 'tool') {
      const singleMapped = mapGatewayMessagesToResponsesInput([message]);
      input.push(...singleMapped.input);
      continue;
    }

    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
    const state = isDeepSeekResponsesProviderState(message.provider_state, model)
      ? message.provider_state
      : undefined;

    if (message.role === 'assistant' && hasToolCalls) {
      let pendingCoEmittedOutputs: any[] = [];
      if (index > lastUserIndex) {
        let stepHasReasoning = false;
        if (state) {
          if (state.priorSubturnItems.length > 0) {
            input.push(...structuredCloneItems(state.priorSubturnItems));
          }
          if (state.currentReasoningItem) {
            input.push(structuredCloneItems([state.currentReasoningItem])[0]);
          }
          stepHasReasoning = state.hasNonEmptyReasoning;
          if (state.coEmittedHostedOutputs?.length) {
            pendingCoEmittedOutputs = structuredCloneItems(state.coEmittedHostedOutputs);
          }
        } else if (
          typeof message.reasoning_content === 'string' &&
          message.reasoning_content.length > 0
        ) {
          input.push(buildReasoningInputItem(message.reasoning_content));
          stepHasReasoning = true;
        }
        if (!stepHasReasoning) {
          activeToolContinuationMissingReasoning = true;
        }
      }
      const singleMapped = mapGatewayMessagesToResponsesInput([message]);
      input.push(...singleMapped.input);
      if (index > lastUserIndex && state?.coEmittedHostedCalls?.length) {
        input.push(...structuredCloneItems(state.coEmittedHostedCalls));
      }
      if (pendingCoEmittedOutputs.length > 0) {
        input.push(...pendingCoEmittedOutputs);
      }
      continue;
    }

    const singleMapped = mapGatewayMessagesToResponsesInput([message]);
    input.push(...singleMapped.input);
  }

  return {
    instructions: instructions.length ? instructions.join('\n\n') : undefined,
    input,
    activeToolContinuationMissingReasoning,
  };
}

export function buildReasoningInputItem(text: string): Record<string, unknown> {
  return {
    type: 'reasoning',
    content: [{ type: 'reasoning_text', text }],
  };
}

export function prepareDeepSeekResponsesRequest(
  request: ModelGatewayRequest,
  stream: boolean,
  nativeWebSearch?: ModelGatewayNativeWebSearchConfig,
): DeepSeekPreparedRequest {
  const isContextCompaction = request.purpose === 'context_compaction';
  const additionalParams = isContextCompaction ? {} : request.config.additionalParams || {};
  const mapped = mapDeepSeekResponsesInput(request.messages, request.config.model);
  const functionTools = isContextCompaction
    ? []
    : mapOpenAIChatToolsToResponsesTools(request.tools);

  const webSearchAllowed = isDeepSeekWebSearchAllowed(request, nativeWebSearch);
  const hostedWebToolNames = new Set<string>();
  const hostedTools: any[] = [];

  if (webSearchAllowed) {
    if (functionTools.length === 0) {
      if (isDeepSeekFlashModel(request.config.model)) {
        hostedTools.push(
          { type: DEEPSEEK_WEB_SEARCH_TOOL_NAME },
          { type: DEEPSEEK_READ_URL_TOOL_NAME },
        );
      } else {
        hostedTools.push({ type: 'web_search' });
      }
    } else {
      const existingNames = new Set(
        functionTools.map(tool => String(tool?.name || '').trim()).filter(Boolean),
      );
      for (const standaloneTool of buildDeepSeekStandaloneWebFunctionTools()) {
        if (!existingNames.has(standaloneTool.name)) {
          hostedWebToolNames.add(standaloneTool.name);
          hostedTools.push(standaloneTool);
        }
      }
    }
  }

  const tools = [...functionTools, ...hostedTools];
  const body: any = {
    ...additionalParams,
    model: request.config.model,
    input: mapped.input,
    instructions: mapped.instructions,
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? resolveDeepSeekToolChoice(request.toolChoice) : undefined,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    stream,
    store: false,
  };

  if (request.maxTokens) {
    body.max_output_tokens = request.maxTokens;
  }

  applyDeepSeekResponsesReasoning(body, request, {
    activeToolContinuationMissingReasoning: mapped.activeToolContinuationMissingReasoning,
  });

  if (
    request.purpose === 'test_connection' &&
    body.max_output_tokens &&
    request.config.capabilities?.reasoning !== 'none' &&
    isDeepSeekThinkingCapableModel(request.config.model, request.config.baseUrl) &&
    body.reasoning?.effort !== 'none'
  ) {
    // DeepSeek Responses 的 max_output_tokens 同时覆盖 reasoning_tokens 与正文输出；
    // 探针默认 512 上限在默认 high / max 思考档位或 PDF/图片探针下容易在输出正文前耗尽。
    body.max_output_tokens = Math.max(Number(body.max_output_tokens) || 0, 4096);
  }

  return { body, hostedWebToolNames };
}

export function applyDeepSeekResponsesReasoning(
  body: any,
  request: ModelGatewayRequest,
  options: { activeToolContinuationMissingReasoning?: boolean } = {},
): void {
  if (request.config.capabilities?.reasoning === 'none') return;
  if (!isDeepSeekThinkingCapableModel(request.config.model, request.config.baseUrl)) return;

  const setEffort = (effort: 'none' | 'low' | 'high' | 'max') => {
    const current =
      body.reasoning && typeof body.reasoning === 'object' && !Array.isArray(body.reasoning)
        ? body.reasoning
        : {};
    body.reasoning = { ...current, effort };
  };

  if (options.activeToolContinuationMissingReasoning) {
    setEffort('none');
    return;
  }

  if (request.purpose === 'context_compaction') {
    setEffort('none');
    return;
  }

  const effort = request.config.reasoningEffort;
  if (!shouldApplyModelGatewayReasoningEffort(effort)) {
    if (request.disableThinking) {
      setEffort('none');
    }
    return;
  }

  const mappedEffort = mapModelGatewayReasoningEffort(effort, request.config.capabilities);
  if (mappedEffort === null) return;

  if (request.purpose === 'test_connection') {
    const probeEffort = mapDeepSeekProbeEffort(effort, mappedEffort, request.config.capabilities);
    if (!probeEffort) return;
    setEffort(probeEffort);
    return;
  }

  setEffort(mapDeepSeekRuntimeEffort(effort, mappedEffort));
}

function mapDeepSeekProbeEffort(
  effort: ModelGatewayReasoningEffort,
  mappedEffort: string,
  capabilities?: ModelGatewayCapabilities | null,
): 'none' | 'low' | 'high' | 'max' | undefined {
  const explicitLevelMap = capabilities?.reasoningControl?.levelMap;
  const hasExplicitMapping =
    explicitLevelMap && Object.prototype.hasOwnProperty.call(explicitLevelMap, effort);

  if (effort === 'off' || mappedEffort === 'off' || mappedEffort === 'none') return 'none';
  if (effort === 'low' && mappedEffort === 'low') return 'low';
  if (effort === 'high' && mappedEffort === 'high') return 'high';
  if (effort === 'max' && mappedEffort === 'max') return 'max';
  if (
    hasExplicitMapping &&
    (mappedEffort === 'low' || mappedEffort === 'high' || mappedEffort === 'max')
  ) {
    return mappedEffort;
  }
  return undefined;
}

function mapDeepSeekRuntimeEffort(
  effort: ModelGatewayReasoningEffort,
  mappedEffort: string,
): 'none' | 'low' | 'high' | 'max' {
  const target = mappedEffort || effort;
  switch (target) {
    case 'off':
    case 'none':
      return 'none';
    case 'minimal':
    case 'low':
      return 'low';
    case 'xhigh':
    case 'max':
      return 'max';
    case 'medium':
    case 'high':
    default:
      return 'high';
  }
}

function resolveDeepSeekToolChoice(toolChoice: ModelGatewayRequest['toolChoice']): any {
  if (toolChoice === 'none') return 'none';
  if (toolChoice === 'required') return 'required';
  return 'auto';
}

function buildDeepSeekStandaloneWebFunctionTools(): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: null;
}> {
  return [
    {
      type: 'function',
      name: DEEPSEEK_WEB_SEARCH_TOOL_NAME,
      description:
        'Search public web pages via DeepSeek native web search engine for current facts, documentation, news, or verification. Pass 1 to 4 concise search queries.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' },
            description:
              '1 to 4 search queries (supports site:, -site:, after:, before:, lang:, and exact quotes).',
          },
        },
        required: ['queries'],
      },
      strict: null,
    },
    {
      type: 'function',
      name: DEEPSEEK_READ_URL_TOOL_NAME,
      description:
        'Read the full Markdown content of a public http:// or https:// web page URL via DeepSeek native web fetch.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Public http:// or https:// URL to fetch and read.',
          },
        },
        required: ['url'],
      },
      strict: null,
    },
  ];
}

export function deriveDeepSeekApiRootUrl(sdkBaseUrl: string): string {
  const parsed = new URL(sdkBaseUrl);
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = cleanPath.endsWith('/v1') ? cleanPath.slice(0, -3) || '/' : cleanPath || '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

/**
 * 将请求输入中的内联 PDF (`input_file.file_data`) 上传至 DeepSeek Files API 并替换为 `file_id`。
 * 非探针请求使用有界 SHA-256 内存缓存避免多轮对话重复解析计费，且文件统一设置 1 小时自动过期；
 * 探针请求 (`test_connection`) 返回临时文件列表由调用方立即删除。
 */
export async function materializeDeepSeekInputFiles(input: {
  body: any;
  sdkBaseUrl: string;
  apiKey: string;
  purpose: ModelGatewayRequest['purpose'];
  signal?: AbortSignal;
}): Promise<{ body: any; temporaryFileIds: string[] }> {
  const { body, sdkBaseUrl, apiKey, purpose, signal } = input;
  if (!Array.isArray(body?.input) || body.input.length === 0) {
    return { body, temporaryFileIds: [] };
  }

  const hasInlineInputFile = (parts: unknown): parts is any[] =>
    Array.isArray(parts) &&
    parts.some((part: any) => part?.type === 'input_file' && part.file_data && !part.file_id);

  let hasInlineFile = false;
  for (const item of body.input) {
    if (
      hasInlineInputFile(item?.content) ||
      (item?.type === 'function_call_output' && hasInlineInputFile(item?.output))
    ) {
      hasInlineFile = true;
      break;
    }
  }
  if (!hasInlineFile) {
    return { body, temporaryFileIds: [] };
  }

  const apiRoot = deriveDeepSeekApiRootUrl(sdkBaseUrl);
  const temporaryFileIds: string[] = [];
  const isProbe = purpose === 'test_connection';
  const nextInput: any[] = [];

  const replaceParts = async (parts: any[]): Promise<{ parts: any[]; changed: boolean }> => {
    let changed = false;
    const nextParts: any[] = [];
    for (const part of parts) {
      if (part?.type === 'input_file' && typeof part.file_data === 'string' && !part.file_id) {
        const fileId = await uploadOrGetCachedDeepSeekPdf({
          apiRoot,
          apiKey,
          fileData: part.file_data,
          filename: typeof part.filename === 'string' ? part.filename : undefined,
          skipCache: isProbe,
          signal,
        });
        if (isProbe) temporaryFileIds.push(fileId);
        nextParts.push({ type: 'input_file', file_id: fileId });
        changed = true;
      } else {
        nextParts.push(part);
      }
    }
    return { parts: nextParts, changed };
  };

  for (const item of body.input) {
    if (Array.isArray(item?.content)) {
      const replaced = await replaceParts(item.content);
      nextInput.push(replaced.changed ? { ...item, content: replaced.parts } : item);
      continue;
    }
    if (item?.type === 'function_call_output' && Array.isArray(item?.output)) {
      const replaced = await replaceParts(item.output);
      nextInput.push(replaced.changed ? { ...item, output: replaced.parts } : item);
      continue;
    }
    nextInput.push(item);
  }

  return {
    body: { ...body, input: nextInput },
    temporaryFileIds,
  };
}

export async function deleteDeepSeekTemporaryFiles(input: {
  sdkBaseUrl: string;
  apiKey: string;
  fileIds: string[];
}): Promise<void> {
  if (!input.fileIds.length) return;
  const apiRoot = deriveDeepSeekApiRootUrl(input.sdkBaseUrl);
  await Promise.all(
    input.fileIds.map(async fileId => {
      try {
        await fetch(`${apiRoot}/v1/files/${encodeURIComponent(fileId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${input.apiKey}` },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        // 探针清理失败不阻断主结果，文件已带 expires_after 自动过期兜底
      }
    }),
  );
}

async function uploadOrGetCachedDeepSeekPdf(input: {
  apiRoot: string;
  apiKey: string;
  fileData: string;
  filename?: string;
  skipCache: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const parsed = parseDataUrl(input.fileData.trim());
  if (!parsed || parsed.mime !== 'application/pdf') {
    throw new Error('DeepSeek 文档输入仅支持 PDF dataUrl');
  }

  const now = Date.now();
  pruneExpiredFileCache(now);

  const keyDigest = createHash('sha256')
    .update(input.apiRoot)
    .update('\0')
    .update(createHash('sha256').update(input.apiKey).digest('hex'))
    .update('\0')
    .update(parsed.base64)
    .digest('hex');

  if (!input.skipCache) {
    const cached = deepSeekFileIdCache.get(keyDigest);
    if (cached && cached.expiresAtMs > now) {
      return cached.fileId;
    }
  }

  const pdfBytes = Buffer.from(parsed.base64, 'base64');
  const safeName = sanitizeUploadFilename(input.filename);
  const form = new FormData();
  // DeepSeek Files API 要求 purpose 字段必须排在 file 字段之前
  form.append('purpose', 'rich_layout_recognition');
  form.append('expires_after[anchor]', 'created_at');
  form.append('expires_after[seconds]', DEEPSEEK_FILE_EXPIRES_SECONDS);
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), safeName);

  const response = await fetch(`${input.apiRoot}/v1/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: form,
    redirect: 'error',
    signal: combineAbortSignals(input.signal, FILE_UPLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw Object.assign(
      new Error(`DeepSeek 文档上传解析失败: HTTP ${response.status}${detail ? ` ${detail}` : ''}`),
      { status: response.status },
    );
  }

  const data = (await response.json()) as { id?: unknown };
  const fileId = typeof data?.id === 'string' ? data.id.trim() : '';
  if (!fileId) {
    throw new Error('DeepSeek 文档上传未返回有效 file_id');
  }

  if (!input.skipCache) {
    if (deepSeekFileIdCache.size >= MAX_FILE_CACHE_ENTRIES) {
      const oldestKey = deepSeekFileIdCache.keys().next().value;
      if (oldestKey) deepSeekFileIdCache.delete(oldestKey);
    }
    deepSeekFileIdCache.set(keyDigest, {
      fileId,
      expiresAtMs: now + FILE_CACHE_TTL_MS,
    });
  }

  return fileId;
}

function pruneExpiredFileCache(now: number): void {
  for (const [key, entry] of deepSeekFileIdCache.entries()) {
    if (entry.expiresAtMs <= now) {
      deepSeekFileIdCache.delete(key);
    }
  }
}

function sanitizeUploadFilename(filename?: string): string {
  const cleaned = String(filename || 'document.pdf')
    .replace(/[\r\n"\\/]+/g, '_')
    .trim()
    .slice(0, 120);
  if (!cleaned) return 'document.pdf';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

export function parseDeepSeekHostedWebArgs(
  toolName: string,
  rawArgs: string,
): { queries: string[]; url?: string } {
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawArgs || '{}');
  } catch {
    parsed = {};
  }
  if (toolName === DEEPSEEK_READ_URL_TOOL_NAME) {
    const url = typeof parsed?.url === 'string' ? parsed.url.trim() : '';
    return { queries: url ? [url] : [], url };
  }
  const rawQueries = Array.isArray(parsed?.queries)
    ? parsed.queries
    : typeof parsed?.query === 'string'
      ? [parsed.query]
      : [];
  const queries: string[] = [];
  for (const item of rawQueries) {
    if (typeof item !== 'string') continue;
    const normalized = truncateUnicodeCodePoints(item.trim(), MAX_SEARCH_QUERY_CODEPOINTS);
    if (normalized && !queries.includes(normalized)) {
      queries.push(normalized);
      if (queries.length >= MAX_SEARCH_QUERIES_PER_CALL) break;
    }
  }
  return { queries };
}

export async function executeDeepSeekHostedWebCall(input: {
  toolName: string;
  rawArguments: string;
  sdkBaseUrl: string;
  apiKey: string;
  oriQuestion?: string;
  signal?: AbortSignal;
}): Promise<DeepSeekHostedWebExecutionResult> {
  const apiRoot = deriveDeepSeekApiRootUrl(input.sdkBaseUrl);
  const parsed = parseDeepSeekHostedWebArgs(input.toolName, input.rawArguments);

  if (input.toolName === DEEPSEEK_READ_URL_TOOL_NAME) {
    const safeUrl = validatePublicWebUrl(parsed.url || '');
    if (!safeUrl) {
      return {
        ok: false,
        queries: [],
        sources: [],
        outputText: JSON.stringify({
          error: 'url_not_allowed',
          message: '仅允许读取公开的 HTTP/HTTPS 网页地址。',
        }),
      };
    }

    try {
      const response = await fetch(`${apiRoot}/v1/tools/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({ url: safeUrl }),
        redirect: 'error',
        signal: combineAbortSignals(input.signal, WEB_TOOL_TIMEOUT_MS),
      });
      if (!response.ok) {
        return {
          ok: false,
          queries: [safeUrl],
          sources: [{ type: 'url', url: safeUrl }],
          outputText: JSON.stringify({
            error: `http_${response.status}`,
            url: safeUrl,
          }),
        };
      }
      const page = (await response.json()) as { title?: unknown; content?: unknown };
      const title = typeof page?.title === 'string' ? page.title.trim() : '';
      const rawContent = typeof page?.content === 'string' ? page.content : '';
      const content =
        rawContent.length > MAX_FETCH_MARKDOWN_CHARS
          ? `${rawContent.slice(0, MAX_FETCH_MARKDOWN_CHARS)}\n\n[正文已截断]`
          : rawContent;
      return {
        ok: true,
        queries: [safeUrl],
        sources: [{ type: 'url', url: safeUrl, ...(title ? { title } : {}) }],
        outputText: JSON.stringify({ url: safeUrl, title, content }),
      };
    } catch (error) {
      if (input.signal?.aborted) throw error;
      return {
        ok: false,
        queries: [safeUrl],
        sources: [{ type: 'url', url: safeUrl }],
        outputText: JSON.stringify({ error: 'unavailable', url: safeUrl }),
      };
    }
  }

  if (parsed.queries.length === 0) {
    return {
      ok: false,
      queries: [],
      sources: [],
      outputText: JSON.stringify({ error: 'empty_query', results: [] }),
    };
  }

  const oriQuestion = input.oriQuestion
    ? truncateUnicodeCodePoints(input.oriQuestion.trim(), MAX_SEARCH_QUERY_CODEPOINTS)
    : '';

  try {
    const queryBatches = await Promise.all(
      parsed.queries.map(async query => {
        const response = await fetch(`${apiRoot}/v1/tools/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            query,
            count: 6,
            need_content: false,
            ...(oriQuestion ? { ori_question: oriQuestion } : {}),
          }),
          redirect: 'error',
          signal: combineAbortSignals(input.signal, WEB_TOOL_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { results?: unknown[] };
        const items = Array.isArray(payload?.results) ? payload.results : [];
        return { query, items };
      }),
    );

    const sources: Array<{ type?: string; title?: string; url?: string }> = [];
    const formattedGroups = queryBatches.map(({ query, items }) => ({
      query,
      results: items.slice(0, 6).flatMap((raw: any) => {
        const safeUrl = toSafeHttpUrl(raw?.url);
        const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
        if (!safeUrl && !title) return [];
        if (safeUrl && !sources.some(item => item.url === safeUrl)) {
          sources.push({
            type: 'url',
            ...(title ? { title } : {}),
            url: safeUrl,
          });
        }
        return [
          {
            title,
            ...(safeUrl ? { url: safeUrl } : {}),
            ...(typeof raw?.site_name === 'string' && raw.site_name
              ? { siteName: raw.site_name }
              : {}),
            ...(typeof raw?.date === 'string' && raw.date ? { publishedAt: raw.date } : {}),
            summary:
              typeof raw?.summary === 'string' && raw.summary.trim()
                ? raw.summary.trim()
                : typeof raw?.snippet === 'string'
                  ? raw.snippet.trim()
                  : '',
          },
        ];
      }),
    }));

    return {
      ok: true,
      queries: parsed.queries,
      sources,
      outputText: JSON.stringify({ searches: formattedGroups }),
    };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return {
      ok: false,
      queries: parsed.queries,
      sources: [],
      outputText: JSON.stringify({ error: 'search_failed', queries: parsed.queries }),
    };
  }
}

export function buildDeepSeekHostedToolEvent(input: {
  id: string;
  toolName: string;
  status: 'running' | 'searching' | 'success' | 'error';
  queries: string[];
  sources: Array<{ type?: string; title?: string; url?: string }>;
  update?: boolean;
}): ModelStreamEvent {
  const isReadUrl = input.toolName === DEEPSEEK_READ_URL_TOOL_NAME;
  const displayName = isReadUrl ? '网页阅读' : '联网搜索';
  const sources = input.sources.slice(0, 10);
  const primaryQuery = input.queries.find(q => q.trim());
  const queryLines = input.queries
    .slice(0, 4)
    .map((q, index) => `${index + 1}. ${q}`)
    .join('\n');
  const sourceLines = sources
    .map(
      (item, index) => `${index + 1}. ${item.title || item.url}${item.url ? `\n${item.url}` : ''}`,
    )
    .join('\n');
  const markdown = [
    queryLines ? `${isReadUrl ? '目标链接' : '搜索查询'}：\n${queryLines}` : '',
    sourceLines ? `${isReadUrl ? '网页信息' : '搜索来源'}：\n${sourceLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const statusText =
    input.status === 'running'
      ? isReadUrl
        ? '准备读取网页内容'
        : '准备调用 DeepSeek 原生搜索'
      : input.status === 'searching'
        ? isReadUrl
          ? '正在读取公开网页'
          : '正在搜索公开网页'
        : input.status === 'error'
          ? isReadUrl
            ? '网页读取失败'
            : 'DeepSeek 原生搜索失败'
          : isReadUrl
            ? '网页内容读取完成'
            : sources.length
              ? `搜索完成，找到 ${sources.length} 个网页来源`
              : 'DeepSeek 原生搜索完成';

  return {
    type: 'hosted_tool_call',
    toolCall: {
      id: input.id,
      name: input.toolName,
      displayName,
      type: 'search',
      status: input.status,
      ...(input.update ? { update: true } : {}),
      inputSummary: primaryQuery
        ? `${isReadUrl ? '读取' : '搜索'}：${primaryQuery}`
        : isReadUrl
          ? '网页阅读'
          : '网页检索',
      output: {
        summary: statusText,
        queries: [...input.queries],
        results: sources,
        sources,
      },
      display: {
        title: displayName,
        summary: statusText,
        ...(markdown ? { markdown } : {}),
        json: { queries: [...input.queries], results: sources, sources },
      },
    },
  };
}

export function extractLatestUserQuestion(messages: ModelGatewayMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      const text = stringifyContent(messages[i].content).trim();
      return text || undefined;
    }
  }
  return undefined;
}

export function accumulateResponsesUsage(
  current: ModelGatewayUsage | undefined,
  next: ModelGatewayUsage,
): ModelGatewayUsage {
  if (!current) return { ...next };
  const inputTokens = current.inputTokens + next.inputTokens;
  const outputTokens = current.outputTokens + next.outputTokens;
  const totalTokens = current.totalTokens + next.totalTokens;
  const cacheHitTokens = (current.cacheHitTokens || 0) + (next.cacheHitTokens || 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheHitTokens,
    cacheMissTokens: cacheHitTokens > 0 ? Math.max(inputTokens - cacheHitTokens, 0) : 0,
  };
}

export function toSafeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 8192 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function validatePublicWebUrl(raw: string): string | undefined {
  const safe = toSafeHttpUrl(raw);
  if (!safe) return undefined;
  const parsed = new URL(safe);
  const host = parsed.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isCloudMetadataHost(host)
  ) {
    return undefined;
  }
  if (isIP(host) && isBlockedNetworkAddress(host)) return undefined;
  return safe;
}

function truncateUnicodeCodePoints(value: string, maxCodePoints: number): string {
  const points = Array.from(value);
  return points.length <= maxCodePoints ? value : points.slice(0, maxCodePoints).join('');
}

function combineAbortSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return signal;
}

function structuredCloneItems<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items));
}
