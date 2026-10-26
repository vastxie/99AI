import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import {
  mapModelGatewayReasoningEffort,
  shouldApplyModelGatewayReasoningEffort,
} from '@/modules/modelGateway/model-gateway.types';
import {
  buildOpenAIChatCompletionsRequestBody,
  normalizeOpenAIChatCompletionsUsage,
} from '@/modules/modelGateway/adapters/openai-chat-completions.adapter';
import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import type { ModelGatewayRequest } from '@/modules/modelGateway/model-gateway.types';
import {
  ModelStreamRegistry,
  toClassifiedProviderError,
} from '@/modules/modelGateway/model-stream';
import type {
  ModelCompleteResult,
  ModelProtocolDescriptor,
  ModelStreamAdapter,
  ModelStreamEvent,
  ModelStreamInput,
  ModelStreamRuntimeConfig,
} from '@/modules/modelGateway/model-stream';
import {
  OPENCODE_GO_CHAT_COMPLETIONS_CATALOG,
  OPENCODE_GO_CHAT_COMPLETIONS_PROFILES,
  OPENCODE_GO_CHAT_COMPLETIONS_REASONING_CONTROLS,
} from './opencode-go-chat-completions.profiles';

export const OPENCODE_GO_CHAT_COMPLETIONS_PROTOCOL = 'opencode_go_chat_completions';
export const OPENCODE_GO_USER_AGENT = '99Agent/1.0';
export const OPENCODE_GO_CHAT_COMPLETIONS_MODEL_IDS = new Set(
  OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.map(item => item.id),
);
const OPENCODE_GO_DEEPSEEK_THINKING_FORMAT_MODEL_IDS = new Set([
  'deepseek-v4.1-flash',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
  'kimi-k2.6',
]);
const OPENCODE_GO_MODELS_WITHOUT_REASONING_EFFORT = new Set(['kimi-k2.6']);

export const OPENCODE_GO_CHAT_COMPLETIONS_DESCRIPTOR: ModelProtocolDescriptor = {
  protocol: OPENCODE_GO_CHAT_COMPLETIONS_PROTOCOL,
  label: 'OpenCode Go Chat Completions',
  endpoints: {
    default: '/v1/chat/completions',
    modelsList: '/v1/models',
    knownSuffixes: ['/chat/completions', '/models'],
  },
  multimodalTypes: ['image_url'],
  profiles: OPENCODE_GO_CHAT_COMPLETIONS_PROFILES,
};

type OpenCodeGoHeaderInput = {
  purpose?: string;
  sessionId?: string;
};

export function resolveOpenCodeGoSessionId(input: OpenCodeGoHeaderInput): string {
  const supplied = String(input.sessionId || '').trim();
  if (supplied && supplied.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(supplied)) {
    return supplied;
  }
  const purpose = String(input.purpose || 'request')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .slice(0, 64);
  if (purpose === 'model-list') return '99agent-model-list';
  return `99agent-${randomUUID()}`;
}

export function buildOpenCodeGoHeaders(input: OpenCodeGoHeaderInput): Record<string, string> {
  return {
    'User-Agent': OPENCODE_GO_USER_AGENT,
    'x-opencode-session': resolveOpenCodeGoSessionId(input),
  };
}

@Injectable()
export class OpenCodeGoChatCompletionsAdapter implements ModelStreamAdapter {
  readonly protocol = OPENCODE_GO_CHAT_COMPLETIONS_PROTOCOL;
  readonly descriptor = OPENCODE_GO_CHAT_COMPLETIONS_DESCRIPTOR;

  constructor(
    private readonly urlBuilder: ModelGatewayUrlBuilder,
    registry: ModelStreamRegistry,
  ) {
    registry.register(this);
  }

