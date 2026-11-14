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
import {
  accumulateResponsesUsage,
  buildDeepSeekHostedToolEvent,
  buildReasoningInputItem,
  DEEPSEEK_READ_URL_TOOL_NAME,
  DEEPSEEK_WEB_SEARCH_TOOL_NAME,
  deleteDeepSeekTemporaryFiles,
  executeDeepSeekHostedWebCall,
  extractLatestUserQuestion,
  isDeepSeekResponsesRequest,
  materializeDeepSeekInputFiles,
  MAX_DEEPSEEK_HOSTED_WEB_STEPS,
  parseDeepSeekHostedWebArgs,
  prepareDeepSeekResponsesRequest,
} from './deepseek-responses';
import type { DeepSeekResponsesProviderState } from './deepseek-responses';

export const OPENAI_RESPONSES_PROTOCOL = 'openai_responses';

/** OpenAI Responses 协议（含 DeepSeek 原生 Responses 与豆包方舟兼容）；原生联网搜索由协议自身提供 */
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
      if (isDeepSeekResponsesRequest(gatewayRequest)) {
        yield* this.streamDeepSeek(gatewayRequest);
        return;
      }

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
      const webSearchStates = new Map<string, WebSearchToolState>();
      const pendingCitations: WebSearchCitation[] = [];

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
          case 'response.reasoning_text.delta':
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
          case 'response.reasoning_text.done':
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
              const state = getWebSearchState(webSearchStates, event.item.id, pendingCitations);
              collectWebSearchItem(state, event.item);
              yield* webSearchToolEvents(state, 'running');
            }
            break;
          case 'response.output_item.done':
            if (event.item?.type === 'web_search_call') {
              const state = getWebSearchState(webSearchStates, event.item.id, pendingCitations);
              collectWebSearchItem(state, event.item);
              yield* webSearchToolEvents(
                state,
                event.item.status === 'completed'
                  ? 'success'
                  : event.item.status === 'failed' || event.item.status === 'incomplete'
                    ? 'error'
                    : 'searching',
              );
            } else if (event.item?.type === 'message') {
              yield* collectMessageAnnotations(webSearchStates, event.item, pendingCitations);
            }
            break;
          case 'response.web_search_call.in_progress':
            yield* webSearchToolEvents(
              getWebSearchState(webSearchStates, event.item_id, pendingCitations),
              'running',
            );
            break;
          case 'response.web_search_call.searching':
            yield* webSearchToolEvents(
              getWebSearchState(webSearchStates, event.item_id, pendingCitations),
              'searching',
            );
            break;
          case 'response.output_text.annotation.added':
          case 'response.output_text_annotation.added':
            yield* collectWebSearchCitation(webSearchStates, event.annotation, pendingCitations);
            break;
          case 'response.web_search_call.completed':
            yield* webSearchToolEvents(
              getWebSearchState(webSearchStates, event.item_id, pendingCitations),
              'success',
            );
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
            yield* collectWebSearchOutput(
              webSearchStates,
              event.response?.output,
              pendingCitations,
            );
            finalFinishReason = event.response?.status || 'completed';
            if (event.response?.usage) {
              finalUsage = this.normalizeUsage(event.response.usage);
              yield { type: 'usage', usage: finalUsage };
            }
            break;
          case 'response.failed':
            yield* collectWebSearchOutput(
              webSearchStates,
              event.response?.output,
              pendingCitations,
            );
            for (const state of webSearchStates.values()) {
              if (!state.terminal) yield* webSearchToolEvents(state, 'error');
            }
            throw toClassifiedProviderError(event.response?.error || event, {
              requestOutcome: 'rejected',
            });
          case 'response.incomplete':
            terminalObserved = true;
            yield* collectWebSearchOutput(
              webSearchStates,
              event.response?.output,
              pendingCitations,
            );
            for (const state of webSearchStates.values()) {
              if (!state.terminal) yield* webSearchToolEvents(state, 'error');
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
      if (isDeepSeekResponsesRequest(request)) {
        return await this.completeDeepSeekOnce(request);
      }
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
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
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
    const nativeWebSearch = isContextCompaction
      ? undefined
      : getOpenAINativeWebSearchConfig(request.config.capabilities);
    if (isDeepSeekResponsesRequest(request)) {
      return prepareDeepSeekResponsesRequest(request, stream, nativeWebSearch).body;
    }

    const mapped = mapGatewayMessagesToResponsesInput(request.messages);
    const functionTools = isContextCompaction
      ? []
      : mapOpenAIChatToolsToResponsesTools(request.tools);
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

  private async *streamDeepSeek(
    gatewayRequest: ModelGatewayRequest,
  ): AsyncGenerator<ModelStreamEvent> {
    const isContextCompaction = gatewayRequest.purpose === 'context_compaction';
    const additionalParams = isContextCompaction
      ? {}
      : gatewayRequest.config.additionalParams || {};
    assertNoReservedAdditionalParams(additionalParams);
    assertNoResponsesState(additionalParams);
    const nativeWebSearch = isContextCompaction
      ? undefined
      : getOpenAINativeWebSearchConfig(gatewayRequest.config.capabilities);
    const prepared = prepareDeepSeekResponsesRequest(gatewayRequest, true, nativeWebSearch);
    const sdkBaseUrl = this.resolveSdkBaseUrl(gatewayRequest);
    const client = this.createClient(gatewayRequest);

    const materialized = await materializeDeepSeekInputFiles({
      body: prepared.body,
      sdkBaseUrl,
      apiKey: gatewayRequest.config.apiKey,
      purpose: gatewayRequest.purpose,
      signal: gatewayRequest.signal,
    });

    try {
      let currentInput = Array.isArray(materialized.body.input)
        ? [...materialized.body.input]
        : materialized.body.input;
      const oriQuestion = extractLatestUserQuestion(gatewayRequest.messages);
      let totalUsage: ModelGatewayUsage | undefined;
      const priorSubturnItems: any[] = [];
      let allSubturnsHaveReasoning = true;
      let nextClientToolIndex = 0;

      for (let step = 0; step < MAX_DEEPSEEK_HOSTED_WEB_STEPS; step += 1) {
        const isFinalStep = step === MAX_DEEPSEEK_HOSTED_WEB_STEPS - 1;
        const stepBody = buildDeepSeekStepBody(
          materialized.body,
          currentInput,
          prepared.hostedWebToolNames,
          isFinalStep,
          !allSubturnsHaveReasoning,
        );
        const responseStream = await client.responses.create(stepBody, {
          signal: gatewayRequest.signal,
        });

        let stepFinishReason: string | undefined;
        let stepTerminalObserved = false;
        let stepReasoningText = '';
        let stepOutputText = '';
        const reasoningDeltaKeys = new Set<string>();
        const webSearchStates = new Map<string, WebSearchToolState>();
        const pendingCitations: WebSearchCitation[] = [];
        const hostedCallsByIndex = new Map<number, HostedFunctionCallDraft>();
        const ignoredHostedIndices = new Set<number>();
        const clientToolsByIndex = new Map<
          number,
          { clientIndex: number; callId: string; name: string }
        >();

        for await (const event of responseStream as any) {
          switch (event.type) {
            case 'response.output_text.delta':
              if (event.delta) {
                stepOutputText += event.delta;
                yield { type: 'text_delta', delta: event.delta };
              }
              break;
            case 'response.reasoning.delta':
            case 'response.reasoning_summary.delta':
              if (event.delta) {
                const delta = stringifyDelta(event.delta);
                if (delta) {
                  reasoningDeltaKeys.add(reasoningEventKey(event));
                  stepReasoningText += delta;
                  yield { type: 'reasoning_delta', delta };
                }
              }
              break;
            case 'response.reasoning_text.delta':
            case 'response.reasoning_summary_text.delta':
              if (event.delta) {
                reasoningDeltaKeys.add(reasoningEventKey(event));
                stepReasoningText += event.delta;
                yield { type: 'reasoning_delta', delta: event.delta };
              }
              break;
            case 'response.reasoning_summary_part.done':
              if (event.part?.text && !reasoningDeltaKeys.has(reasoningEventKey(event))) {
                stepReasoningText += event.part.text;
                yield { type: 'reasoning_delta', delta: event.part.text };
              }
              break;
            case 'response.reasoning.done':
            case 'response.reasoning_text.done':
            case 'response.reasoning_summary.done':
            case 'response.reasoning_summary_text.done':
              if (event.text && !reasoningDeltaKeys.has(reasoningEventKey(event))) {
                stepReasoningText += event.text;
                yield { type: 'reasoning_delta', delta: event.text };
              }
              break;
            case 'response.output_item.added':
              if (event.item?.type === 'function_call') {
                const outputIndex = event.output_index ?? 0;
                const toolName = String(event.item.name || '');
                const callId = String(
                  event.item.call_id || event.item.id || `ds_call_${step}_${outputIndex}`,
                );
                const initialArgs =
                  typeof event.item.arguments === 'string' ? event.item.arguments : '';
                if (prepared.hostedWebToolNames.has(toolName)) {
                  const hostedEventId = `hosted_ds_${step}_${outputIndex}_${Date.now().toString(36)}`;
                  if (isFinalStep) {
                    ignoredHostedIndices.add(outputIndex);
                    yield buildDeepSeekHostedToolEvent({
                      id: hostedEventId,
                      toolName,
                      status: 'error',
                      queries: [],
                      sources: [],
                    });
                  } else {
                    const draft: HostedFunctionCallDraft = {
                      outputIndex,
                      callId,
                      name: toolName,
                      argumentsText: initialArgs,
                      hostedEventId,
                    };
                    hostedCallsByIndex.set(outputIndex, draft);
                    yield buildDeepSeekHostedToolEvent({
                      id: draft.hostedEventId,
                      toolName,
                      status: 'running',
                      queries: [],
                      sources: [],
                    });
                  }
                } else {
                  const clientIndex = nextClientToolIndex;
                  nextClientToolIndex += 1;
                  clientToolsByIndex.set(outputIndex, { clientIndex, callId, name: toolName });
                  yield {
                    type: 'tool_call_delta',
                    index: clientIndex,
                    id: callId,
                    nameDelta: toolName,
                    rawName: toolName,
                  };
                  if (initialArgs) {
                    yield {
                      type: 'tool_call_delta',
                      index: clientIndex,
                      id: callId,
                      argumentsDelta: initialArgs,
                      rawName: toolName,
                    };
                  }
                }
              } else if (event.item?.type === 'web_search_call') {
                const state = getWebSearchState(
                  webSearchStates,
                  event.item.id,
                  pendingCitations,
                  'DeepSeek',
                );
                collectWebSearchItem(state, event.item);
                yield* webSearchToolEvents(state, 'running');
              }
              break;
            case 'response.function_call_arguments.delta': {
              const outputIndex = event.output_index ?? 0;
              if (ignoredHostedIndices.has(outputIndex)) break;
              const hostedDraft = hostedCallsByIndex.get(outputIndex);
              if (hostedDraft) {
                hostedDraft.argumentsText += event.delta || '';
              } else {
                const clientTool = clientToolsByIndex.get(outputIndex);
                if (clientTool) {
                  yield {
                    type: 'tool_call_delta',
                    index: clientTool.clientIndex,
                    id: clientTool.callId,
                    argumentsDelta: event.delta || '',
                    rawName: clientTool.name,
                  };
                }
              }
              break;
            }
            case 'response.function_call_arguments.done': {
              const outputIndex = event.output_index ?? 0;
              const hostedDraft = hostedCallsByIndex.get(outputIndex);
              if (
                hostedDraft &&
                !hostedDraft.argumentsText &&
                typeof event.arguments === 'string'
              ) {
                hostedDraft.argumentsText = event.arguments;
              }
              break;
            }
            case 'response.output_item.done':
              if (event.item?.type === 'function_call') {
                const outputIndex = event.output_index ?? 0;
                if (ignoredHostedIndices.has(outputIndex)) break;
                const hostedDraft = hostedCallsByIndex.get(outputIndex);
                if (hostedDraft) {
                  if (typeof event.item.arguments === 'string' && event.item.arguments) {
                    hostedDraft.argumentsText = event.item.arguments;
                  }
                } else if (!clientToolsByIndex.has(outputIndex)) {
                  const toolName = String(event.item.name || '');
                  const callId = String(
                    event.item.call_id || event.item.id || `ds_call_${step}_${outputIndex}`,
                  );
                  const argsText =
                    typeof event.item.arguments === 'string' ? event.item.arguments : '';
                  if (prepared.hostedWebToolNames.has(toolName)) {
                    const hostedEventId = `hosted_ds_${step}_${outputIndex}_${Date.now().toString(36)}`;
                    if (isFinalStep) {
                      ignoredHostedIndices.add(outputIndex);
                      yield buildDeepSeekHostedToolEvent({
                        id: hostedEventId,
                        toolName,
                        status: 'error',
                        queries: [],
                        sources: [],
                      });
                    } else {
                      const draft: HostedFunctionCallDraft = {
                        outputIndex,
                        callId,
                        name: toolName,
                        argumentsText: argsText,
                        hostedEventId,
                      };
                      hostedCallsByIndex.set(outputIndex, draft);
                      yield buildDeepSeekHostedToolEvent({
                        id: draft.hostedEventId,
                        toolName,
                        status: 'running',
                        queries: [],
                        sources: [],
                      });
                    }
                  } else if (toolName) {
                    const clientIndex = nextClientToolIndex;
                    nextClientToolIndex += 1;
                    clientToolsByIndex.set(outputIndex, { clientIndex, callId, name: toolName });
                    yield {
                      type: 'tool_call_delta',
                      index: clientIndex,
                      id: callId,
                      nameDelta: toolName,
                      argumentsDelta: argsText || undefined,
                      rawName: toolName,
                    };
                  }
                }
              } else if (event.item?.type === 'web_search_call') {
                const state = getWebSearchState(
                  webSearchStates,
                  event.item.id,
                  pendingCitations,
                  'DeepSeek',
                );
                collectWebSearchItem(state, event.item);
                yield* webSearchToolEvents(
                  state,
                  event.item.status === 'completed'
                    ? 'success'
                    : event.item.status === 'failed' || event.item.status === 'incomplete'
                      ? 'error'
                      : 'searching',
                );
              } else if (event.item?.type === 'message') {
                yield* collectMessageAnnotations(
                  webSearchStates,
                  event.item,
                  pendingCitations,
                  'DeepSeek',
                );
              }
              break;
            case 'response.web_search_call.in_progress':
              yield* webSearchToolEvents(
                getWebSearchState(webSearchStates, event.item_id, pendingCitations, 'DeepSeek'),
                'running',
              );
              break;
            case 'response.web_search_call.searching':
              yield* webSearchToolEvents(
                getWebSearchState(webSearchStates, event.item_id, pendingCitations, 'DeepSeek'),
                'searching',
              );
              break;
            case 'response.output_text.annotation.added':
            case 'response.output_text_annotation.added':
              yield* collectWebSearchCitation(
                webSearchStates,
                event.annotation,
                pendingCitations,
                'DeepSeek',
              );
              break;
            case 'response.web_search_call.completed':
              yield* webSearchToolEvents(
                getWebSearchState(webSearchStates, event.item_id, pendingCitations, 'DeepSeek'),
                'success',
              );
              break;
            case 'response.completed':
              stepTerminalObserved = true;
              if (!stepReasoningText) {
                stepReasoningText = extractReasoningTextFromOutput(event.response?.output);
              }
              yield* collectWebSearchOutput(
                webSearchStates,
                event.response?.output,
                pendingCitations,
                'DeepSeek',
              );
              stepFinishReason = event.response?.status || 'completed';
              if (event.response?.usage) {
                totalUsage = accumulateResponsesUsage(
                  totalUsage,
                  this.normalizeUsage(event.response.usage),
                );
                yield { type: 'usage', usage: totalUsage };
              }
              break;
            case 'response.failed':
              yield* collectWebSearchOutput(
                webSearchStates,
                event.response?.output,
                pendingCitations,
                'DeepSeek',
              );
              for (const state of webSearchStates.values()) {
                if (!state.terminal) yield* webSearchToolEvents(state, 'error');
              }
              yield* emitPendingHostedDraftErrors(hostedCallsByIndex);
              throw toClassifiedProviderError(event.response?.error || event, {
                requestOutcome: 'rejected',
              });
            case 'response.incomplete':
              stepTerminalObserved = true;
              if (!stepReasoningText) {
                stepReasoningText = extractReasoningTextFromOutput(event.response?.output);
              }
              yield* collectWebSearchOutput(
                webSearchStates,
                event.response?.output,
                pendingCitations,
                'DeepSeek',
              );
              for (const state of webSearchStates.values()) {
                if (!state.terminal) yield* webSearchToolEvents(state, 'error');
              }
              stepFinishReason = event.response?.incomplete_details?.reason || 'incomplete';
              if (event.response?.usage) {
                totalUsage = accumulateResponsesUsage(
                  totalUsage,
                  this.normalizeUsage(event.response.usage),
                );
                yield { type: 'usage', usage: totalUsage };
              }
              break;
            case 'error':
              yield* emitPendingHostedDraftErrors(hostedCallsByIndex);
              throw toClassifiedProviderError(event, { requestOutcome: 'rejected' });
          }
        }

        if (!stepTerminalObserved) {
          return;
        }

        const isStepTruncated =
          stepFinishReason === 'max_output_tokens' || stepFinishReason === 'incomplete';
        const hostedCalls = [...hostedCallsByIndex.values()];
        const hostedCallItems: any[] = [];
        const hostedOutputItems: any[] = [];

        if (isStepTruncated) {
          yield* emitPendingHostedDraftErrors(hostedCallsByIndex);
        } else {
          for (const hc of hostedCalls) {
            const parsedArgs = parseDeepSeekHostedWebArgs(hc.name, hc.argumentsText);
            yield buildDeepSeekHostedToolEvent({
              id: hc.hostedEventId,
              toolName: hc.name,
              status: 'searching',
              queries: parsedArgs.queries,
              sources: [],
            });

            const execution = await executeDeepSeekHostedWebCall({
              toolName: hc.name,
              rawArguments: hc.argumentsText,
              sdkBaseUrl,
              apiKey: gatewayRequest.config.apiKey,
              oriQuestion,
              signal: gatewayRequest.signal,
            });

            yield buildDeepSeekHostedToolEvent({
              id: hc.hostedEventId,
              toolName: hc.name,
              status: execution.ok ? 'success' : 'error',
              queries: execution.queries,
              sources: execution.sources,
            });

            hostedCallItems.push({
              type: 'function_call',
              call_id: hc.callId,
              name: hc.name,
              arguments: hc.argumentsText || '{}',
            });
            hostedOutputItems.push({
              type: 'function_call_output',
              call_id: hc.callId,
              output: execution.outputText,
            });
          }
        }

        const stepCanContinue =
          hostedCalls.length > 0 && clientToolsByIndex.size === 0 && !isStepTruncated;

        if (stepCanContinue) {
          const reasoningItem =
            stepReasoningText.length > 0 ? buildReasoningInputItem(stepReasoningText) : undefined;
          if (!reasoningItem) {
            allSubturnsHaveReasoning = false;
          }
          const subturnForState = [
            ...(reasoningItem ? [reasoningItem] : []),
            ...hostedCallItems,
            ...hostedOutputItems,
          ];
          priorSubturnItems.push(...subturnForState);
          currentInput = [
            ...(Array.isArray(currentInput) ? currentInput : []),
            ...(reasoningItem ? [reasoningItem] : []),
            ...(stepOutputText.trim() ? [{ role: 'assistant', content: stepOutputText }] : []),
            ...hostedCallItems,
            ...hostedOutputItems,
          ];
          continue;
        }

        if (clientToolsByIndex.size > 0) {
          const currentReasoningItem =
            stepReasoningText.length > 0 ? buildReasoningInputItem(stepReasoningText) : undefined;
          const providerState: DeepSeekResponsesProviderState = {
            protocol: 'openai_responses',
            vendor: 'deepseek',
            model: gatewayRequest.config.model,
            priorSubturnItems,
            ...(currentReasoningItem ? { currentReasoningItem } : {}),
            ...(hostedCallItems.length ? { coEmittedHostedCalls: hostedCallItems } : {}),
            ...(hostedOutputItems.length ? { coEmittedHostedOutputs: hostedOutputItems } : {}),
            hasNonEmptyReasoning: allSubturnsHaveReasoning && Boolean(currentReasoningItem),
          };
          yield { type: 'provider_state', state: providerState };
        }

        yield { type: 'done', finishReason: stepFinishReason };
        return;
      }
    } finally {
      await deleteDeepSeekTemporaryFiles({
        sdkBaseUrl,
        apiKey: gatewayRequest.config.apiKey,
        fileIds: materialized.temporaryFileIds,
      });
    }
  }

  private async completeDeepSeekOnce(request: ModelGatewayRequest): Promise<ModelCompleteResult> {
    const isContextCompaction = request.purpose === 'context_compaction';
    const additionalParams = isContextCompaction ? {} : request.config.additionalParams || {};
    assertNoReservedAdditionalParams(additionalParams);
    assertNoResponsesState(additionalParams);
    const nativeWebSearch = isContextCompaction
      ? undefined
      : getOpenAINativeWebSearchConfig(request.config.capabilities);
    const prepared = prepareDeepSeekResponsesRequest(request, false, nativeWebSearch);
    const sdkBaseUrl = this.resolveSdkBaseUrl(request);
    const client = this.createClient(request);

    const materialized = await materializeDeepSeekInputFiles({
      body: prepared.body,
      sdkBaseUrl,
      apiKey: request.config.apiKey,
      purpose: request.purpose,
      signal: request.signal,
    });

    try {
      let currentInput = Array.isArray(materialized.body.input)
        ? [...materialized.body.input]
        : materialized.body.input;
      const oriQuestion = extractLatestUserQuestion(request.messages);
      let totalUsage: ModelGatewayUsage | undefined;
      let allSubturnsHaveReasoning = true;

      for (let step = 0; step < MAX_DEEPSEEK_HOSTED_WEB_STEPS; step += 1) {
        const isFinalStep = step === MAX_DEEPSEEK_HOSTED_WEB_STEPS - 1;
        const stepBody = buildDeepSeekStepBody(
          materialized.body,
          currentInput,
          prepared.hostedWebToolNames,
          isFinalStep,
          !allSubturnsHaveReasoning,
        );
        const response: any = await client.responses.create(stepBody, {
          signal: request.signal,
        });
        if (response?.usage) {
          totalUsage = accumulateResponsesUsage(totalUsage, this.normalizeUsage(response.usage));
        }

        const outputItems: any[] = Array.isArray(response?.output) ? response.output : [];
        const hostedFunctionItems = !isFinalStep
          ? outputItems.filter(
              item =>
                item?.type === 'function_call' &&
                prepared.hostedWebToolNames.has(String(item.name || '')),
            )
          : [];
        const hasClientFunctionItems = outputItems.some(
          item =>
            item?.type === 'function_call' &&
            !prepared.hostedWebToolNames.has(String(item.name || '')),
        );

        if (
          hostedFunctionItems.length > 0 &&
          !hasClientFunctionItems &&
          response?.status !== 'incomplete'
        ) {
          const reasoningText = extractReasoningTextFromOutput(outputItems);
          if (!reasoningText) {
            allSubturnsHaveReasoning = false;
          }
          const hostedCallItems: any[] = [];
          const hostedOutputItems: any[] = [];
          for (const fc of hostedFunctionItems) {
            const callId = String(fc.call_id || fc.id || `ds_call_${step}`);
            const rawArgs = typeof fc.arguments === 'string' ? fc.arguments : '{}';
            const execution = await executeDeepSeekHostedWebCall({
              toolName: String(fc.name),
              rawArguments: rawArgs,
              sdkBaseUrl,
              apiKey: request.config.apiKey,
              oriQuestion,
              signal: request.signal,
            });
            hostedCallItems.push({
              type: 'function_call',
              call_id: callId,
              name: fc.name,
              arguments: rawArgs,
            });
            hostedOutputItems.push({
              type: 'function_call_output',
              call_id: callId,
              output: execution.outputText,
            });
          }
          currentInput = [
            ...(Array.isArray(currentInput) ? currentInput : []),
            ...(reasoningText ? [buildReasoningInputItem(reasoningText)] : []),
            ...hostedCallItems,
            ...hostedOutputItems,
          ];
          continue;
        }

        const directOutputText =
          typeof response?.output_text === 'string' ? response.output_text : '';
        return {
          content: directOutputText || extractOutputTextFromOutput(outputItems),
          usage: totalUsage,
        };
      }

      return { content: '', usage: totalUsage };
    } finally {
      await deleteDeepSeekTemporaryFiles({
        sdkBaseUrl,
        apiKey: request.config.apiKey,
        fileIds: materialized.temporaryFileIds,
      });
    }
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

  private resolveSdkBaseUrl(request: ModelGatewayRequest): string {
    const urlResult = this.urlBuilder.build({
      protocol: request.config.protocol,
      baseUrl: request.config.baseUrl,
      endpointPath: request.config.endpointPath,
      model: request.config.model,
      operation: request.stream ? 'stream' : 'non_stream',
    });
    return deriveOpenAIResponsesSdkBaseUrl(urlResult.url);
  }

  private createClient(request: ModelGatewayRequest): OpenAI {
    return new OpenAI({
      apiKey: request.config.apiKey,
      baseURL: this.resolveSdkBaseUrl(request),
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

interface HostedFunctionCallDraft {
  outputIndex: number;
  callId: string;
  name: string;
  argumentsText: string;
  hostedEventId: string;
}

function* emitPendingHostedDraftErrors(
  hostedCallsByIndex: Map<number, HostedFunctionCallDraft>,
): Generator<ModelStreamEvent> {
  for (const hc of hostedCallsByIndex.values()) {
    const parsedArgs = parseDeepSeekHostedWebArgs(hc.name, hc.argumentsText);
    yield buildDeepSeekHostedToolEvent({
      id: hc.hostedEventId,
      toolName: hc.name,
      status: 'error',
      queries: parsedArgs.queries,
      sources: [],
    });
  }
}

function buildDeepSeekStepBody(
  baseBody: any,
  currentInput: any,
  hostedWebToolNames: Set<string>,
  isFinalStep: boolean,
  forceEffortNone = false,
): any {
  const currentReasoning =
    baseBody.reasoning &&
    typeof baseBody.reasoning === 'object' &&
    !Array.isArray(baseBody.reasoning)
      ? baseBody.reasoning
      : {};
  const reasoningOverride = forceEffortNone
    ? { reasoning: { ...currentReasoning, effort: 'none' } }
    : {};
  if (!isFinalStep || hostedWebToolNames.size === 0 || !Array.isArray(baseBody.tools)) {
    return { ...baseBody, ...reasoningOverride, input: currentInput };
  }
  const remainingTools = baseBody.tools.filter(
    (tool: any) => !hostedWebToolNames.has(String(tool?.name || '')),
  );
  return {
    ...baseBody,
    ...reasoningOverride,
    input: currentInput,
    tools: remainingTools.length ? remainingTools : undefined,
    tool_choice: remainingTools.length ? baseBody.tool_choice : undefined,
  };
}

function extractOutputTextFromOutput(output: unknown): string {
  if (!Array.isArray(output)) return '';
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object' || (item as any).type !== 'message') continue;
    const content = (item as any).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string' && part.text) {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('');
}

function extractReasoningTextFromOutput(output: unknown): string {
  if (!Array.isArray(output)) return '';
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object' || (item as any).type !== 'reasoning') continue;
    const content = (item as any).content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === 'string' && part.text) {
          chunks.push(part.text);
        }
      }
    }
    const summary = (item as any).summary;
    if (!chunks.length && Array.isArray(summary)) {
      for (const part of summary) {
        if (typeof part?.text === 'string' && part.text) {
          chunks.push(part.text);
        }
      }
    }
  }
  return chunks.join('');
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
  vendorLabel: 'OpenAI' | 'DeepSeek';
  actionKind?: 'search' | 'open_page';
  terminal?: 'success' | 'error';
  lastPayload?: string;
  providerItemIds: string[];
  queries: string[];
  citations: WebSearchCitation[];
  sources: WebSearchSource[];
}

function createHostedToolCallId(): string {
  return `hosted_web_search_${Date.now().toString(36)}`;
}

function sanitizeWebUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 8192 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

function getWebSearchState(
  states: Map<string, WebSearchToolState>,
  id: unknown,
  pending: WebSearchCitation[] = [],
  vendorLabel: 'OpenAI' | 'DeepSeek' = 'OpenAI',
): WebSearchToolState {
  const key = typeof id === 'string' && id.trim() ? id.trim() : 'unidentified';
  let state = states.get(key);
  if (!state) {
    state = {
      id: `${createHostedToolCallId()}_${states.size}`,
      vendorLabel,
      providerItemIds: [],
      queries: [],
      citations: pending.splice(0),
      sources: [],
    };
    states.set(key, state);
  }
  trackWebSearchProviderItem(state, id);
  return state;
}

/** Search completion is independent of response completion; later citations only amend metadata. */
function* webSearchToolEvents(
  state: WebSearchToolState,
  status: 'running' | 'searching' | 'success' | 'error',
): Generator<ModelStreamEvent> {
  if (state.terminal && status !== state.terminal) return;
  const event = buildWebSearchToolEvent(state, status);
  const payload = JSON.stringify(event);
  if (payload === state.lastPayload) return;
  state.lastPayload = payload;
  if (state.terminal && event.type === 'hosted_tool_call') event.toolCall.update = true;
  if (status === 'success' || status === 'error') state.terminal = status;
  yield event;
}

function* collectWebSearchCitation(
  states: Map<string, WebSearchToolState>,
  annotation: unknown,
  pending: WebSearchCitation[],
  vendorLabel: 'OpenAI' | 'DeepSeek' = 'OpenAI',
): Generator<ModelStreamEvent> {
  if (!annotation || typeof annotation !== 'object') return;
  const url = sanitizeWebUrl((annotation as Record<string, unknown>).url);
  const candidates = [...states.values()].reverse();
  const state =
    candidates.find(
      item =>
        (url && item.sources.some(source => source.url === url)) ||
        (url && item.citations.some(citation => citation.url === url)),
    ) || candidates[0];
  if (!state) {
    collectWebCitation(pending, annotation);
    return;
  }
  if (vendorLabel === 'DeepSeek') state.vendorLabel = 'DeepSeek';
  const count = state.citations.length;
  collectWebCitation(state.citations, annotation);
  if (state.citations.length !== count)
    yield* webSearchToolEvents(state, state.terminal || 'searching');
}

function collectWebCitation(citations: WebSearchCitation[], annotation: unknown): void {
  if (!annotation || typeof annotation !== 'object') return;
  const value = annotation as Record<string, unknown>;
  if (value.type !== 'url_citation') return;
  const rawUrl = typeof value.url === 'string' ? value.url.trim() : '';
  const url = sanitizeWebUrl(rawUrl);
  if (rawUrl && !url) return;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!url && !title) return;
  if (url && citations.some(item => item.url === url)) return;
  citations.push({
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
  });
}

