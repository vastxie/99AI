import { Injectable } from '@nestjs/common';
import { OPENAI_RESPONSES_PROFILES } from './openai-responses.profiles';
import type { ModelProtocolDescriptor } from '@/modules/modelGateway/model-stream';
import {
  ModelStreamRegistry,
  toClassifiedProviderError,
} from '@/modules/modelGateway/model-stream';
import OpenAI from 'openai';
import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import {
  assertNoReservedAdditionalParams,
  getOpenAINativeWebSearchConfig,
  ModelGatewayReasoningEffort,
  ModelGatewayRequest,
  ModelGatewayUsage,
  mapModelGatewayReasoningEffort,
  shouldApplyModelGatewayReasoningEffort,
} from '@/modules/modelGateway/model-gateway.types';
import type { ModelGatewayNativeWebSearchConfig } from '@/modules/modelGateway/model-gateway.types';
import type {
  ModelCompleteResult,
  ModelStreamAdapter,
  ModelStreamEvent,
  ModelStreamInput,
  ModelStreamRuntimeConfig,
} from '@/modules/modelGateway/model-stream';
import {
  mapGatewayMessagesToResponsesInput,
  mapOpenAIChatToolsToResponsesTools,
} from './responses-message.mapper';

export const OPENAI_RESPONSES_PROTOCOL = 'openai_responses';

/** OpenAI Responses 协议（含豆包方舟 Responses 兼容）；原生联网搜索由协议自身提供 */
export const OPENAI_RESPONSES_DESCRIPTOR: ModelProtocolDescriptor = {
  protocol: OPENAI_RESPONSES_PROTOCOL,
  label: 'OpenAI Responses',
  endpoints: {
    default: '/v1/responses',
    modelsList: '/v1/models',
    knownSuffixes: ['/responses', '/models'],
  },
  multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
  supportsNativeWebSearch: true,
  profiles: OPENAI_RESPONSES_PROFILES,
};

@Injectable()
export class OpenAIResponsesAdapter implements ModelStreamAdapter {
  readonly protocol = OPENAI_RESPONSES_PROTOCOL;
  readonly descriptor = OPENAI_RESPONSES_DESCRIPTOR;

  constructor(
    private readonly urlBuilder: ModelGatewayUrlBuilder,
    registry: ModelStreamRegistry,
  ) {
    registry.register(this);
  }

