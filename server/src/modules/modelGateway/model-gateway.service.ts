import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ModelGatewayMediaPreparerService } from './model-gateway-media-preparer.service';
import { createOpaqueModelGatewaySessionId } from './model-gateway-session';
import { ModelGatewayUrlBuilder } from './model-gateway-url.builder';
import {
  DEFAULT_MODEL_PROTOCOL,
  MODEL_GATEWAY_REASONING_LEVELS,
  ModelGatewayCompleteResult,
  ModelGatewayEvent,
  ModelGatewayRemoteModel,
  ModelGatewayRequest,
  ModelGatewayReasoningEffort,
  ModelGatewayRuntimeConfig,
  ModelGatewayTestConnectionResult,
  ModelGatewayUrlInput,
  ModelGatewayUrlResult,
} from './model-gateway.types';
import {
  classifyProviderError,
  classifySilentProviderCompletion,
  completeFromStream,
  estimateProviderInputTokens,
  ModelStreamRegistry,
  normalizeModelHistory,
  toSafeModelStreamUsage,
  toSafeModelStreamError,
} from './model-stream';
import type { ModelProtocolDescriptor } from './model-stream';
import { buildModelGatewayProviderProfilePayload } from './provider-profiles';
import type { ModelGatewayProviderProfilePayload } from './provider-profiles.types';
import type {
  ModelCompleteResult,
  ModelStreamAdapter,
  ModelStreamError,
  ModelStreamEvent,
  ModelStreamInput,
  ModelStreamRuntimeConfig,
  ModelStreamUsage,
} from './model-stream';

const MODEL_PROBE_TIMEOUT_MS = 45_000;
const MODEL_PROBE_CONCURRENCY = 4;

/** 已确认实现了远程模型列表的协议适配器 */
type RemoteModelListAdapter = ModelStreamAdapter &
  Required<Pick<ModelStreamAdapter, 'listRemoteModels'>>;

@Injectable()
export class ModelGatewayService {
  constructor(
    private readonly modelStreamRegistry: ModelStreamRegistry,
    private readonly urlBuilder: ModelGatewayUrlBuilder,
    private readonly mediaPreparer: ModelGatewayMediaPreparerService,
  ) {}

  stream(request: ModelGatewayRequest): AsyncGenerator<ModelGatewayEvent>;
  stream(request: ModelStreamInput): AsyncGenerator<ModelStreamEvent>;
  async *stream(
    request: ModelGatewayRequest | ModelStreamInput,
  ): AsyncGenerator<ModelGatewayEvent | ModelStreamEvent> {
    const constrainedRequest = this.constrainInternalRequest(request);
    const normalizedRequest = this.normalizeRequestHistory(constrainedRequest);
    const estimatedInputTokens = estimateProviderInputTokens({
      messages: normalizedRequest.messages,
      tools: normalizedRequest.tools,
    });
    const preparedRequest = await this.mediaPreparer.prepare(
      normalizedRequest as ModelGatewayRequest,
    );
    yield* this.streamPrepared(preparedRequest, estimatedInputTokens);
  }

  completeOnce(request: ModelGatewayRequest): Promise<ModelGatewayCompleteResult>;
  completeOnce(request: ModelStreamInput): Promise<ModelCompleteResult>;
  async completeOnce(
    request: ModelGatewayRequest | ModelStreamInput,
  ): Promise<ModelGatewayCompleteResult | ModelCompleteResult> {
    const constrainedRequest = this.constrainInternalRequest(request);
    const normalizedRequest = this.normalizeRequestHistory(constrainedRequest);
    const estimatedInputTokens = estimateProviderInputTokens({
      messages: normalizedRequest.messages,
      tools: normalizedRequest.tools,
    });
    const preparedRequest = await this.mediaPreparer.prepare(
      normalizedRequest as ModelGatewayRequest,
    );
    return completeFromStream(
      input => this.streamPrepared(input, estimatedInputTokens),
      preparedRequest,
    );
  }

  private constrainInternalRequest<T extends ModelGatewayRequest | ModelStreamInput>(
    request: T,
  ): T {
    if (request.purpose !== 'context_compaction') return request;
    const capabilities =
      request.config.capabilities && typeof request.config.capabilities === 'object'
        ? { ...(request.config.capabilities as Record<string, unknown>), nativeTools: undefined }
        : request.config.capabilities;
    return {
      ...request,
      config: {
        ...request.config,
        capabilities,
        additionalParams: undefined,
        reasoningEffort: 'off',
      },
      tools: undefined,
      toolChoice: 'none',
      disableThinking: true,
    } as T;
  }

  previewRequestUrl(input: ModelGatewayUrlInput): ModelGatewayUrlResult {
    return this.urlBuilder.build(input);
  }

