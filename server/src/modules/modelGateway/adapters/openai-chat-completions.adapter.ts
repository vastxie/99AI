import { Injectable } from '@nestjs/common';
import { projectToolMediaAsUserContent } from '../tool-media-message-projection';
import { OPENAI_CHAT_COMPLETIONS_PROFILES } from '../profiles/openai-chat-completions.profiles';
import type { ModelProtocolDescriptor } from '../model-stream';
import { ModelStreamRegistry, toClassifiedProviderError } from '../model-stream';
import OpenAI from 'openai';
import { extractCacheMetrics } from './usage-cache-metrics';
import { ModelGatewayUrlBuilder } from '../model-gateway-url.builder';
import {
  assertNoReservedAdditionalParams,
  ModelGatewayReasoningEffort,
  ModelGatewayRequest,
  ModelGatewayUsage,
  mapModelGatewayReasoningEffort,
  shouldApplyModelGatewayReasoningEffort,
} from '../model-gateway.types';
import type {
  ModelCompleteResult,
  ModelStreamAdapter,
  ModelStreamEvent,
  ModelStreamInput,
  ModelStreamRuntimeConfig,
} from '../model-stream';

export const OPENAI_CHAT_COMPLETIONS_PROTOCOL = 'openai_chat_completions';

/** 内核基线协议：OpenAI Chat Completions 及各家兼容接口（DeepSeek / Qwen / Ollama / 各类中转网关） */
export const OPENAI_CHAT_COMPLETIONS_DESCRIPTOR: ModelProtocolDescriptor = {
  protocol: OPENAI_CHAT_COMPLETIONS_PROTOCOL,
  label: 'OpenAI Chat Completions / 兼容接口',
  endpoints: {
    default: '/v1/chat/completions',
    modelsList: '/v1/models',
    knownSuffixes: ['/chat/completions', '/models'],
  },
  multimodalTypes: ['image_url', 'video_url', 'audio_url'],
  profiles: OPENAI_CHAT_COMPLETIONS_PROFILES,
};

@Injectable()
export class OpenAIChatCompletionsAdapter implements ModelStreamAdapter {
  readonly protocol = OPENAI_CHAT_COMPLETIONS_PROTOCOL;
  readonly descriptor = OPENAI_CHAT_COMPLETIONS_DESCRIPTOR;

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
      const stream = await client.chat.completions.create(
        this.buildRequestBody(gatewayRequest, true),
        {
          signal: request.signal,
        },
      );

      let finishReason: string | undefined;
      let terminalObserved = false;
      for await (const chunk of stream as any) {
        if (chunk?.error) {
          throw toClassifiedProviderError(chunk.error, { requestOutcome: 'rejected' });
        }
        const delta = chunk.choices?.[0]?.delta as any;
        const chunkFinishReason = Array.isArray(chunk?.choices)
          ? chunk.choices
              .map((choice: any) => choice?.finish_reason)
              .find(
                (value: unknown): value is string =>
                  typeof value === 'string' && Boolean(value.trim()),
              )
          : undefined;

        if (delta?.reasoning_content) {
          yield { type: 'reasoning_delta', delta: delta.reasoning_content };
        }
        if (delta?.content) {
          yield { type: 'text_delta', delta: delta.content };
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            yield {
              type: 'tool_call_delta',
              index: tc.index ?? 0,
              id: tc.id,
              nameDelta: tc.function?.name,
              argumentsDelta: tc.function?.arguments,
              rawName: tc.function?.name,
            };
          }
        }
        if (chunk.usage) {
          yield { type: 'usage', usage: normalizeOpenAIChatCompletionsUsage(chunk.usage) };
        }
        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
          terminalObserved = true;
        }
      }

      if (terminalObserved) {
        yield { type: 'done', finishReason };
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
      const response = await client.chat.completions.create(this.buildRequestBody(request, false), {
        signal: request.signal,
      });
      const content = response.choices?.[0]?.message?.content;
      return {
        content: typeof content === 'string' ? content : '',
        usage: response.usage ? normalizeOpenAIChatCompletionsUsage(response.usage) : undefined,
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
    return buildOpenAIChatCompletionsRequestBody(request, stream);
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
      baseURL: urlResult.openAIChatSdkBaseUrl,
      maxRetries: 0,
    });
  }
}

