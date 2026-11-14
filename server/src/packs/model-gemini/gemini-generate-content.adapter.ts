import { Injectable } from '@nestjs/common';
import { GEMINI_GENERATE_CONTENT_PROFILES } from './gemini-generate-content.profiles';
import type {
  ModelProtocolDescriptor,
  ModelStreamRuntimeConfig,
} from '@/modules/modelGateway/model-stream';
import {
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
  mapGatewayMessagesToGeminiContent,
  mapOpenAIChatToolsToGeminiTools,
} from './gemini-content.mapper';
import { buildGeminiThinkingConfig, isGemini3OrLaterModel } from './gemini-model-capabilities';
import { GeminiProviderStateCollector } from './gemini-provider-state';
import {
  GeminiNativeWebSearchConfig,
  GeminiWebSearchCollector,
  getGeminiNativeWebSearchConfig,
} from './gemini-web-search';

export const GEMINI_GENERATE_CONTENT_PROTOCOL = 'gemini_generate_content';

/** Google Gemini Generate Content 协议：模型名在路径里，流式走 :streamGenerateContent?alt=sse */
export const GEMINI_GENERATE_CONTENT_DESCRIPTOR: ModelProtocolDescriptor = {
  protocol: GEMINI_GENERATE_CONTENT_PROTOCOL,
  label: 'Google Gemini Generate Content',
  endpoints: {
    default: '/v1beta/models/{model}:generateContent',
    stream: '/v1beta/models/{model}:streamGenerateContent',
    modelsList: '/v1beta/models',
    streamQuery: { alt: 'sse' },
    knownSuffixes: [':generateContent', ':streamGenerateContent'],
  },
  multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
  supportsNativeWebSearch: true,
  profiles: GEMINI_GENERATE_CONTENT_PROFILES,
};

@Injectable()
export class GeminiGenerateContentAdapter implements ModelStreamAdapter {
  readonly protocol = GEMINI_GENERATE_CONTENT_PROTOCOL;
  readonly descriptor = GEMINI_GENERATE_CONTENT_DESCRIPTOR;

  constructor(
    private readonly urlBuilder: ModelGatewayUrlBuilder,
    registry: ModelStreamRegistry,
  ) {
    registry.register(this);
  }

