import { Injectable } from '@nestjs/common';
import { ANTHROPIC_MESSAGES_PROFILES } from './anthropic-messages.profiles';
import type { ModelProtocolDescriptor } from '@/modules/modelGateway/model-stream';
import {
  ClassifiedProviderError,
  MODEL_PROVIDER_STATE_REJECTED,
  ModelStreamRegistry,
  toClassifiedProviderError,
} from '@/modules/modelGateway/model-stream';
import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import {
  assertNoReservedAdditionalParams,
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelGatewayUsage,
} from '@/modules/modelGateway/model-gateway.types';
import type {
  ModelCompleteResult,
  ModelStreamAdapter,
  ModelStreamEvent,
  ModelStreamInput,
} from '@/modules/modelGateway/model-stream';
import {
  mapGatewayMessagesToAnthropicMessages,
  mapOpenAIChatToolsToAnthropicTools,
} from './anthropic-message.mapper';
import {
  AnthropicProviderStateCollector,
  AnthropicReplayPlan,
  AnthropicWireMessage,
  planAnthropicReplay,
} from './anthropic-provider-state';
import { resolveAnthropicRequestControls } from './anthropic-request-controls';

const ANTHROPIC_VERSION = '2023-06-01';

export const ANTHROPIC_MESSAGES_PROTOCOL = 'anthropic_messages';

/** Anthropic Messages 协议 */
export const ANTHROPIC_MESSAGES_DESCRIPTOR: ModelProtocolDescriptor = {
  protocol: ANTHROPIC_MESSAGES_PROTOCOL,
  label: 'Anthropic Claude Messages',
  endpoints: {
    default: '/v1/messages',
    knownSuffixes: ['/messages'],
  },
  multimodalTypes: ['image_url', 'document'],
  profiles: ANTHROPIC_MESSAGES_PROFILES,
};

@Injectable()
export class AnthropicMessagesAdapter implements ModelStreamAdapter {
  readonly protocol = ANTHROPIC_MESSAGES_PROTOCOL;
  readonly descriptor = ANTHROPIC_MESSAGES_DESCRIPTOR;

  constructor(
    private readonly urlBuilder: ModelGatewayUrlBuilder,
    registry: ModelStreamRegistry,
  ) {
    registry.register(this);
  }

  async *stream(request: ModelStreamInput): AsyncGenerator<ModelStreamEvent> {
    try {
      const { body, replay } = this.prepareRequest(request as ModelGatewayRequest, true);
      const response = await this.post(request as ModelGatewayRequest, true, body);
      // 带了回放的思考块而被拒（还没开始返回）：交给运行时去掉全部回放状态后重发一次
      await assertOkResponse(response, replay.carriesThinking);
      const collector = new AnthropicProviderStateCollector({
        model: request.config.model,
        digest: replay.digestAfter,
        lineage: replay.replayedIds,
      });

      const toolNames = new Map<number, string>();
      const toolIds = new Map<number, string>();
      const usageCounts = emptyAnthropicUsageCounts();
      let finalFinishReason: string | undefined;

      for await (const event of readAnthropicSseEvents((response as any).body)) {
        collector.onEvent(event);
        switch (event.type) {
          case 'message_start':
            if (event.message?.usage) {
              mergeAnthropicUsageCounts(usageCounts, event.message.usage);
              yield { type: 'usage', usage: toGatewayUsage(usageCounts) };
            }
            break;
          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              const index = event.index ?? 0;
              if (event.content_block.id) toolIds.set(index, event.content_block.id);
              if (event.content_block.name) toolNames.set(index, event.content_block.name);
              yield {
                type: 'tool_call_delta',
                index,
                id: event.content_block.id,
                nameDelta: event.content_block.name,
                rawName: event.content_block.name,
              };
            }
            break;
          case 'content_block_delta':
            yield* this.mapContentBlockDelta(event, toolIds, toolNames);
            break;
          case 'message_delta':
            finalFinishReason = event.delta?.stop_reason || finalFinishReason;
            if (event.usage) {
              mergeAnthropicUsageCounts(usageCounts, event.usage);
              yield { type: 'usage', usage: toGatewayUsage(usageCounts) };
            }
            break;
          case 'message_stop':
            // 本次回复的回放记录：只挂在运行时历史里，不进公开事件与日志
            yield { type: 'provider_state', state: collector.finish() };
            yield { type: 'done', finishReason: finalFinishReason };
            break;
          case 'error':
            throw toClassifiedProviderError(event.error || event, {
              requestOutcome: 'rejected',
            });
        }
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
      const response = await this.post(request, false);
      await assertOkResponse(response);
      const data = await response.json();
      return {
        content: collectAnthropicText(data.content),
        usage: data.usage ? normalizeAnthropicUsage(data.usage) : undefined,
      };
    } catch (error) {
      throw toClassifiedProviderError(error, { signal: request.signal });
    }
  }