  async *stream(request: ModelStreamInput): AsyncGenerator<ModelStreamEvent> {
    try {
      const gatewayRequest = request as ModelGatewayRequest;
      const client = this.createClient(gatewayRequest);
      const stream = await client.responses.create(this.buildRequestBody(gatewayRequest, true), {
        signal: request.signal,
      });

      let finalFinishReason: string | undefined;
      let finalUsage: ModelGatewayUsage | undefined;
      let terminalObserved = false;
      const toolNames = new Map<number, string>();
      const toolIds = new Map<number, string>();
      const reasoningDeltaKeys = new Set<string>();
      const webSearchState = createWebSearchState();

      for await (const event of stream as any) {
        switch (event.type) {
          case 'response.output_text.delta':
            if (event.delta) yield { type: 'text_delta', delta: event.delta };
            break;
          case 'response.reasoning.delta':
          case 'response.reasoning_summary.delta':
            if (event.delta) {
              reasoningDeltaKeys.add(reasoningEventKey(event));
              yield { type: 'reasoning_delta', delta: stringifyDelta(event.delta) };
            }
            break;
          case 'response.reasoning_summary_text.delta':
            if (event.delta) {
              reasoningDeltaKeys.add(reasoningEventKey(event));
              yield { type: 'reasoning_delta', delta: event.delta };
            }
            break;
          case 'response.reasoning_summary_part.done':
            if (event.part?.text && !reasoningDeltaKeys.has(reasoningEventKey(event))) {
              yield { type: 'reasoning_delta', delta: event.part.text };
            }
            break;
          case 'response.reasoning.done':
          case 'response.reasoning_summary.done':
          case 'response.reasoning_summary_text.done':
            if (event.text && !reasoningDeltaKeys.has(reasoningEventKey(event))) {
              yield { type: 'reasoning_delta', delta: event.text };
            }
            break;
          case 'response.output_item.added':
            if (event.item?.type === 'function_call') {
              const index = event.output_index ?? 0;
              if (event.item.name) toolNames.set(index, event.item.name);
              if (event.item.call_id || event.item.id)
                toolIds.set(index, event.item.call_id || event.item.id);
              yield {
                type: 'tool_call_delta',
                index,
                id: event.item.call_id || event.item.id,
                nameDelta: event.item.name,
                rawName: event.item.name,
              };
            } else if (event.item?.type === 'web_search_call') {
              yield buildWebSearchToolEvent(webSearchState, event.item.id, 'running');
            }
            break;
          case 'response.output_item.done':
            if (event.item?.type === 'web_search_call') {
              webSearchState.seen = true;
              trackWebSearchProviderItem(webSearchState, event.item.id);
              collectWebSearchAction(webSearchState, event.item.action);
              if (event.item.status === 'failed') {
                yield buildWebSearchToolEvent(webSearchState, webSearchState.id, 'error');
              } else {
                yield buildWebSearchToolEvent(webSearchState, webSearchState.id, 'searching');
              }
            } else if (event.item?.type === 'message') {
              collectMessageAnnotations(webSearchState, event.item);
            }
            break;
          case 'response.web_search_call.in_progress':
            yield buildWebSearchToolEvent(webSearchState, event.item_id, 'running');
            break;
          case 'response.web_search_call.searching':
            yield buildWebSearchToolEvent(webSearchState, event.item_id, 'searching');
            break;
          case 'response.output_text.annotation.added':
          case 'response.output_text_annotation.added':
            collectWebCitation(webSearchState, event.annotation);
            if (webSearchState.seen) {
              yield buildWebSearchToolEvent(webSearchState, webSearchState.id, 'searching');
            }
            break;
          case 'response.web_search_call.completed':
            webSearchState.seen = true;
            trackWebSearchProviderItem(webSearchState, event.item_id);
            break;
          case 'response.function_call_arguments.delta': {
            const index = event.output_index ?? 0;
            yield {
              type: 'tool_call_delta',
              index,
              id: toolIds.get(index),
              argumentsDelta: event.delta || '',
              rawName: toolNames.get(index),
            };
            break;
          }
          case 'response.completed':
            terminalObserved = true;
            collectWebSearchOutput(webSearchState, event.response?.output);
            if (webSearchState.seen) {
              yield buildWebSearchToolEvent(webSearchState, webSearchState.id, 'success');
            }
            finalFinishReason = event.response?.status || 'completed';
            if (event.response?.usage) {
              finalUsage = this.normalizeUsage(event.response.usage);
              yield { type: 'usage', usage: finalUsage };
            }
            break;
          case 'response.failed':
            if (webSearchState.seen) {
              yield buildWebSearchToolEvent(webSearchState, webSearchState.id, 'error');
            }
            throw toClassifiedProviderError(event.response?.error || event, {
              requestOutcome: 'rejected',
            });
          case 'response.incomplete':
            terminalObserved = true;
            collectWebSearchOutput(webSearchState, event.response?.output);
            if (webSearchState.seen) {
              yield buildWebSearchToolEvent(webSearchState, webSearchState.id, 'success');
            }
            finalFinishReason = event.response?.incomplete_details?.reason || 'incomplete';
            if (event.response?.usage) {
              finalUsage = this.normalizeUsage(event.response.usage);
              yield { type: 'usage', usage: finalUsage };
            }
            break;
          case 'error':
            throw toClassifiedProviderError(event, { requestOutcome: 'rejected' });
        }
      }

      if (terminalObserved) {
        yield { type: 'done', finishReason: finalFinishReason };
      }
    } catch (error) {
      throw toClassifiedProviderError(error, { signal: request.signal });
    }
  }

  complete(request: ModelStreamInput): Promise<ModelCompleteResult> {
    return this.completeOnce(request as ModelGatewayRequest);
  }

  async completeOnce(request: ModelGatewayRequest): Promise<ModelCompleteResult> {
    try {
      const client = this.createClient(request);
      const response = await client.responses.create(this.buildRequestBody(request, false), {
        signal: request.signal,
      });
      return {
        content:
          typeof (response as any).output_text === 'string' ? (response as any).output_text : '',
        usage: (response as any).usage ? this.normalizeUsage((response as any).usage) : undefined,
      };
    } catch (error) {
      throw toClassifiedProviderError(error, { signal: request.signal });
    }
  }

