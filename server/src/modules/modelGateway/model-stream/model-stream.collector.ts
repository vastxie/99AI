import type {
  ModelCompleteResult,
  ModelStreamError,
  ModelStreamEvent,
  ModelStreamFn,
  ModelStreamInput,
  ModelStreamToolCallDelta,
  ModelStreamUsage,
} from './model-stream.types';
import {
  ClassifiedProviderError,
  classifyProviderError,
  toSafeModelStreamError,
} from './provider-error-classifier';

export interface CollectedModelStream {
  content: string;
  reasoningContent: string;
  toolDeltas: ModelStreamToolCallDelta[];
  usage?: ModelStreamUsage;
  finishReason?: string;
  error?: ModelStreamError;
  aborted: boolean;
  done: boolean;
  events: ModelStreamEvent[];
}

export async function collectModelStream(
  stream: AsyncIterable<ModelStreamEvent>,
): Promise<CollectedModelStream> {
  const collected: CollectedModelStream = {
    content: '',
    reasoningContent: '',
    toolDeltas: [],
    aborted: false,
    done: false,
    events: [],
  };

  try {
    for await (const rawEvent of stream) {
      // 厂商私有回放状态只交给 Agent 运行时，收集结果里不带
      if (rawEvent.type === 'provider_state') continue;
      const event = sanitizeCollectedEvent(rawEvent);
      collected.events.push(event);

      if (event.type === 'text_delta') {
        collected.content += event.delta;
        continue;
      }

      if (event.type === 'reasoning_delta') {
        collected.reasoningContent += event.delta;
        continue;
      }

      if (event.type === 'tool_call_delta') {
        collected.toolDeltas.push({
          index: event.index,
          id: event.id,
          nameDelta: event.nameDelta,
          argumentsDelta: event.argumentsDelta,
          rawName: event.rawName,
        });
        continue;
      }

      if (event.type === 'usage') {
        collected.usage = event.usage;
        continue;
      }

      if (event.type === 'done') {
        collected.done = true;
        collected.finishReason = event.finishReason;
        continue;
      }

      if (event.type === 'abort') {
        collected.aborted = true;
        collected.finishReason = 'abort';
        collected.error = event.error
          ? withObservedOutcome(toSafeModelStreamError(event.error), collected)
          : classifyProviderError({ name: 'AbortError' });
        break;
      }

      if (event.type === 'error') {
        collected.finishReason = 'error';
        collected.error = withObservedOutcome(toSafeModelStreamError(event.error), collected);
        break;
      }
    }
  } catch (error) {
    const streamError = withObservedOutcome(classifyProviderError(error), collected);
    collected.error = streamError;
    collected.aborted = streamError.category === 'aborted';
    collected.finishReason = collected.aborted ? 'abort' : 'error';
  }

  return collected;
}

export function toSafeModelStreamUsage(value: unknown): ModelStreamUsage {
  const usage =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    inputTokens: safeTokenCount(usage.inputTokens),
    outputTokens: safeTokenCount(usage.outputTokens),
    totalTokens: safeTokenCount(usage.totalTokens),
    ...(usage.cacheHitTokens === undefined
      ? {}
      : { cacheHitTokens: safeTokenCount(usage.cacheHitTokens) }),
    ...(usage.cacheMissTokens === undefined
      ? {}
      : { cacheMissTokens: safeTokenCount(usage.cacheMissTokens) }),
  };
}

function sanitizeCollectedEvent(event: ModelStreamEvent): ModelStreamEvent {
  if (event.type === 'usage') {
    return { type: 'usage', usage: toSafeModelStreamUsage(event.usage) };
  }
  if (event.type === 'error') {
    return { type: 'error', error: toSafeModelStreamError(event.error) };
  }
  if (event.type === 'abort') {
    return {
      type: 'abort',
      ...(event.error ? { error: toSafeModelStreamError(event.error) } : {}),
    };
  }
  return event;
}

function safeTokenCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

/**
 * 部分代理端点不支持禁思考参数，会把思考以 <think>…</think> 内联在正文里；
 * 声明 disableThinking 的小任务调用方只关心正文，这里统一剥离（含未闭合标签容错）。
 */
function stripInlineThinkTags(content: string): string {
  if (!content || !content.includes('<think')) return content;
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

export async function completeFromStream(
  streamFn: ModelStreamFn,
  input: ModelStreamInput,
): Promise<ModelCompleteResult> {
  let stream: AsyncIterable<ModelStreamEvent>;
  try {
    stream = streamFn({ ...input, stream: true });
  } catch (error) {
    throw createModelStreamException(classifyProviderError(error));
  }

  const collected = await collectModelStream(stream);
  if (collected.error) {
    throw createModelStreamException(collected.error, collected.usage);
  }
  if (
    input.toolChoice === 'none' &&
    collected.events.some(
      event => event.type === 'tool_call_delta' || event.type === 'hosted_tool_call',
    )
  ) {
    throw createModelStreamException(
      {
        code: 'MODEL_INVALID_REQUEST',
        message: '模型请求无效，请检查模型配置',
        category: 'invalid_request',
        retryable: false,
        requestOutcome: 'unknown',
        status: 400,
      },
      collected.usage,
    );
  }

  return {
    content: input.disableThinking ? stripInlineThinkTags(collected.content) : collected.content,
    usage: collected.usage,
    finishReason: collected.finishReason,
  };
}

function createModelStreamException(
  error: ModelStreamError,
  usage?: ModelStreamUsage,
): ClassifiedProviderError & { usage?: ModelStreamUsage } {
  const exception = new ClassifiedProviderError(
    toSafeModelStreamError(error),
  ) as ClassifiedProviderError & { usage?: ModelStreamUsage };
  if (usage) exception.usage = usage;
  return exception;
}

function withObservedOutcome(
  error: ModelStreamError,
  collected: Pick<
    CollectedModelStream,
    'content' | 'reasoningContent' | 'toolDeltas' | 'usage' | 'events'
  >,
): ModelStreamError {
  const effectObserved =
    Boolean(collected.content || collected.reasoningContent || collected.usage) ||
    collected.toolDeltas.length > 0 ||
    collected.events.some(event => event.type === 'hosted_tool_call');
  return effectObserved
    ? { ...error, retryable: false, requestOutcome: 'unknown' }
    : toSafeModelStreamError(error);
}