  /**
   * 推理参数、输出上限、采样参数与强制工具按模型能力表决定（见 anthropic-request-controls.ts）；
   * 探针（test_connection）里能力表不支持的档位会抛错，由内核按「未生成此档位」跳过
   */
  buildRequestBody(request: ModelGatewayRequest, stream: boolean): any {
    return this.prepareRequest(request, stream).body;
  }

  /** 组装请求体，同时给出本次的回放规划（流式捕获下一份记录要用它的摘要与谱系） */
  private prepareRequest(
    request: ModelGatewayRequest,
    stream: boolean,
  ): { body: any; replay: AnthropicReplayPlan } {
    const additionalParams = request.config.additionalParams || {};
    assertNoReservedAdditionalParams(additionalParams);
    const mapped = mapGatewayMessagesToAnthropicMessages(request.messages);
    const tools = mapOpenAIChatToolsToAnthropicTools(request.tools);
    const replay = planAnthropicReplay({
      model: request.config.model,
      system: mapped.system,
      tools: tools.length ? tools : undefined,
      messages: mapped.messages,
      sources: mapped.sources,
    });
    const controls = resolveAnthropicRequestControls(request, additionalParams, {
      manualThinkingAllowed: !continuesToolCallWithoutThinking(replay.messages),
    });
    const body: any = {
      ...controls.params,
      model: request.config.model,
      messages: replay.messages,
      system: mapped.system,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length
        ? mapToolChoice(request.toolChoice, controls.forcedToolAllowed)
        : undefined,
      // 不设默认温度：没指定时使用模型服务自己的默认值（部分新模型不接受 temperature）
      ...(controls.temperature !== undefined ? { temperature: controls.temperature } : {}),
      max_tokens: controls.maxTokens,
      stream,
    };
    if (controls.thinking !== undefined) body.thinking = controls.thinking;
    if (
      controls.outputConfig !== undefined &&
      !(isPlainRecord(controls.outputConfig) && Object.keys(controls.outputConfig).length === 0)
    ) {
      body.output_config = controls.outputConfig;
    }
    return { body, replay };
  }

  private post(request: ModelGatewayRequest, stream: boolean, body?: any): Promise<Response> {
    const url = this.urlBuilder.build({
      protocol: request.config.protocol,
      baseUrl: request.config.baseUrl,
      endpointPath: request.config.endpointPath,
      model: request.config.model,
      operation: stream ? 'stream' : 'non_stream',
    }).url;
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: stream ? 'text/event-stream' : 'application/json',
        'x-api-key': request.config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body ?? this.buildRequestBody(request, stream)),
      signal: request.signal,
    });
  }

  private async *mapContentBlockDelta(
    event: any,
    toolIds: Map<number, string>,
    toolNames: Map<number, string>,
  ): AsyncGenerator<ModelGatewayEvent> {
    const delta = event.delta || {};
    const index = event.index ?? 0;
    if (delta.type === 'text_delta' && delta.text) {
      yield { type: 'text_delta', delta: delta.text };
      return;
    }
    if (delta.type === 'input_json_delta') {
      yield {
        type: 'tool_call_delta',
        index,
        id: toolIds.get(index),
        argumentsDelta: delta.partial_json || '',
        rawName: toolNames.get(index),
      };
      return;
    }
    if (delta.type === 'thinking_delta' && delta.thinking) {
      yield { type: 'reasoning_delta', delta: delta.thinking };
    }
  }
}