  async listRemoteModels(config: ModelStreamRuntimeConfig): Promise<any[]> {
    const url = this.urlBuilder.build({
      protocol: config.protocol as any,
      baseUrl: config.baseUrl,
      model: config.model,
      operation: 'models_list',
    }).url;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`远程模型列表获取失败: HTTP ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data?.data) ? data.data : [];
  }

  buildRequestBody(request: ModelGatewayRequest, stream: boolean): any {
    const isContextCompaction = request.purpose === 'context_compaction';
    const additionalParams = isContextCompaction ? {} : request.config.additionalParams || {};
    assertNoReservedAdditionalParams(additionalParams);
    assertNoResponsesState(additionalParams);
    const mapped = mapGatewayMessagesToResponsesInput(request.messages);
    const functionTools = isContextCompaction
      ? []
      : mapOpenAIChatToolsToResponsesTools(request.tools);
    const nativeWebSearch = isContextCompaction
      ? undefined
      : getOpenAINativeWebSearchConfig(request.config.capabilities);
    const hostedTools = buildOpenAINativeTools(nativeWebSearch);
    const tools = [...functionTools, ...hostedTools];
    const include = buildOpenAIResponsesInclude(additionalParams.include, nativeWebSearch);
    const body: any = {
      ...additionalParams,
      model: request.config.model,
      input: mapped.input,
      instructions: mapped.instructions,
      tools: tools.length ? tools : undefined,
      tool_choice: resolveOpenAIToolChoice(request.toolChoice, nativeWebSearch, tools.length),
      include,
      // 不设默认温度：没指定时使用模型服务自己的默认值
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      stream,
      store: false,
    };
    if (request.maxTokens) {
      body.max_output_tokens = request.maxTokens;
    }
    this.applyReasoningEffort(body, request);
    return body;
  }

  private applyReasoningEffort(body: any, request: ModelGatewayRequest): void {
    const effort = request.config.reasoningEffort;
    if (!shouldApplyModelGatewayReasoningEffort(effort)) return;
    if (!supportsOpenAIResponsesReasoningEffort(request)) return;
    const mappedEffort = mapModelGatewayReasoningEffort(effort, request.config.capabilities);
    if (mappedEffort === null) return;

    const currentReasoning =
      body.reasoning && typeof body.reasoning === 'object' && !Array.isArray(body.reasoning)
        ? body.reasoning
        : {};

    body.reasoning = {
      ...currentReasoning,
      effort:
        effort === 'off' || mappedEffort === 'off'
          ? 'none'
          : mappedEffort === effort
            ? mapOpenAIResponsesReasoningEffort(request.config.model, effort)
            : mappedEffort,
    };
  }

  private createClient(request: ModelGatewayRequest): OpenAI {
    const urlResult = this.urlBuilder.build({
      protocol: request.config.protocol,
      baseUrl: request.config.baseUrl,
      endpointPath: request.config.endpointPath,
      model: request.config.model,
      operation: request.stream ? 'stream' : 'non_stream',
    });
    return new OpenAI({
      apiKey: request.config.apiKey,
      baseURL: deriveOpenAIResponsesSdkBaseUrl(urlResult.url),
      maxRetries: 0,
    });
  }

  private normalizeUsage(usage: any): ModelGatewayUsage {
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;
    const cacheHitTokens = usage.input_tokens_details?.cached_tokens || 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens,
      cacheHitTokens,
      cacheMissTokens: cacheHitTokens > 0 ? Math.max(inputTokens - cacheHitTokens, 0) : 0,
    };
  }
}

function supportsOpenAIResponsesReasoningEffort(request: ModelGatewayRequest): boolean {
  if (request.config.capabilities?.reasoning === 'none') return false;
  return /^o[134](?:-|$)|^gpt-5(?:\.|-|$)/i.test(String(request.config.model || '').trim());
}

function stringifyDelta(delta: unknown): string {
  if (typeof delta === 'string') return delta;
  if (delta === null || delta === undefined) return '';
  return JSON.stringify(delta);
}

function mapOpenAIResponsesReasoningEffort(
  model: string,
  effort: ModelGatewayReasoningEffort,
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  switch (effort) {
    case 'minimal':
      return supportsOpenAIXHighReasoning(model) ? 'minimal' : 'low';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'xhigh':
      return supportsOpenAIXHighReasoning(model) ? 'xhigh' : 'high';
    case 'max':
      return supportsOpenAIXHighReasoning(model) ? 'xhigh' : 'high';
    case 'high':
    case 'off':
    default:
      return 'high';
  }
}

function supportsOpenAIXHighReasoning(model: string): boolean {
  return /^gpt-5(?:\.|-|$)/i.test(String(model || ''));
}

function reasoningEventKey(event: any): string {
  return [
    event.output_index ?? 'output',
    event.item_id ?? event.item?.id ?? 'item',
    event.summary_index ?? event.content_index ?? event.index ?? 'summary',
  ].join(':');
}

function assertNoResponsesState(additionalParams: Record<string, unknown>): void {
  const blocked = ['previous_response_id', 'conversation', 'store'].filter(
    key => key in additionalParams,
  );
  if (blocked.length) {
    throw new Error(`additionalParams 包含 OpenAI Responses 状态字段: ${blocked.join(', ')}`);
  }
}

function buildOpenAINativeTools(config?: ModelGatewayNativeWebSearchConfig): any[] {
  if (!config) return [];
  const tool: Record<string, unknown> = {
    type: config.toolType || 'web_search',
  };
  if (config.searchContextSize) tool.search_context_size = config.searchContextSize;
  if (config.filters && typeof config.filters === 'object') tool.filters = config.filters;
  if (config.returnTokenBudget) tool.return_token_budget = config.returnTokenBudget;
  if (Array.isArray(config.searchContentTypes) && config.searchContentTypes.length) {
    tool.search_content_types = config.searchContentTypes;
  }
  if (typeof config.externalWebAccess === 'boolean') {
    tool.external_web_access = config.externalWebAccess;
  }
  if (config.userLocation && typeof config.userLocation === 'object') {
    tool.user_location = config.userLocation;
  }
  return [tool];
}

function buildOpenAIResponsesInclude(
  existingInclude: unknown,
  nativeWebSearch?: ModelGatewayNativeWebSearchConfig,
): string[] | undefined {
  const values = Array.isArray(existingInclude)
    ? existingInclude.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : typeof existingInclude === 'string' && existingInclude.trim()
      ? [existingInclude.trim()]
      : [];
  if (nativeWebSearch && nativeWebSearch.includeSources !== false) {
    values.push('web_search_call.action.sources');
  }
  const deduped = Array.from(new Set(values));
  return deduped.length ? deduped : undefined;
}

function resolveOpenAIToolChoice(
  requestToolChoice: ModelGatewayRequest['toolChoice'],
  nativeWebSearch: ModelGatewayNativeWebSearchConfig | undefined,
  toolCount: number,
): any {
  if (!toolCount) return undefined;
  if (nativeWebSearch?.mode === 'force') {
    return { type: nativeWebSearch.toolType || 'web_search' };
  }
  return requestToolChoice || 'auto';
}

interface WebSearchCitation {
  title?: string;
  url?: string;
}

interface WebSearchSource {
  type?: string;
  title?: string;
  url?: string;
}

interface WebSearchToolState {
  id: string;
  seen: boolean;
  providerItemIds: string[];
  queries: string[];
  citations: WebSearchCitation[];
  sources: WebSearchSource[];
}

function createHostedToolCallId(): string {
  return `hosted_web_search_${Date.now().toString(36)}`;
}

function createWebSearchState(): WebSearchToolState {
  return {
    id: createHostedToolCallId(),
    seen: false,
    providerItemIds: [],
    queries: [],
    citations: [],
    sources: [],
  };
}

function collectWebCitation(state: WebSearchToolState, annotation: unknown): void {
  if (!annotation || typeof annotation !== 'object') return;
  const value = annotation as Record<string, unknown>;
  if (value.type !== 'url_citation') return;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!url && !title) return;
  if (url && state.citations.some(item => item.url === url)) return;
  state.citations.push({
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
  });
}

function collectWebSearchOutput(state: WebSearchToolState, output: unknown): void {
  if (!Array.isArray(output)) return;
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (value.type === 'web_search_call') {
      state.seen = true;
      trackWebSearchProviderItem(state, value.id);
      collectWebSearchAction(state, value.action);
    }
    if (value.type === 'message') {
      collectMessageAnnotations(state, value);
    }
  }
}

function collectMessageAnnotations(
  state: WebSearchToolState,
  message: Record<string, unknown>,
): void {
  if (!Array.isArray(message.content)) return;
  for (const part of message.content) {
    if (!part || typeof part !== 'object') continue;
    const annotations = (part as Record<string, unknown>).annotations;
    if (!Array.isArray(annotations)) continue;
    for (const annotation of annotations) {
      collectWebCitation(state, annotation);
    }
  }
}

function collectWebSearchAction(state: WebSearchToolState, action: unknown): void {
  if (!action || typeof action !== 'object') return;
  const value = action as Record<string, unknown>;
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  if (query) addUniqueString(state.queries, query);
  if (Array.isArray(value.queries)) {
    for (const item of value.queries) {
      if (typeof item === 'string' && item.trim()) addUniqueString(state.queries, item.trim());
    }
  }
  if (typeof value.url === 'string' && value.url.trim()) {
    addUniqueSource(state.sources, {
      type: 'url',
      url: value.url.trim(),
    });
  }
  if (Array.isArray(value.sources)) {
    for (const source of value.sources) {
      collectWebSearchSource(state, source);
    }
  }
}

function collectWebSearchSource(state: WebSearchToolState, source: unknown): void {
  if (!source || typeof source !== 'object') return;
  const value = source as Record<string, unknown>;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const type = typeof value.type === 'string' ? value.type.trim() : '';
  if (!url && !title) return;
  addUniqueSource(state.sources, {
    ...(type ? { type } : {}),
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
  });
}

function addUniqueString(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function addUniqueSource(values: WebSearchSource[], value: WebSearchSource): void {
  if (value.url && values.some(item => item.url === value.url)) return;
  if (!value.url && value.title && values.some(item => item.title === value.title)) return;
  values.push(value);
}

function trackWebSearchProviderItem(state: WebSearchToolState, id: unknown): void {
  if (typeof id !== 'string' || !id.trim()) return;
  const providerId = id.trim();
  if (providerId === state.id) return;
  addUniqueString(state.providerItemIds, providerId);
}

function buildWebSearchToolEvent(
  state: WebSearchToolState,
  id: unknown,
  status: 'running' | 'searching' | 'success' | 'error',
): ModelStreamEvent {
  trackWebSearchProviderItem(state, id);
  const toolCallId = state.id;
  state.seen = true;
  const citations = state.citations.slice(0, 10);
  const sources = state.sources
    .filter(source => !source.url || !citations.some(citation => citation.url === source.url))
    .slice(0, 10);
  const queryLines = state.queries
    .slice(0, 3)
    .map((query, index) => `${index + 1}. ${query}`)
    .join('\n');
  const sourceLines = [...citations, ...sources]
    .map(
      (item, index) => `${index + 1}. ${item.title || item.url}${item.url ? `\n${item.url}` : ''}`,
    )
    .join('\n');
  const markdown = [
    queryLines ? `搜索查询：\n${queryLines}` : '',
    sourceLines ? `搜索来源：\n${sourceLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const sourceCount = citations.length + sources.length;
  const primaryQuery = state.queries.find(query => query.trim());
  const statusText =
    status === 'running'
      ? '准备调用 OpenAI 原生搜索'
      : status === 'searching'
        ? sourceCount
          ? `已发现 ${sourceCount} 个网页来源`
          : '正在搜索公开网页'
        : status === 'error'
          ? 'OpenAI 原生搜索失败'
          : sourceCount
            ? `搜索完成，找到 ${sourceCount} 个网页来源`
            : 'OpenAI 原生搜索完成';

  return {
    type: 'hosted_tool_call',
    toolCall: {
      id: toolCallId,
      name: 'openai_web_search',
      displayName: '联网搜索',
      type: 'search',
      status,
      inputSummary: primaryQuery ? `搜索：${primaryQuery}` : '正在搜索公开网页',
      output: {
        summary: statusText,
        queries: state.queries,
        results: citations,
        sources,
        providerItemIds: state.providerItemIds,
      },
      display: {
        title: '联网搜索',
        summary: statusText,
        ...(markdown ? { markdown } : {}),
        json: { queries: state.queries, results: citations, sources },
      },
    },
  };
}

function deriveOpenAIResponsesSdkBaseUrl(finalUrl: string): string {
  const url = new URL(finalUrl);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/responses')) {
    throw new Error('OpenAI Responses endpointPath 必须以 /responses 结尾');
  }
  url.pathname = path.slice(0, -'/responses'.length) || '/';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}