function* collectWebSearchOutput(
  states: Map<string, WebSearchToolState>,
  output: unknown,
  pending: WebSearchCitation[],
  vendorLabel: 'OpenAI' | 'DeepSeek' = 'OpenAI',
): Generator<ModelStreamEvent> {
  if (!Array.isArray(output)) return;
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (value.type === 'web_search_call') {
      const state = getWebSearchState(states, value.id, [], vendorLabel);
      collectWebSearchItem(state, value);
      yield* webSearchToolEvents(
        state,
        state.terminal ||
          (value.status === 'completed'
            ? 'success'
            : value.status === 'failed' || value.status === 'incomplete'
              ? 'error'
              : 'searching'),
      );
    }
  }
  for (const citation of pending.splice(0)) {
    yield* collectWebSearchCitation(
      states,
      { type: 'url_citation', ...citation },
      pending,
      vendorLabel,
    );
  }
  for (const item of output) {
    if (item?.type === 'message') {
      yield* collectMessageAnnotations(states, item, pending, vendorLabel);
    }
  }
}

function* collectMessageAnnotations(
  states: Map<string, WebSearchToolState>,
  message: Record<string, unknown>,
  pending: WebSearchCitation[],
  vendorLabel: 'OpenAI' | 'DeepSeek' = 'OpenAI',
): Generator<ModelStreamEvent> {
  if (!Array.isArray(message.content)) return;
  for (const part of message.content) {
    if (!part || typeof part !== 'object') continue;
    const annotations = (part as Record<string, unknown>).annotations;
    if (!Array.isArray(annotations)) continue;
    for (const annotation of annotations)
      yield* collectWebSearchCitation(states, annotation, pending, vendorLabel);
  }
}