async function assertOkResponse(response: Response, carriedState = false): Promise<void> {
  if (response.ok) return;
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = '';
  }
  if (carriedState && response.status === 400) {
    throw new ClassifiedProviderError({
      code: MODEL_PROVIDER_STATE_REJECTED,
      message: '模型服务拒绝了回放的思考状态',
      category: 'invalid_request',
      retryable: false,
      requestOutcome: 'rejected',
      status: 400,
    });
  }
  throw toClassifiedProviderError(
    { status: response.status, headers: response.headers, message: detail },
    { status: response.status },
  );
}

/**
 * 本次是在续接工具调用（最后一条线上消息带 tool_result），而最后一条助手消息不以思考块开头：
 * 手动思考这时会被拒，本次改为关闭
 */
function continuesToolCallWithoutThinking(messages: AnthropicWireMessage[]): boolean {
  const last = messages.at(-1);
  const continuation =
    last?.role === 'user' && last.content.some(part => part?.type === 'tool_result');
  if (!continuation) return false;
  const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant');
  const first = lastAssistant?.content?.[0]?.type;
  return first !== 'thinking' && first !== 'redacted_thinking';
}

async function* readAnthropicSseEvents(body: any): AsyncGenerator<any> {
  if (!body) return;
  let buffer = '';
  const decoder = new TextDecoder();

  const appendAndDrain = async function* (chunk: unknown, flush = false): AsyncGenerator<any> {
    if (chunk !== undefined) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk as any, { stream: true });
    }
    if (flush) buffer += decoder.decode();

    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match) break;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice((match.index || 0) + match[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      yield JSON.parse(data);
    }
  };

  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield* appendAndDrain(value);
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    for await (const chunk of body as AsyncIterable<unknown>) {
      yield* appendAndDrain(chunk);
    }
  }

  yield* appendAndDrain(undefined, true);
}

/**
 * Anthropic 用量：`input_tokens` 只是未命中缓存的部分，缓存写入、缓存读取另外两个字段；三者之和才是本次的输入。
 * 流式时各字段是累计值，事件可能只带其中一部分
 */
interface AnthropicUsageCounts {
  input: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
}

const ANTHROPIC_USAGE_FIELDS: Record<keyof AnthropicUsageCounts, string> = {
  input: 'input_tokens',
  cacheCreation: 'cache_creation_input_tokens',
  cacheRead: 'cache_read_input_tokens',
  output: 'output_tokens',
};

function emptyAnthropicUsageCounts(): AnthropicUsageCounts {
  return { input: 0, cacheCreation: 0, cacheRead: 0, output: 0 };
}

/** 只覆盖出现了且是有限非负数的字段（显式 0 也覆盖），没出现或不合法的保持原值 */
function mergeAnthropicUsageCounts(counts: AnthropicUsageCounts, usage: unknown): void {
  if (!usage || typeof usage !== 'object') return;
  for (const key of Object.keys(ANTHROPIC_USAGE_FIELDS) as Array<keyof AnthropicUsageCounts>) {
    const value = (usage as Record<string, unknown>)[ANTHROPIC_USAGE_FIELDS[key]];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) counts[key] = value;
  }
}

/** 网关口径：输入含缓存写入与读取，命中 = 缓存读取，未命中 = 非缓存读取的输入（未命中缓存 + 写入缓存） */
function toGatewayUsage(counts: AnthropicUsageCounts): ModelGatewayUsage {
  const inputTokens = counts.input + counts.cacheCreation + counts.cacheRead;
  return {
    inputTokens,
    outputTokens: counts.output,
    totalTokens: inputTokens + counts.output,
    cacheHitTokens: counts.cacheRead,
    cacheMissTokens: counts.input + counts.cacheCreation,
  };
}

function normalizeAnthropicUsage(usage: unknown): ModelGatewayUsage {
  const counts = emptyAnthropicUsageCounts();
  mergeAnthropicUsageCounts(counts, usage);
  return toGatewayUsage(counts);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectAnthropicText(content: any): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('');
}

/** 「必须调用工具」在家族拒绝强制工具、或手动思考开启时降为 auto（否则 400） */
function mapToolChoice(
  toolChoice: ModelGatewayRequest['toolChoice'],
  forcedToolAllowed: boolean,
): any {
  if (toolChoice === 'none') return { type: 'none' };
  if (toolChoice === 'required' && forcedToolAllowed) return { type: 'any' };
  return { type: 'auto' };
}