/** OpenAI Chat Completions 兼容协议共用请求体；专属协议包可复用，但自行负责鉴权与请求头。 */
export function buildOpenAIChatCompletionsRequestBody(
  request: ModelGatewayRequest,
  stream: boolean,
): any {
  const additionalParams = request.config.additionalParams || {};
  assertNoReservedAdditionalParams(additionalParams);
  const body: any = {
    ...additionalParams,
    model: request.config.model,
    messages: projectToolMediaAsUserContent(request.messages) as any,
    tools: request.tools?.length ? request.tools : undefined,
    tool_choice: request.tools?.length ? request.toolChoice || 'auto' : undefined,
    // 不设默认温度：没指定时使用模型服务自己的默认值
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
  if (request.maxTokens) {
    body.max_tokens = request.maxTokens;
  }
  if (shouldApplyModelGatewayReasoningEffort(request.config.reasoningEffort)) {
    applyThinkingEffort(body, request, request.config.reasoningEffort);
  } else if (request.disableThinking) {
    applyThinkingOptOut(body, request);
  }
  return body;
}

function applyThinkingEffort(
  body: any,
  request: ModelGatewayRequest,
  effort: ModelGatewayReasoningEffort,
): void {
  const model = String(request.config.model || '').toLowerCase();
  const baseUrl = String(request.config.baseUrl || '').toLowerCase();
  const mappedEffort = mapModelGatewayReasoningEffort(effort, request.config.capabilities);
  if (mappedEffort === null) return;
  if (effort === 'off' || mappedEffort === 'off' || mappedEffort === 'none') {
    applyThinkingOptOut(body, request);
    return;
  }

  if (isGlmOrDoubaoModel(model, baseUrl)) {
    body.thinking = { type: 'enabled' };
    return;
  }

  if (isQwenOrHunyuanModel(model, baseUrl)) {
    body.enable_thinking = true;
    return;
  }

  if (isGeminiOpenAICompatModel(model, baseUrl)) {
    body.reasoning_effort =
      mappedEffort === effort ? mapOpenAIChatReasoningEffort(model, effort) : mappedEffort;
    return;
  }

  if (isDeepSeekV4Model(model)) {
    body.reasoning_effort = mappedEffort;
    return;
  }

  if (isOpenAIReasoningModel(model, baseUrl)) {
    body.reasoning_effort =
      mappedEffort === effort ? mapOpenAIChatReasoningEffort(model, effort) : mappedEffort;
    return;
  }

  if (isPureReasoningModel(model)) {
    body.max_tokens = Math.max(
      Number(body.max_tokens) || 0,
      effort === 'minimal' || effort === 'low' ? 1024 : 2048,
    );
  }
}

/**
 * 把「不需要思考」意图翻译为各家 OpenAI 兼容端点的专属参数；
 * 无法禁用思考的纯推理模型则放大 token 预算，保证思考后仍有余量输出正文。
 * 未识别的端点不注入任何未知字段，避免被严格校验的服务拒绝。
 */
function applyThinkingOptOut(body: any, request: ModelGatewayRequest): void {
  const model = String(request.config.model || '').toLowerCase();
  const baseUrl = String(request.config.baseUrl || '').toLowerCase();

  if (isGlmOrDoubaoModel(model, baseUrl)) {
    body.thinking = { type: 'disabled' };
    return;
  }

  if (isQwenOrHunyuanModel(model, baseUrl)) {
    body.enable_thinking = false;
    return;
  }

  if (isGeminiOpenAICompatModel(model, baseUrl)) {
    body.reasoning_effort = 'none';
    return;
  }

  if (isDeepSeekV4Model(model)) {
    body.thinking = { type: 'disabled' };
    return;
  }

  if (isPureReasoningModel(model)) {
    body.max_tokens = Math.max(Number(body.max_tokens) || 0, 1024);
  }
}

export function normalizeOpenAIChatCompletionsUsage(usage: any): ModelGatewayUsage {
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || inputTokens + outputTokens;
  const { cacheHitTokens, cacheMissTokens } = extractCacheMetrics(usage);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheHitTokens,
    cacheMissTokens,
  };
}

function isGlmOrDoubaoModel(model: string, baseUrl: string): boolean {
  return (
    model.startsWith('glm') ||
    baseUrl.includes('bigmodel.cn') ||
    model.startsWith('doubao') ||
    baseUrl.includes('volces.com')
  );
}

function isQwenOrHunyuanModel(model: string, baseUrl: string): boolean {
  return (
    model.startsWith('qwen') ||
    model.startsWith('qwq') ||
    model.includes('hunyuan') ||
    baseUrl.includes('dashscope')
  );
}

function isGeminiOpenAICompatModel(model: string, baseUrl: string): boolean {
  return baseUrl.includes('generativelanguage.googleapis.com') || model.startsWith('gemini');
}

function isPureReasoningModel(model: string): boolean {
  return /^o[134](-|$)|deepseek-r1|deepseek-reasoner|reasoner|-thinking/.test(model);
}

function isDeepSeekV4Model(model: string): boolean {
  return model.startsWith('deepseek-v4');
}

function isOpenAIReasoningModel(model: string, baseUrl: string): boolean {
  if (!baseUrl.includes('api.openai.com')) return false;
  return /^o[134](-|$)|^gpt-5(?:\.|-|$)/.test(model);
}

function mapOpenAIChatReasoningEffort(
  model: string,
  effort: ModelGatewayReasoningEffort,
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  switch (effort) {
    case 'minimal':
      return /^gpt-5(?:\.|-|$)/.test(model) ? 'minimal' : 'low';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'xhigh':
      return /^gpt-5(?:\.|-|$)/.test(model) ? 'xhigh' : 'high';
    case 'max':
      return /^gpt-5(?:\.|-|$)/.test(model) ? 'xhigh' : 'high';
    case 'high':
    case 'off':
    default:
      return 'high';
  }
}