  async testConnection(
    config: ModelGatewayRuntimeConfig,
  ): Promise<ModelGatewayTestConnectionResult> {
    const tests: ModelGatewayTestConnectionResult['tests'] = [];
    const textTest = await this.runConnectionProbe({
      key: 'text',
      label: '文本对话',
      capability: 'text',
      config,
      messages: [{ role: 'user', content: '只回答 PROBE_OK' }],
      expected: /PROBE_OK/i,
    });
    tests.push(textTest);
    if (!textTest.ok) {
      return { ok: false, tests };
    }

    const adapter = this.getAdapter(config);
    const descriptorMedia = Array.from(
      new Set(adapter.descriptor.multimodalTypes.filter(isProbeMultimodalType)),
    );
    const probeTasks: Array<() => Promise<ModelGatewayTestConnectionResult['tests'][number]>> = [];
    for (const type of descriptorMedia) {
      const definition = mediaProbeDefinition(type);
      probeTasks.push(() =>
        this.runConnectionProbe({
          key: `multimodal:${type}`,
          label: definition.label,
          capability: 'multimodal',
          value: type,
          config: {
            ...config,
            capabilities: capabilitiesForProbe(config, type),
          },
          messages: [{ role: 'user', content: definition.content }],
          expected: definition.expected,
        }),
      );
    }

    for (const candidate of buildReasoningProbeCandidates(adapter, config)) {
      const { level } = candidate;
      probeTasks.push(() => {
        if (candidate.skippedMessage) {
          return Promise.resolve({
            key: `reasoning:${level}`,
            label: `推理强度：${reasoningLevelLabel(level)}`,
            capability: 'reasoning',
            value: level,
            ok: false,
            skipped: true,
            message: candidate.skippedMessage,
          });
        }
        return this.runConnectionProbe({
          key: `reasoning:${level}`,
          label: `推理强度：${reasoningLevelLabel(level)}`,
          capability: 'reasoning',
          value: level,
          config: { ...config, reasoningEffort: level },
          messages: [{ role: 'user', content: '只回答 PROBE_OK' }],
          expected: /PROBE_OK/i,
          successMessage: '该档位请求已被服务接受',
        });
      });
    }
    tests.push(...(await runProbeTasks(probeTasks, MODEL_PROBE_CONCURRENCY)));

    const usage = sumProbeUsage(tests);
    return {
      ok: tests.every(item => item.ok || item.skipped),
      ...(usage ? { usage } : {}),
      tests,
    };
  }

  private async runConnectionProbe(input: {
    key: string;
    label: string;
    capability: 'text' | 'multimodal' | 'reasoning';
    value?: string;
    config: ModelGatewayRuntimeConfig;
    messages: ModelGatewayRequest['messages'];
    expected: RegExp;
    successMessage?: string;
  }): Promise<ModelGatewayTestConnectionResult['tests'][number]> {
    const signal = AbortSignal.timeout(MODEL_PROBE_TIMEOUT_MS);
    try {
      const result = await this.completeOnce({
        config: input.config,
        messages: input.messages,
        maxTokens: 512,
        stream: false,
        signal,
        purpose: 'test_connection',
        sessionId: createOpaqueModelGatewaySessionId(`probe:${randomUUID()}`),
      });
      const recognized = input.expected.test(String(result.content || '').trim());
      return {
        key: input.key,
        label: input.label,
        capability: input.capability,
        ...(input.value ? { value: input.value } : {}),
        ok: recognized,
        message: recognized
          ? input.successMessage || '真实探针通过'
          : '请求已完成，但模型未正确识别探针内容',
        usage: result.usage,
      };
    } catch (error) {
      const classified = toSafeModelStreamError(classifyProviderError(error, { signal }));
      return {
        key: input.key,
        label: input.label,
        capability: input.capability,
        ...(input.value ? { value: input.value } : {}),
        ok: false,
        message: probeFailureMessage(classified.category),
      };
    }
  }

  listRemoteModels(config: ModelGatewayRuntimeConfig): Promise<ModelGatewayRemoteModel[]> {
    return Promise.resolve().then(() => {
      const adapter = this.getRemoteModelListAdapter(config.protocol);
      if (!adapter) {
        throw new BadRequestException(`当前协议暂不支持远程模型列表: ${config.protocol}`);
      }
      return adapter.listRemoteModels(config) as Promise<ModelGatewayRemoteModel[]>;
    });
  }

  supportsRemoteModelList(protocol: string = DEFAULT_MODEL_PROTOCOL): boolean {
    return Boolean(this.getRemoteModelListAdapter(protocol));
  }

  /** 协议描述（默认端点 / 多模态 / 原生联网等）；未装载的协议返回 undefined */
  describeProtocol(protocol: string = DEFAULT_MODEL_PROTOCOL): ModelProtocolDescriptor | undefined {
    return this.modelStreamRegistry.describe(protocol || DEFAULT_MODEL_PROTOCOL);
  }

  /** 管理端用：当前装载的协议列表、厂商预设与模型目录 */
  getProfilePayload(): ModelGatewayProviderProfilePayload {
    return buildModelGatewayProviderProfilePayload(this.modelStreamRegistry.listDescriptors());
  }

  private getAdapter(
    config: ModelGatewayRuntimeConfig | ModelStreamRuntimeConfig,
  ): ModelStreamAdapter {
    const protocol = config.protocol || DEFAULT_MODEL_PROTOCOL;
    return this.modelStreamRegistry.get(protocol);
  }