function collectWebSearchItem(state: WebSearchToolState, item: Record<string, unknown>): void {
  collectWebSearchAction(state, item.action);
  if (item.page && typeof item.page === 'object') {
    const page = item.page as Record<string, unknown>;
    const pageUrl = sanitizeWebUrl(page.url);
    const pageTitle = typeof page.title === 'string' ? page.title.trim() : '';
    if (pageUrl || pageTitle) {
      state.actionKind = state.actionKind || 'open_page';
      if (pageUrl) addUniqueString(state.queries, pageUrl);
      addUniqueSource(state.sources, {
        type: 'url',
        ...(pageTitle ? { title: pageTitle } : {}),
        ...(pageUrl ? { url: pageUrl } : {}),
      });
    }
  }
}

function collectWebSearchAction(state: WebSearchToolState, action: unknown): void {
  if (!action || typeof action !== 'object') return;
  const value = action as Record<string, unknown>;
  if (value.type === 'open_page' || value.type === 'read_link') {
    state.actionKind = 'open_page';
  } else if (value.type === 'search' && !state.actionKind) {
    state.actionKind = 'search';
  }
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  if (query) addUniqueString(state.queries, query);
  if (Array.isArray(value.queries)) {
    for (const item of value.queries) {
      if (typeof item === 'string' && item.trim()) addUniqueString(state.queries, item.trim());
    }
  }
  const safeActionUrl = sanitizeWebUrl(value.url);
  if (safeActionUrl) {
    if (state.vendorLabel === 'DeepSeek' && state.actionKind === 'open_page') {
      addUniqueString(state.queries, safeActionUrl);
    }
    addUniqueSource(state.sources, {
      type: 'url',
      url: safeActionUrl,
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
  const rawUrl = typeof value.url === 'string' ? value.url.trim() : '';
  const url = sanitizeWebUrl(rawUrl);
  if (rawUrl && !url) return;
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
  status: 'running' | 'searching' | 'success' | 'error',
): ModelStreamEvent {
  const isDeepSeek = state.vendorLabel === 'DeepSeek';
  const isDeepSeekReadPage = isDeepSeek && state.actionKind === 'open_page';
  const vendorName = state.vendorLabel;
  const toolName = isDeepSeekReadPage
    ? DEEPSEEK_READ_URL_TOOL_NAME
    : isDeepSeek
      ? DEEPSEEK_WEB_SEARCH_TOOL_NAME
      : 'openai_web_search';
  const displayName = isDeepSeekReadPage ? '网页阅读' : '联网搜索';
  const toolCallId = state.id;
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
    queryLines ? `${isDeepSeekReadPage ? '目标链接' : '搜索查询'}：\n${queryLines}` : '',
    sourceLines ? `${isDeepSeekReadPage ? '网页信息' : '搜索来源'}：\n${sourceLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const sourceCount = citations.length + sources.length;
  const primaryQuery = state.queries.find(query => query.trim());
  const statusText = isDeepSeekReadPage
    ? status === 'running'
      ? '准备读取网页内容'
      : status === 'searching'
        ? '正在读取公开网页'
        : status === 'error'
          ? '网页读取失败'
          : '网页内容读取完成'
    : status === 'running'
      ? `准备调用 ${vendorName} 原生搜索`
      : status === 'searching'
        ? sourceCount
          ? `已发现 ${sourceCount} 个网页来源`
          : '正在搜索公开网页'
        : status === 'error'
          ? `${vendorName} 原生搜索失败`
          : sourceCount
            ? `搜索完成，找到 ${sourceCount} 个网页来源`
            : `${vendorName} 原生搜索完成`;

  return {
    type: 'hosted_tool_call',
    toolCall: {
      id: toolCallId,
      name: toolName,
      displayName,
      type: 'search',
      status,
      inputSummary: primaryQuery
        ? `${isDeepSeekReadPage ? '读取' : '搜索'}：${primaryQuery}`
        : status === 'success' || status === 'error'
          ? isDeepSeekReadPage
            ? '网页阅读'
            : '网页检索'
          : isDeepSeekReadPage
            ? '正在读取公开网页'
            : '正在搜索公开网页',
      output: {
        summary: statusText,
        queries: [...state.queries],
        results: citations,
        sources,
        providerItemIds: [...state.providerItemIds],
      },
      display: {
        title: displayName,
        summary: statusText,
        ...(markdown ? { markdown } : {}),
        json: { queries: [...state.queries], results: citations, sources },
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
