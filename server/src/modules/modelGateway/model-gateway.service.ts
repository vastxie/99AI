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
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAN0bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAADIAAAEAAABAAAAAAIXbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAACgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnJ0AAAAAAAAAHZIAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAFAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAOGN0dHMAAAAAAAAABQAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAUAAAABAAAAKHN0c3oAAAAAAAAAAAAAAAUAAALFAAAADAAAAAwAAAAMAAAADAAAABRzdGNvAAAAAAAAAAEAAAOkAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2My4xLjEwMQAAAAhmcmVlAAAC/W1kYXQAAAKuBgX//6rcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49MjUgc2NlbmVjdXQ9NDAgaW50cmFfcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAPZYiEADP//vbsvgU2FMjBAAAACEGaJGxCv/7AAAAACEGeQniF/8GBAAAACAGeYXRCv8SAAAAACAGeY2pCv8SB';

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
          { type: 'text', text: '这段音频是电话按键音（DTMF）。只回答四位数字，不要解释。' },
          {
            type: 'input_audio',
            input_audio: { data: buildProbeDtmfWavBase64(), format: 'wav', mime: 'audio/wav' },
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

function buildProbeDtmfWavBase64(): string {
  const sampleRate = 8000;
  const toneSamples = Math.round(sampleRate * 0.28);
  const gapSamples = Math.round(sampleRate * 0.09);
  const tones = [
    [770, 1209],
    [852, 1336],
    [697, 1336],
    [852, 1209],
  ];
  const sampleCount = tones.length * toneSamples + (tones.length - 1) * gapSamples;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(44 + sampleCount * bytesPerSample);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(sampleCount * bytesPerSample, 40);
  let outputIndex = 0;
  tones.forEach(([lowFrequency, highFrequency], toneIndex) => {
    for (let index = 0; index < toneSamples; index += 1) {
      const low = Math.sin((2 * Math.PI * lowFrequency * index) / sampleRate);
      const high = Math.sin((2 * Math.PI * highFrequency * index) / sampleRate);
      buffer.writeInt16LE(Math.round((low + high) * 4096), 44 + outputIndex * bytesPerSample);
      outputIndex += 1;
    }
    if (toneIndex < tones.length - 1) outputIndex += gapSamples;
  });
  return buffer.toString('base64');
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