  private getRemoteModelListAdapter(
    protocol: string = DEFAULT_MODEL_PROTOCOL,
  ): RemoteModelListAdapter | undefined {
    try {
      const adapter = this.modelStreamRegistry.get(protocol || DEFAULT_MODEL_PROTOCOL);
      return typeof adapter.listRemoteModels === 'function'
        ? (adapter as RemoteModelListAdapter)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeRequestHistory<T extends ModelGatewayRequest | ModelStreamInput>(request: T): T {
    const adapter = this.getAdapter(request.config);
    const messages = normalizeModelHistory(request.messages, {
      config: request.config,
      supportedMediaTypes: adapter.descriptor.multimodalTypes,
      reasoningAlreadySanitized: request.historyReasoningSanitized === true,
    }).map(message => {
      const { __agent_context: _internal, ...providerMessage } = message as any;
      return providerMessage;
    });
    return { ...request, messages } as T;
  }

  private async *streamPrepared(
    request: ModelGatewayRequest | ModelStreamInput,
    estimatedInputTokens: number,
  ): AsyncGenerator<ModelStreamEvent> {
    const adapter = this.getAdapter(request.config);
    let outputObserved = false;
    let usageObserved = false;
    let doneObserved = false;
    let finishReason: string | undefined;
    let usage: ModelStreamUsage | undefined;

    const safeError = (
      error: ModelStreamError,
      options: { ignoreBufferedDone?: boolean } = {},
    ): ModelStreamError => {
      const sanitized = toSafeModelStreamError(error);
      return outputObserved || usageObserved || (doneObserved && !options.ignoreBufferedDone)
        ? { ...sanitized, retryable: false, requestOutcome: 'unknown' }
        : sanitized;
    };

    try {
      for await (const event of adapter.stream({ ...request, stream: true })) {
        if (
          (event.type === 'text_delta' && Boolean(event.delta)) ||
          (event.type === 'reasoning_delta' && Boolean(event.delta)) ||
          event.type === 'tool_call_delta' ||
          event.type === 'hosted_tool_call'
        ) {
          outputObserved = true;
        }
        if (event.type === 'usage') {
          usageObserved = true;
          usage = toSafeModelStreamUsage(event.usage);
          yield { type: 'usage', usage };
          continue;
        }
        if (event.type === 'done') {
          doneObserved = true;
          finishReason = event.finishReason || finishReason;
          continue;
        }
        if (event.type === 'error') {
          yield { type: 'error', error: safeError(event.error) };
          return;
        }
        if (event.type === 'abort') {
          const error = event.error
            ? safeError(event.error)
            : classifyProviderError({ name: 'AbortError' });
          yield { type: 'abort', error };
          return;
        }
        yield event;
      }

      if (!doneObserved) {
        yield {
          type: 'error',
          error: safeError(classifyProviderError(new Error('provider_stream_without_terminal'))),
        };
        return;
      }

      const silentFailure = classifySilentProviderCompletion({
        finishReason,
        usage,
        outputObserved,
        estimatedInputTokens,
        contextWindowTokens: this.contextWindowTokens(request.config),
      });
      if (silentFailure) {
        yield {
          type: 'error',
          error: safeError(silentFailure, { ignoreBufferedDone: true }),
        };
        return;
      }
      yield { type: 'done', finishReason };
    } catch (error) {
      const classified = safeError(classifyProviderError(error, { signal: request.signal }));
      if (classified.category === 'aborted') {
        yield { type: 'abort', error: classified };
      } else {
        yield { type: 'error', error: classified };
      }
    }
  }

  private contextWindowTokens(config: ModelStreamRuntimeConfig): number | undefined {
    if (!config.capabilities || typeof config.capabilities !== 'object') return undefined;
    const value = Number((config.capabilities as Record<string, unknown>).maxInputTokens);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }
}

type ProbeMultimodalType = 'image_url' | 'document' | 'audio_url' | 'video_url';

const PROBE_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVR4nGP4ICJCEmIY1SAyGkofhmvSAAC4MxgQNp15KgAAAABJRU5ErkJggg==';
const PROBE_VIDEO_DATA_URL =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMvbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABdwAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlp0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAABdwAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAXcAAAAAAABAAAAAAHSbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAYABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT1zdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAK/+EAF2dCwArZBCbARAAAAwAEAAADABA8SJkgAQAFaMuDyyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAOFQAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAwAAIAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAwAAAAEAAAAgc3RzegAAAAAAAAAAAAAAAwAAAo8AAAAKAAAACwAAABRzdGNvAAAAAAAAAAEAAANfAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2My4xLjEwMgAAAAhmcmVlAAACrG1kYXQAAAJwBgX//2zcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0yIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAF2WIhAU8mKAAP78nJyddddddddddddeAAAAABkGaOAp4RgAAAAdBmlQCXhGA';
const PROBE_AUDIO_WAV_BASE64 =
  'UklGRiAsAABXQVZFZm10IBAAAAABAAEAcBcAAHAXAAABAAgATElTVBoAAABJTkZPSVNGVA0AAABMYXZmNjMuMS4xMDIAAGRhdGHaKwAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgH+AgICAgICAgICAgIB/gICAgICAgICAgIB/gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIB/gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAf4CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAf4CBgICAf4CAgICAgICAgH+Af4CAf4CAgIKAgYGAgYB/gH9+f35/f35+fn6BgoOFhoWGhISCf358e3t7e3t7fHx8f4OFiIqLjIyJhYJ+enh1dXZ2d3d5e32Bh4uPkZGQjomEfnl0cG5vb3F0d3h7gIWMkZSWlpSQioN9dnBtbGtucnR4fHuBh4qRlpeXlpCKg3lybWpqbG5zeHl8foKIjJGYmJiYkYmBeG9saWdscXN4fH1+g4mNkZiZmZiSiIB1bGlmZWtwc3p/gH+DiYuQmJqanJSJg3dsaGNjaW1zeX6Cg4GDiY+TmZ2ZmZKEfnFkZGRiaXJ1fYKCgn+Dio2WnJucmY6FemtlYWFma3J7gIOGhH6Ah42UmpycmpOIfG9lY2Bja3B3gYOEh4B4gYmKlZ6dnZyRhnttZWNfZW5weIODhIeCeniCio+aoJ2dmIl9cmVjYmJsc3aBhYSGg3t3d4SLkp2hnpyUh3hsZ2FiaW12f4CFh4N+e3Nzg4uSn6Kfn5aFe3BkZWVmcHh6goeEhIJ5d3N1h5GVoaacm5J/dG1kZGdqdHt+hYaEg315dm53hoyYo6CinY6EeGtmZmVqdHp6hYiCg4F5dnRvfI2QnaWgn5uIfndnY2hnbHZ8f4SGhIB9eHNzb3eMkpmmo52cjn53amVnZ2x1en+ChYOAfHh1c3Jwf46Sn6SgoJiJf3RoZWZnbXZ6fYODgIB8dXd0cXN6ipObpKSfnJKBeW9lZmlpc3p5gYR/gH51d3ZydXN3i5SYpKafn5WFe3FnaGhqcnh5gIGBf3t5eHN3d3Nzfo2Um6annqGXgn1zZWlsa3N6eX+Bf3x6d3Z1d3d4d3WDk5SdqaOgopKDfHBobGtvdnh8fn19eXV2dHR4eHd8eHSIkZOgp6GinI6EeG9vbW50eHd+fnp8eXR2d3V6e3x9e3d7ho2UnZ+eoJaLhHhvcHBvdnl5fX97enl2dnd6ent+fnt8eHiGjZCcopudmYuBe3FvcnJ0fHp8f3t5e3V3fHp6gH59fnx4d3eDipGan5uZlIqCeHNzdXZ6fXx/f3t6eXZ5eHp+fn2Afnx8end4f4eNlJqZlZOLgn13dHZ2eX5+fX9/e3p6eHl8fX6AgH+Afn17enp8g4mMkZKOjIiBfXt4ent8f4GAgH99fX18fH5+f4GBf4B/fn18fHyAhYeJi4mHhYF+fXx8fn+AgYGAf359fn19fn9/gIGAgIB/fn5+fn+Cg4WGhoSDgX9+fX1+f4CBgYCAf39+fn9/f4CAgICAgH9/f39+f4CBgoODgoKBgH9/f3+AgICAgICAf39/f3+AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAf3+AgH9/gICAgICAgICAgH+AgYGAgYGAgYF/f4GBfn1+f36AgYB/goOBgIB8fYOKiIKJgndufoN7dXqBgYuMh4SDiIyHf29pbHV4dG9ucX6ChYaNipSzs5uBgoF/enNya19hbnJxbHODg4CXvq2SjI6KiYN3bmlkZnZuX21+dnSAn7eykH2OkoqFhG9jbW1xaGZwdnN3ocKuf3mLi4iKhWplbndubXJvb3Z5osurc3ONiISOgGhmdnZucHJwb3d4qc+ianKShomOfWdpeXZwcXVvcnh4rc6eYXaRiIeQfGNteXdwc3ZudHd4qs2ZYHeTiYeReWRsfHdxdHVvcXp2p8ubX3aViYWNfGZwfHhwdHZwcHd0mdCjYm2Xi4CLfmpufndwdHdybnhyhse0a2CXk4GGhG5ufHpwdHh0bnZ3d7LEe1mNoYOAhnVuenxycXl2cnF+cI/DpV1ypZR7goFzeHx1bnd5dW92eXKjxIdciqWGfYR8dX16cHB5eHJweHV2tbx2YZqegH6Eenh9dnBze3ZxcXpyfLy3bWagnH5/gnl6fnNwdH10cnF7cHy8tGxnopl+fYN3e3x0b3V8dnNxe3J7t7ZwZp+cfn6DeXt9dG51e3Zxcnl0c627fGKWoIJ9g3t6fnZvc3t3cHJ4eW2bwpBghqWJfIJ+eX95b3F6e3JydXxvgr6taXGhl3uAf3p7fXJwdnt2cHR3eW2jwYtfjKOFfYF9eX93b3J6eXBydntue7mzb2ugmH5+gnl9fHRvd3t3cXZ4eWuPwZ5jfaWPfIB/eX96cW95e3Vwdnl5bZu/kGGIpIp8gn56fnlwcXp6dHF3eXhun76NYouiiHuCfnt+eXBzenpzcXh6d2yawJJjhqKKfYJ+e395cHF6enRxeXl5bIzBomd6o5B9gIB6f3tycXl8dXJ3enlxd7a3eGebmoF+gnp8fXVwdnx4c3R8eHdsl8KZY4GkjXyBfnp+enFyent1cnh6eHNzq72DZJOfhX2Ce3t+d3B0fHlzdHt7eHF5s7Z5aJqcg36De3x8dnB1e3lzdXt6eHJ4sLZ8aJidg32De3t8dW92e3ZyeHt6dnd4oLiRa4Wak395fH96dXNueX9yan6Fc216kKuqfnKSnIR9f312eXNxdHl3dXN8gXpwdqCzlnyBjpGKfXZ5e3NtcXh4dXV3goF3c4Car5uAgYqNiXx4eHJteHVneId4boGNhHN1l7Sag4WEfoiGdHBxbnJ2cnJ+gYJ+g5B/dY2gopaAc4iObWqFgGRcdIh/b32Wi4CKjoqDfpGolHh2dHB7hnxiY4KDcH2Tj4eNmJeEfoGJgHuRkG1ZdYR0d4R6dHqFhImXk36LooxmfI51YXSWjmVZfYp5eIiJf397iJGFjZeIgoeCdnR7d2d4n4NVZZiTcXuNh4aBcYKYk3qCmo1uc4yEam1ufZuLWWeWlHl4i46IcnKKkYeDi4mChH94gX5paXmCk39rdI6DgoyId3iSj2BuqZ12d42Ne3R6fmpzgX6LgWJsmJh4gJCAdXl7h4qCkpJ8fIiBg3lxeYZlYqGWVm6hgm6Pl3dtf4qHg3h/lZGGjYxyd4R+ZnOHkIdgZoh/cpCRdW+GgnNwgpuThIOGgZGIenqKhnJ2kpN6dYN9fYV8dXh3d3l5e36ChH5+hImEgYSBfYOEg4uIf3+DgYOBfn59eHl/fnt9fnx/goB/gICBgoB/gIOHhoCAgoKDgn9+f39+f359fn9/f35/gICAf4GBgICBg4OCgYGBgoGAgIB/f39/f39/f39/gIB/gICAgICAgIGBgYCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGAf4CBgH+AgYB/gIF/f4CBgH+AgH9/gYF/f4CAgICAgICAgICBgH5+goF+f4KBfX+CgX+BgX9+gYF/gIF/foGBgICBf35/gYGAgH9/gYKAfH6FhHx8gYF/hIR7eYSGfnuBgn59goWCgX54fY6IcG+OjHF6mYdqf5h/aX2NhHp9eoSOfmt7jYN1foWCfHh+g4V9fYWlnnVmgI+Ef3JyeIOCfHd3hIN6eIaCdnqmtnxUdqSKbXKCdHGDg3d0g4B3eoOGcn66sW5SkKN+aXl/cHWEfnN3gnxzgIR5d7C9eFOFqoZpd4Fxcn+Bc3d7fnR/hXaCtrJtWJGqf2d4hXBxgIFzdX53eX+CdZe+llZtqZhva4V+bXmCe3F9e3h4hHuAt69tVpSngGV6hnNyf350dn94dX6Bd5zAjlVyqpRsbYR8b3uAd3N+fHV4g3mAtrFvWJOpf2h6hHR1gHxxeoB5dH2Ac5LAnF1po55xboB+cHuBdXN+fnV4gX1xnL+SWnKnlXB0hHpvfoBzc399dHmBfHGPv6BiaZycdnSEe3B7gXRxfn90eH5/dHaov4dcfqSMc36Dc3OBe252gHlyeoB5dHWkw45feqGNdYCDcnKBe211gHhxeoB4dHKGvbVyZI+dfnyIem55gnJue3xxc358c3Vzgr+7eGaMmoCDjXlsfIZzbn19cXSAe3J0eXKazJxmd5WKgJKIbHGGfm13gHVwfH90cnh4cJvLmWV3komDlYlrcod/b3h/c3F9fnNzeXlxf767c2mJj4SPlXdof4h2cX15b3eAeXB0endyfrm+d2iGjoaQl3pnfIp6cXx6b3SAfHJzeXh3dI3GqmlwjI2Llo9wa4OJd3R7dG95gHhydXl4eXV+ubx1Z4aOjZSReWh4i4J1d3VudH59dHJ3e3p6dYK4tndpgpGRkJF7Z3iKhXlydHVyfYB0dXR3g3prfKy5jXB7homZl3lxdnyGg3lxcXV3eIF7ZneIeXN0gaeyjXR3hI+VlIJrcIiIenh2dXF0hX1tdXt6gHxwdJm7nnF3g4eUloZ3bnaOh3F7eWt3hXtzd3l5fX58cXWmwY9rfYaJk5SGbm2Ein15enJwfIJ6c3Z7fHl9fW9yn7+ZbXeGipCTi3FqhIp7e3pxcXmAenR3eHl+fXl4b4C2tX1ug4eJlpN6bnmFhH97dHF2fX55dXV6fXx9e3VwiLitenaBhI6TkX1reYeBfXp0cHR+fXd3d3d+fXt8dnB+qreJc4GDh5eVf3J0gId9enpvcn19enZ2enp9f3h4eHCIua18eoR/jJqOfXN3g4N9e3hxdH97d3l2eXx9fXl2eHKFt65/f4N8jJmPfXR4gIF9fXZxdnx6eHh3eHt9fXp4eHR4oriRgIh6f5eUhn53e358gHtzdHh5eHh4dnl7fHx5endwhKmlkJCCeY2Ujot8eIB3eoRycX1ydYB0dH14d4B6dXx1dJKonJKQgX+RlYuFgHl5fXl7enJ4eXR6eXV3d317dHx5b4SinJOYh36KkZKIgoJ6eH98dXl2dHh2eHd0enh4fXZ1eXySnpSTjIOLjY2NhYJ+eHx9dnl5cXd7cnZ6d3l7eHd3d4OSkZWUhomOi5CMgoOAeXx9eXh2dXZ0eHx3d3d3eXh5e4aPj5aQho2NiY+JgYSAen97dXx6dHp3dHt6dnt6eHp8hIuLjYyGhoqKioiEgoB/f357e3p4enl4e3l4fHp5fIGHhomLhYWKhoaJhIKCgH9/fXx7e3p6enp6e3t7e32DhYSHh4WHhoWGhIKEgX6Afnt9fXt7fHt7e3p7fX6BhIOFhYSFhoWFhIKCgICAfX1+fHt9fHt8fHt9fn+Cg4SFg4OFhISEgoGBgH9/fn1+fXx9fHx+fXx/gYGDhYOCg4KDhIGBgYB/gH59fn5+fX5+fH1+foGDg4OCgoKCg4KBgYGAf4B/fn9/fX9+fX9+fn+BgoKDgoGBgoGCgoCAgH9/f35/f39/fn5+fn+AgoKCgoGBgoGBgYGAf4CAf39/f39/f35+f3+AgoGBgoCBgYGBgYGAgIB/f4B/f39/f39/f3+AgYGBgYCAgYGBgYGAgIB/f4B/f4B/f3+Af4CAgYGBgYCAgICBgYCAgICAgICAf4CAf4CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgH+Bf4CAgICAgICAgICAgICAgICAgICAgX+Bf4CAgIF/gH+AgICAgICAgICAgICAgICAgICAgICAgIB/gX+AgICBgICAgICAgICAgICAgIF/gYCBgICAf4F/gYCAgICAf4CAgICAgICAgICAf4CAgX+AgICAgICAgICBgICAf4GAgH+AgYCBf4B/gIF/gX+Bf4CAgIGAgICBf4F/gH9/gICBf4CAgIGBf4B/gX+Bf4CBgIB/gH+BgIGAgIB/gX6Bf4B/f4J/gn6Bf4CAf4F/g36Bf4CBfoJ9gn6BgH+Cf4J/gX+AgICAf4CAgX+Af4CBgIGAgICAgIGAgICAgICAgICAf4F/gYB/gn6DfoF9f4CAgX+BgIGAgX+Af4CAf4F/gIF/gX+BgICBf4F+gYB/gH6Bf4F/gYCAgX+BfYJ9gn6BgX+FfIV8gn9/gX2EfoJ+gIF+gn2Cf4GBf4J9gn6Cf4CAgICAgH+Af4GAgYF/gICAgH6Bf4GBf4J9g3+BgH+BfoN+gn6BgICAf4J+gn6Bf4GAgIF/gn+CgH+BfoJ+gn+BgICBf4CAgIGAgICAgIF/gX+BgICAf4F+gX+Bf4B/gYCAgH+Af4GBg4CCf4GAgIB/gH6Af4B/gH+AgH+Af4F/hIGEgoOEgIN+gnx/e3x7e3x7fX19fX2Bg4aJioyLi4iGg399eXd2dXZ2eHh5fHt+gIWJjpGSk5GQi4aAe3dzcW9vcHJzdXd4fICGjJKXmp2cmpONhHx1bmtoaWltbnJ0dnp+hYuSlpudnpuVjoV+dXBraGdoa21xc3Z5fYOJkJaanZ6cl5CIf3hwbGdoZ2ptb3N1eHyBiI6VmZ2dnZiSioF5cm1pZ2dpa25xdXV6foaMk5icnp2blY6FfXVva2hnaGltb3NzeHyCipCYmp+dnZaRh4B3cWxpZ2hpa25xc3V7gIqPmJqfnp6Yk4qCeXNtamdoaGpsb3FyeX6IjZeZn56fmZWMhXx1bmtoZ2dqbG9xcnl+iI6XmZ+enpmUjIV8dW9raGdnamtvcHN5foiOl5qfnp6YlIuEe3Vva2hoZ2prb290eYCIkJebn5+dmJKKgnp0bmtoaGhqbHBvdnmDiZOYnZ6fm5ePiH95cm5paGdpam1vcHd8hoyWmZ+en5qVjIZ8d3BtaWloamtvbnR4gYiRlpyeoJ2ZkouCe3Rwa2ppamptbm92eoSLlZienp+alo2GfXdwbWlpaGtrb250eIGHkZacnp+cmJGKgXpybmppaGpqbm9yd32FjJSZnZ6empSMhHx1b2toaGhqbG9wd3qEipOXnJ2empeOiH54cW1paGdqa29vdnmCiJGVm5yempeQiYB5cm5qaGdpam5udHiAho+UmZydm5iSi4N8dG9raWhpaW1tcnZ9hY2UmJydnJiTjIR9dnBsaWhpaW1ucXZ8hYyUmJycnJiTjIV9d3FtamhpaWxucHZ7hIuUmJydnJiUjIV9d3FtamlpamxucHZ7hIuTl5ydnZiUjIZ9d3Fua2ppa21vcHZ7g4qTl5ycnZiVjYZ+eHJua2pqa21vcXV6gomSlpubnJiUjIV9d3Fua2tqbG5wcnZ8gomQlpmcmpiTjYV+d3Fua2trbW5xc3d8gomPlJiampiTjYZ+eHJvbGtrbW9xc3d8goiOk5eYmJaSjYZ/eXRwbWxsbW9xc3h8goeOkpaXl5WSjIeAenRxbm1tbm9ydHh8goiNkZWWlpSRjIaAe3Zyb25ubnBxdHd7gIaMkJOVlZOQi4aAe3ZzcG9vcHFzdXh8gYeMkJKUk5GNiYR/e3h1c3NzdHR2eHt+goaKjI+Pj42KhoN/fHl3dnZ2dnd4enx+gYSHiYuMjIqJhoOAfXt5eHh4eHl5e3x+gIKEhoiJiYmHhoOBf317enl5enp6e3x+f4GDhYaHiIeGhYOCgH58e3t6ent7fH1+f4CCg4WGhoaGhYOCgH9+fHx7e3t8fH1+foCBgoOEhYWFhISCgYB/fX18fHx8fX1+fn+AgYKDhISEhIOCgYB/fn59fX19fX1+fn+AgIGCg4ODg4OCgoGAf35+fn19fX5+fn9/gIGBgoKDg4OCgoGAgH9/fn5+fn5+fn9/gICBgYKCgoKCgoGBgIB/f39+fn5+fn9/f3+AgIGBgYKCgoKCgYGBgIB/f39/f35/f39/f39/gICBgYGCgoKCgYGBgICAf39/f39/f39/f3+AgICAgIGBgYGBgYGBgYCAgH9/f39/f39/f3+AgICAgICBgYGBgYGBgYCAgICAgH9/f39/f4CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

function isProbeMultimodalType(value: string): value is ProbeMultimodalType {
  return ['image_url', 'document', 'audio_url', 'video_url'].includes(value);
}

function capabilitiesForProbe(
  config: ModelGatewayRuntimeConfig,
  type: ProbeMultimodalType,
): ModelGatewayRuntimeConfig['capabilities'] {
  return {
    ...(config.capabilities || {}),
    ...(type === 'image_url' ? { vision: true } : {}),
    ...(type === 'document' ? { documentInput: true } : {}),
    ...(type === 'audio_url' ? { audioInput: true } : {}),
    ...(type === 'video_url' ? { videoInput: true } : {}),
  };
}

function mediaProbeDefinition(type: ProbeMultimodalType): {
  label: string;
  content: any[];
  expected: RegExp;
} {
  switch (type) {
    case 'image_url':
      return {
        label: '图片解析',
        content: [
          { type: 'text', text: '识别图片的主要颜色，只回答颜色。' },
          { type: 'image_url', image_url: { url: PROBE_IMAGE_DATA_URL } },
        ],
        expected: /red|红/i,
      };
    case 'document':
      return {
        label: 'PDF 文档',
        content: [
          { type: 'text', text: '读取文档中的四位数字，只回答数字。' },
          {
            type: 'document',
            document: {
              data: buildProbePdfDataUrl(),
              mime: 'application/pdf',
              name: 'probe.pdf',
            },
          },
        ],
        expected: /4827/,
      };
    case 'audio_url':
      return {
        label: '音频解析',
        content: [
          { type: 'text', text: '听这段语音报出的四位数字，只回答四位阿拉伯数字，不要解释。' },
          {
            type: 'input_audio',
            input_audio: { data: PROBE_AUDIO_WAV_BASE64, format: 'wav', mime: 'audio/wav' },
          },
        ],
        expected: /4827/,
      };
    case 'video_url':
      return {
        label: '视频解析',
        content: [
          { type: 'text', text: '识别视频画面的主要颜色，只回答颜色。' },
          { type: 'video_url', video_url: { url: PROBE_VIDEO_DATA_URL } },
        ],
        expected: /black|黑/i,
      };
  }
}

function buildProbePdfDataUrl(): string {
  const stream = 'BT /F1 24 Tf 72 720 Td (4827) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`;
}

async function runProbeTasks<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let index = 0; index < tasks.length; index += concurrency) {
    results.push(
      ...(await Promise.all(tasks.slice(index, index + concurrency).map(task => task()))),
    );
  }
  return results;
}