  async *stream(request: ModelStreamInput): AsyncGenerator<ModelStreamEvent> {
    const gatewayRequest = request as ModelGatewayRequest;
    const hasFunctionTools =
      gatewayRequest.purpose !== 'context_compaction' &&
      mapOpenAIChatToolsToGeminiTools(gatewayRequest.tools).length > 0;
    const nativeWebSearch = getGeminiNativeWebSearchConfig(gatewayRequest, { hasFunctionTools });
    const searchCollector = nativeWebSearch
      ? new GeminiWebSearchCollector(nativeWebSearch.includeSources)
      : undefined;

    try {
      const response = await this.post(gatewayRequest, true);
      await assertOkResponse(response);

      let toolIndex = 0;
      let finishObserved = false;
      const collector = new GeminiProviderStateCollector(gatewayRequest.config.model);

      for await (const chunk of readGeminiSseEvents((response as any).body)) {
        if (chunk?.error) {
          throw toClassifiedProviderError(chunk.error, { requestOutcome: 'rejected' });
        }
        const events = this.mapGenerateContentChunk(
          chunk,
          () => toolIndex++,
          collector,
          searchCollector,
        );
        for (const event of events) {
          if (event.type === 'done') finishObserved = true;
          yield event;
        }
      }
      if (finishObserved && searchCollector) {
        for (const event of searchCollector.finish()) {
          yield event;
        }
      }
      // 结束标志之后仍可能到达只带签名的空正文块，读到流结束再产出（网关在流结束后才发 done）
      const state = collector.finish();
      if (state) yield { type: 'provider_state', state };
    } catch (error) {
      if (searchCollector) {
        for (const event of searchCollector.fail()) {
          yield event;
        }
      }
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
        content: collectGeminiText(data),
        usage: data.usageMetadata ? normalizeGeminiUsage(data.usageMetadata) : undefined,
      };
    } catch (error) {
      throw toClassifiedProviderError(error, { signal: request.signal });
    }
  }

  async listRemoteModels(config: ModelStreamRuntimeConfig): Promise<any[]> {
    const builtUrl = this.urlBuilder.build({
      protocol: config.protocol as any,
      baseUrl: config.baseUrl,
      model: config.model,
      operation: 'models_list',
    }).url;
    const url = new URL(builtUrl);
    if (!url.searchParams.has('pageSize')) {
      url.searchParams.set('pageSize', '200');
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`远程模型列表获取失败: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((item: any) => {
        const methods = Array.isArray(item?.supportedGenerationMethods)
          ? item.supportedGenerationMethods
          : [];
        return !methods.length || methods.includes('generateContent');
      })
      .map((item: any) => {
        const rawName = typeof item?.name === 'string' ? item.name.trim() : '';
        const id = rawName.replace(/^models\//, '');
        if (!id) return null;
        const displayName =
          typeof item?.displayName === 'string' && item.displayName.trim()
            ? item.displayName.trim()
            : id;
        return { id, name: displayName };
      })
      .filter(Boolean);
  }

  buildRequestBody(request: ModelGatewayRequest, _stream: boolean): any {
    const isContextCompaction = request.purpose === 'context_compaction';
    const additionalParams = isContextCompaction ? {} : request.config.additionalParams || {};
    assertNoReservedAdditionalParams(additionalParams);
    assertNoGeminiCoreOverrides(additionalParams);

    const mapped = mapGatewayMessagesToGeminiContent(request.messages, {
      model: request.config.model,
    });
    const functionTools = isContextCompaction ? [] : mapOpenAIChatToolsToGeminiTools(request.tools);
    const hasFunctionTools = functionTools.length > 0;
    const nativeWebSearch = getGeminiNativeWebSearchConfig(request, { hasFunctionTools });
    const tools = [...(nativeWebSearch ? [{ googleSearch: {} }] : []), ...functionTools];
    const toolConfig = buildGeminiToolConfig({
      toolChoice: request.toolChoice,
      hasFunctionTools,
      nativeWebSearch,
      model: request.config.model,
    });

    // 不设默认温度：没指定时使用模型服务自己的默认值
    const generationConfig: Record<string, unknown> =
      request.temperature !== undefined ? { temperature: request.temperature } : {};
    if (request.maxTokens) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    const thinkingConfig = buildGeminiThinkingConfig(request);
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    return {
      ...additionalParams,
      contents: mapped.contents,
      systemInstruction: mapped.systemInstruction,
      tools: tools.length ? tools : undefined,
      toolConfig,
      generationConfig,
    };
  }

  private post(request: ModelGatewayRequest, stream: boolean): Promise<Response> {
    const url = this.urlBuilder.build({
      protocol: request.config.protocol,
      baseUrl: request.config.baseUrl,
      endpointPath: resolveGeminiEndpointPath(request.config.endpointPath, stream),
      model: request.config.model,
      operation: stream ? 'stream' : 'non_stream',
    }).url;

    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: stream ? 'text/event-stream' : 'application/json',
        'x-goog-api-key': request.config.apiKey,
      },
      body: JSON.stringify(this.buildRequestBody(request, stream)),
      redirect: 'error',
      signal: request.signal,
    });
  }

  private mapGenerateContentChunk(
    chunk: any,
    nextToolIndex: () => number,
    collector?: GeminiProviderStateCollector,
    searchCollector?: GeminiWebSearchCollector,
  ): ModelGatewayEvent[] {
    const events: ModelGatewayEvent[] = [];
    let emittedTopLevelText = false;

    if (typeof chunk?.text === 'string' && chunk.text) {
      events.push({ type: 'text_delta', delta: chunk.text });
      emittedTopLevelText = true;
    }

    const candidates = Array.isArray(chunk?.candidates) ? chunk.candidates : [];
    for (const candidate of candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      for (const part of parts) {
        collector?.onPart(part);
        if (searchCollector) {
          events.push(...searchCollector.onPart(part));
        }
        if (part?.thought === true) {
          // 思考摘要：按推理过程展示，不当正文
          if (typeof part.text === 'string' && part.text) {
            events.push({ type: 'reasoning_delta', delta: part.text });
          }
          continue;
        }
        if (!emittedTopLevelText && typeof part?.text === 'string' && part.text) {
          events.push({ type: 'text_delta', delta: part.text });
        }
        if (part?.functionCall?.name) {
          const index = nextToolIndex();
          const args = part.functionCall.args || {};
          events.push({
            type: 'tool_call_delta',
            index,
            id: `gemini_call_${index}`,
            nameDelta: part.functionCall.name,
            rawName: part.functionCall.name,
          });
          events.push({
            type: 'tool_call_delta',
            index,
            id: `gemini_call_${index}`,
            argumentsDelta: JSON.stringify(args),
            rawName: part.functionCall.name,
          });
        }
      }
      if (searchCollector && candidate?.groundingMetadata) {
        events.push(...searchCollector.onGroundingMetadata(candidate.groundingMetadata));
      }
      if (candidate?.finishReason) {
        events.push({ type: 'done', finishReason: candidate.finishReason });
      }
    }

    if (chunk?.usageMetadata) {
      events.push({ type: 'usage', usage: normalizeGeminiUsage(chunk.usageMetadata) });
    }

    return events;
  }
}

async function assertOkResponse(response: Response): Promise<void> {
  if (response.ok) return;
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = '';
  }
  throw toClassifiedProviderError(
    { status: response.status, headers: response.headers, message: detail },
    { status: response.status },
  );
}

async function* readGeminiSseEvents(body: any): AsyncGenerator<any> {
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

function normalizeGeminiUsage(usage: any): ModelGatewayUsage {
  const inputTokens = (usage.promptTokenCount || 0) + (usage.toolUsePromptTokenCount || 0);
  const thoughtsTokens = usage.thoughtsTokenCount || 0;
  const outputTokens = (usage.candidatesTokenCount || 0) + thoughtsTokens;
  const totalTokens = Math.max(usage.totalTokenCount || 0, inputTokens + outputTokens);
  const cacheHitTokens = usage.cachedContentTokenCount || 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheHitTokens,
    cacheMissTokens: Math.max(inputTokens - cacheHitTokens, 0),
  };
}

function resolveGeminiEndpointPath(
  endpointPath: string | undefined,
  stream: boolean,
): string | undefined {
  const trimmed = typeof endpointPath === 'string' ? endpointPath.trim() : '';
  if (!trimmed) return undefined;
  if (stream && trimmed.endsWith(':generateContent')) {
    return `${trimmed.slice(0, -':generateContent'.length)}:streamGenerateContent`;
  }
  if (!stream && trimmed.endsWith(':streamGenerateContent')) {
    return `${trimmed.slice(0, -':streamGenerateContent'.length)}:generateContent`;
  }
  return trimmed;
}

function collectGeminiText(data: any): string {
  if (typeof data?.text === 'string') return data.text;
  const candidates: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> = Array.isArray(
    data?.candidates,
  )
    ? data.candidates
    : [];
  return candidates
    .flatMap(candidate => (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []))
    .filter(part => typeof part?.text === 'string' && (part as any)?.thought !== true)
    .map(part => part.text)
    .join('');
}

function buildGeminiToolConfig(input: {
  toolChoice: ModelGatewayRequest['toolChoice'];
  hasFunctionTools: boolean;
  nativeWebSearch?: GeminiNativeWebSearchConfig;
  model?: string;
}): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};
  if (input.hasFunctionTools) {
    const mode =
      input.toolChoice === 'none' ? 'NONE' : input.toolChoice === 'required' ? 'ANY' : 'AUTO';
    config.functionCallingConfig = { mode };
  }
  if (input.nativeWebSearch && (input.hasFunctionTools || isGemini3OrLaterModel(input.model))) {
    config.includeServerSideToolInvocations = true;
  }
  return Object.keys(config).length ? config : undefined;
}

function assertNoGeminiCoreOverrides(additionalParams: Record<string, unknown>): void {
  const blocked = [
    'contents',
    'systemInstruction',
    'tools',
    'toolConfig',
    'generationConfig',
  ].filter(key => key in additionalParams);
  if (blocked.length) {
    throw new Error(
      `additionalParams 包含 Gemini Generate Content 核心字段: ${blocked.join(', ')}`,
    );
  }
}