  async *stream(request: ModelStreamInput): AsyncGenerator<ModelStreamEvent> {
    try {
      const gatewayRequest = request as ModelGatewayRequest;
      const client = this.createClient(gatewayRequest, true);
      const stream = await client.chat.completions.create(
        this.buildRequestBody(gatewayRequest, true),
        { signal: request.signal },
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
          for (const toolCall of delta.tool_calls) {
            yield {
              type: 'tool_call_delta',
              index: toolCall.index ?? 0,
              id: toolCall.id,
              nameDelta: toolCall.function?.name,
              argumentsDelta: toolCall.function?.arguments,
              rawName: toolCall.function?.name,
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
      const client = this.createClient(request, false);
      const response = await client.chat.completions.create(this.buildRequestBody(request, false), {
        signal: request.signal,
      });
      const choice = response.choices?.[0];
      return {
        content: typeof choice?.message?.content === 'string' ? choice.message.content : '',
        usage: response.usage ? normalizeOpenAIChatCompletionsUsage(response.usage) : undefined,
        finishReason: choice?.finish_reason || undefined,
      };
    } catch (error) {
      throw toClassifiedProviderError(error, { signal: request.signal });
    }
  }

  buildRequestBody(request: ModelGatewayRequest, stream: boolean): any {
    const body = buildOpenAIChatCompletionsRequestBody(request, stream);
    applyOpenCodeGoReasoningEffort(body, request);
    return body;
  }

  async listRemoteModels(config: ModelStreamRuntimeConfig): Promise<any[]> {
    const url = this.urlBuilder.build({
      protocol: config.protocol,
      baseUrl: config.baseUrl,
      endpointPath: undefined,
      model: config.model,
      operation: 'models_list',
    }).url;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...buildOpenCodeGoHeaders({ purpose: 'model-list' }),
      },
    });
    if (!response.ok) {
      throw new Error(`远程模型列表获取失败: HTTP ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data?.data)
      ? data.data.filter((item: any) =>
          OPENCODE_GO_CHAT_COMPLETIONS_MODEL_IDS.has(String(item?.id || '')),
        )
      : [];
  }

  private createClient(request: ModelGatewayRequest, stream: boolean): OpenAI {
    const url = this.urlBuilder.build({
      protocol: request.config.protocol,
      baseUrl: request.config.baseUrl,
      endpointPath: request.config.endpointPath,
      model: request.config.model,
      operation: stream ? 'stream' : 'non_stream',
    }).url;
    return new OpenAI({
      apiKey: request.config.apiKey,
      baseURL: openAIChatSdkBaseUrl(url),
      defaultHeaders: buildOpenCodeGoHeaders(request),
      maxRetries: 0,
    });
  }
}

function applyOpenCodeGoReasoningEffort(body: any, request: ModelGatewayRequest): void {
  delete body.thinking;
  delete body.enable_thinking;
  delete body.reasoning_effort;

  const effort = request.config.reasoningEffort;
  if (!shouldApplyModelGatewayReasoningEffort(effort)) return;
  const mappedEffort = mapModelGatewayReasoningEffort(effort, request.config.capabilities);
  if (mappedEffort === null) return;

  const model = String(request.config.model || '')
    .trim()
    .toLowerCase();
  if (
    OPENCODE_GO_MODELS_WITHOUT_REASONING_EFFORT.has(model) &&
    !OPENCODE_GO_CHAT_COMPLETIONS_REASONING_CONTROLS[model]?.levels.includes(effort)
  ) {
    return;
  }
  if (OPENCODE_GO_DEEPSEEK_THINKING_FORMAT_MODEL_IDS.has(model)) {
    body.thinking = {
      type:
        effort === 'off' || mappedEffort === 'off' || mappedEffort === 'none'
          ? 'disabled'
          : 'enabled',
    };
    if (
      body.thinking.type === 'enabled' &&
      !OPENCODE_GO_MODELS_WITHOUT_REASONING_EFFORT.has(model)
    ) {
      body.reasoning_effort = mappedEffort;
    }
    return;
  }

  if (effort === 'off' || mappedEffort === 'off') {
    const explicitOff = request.config.capabilities?.reasoningControl?.levelMap?.off;
    if (typeof explicitOff === 'string' && explicitOff.trim()) {
      body.reasoning_effort = explicitOff.trim();
    }
    return;
  }

  body.reasoning_effort = mappedEffort;
}

function openAIChatSdkBaseUrl(endpointUrl: string): string {
  const parsed = new URL(endpointUrl);
  const suffix = '/chat/completions';
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path.endsWith(suffix)) {
    throw new Error('OpenCode Go endpointPath 必须以 /chat/completions 结尾');
  }
  parsed.pathname = path.slice(0, -suffix.length) || '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}