function reasoningLevelLabel(level: ModelGatewayReasoningEffort): string {
  return (
    {
      off: '关闭',
      minimal: '极低',
      low: '低',
      medium: '中',
      high: '高',
      xhigh: '超高',
      max: '最高',
    } as const
  )[level];
}

type ReasoningProbeCandidate = {
  level: ModelGatewayReasoningEffort;
  skippedMessage?: string;
};

const REASONING_PROBE_REPRESENTATIVE_PRIORITY: ModelGatewayReasoningEffort[] = [
  'off',
  'medium',
  'low',
  'high',
  'xhigh',
  'minimal',
  'max',
];

function buildReasoningProbeCandidates(
  adapter: ModelStreamAdapter,
  config: ModelGatewayRuntimeConfig,
): ReasoningProbeCandidate[] {
  const baselineSignature = reasoningProbeSignature(adapter, config);
  const signatures = new Map<ModelGatewayReasoningEffort, string | undefined>();
  for (const level of MODEL_GATEWAY_REASONING_LEVELS) {
    const signature = reasoningProbeSignature(adapter, config, level);
    signatures.set(level, signature === baselineSignature ? undefined : signature);
  }

  const groups = new Map<string, ModelGatewayReasoningEffort[]>();
  for (const level of MODEL_GATEWAY_REASONING_LEVELS) {
    const signature = signatures.get(level);
    if (!signature) continue;
    groups.set(signature, [...(groups.get(signature) || []), level]);
  }
  const representativeBySignature = new Map<string, ModelGatewayReasoningEffort>();
  for (const [signature, levels] of groups) {
    const representative = REASONING_PROBE_REPRESENTATIVE_PRIORITY.find(level =>
      levels.includes(level),
    );
    if (representative) representativeBySignature.set(signature, representative);
  }

  return MODEL_GATEWAY_REASONING_LEVELS.map(level => {
    const signature = signatures.get(level);
    if (!signature) {
      return {
        level,
        skippedMessage: '当前模型与协议未生成此档位的推理控制参数',
      };
    }
    const representative = representativeBySignature.get(signature);
    if (representative && representative !== level) {
      return {
        level,
        skippedMessage: `与“${reasoningLevelLabel(representative)}”使用相同控制参数，不重复认定为独立档位`,
      };
    }
    return { level };
  });
}

