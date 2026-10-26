import { collectModelStream, completeFromStream } from './index';
import type {
  ModelCompleteResult,
  ModelStreamError,
  ModelStreamEvent,
  ModelStreamInput,
  ModelStreamUsage,
} from './index';
import type {
  ModelGatewayError,
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelGatewayUsage,
} from '../model-gateway.types';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('model-stream contract', () => {
  const baseInput: ModelStreamInput = {
    config: {
      protocol: 'openai_chat_completions',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
    },
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ type: 'function', function: { name: 'search', parameters: {} } }],
    toolChoice: 'auto',
    temperature: 0.2,
    maxTokens: 128,
    purpose: 'agent_loop',
  };

  it('collects text, reasoning, tool deltas, usage and done events', async () => {
    const usage: ModelStreamUsage = {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
      cacheHitTokens: 1,
      cacheMissTokens: 1,
    };
    const result = await collectModelStream(
      events([
        { type: 'reasoning_delta', delta: 'think ' },
        { type: 'text_delta', delta: 'hello ' },
        { type: 'text_delta', delta: 'world' },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'call_1',
          nameDelta: 'search',
          argumentsDelta: '{"q":"99agent"}',
          rawName: 'search',
        },
        { type: 'usage', usage },
        { type: 'done', finishReason: 'stop' },
      ]),
    );

    expect(result).toMatchObject({
      content: 'hello world',
      reasoningContent: 'think ',
      usage,
      finishReason: 'stop',
      aborted: false,
      done: true,
    });
    expect(result.toolDeltas).toEqual([
      {
        index: 0,
        id: 'call_1',
        nameDelta: 'search',
        argumentsDelta: '{"q":"99agent"}',
        rawName: 'search',
      },
    ]);
  });

  it('leaves the private replay state out of collected and completed results', async () => {
    const stream = () =>
      events([
        { type: 'text_delta', delta: 'answer' },
        { type: 'provider_state', state: { signature: 'PRIVATE_REPLAY_STATE' } },
        { type: 'done', finishReason: 'stop' },
      ]);
    const collected = await collectModelStream(stream());
    expect(collected).toMatchObject({ content: 'answer', done: true, finishReason: 'stop' });
    expect(collected.events.map(event => event.type)).toEqual(['text_delta', 'done']);
    expect(JSON.stringify(collected)).not.toContain('PRIVATE_REPLAY_STATE');
    const completed = await completeFromStream(stream, baseInput);
    expect(JSON.stringify(completed)).not.toContain('PRIVATE_REPLAY_STATE');
  });

  it('collects stream error events without dropping partial text', async () => {
    const result = await collectModelStream(
      events([
        { type: 'text_delta', delta: 'partial' },
        {
          type: 'error',
          error: {
            code: 'MODEL_INVALID_REQUEST',
            message: '模型请求无效，请检查模型配置',
            category: 'invalid_request',
            retryable: false,
            requestOutcome: 'unknown',
            status: 400,
          },
        },
        { type: 'text_delta', delta: 'ignored after error' },
      ]),
    );

    expect(result).toMatchObject({
      content: 'partial',
      finishReason: 'error',
      error: {
        code: 'MODEL_INVALID_REQUEST',
        message: '模型请求无效，请检查模型配置',
        category: 'invalid_request',
        retryable: false,
        requestOutcome: 'unknown',
        status: 400,
      },
      aborted: false,
      done: false,
    });
  });

  it('collects explicit abort events as aborted results', async () => {
    const result = await collectModelStream(
      events([{ type: 'abort', reason: 'user stopped generation' }]),
    );

    expect(result).toMatchObject({
      finishReason: 'abort',
      aborted: true,
      error: { code: 'MODEL_ABORTED', message: '模型请求已取消' },
    });
  });

  it('normalizes thrown abort errors as aborted results', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });

    const result = await collectModelStream(throwingEvents(abortError));

    expect(result).toMatchObject({
      finishReason: 'abort',
      aborted: true,
      error: { code: 'MODEL_ABORTED', message: '模型请求已取消' },
    });
  });

  it('builds complete results from stream text and usage only', async () => {
    const calls: ModelStreamInput[] = [];
    const usage: ModelStreamUsage = {
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
    };
    const streamFn = (input: ModelStreamInput) => {
      calls.push(input);
      return events([
        { type: 'reasoning_delta', delta: 'private reasoning' },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'call_1',
          nameDelta: 'lookup',
          argumentsDelta: '{}',
        },
        { type: 'text_delta', delta: 'answer' },
        { type: 'usage', usage },
        { type: 'done', finishReason: 'stop' },
      ]);
    };

    const result = await completeFromStream(streamFn, baseInput);

    expect(result).toEqual({
      content: 'answer',
      usage,
      finishReason: 'stop',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ stream: true, purpose: 'agent_loop' });
  });

  it('allowlists usage across collected, completed and failed stream results', async () => {
    const privateSentinel = 'PRIVATE_MODEL_STREAM_USAGE';
    const unsafeUsage = {
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
      cacheHitTokens: 1,
      cacheMissTokens: 3,
      raw: { provider: { sentinel: privateSentinel } },
      providerPrivate: { sentinel: privateSentinel },
    } as any;
    const expectedUsage = {
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
      cacheHitTokens: 1,
      cacheMissTokens: 3,
    };

    const collected = await collectModelStream(
      events([
        { type: 'usage', usage: unsafeUsage },
        { type: 'done', finishReason: 'stop' },
      ]),
    );
    expect(collected.usage).toEqual(expectedUsage);
    expect(JSON.stringify(collected)).not.toContain(privateSentinel);

    const completed = await completeFromStream(
      () =>
        events([
          { type: 'usage', usage: unsafeUsage },
          { type: 'done', finishReason: 'stop' },
        ]),
      baseInput,
    );
    expect(completed.usage).toEqual(expectedUsage);
    expect(JSON.stringify(completed)).not.toContain(privateSentinel);

    let thrown: any;
    await completeFromStream(
      () =>
        events([
          { type: 'usage', usage: unsafeUsage },
          {
            type: 'error',
            error: {
              code: 'MODEL_OUTCOME_UNKNOWN',
              message: '模型请求结果无法确认，已停止自动重试',
              category: 'unknown',
              retryable: false,
              requestOutcome: 'unknown',
            },
          },
        ]),
      baseInput,
    ).catch(error => {
      thrown = error;
    });
    expect(thrown?.usage).toEqual(expectedUsage);
    expect(JSON.stringify(thrown)).not.toContain(privateSentinel);
  });

  it('strips inline think tags from content for disableThinking calls', async () => {
    const streamFn = () =>
      events([
        { type: 'text_delta', delta: '<think>内部推理过程' },
        { type: 'text_delta', delta: '</think>最终标题' },
        { type: 'done', finishReason: 'stop' },
      ]);

    const result = await completeFromStream(streamFn, { ...baseInput, disableThinking: true });
    expect(result.content).toBe('最终标题');

    // 未声明 disableThinking 时不改写正文
    const untouched = await completeFromStream(streamFn, baseInput);
    expect(untouched.content).toBe('<think>内部推理过程</think>最终标题');
  });

  it('rejects complete collection on model stream errors', async () => {
    const streamFn = () =>
      events([
        { type: 'text_delta', delta: 'partial' },
        {
          type: 'error',
          error: {
            code: 'MODEL_RATE_LIMIT',
            message: '模型服务请求过于频繁，请稍后再试',
            category: 'rate_limit',
            retryable: true,
            requestOutcome: 'rejected',
          },
        },
      ]);

    await expect(completeFromStream(streamFn, baseInput)).rejects.toMatchObject({
      name: 'ModelStreamError',
      code: 'MODEL_RATE_LIMIT',
      message: '模型服务请求过于频繁，请稍后再试',
    });
  });

  it('rejects tool events for tool-forbidden calls and preserves observed usage', async () => {
    const usage = { inputTokens: 9, outputTokens: 1, totalTokens: 10 };
    const streamFn = () =>
      events([
        {
          type: 'hosted_tool_call',
          toolCall: {
            id: 'hosted_1',
            name: 'web_search',
            status: 'success',
          },
        },
        { type: 'text_delta', delta: '{"version":1}' },
        { type: 'usage', usage },
        { type: 'done', finishReason: 'stop' },
      ]);

    await expect(
      completeFromStream(streamFn, { ...baseInput, tools: undefined, toolChoice: 'none' }),
    ).rejects.toMatchObject({
      code: 'MODEL_INVALID_REQUEST',
      usage,
    });
  });

  it('keeps existing ModelGateway request and event types structurally compatible', () => {
    const gatewayRequest: ModelGatewayRequest = {
      config: {
        protocol: 'openai_chat_completions',
        model: 'gpt-test',
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com/v1',
      },
      messages: [{ role: 'user', content: 'hi' }],
      purpose: 'agent_loop',
    };
    const gatewayUsage: ModelGatewayUsage = {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
    };
    const gatewayError: ModelGatewayError = {
      code: 'MODEL_INVALID_REQUEST',
      message: '模型请求无效，请检查模型配置',
      category: 'invalid_request',
      retryable: false,
      requestOutcome: 'rejected',
      status: 400,
    };
    const gatewayEvent: ModelGatewayEvent = {
      type: 'usage',
      usage: gatewayUsage,
    };

    const streamInput: ModelStreamInput = gatewayRequest;
    const streamUsage: ModelStreamUsage = gatewayUsage;
    const streamError: ModelStreamError = gatewayError;
    const streamEvent: ModelStreamEvent = gatewayEvent;
    const completeResult: ModelCompleteResult = {
      content: 'ok',
      usage: streamUsage,
      finishReason: 'stop',
    };

    expect(streamInput.config.model).toBe('gpt-test');
    expect(streamError).toMatchObject({ code: 'MODEL_INVALID_REQUEST', status: 400 });
    expect(streamEvent).toEqual({ type: 'usage', usage: streamUsage });
    expect(completeResult).toMatchObject({ content: 'ok', finishReason: 'stop' });
  });
});

async function* events(items: ModelStreamEvent[]): AsyncGenerator<ModelStreamEvent> {
  for (const item of items) {
    yield item;
  }
}

async function* throwingEvents(error: unknown): AsyncGenerator<ModelStreamEvent> {
  yield { type: 'text_delta', delta: 'partial' };
  throw error;
}