function reasoningProbeSignature(
  adapter: ModelStreamAdapter,
  config: ModelGatewayRuntimeConfig,
  level?: ModelGatewayReasoningEffort,
): string | undefined {
  const requestBodyBuilder = (
    adapter as ModelStreamAdapter & {
      buildRequestBody?: (request: ModelGatewayRequest, stream: boolean) => unknown;
    }
  ).buildRequestBody;
  if (typeof requestBodyBuilder !== 'function') return undefined;

  let body: Record<string, any>;
  try {
    body = requestBodyBuilder.call(
      adapter,
      {
        config: { ...config, reasoningEffort: level },
        messages: [{ role: 'user', content: '只回答 PROBE_OK' }],
        maxTokens: 512,
        stream: false,
        purpose: 'test_connection',
      },
      false,
    ) as Record<string, any>;
  } catch {
    return undefined;
  }
  const controls = {
    reasoningEffort: body?.reasoning_effort,
    thinking: body?.thinking,
    enableThinking: body?.enable_thinking,
    reasoning: body?.reasoning?.effort,
    outputConfig: body?.output_config?.effort,
    thinkingConfig: body?.generationConfig?.thinkingConfig,
  };
  return Object.values(controls).some(value => value !== undefined)
    ? JSON.stringify(controls)
    : undefined;
}

function probeFailureMessage(category: ModelStreamError['category']): string {
  return (
    {
      context_overflow: '探针输入超过模型上下文限制',
      rate_limit: '服务商限流，请稍后重试',
      transient: '服务商暂时不可用，请稍后重试',
      auth: '认证失败，请检查密钥与服务商权限',
      invalid_request: '服务商拒绝该能力或档位请求',
      aborted: '探针已取消',
      unknown: '探针失败，服务商未返回可确认结果',
    } as const
  )[category];
}

function sumProbeUsage(
  tests: ModelGatewayTestConnectionResult['tests'],
): ModelStreamUsage | undefined {
  const usages = tests.flatMap(test => (test.usage ? [test.usage] : []));
  if (!usages.length) return undefined;
  return usages.reduce<ModelStreamUsage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
      cacheHitTokens: (total.cacheHitTokens || 0) + (usage.cacheHitTokens || 0),
      cacheMissTokens: (total.cacheMissTokens || 0) + (usage.cacheMissTokens || 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}
