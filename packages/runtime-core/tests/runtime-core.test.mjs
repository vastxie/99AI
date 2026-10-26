import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPackage } from './compile-package.mjs';

const { AgentRuntimeCore } = await loadPackage();

function harness(scripts, options = {}) {
  const state = {
    streamInputs: [],
    capabilityInputs: [],
    progress: [],
    trace: [],
    prepared: [],
    preparationContexts: [],
    retryPlans: [],
    retryWaits: [],
    telemetry: [],
    replaced: [],
    closed: [],
    after: 0,
  };
  let streamIndex = 0;
  const ports = {
    modelStream: async function* (input) {
      state.streamInputs.push(input);
      // 运行时之后会往同一个数组追加消息：另存一份发出时的快照
      (state.sentMessages ||= []).push(JSON.parse(JSON.stringify(input.messages)));
      const script = scripts[Math.min(streamIndex++, scripts.length - 1)] || [];
      for (const [eventIndex, event] of script.entries()) {
        await options.beforeModelEvent?.({ event, eventIndex, input });
        yield event;
      }
    },
    ...(options.modelRetry
      ? {
          modelRetry: {
            plan: (input) => {
              state.retryPlans.push(input);
              return options.modelRetry.plan(input);
            },
            wait: async (input) => {
              state.retryWaits.push(input);
              await options.modelRetry.wait(input);
            },
          },
        }
      : {}),
    capabilityExecutor: async (input) => {
      state.capabilityInputs.push(input);
      return typeof options.results === 'function' ? options.results(input) : options.results || [];
    },
    progress: (event) => state.progress.push(event),
    trace: (event) => state.trace.push(event),
    ...(options.telemetry
      ? {
          telemetry: {
            record: (event) => {
              state.telemetry.push(event);
              return options.telemetry(event);
            },
          },
        }
      : {}),
    messagePreparation: {
      prepareForModel: async (messages, context) => {
        state.prepared.push(messages);
        state.preparationContexts.push(context);
        return options.prepare ? options.prepare(messages, context) : messages;
      },
      projectAssistantMessage: (draft) => ({
        role: 'assistant',
        content: draft.content || null,
        tool_calls: draft.toolCalls,
        ...(options.keepReasoning ? { reasoning_content: draft.reasoningContent } : {}),
        ...(draft.providerState !== undefined ? { provider_state: draft.providerState } : {}),
      }),
    },
    lifecycle: {
      prepareCapabilityCommit: (callIds) => {
        state.commitIds = callIds;
        options.prepareCommit?.(callIds);
      },
      afterToolRound: () => {
        state.after += 1;
        return { shouldHandoff: Boolean(options.shouldHandoff) };
      },
      onMessagesReplaced: (messages) => state.replaced.push(messages),
      closeRun: (reason) => state.closed.push(reason),
    },
    logger: () => undefined,
    clock: {
      nowMs: () => 10,
      nowIso: () => '2026-08-30T00:00:00.000Z',
      nextId: (prefix) => `${prefix}_fixed`,
      schedule: () => ({}),
      cancel: () => undefined,
    },
  };
  return { runtime: new AgentRuntimeCore(ports), state };
}

const input = (overrides) => ({
  model: 'test-model',
  messages: [{ role: 'user', content: 'hello' }],
  tools: [],
  maxRounds: 5,
  ...overrides,
});

const toolScript = (calls) => [
  ...calls.flatMap((call, index) => [
    {
      type: 'tool_call_delta',
      index,
      id: call.id,
      nameDelta: call.name,
      argumentsDelta: call.arguments || '{}',
    },
  ]),
  { type: 'done' },
];

test('tool images remain private file references through the next model round', async () => {
  const content = [
    { type: 'text', text: 'chart' },
    {
      type: 'image_file',
      file: { fileRef: 'output_image_1', mime: 'image/png' },
    },
  ];
  const { runtime, state } = harness(
    [toolScript([{ id: 'media', name: 'read' }]), [{ type: 'done' }]],
    {
      results: [{ callId: 'media', status: 'success', modelContent: content }],
    },
  );
  await runtime.run(input());
  assert.deepEqual(
    state.streamInputs[1].messages.find((message) => message.role === 'tool').content,
    content,
  );
});

test('raw media data is rejected in tool result content', async () => {
  const { runtime, state } = harness([toolScript([{ id: 'media', name: 'read' }])], {
    results: [
      {
        callId: 'media',
        status: 'success',
        modelContent: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aW1hZ2U=' },
          },
        ],
      },
    ],
  });
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 1);
});

test('stops on a pure text final response', async () => {
  const { runtime, state } = harness([[{ type: 'text_delta', delta: '纯文本' }, { type: 'done' }]]);
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'stop');
  assert.equal(state.capabilityInputs.length, 0);
  assert.equal(
    state.progress.find((event) => event.type === 'text.delta').data.cumulative,
    '纯文本',
  );
});

test('prepares messages before model streaming', async () => {
  const prepared = [{ role: 'user', content: 'prepared hello' }];
  const { runtime, state } = harness([[{ type: 'done' }]], {
    prepare: () => prepared,
  });
  const result = await runtime.run(input());
  assert.strictEqual(state.streamInputs[0].messages, prepared);
  assert.strictEqual(result.messages, prepared);
  assert.strictEqual(state.replaced[0], prepared);
});

test('streams mixed reasoning and text without framework DI', async () => {
  const { runtime, state } = harness([
    [
      { type: 'reasoning_delta', delta: '想一下。' },
      { type: 'text_delta', delta: '你好' },
      { type: 'done' },
    ],
  ]);
  const result = await runtime.run(input());
  assert.equal(result.success, true);
  assert.deepEqual(
    state.progress.filter((event) => event.type.endsWith('.delta')).map((event) => event.type),
    ['reasoning.delta', 'text.delta'],
  );
});

test('executes tools, appends results, and continues', async () => {
  const { runtime, state } = harness(
    [
      toolScript([
        {
          id: 'call_search',
          name: 'search_tool',
          arguments: '{"query":"alpha"}',
        },
      ]),
      [{ type: 'text_delta', delta: '最终回答' }, { type: 'done' }],
    ],
    {
      results: [{ callId: 'call_search', status: 'success', modelContent: '搜索结果' }],
    },
  );
  const result = await runtime.run(input());
  assert.equal(state.streamInputs.length, 2);
  assert.equal(
    result.messages.find((message) => message.role === 'tool').tool_call_id,
    'call_search',
  );
  assert.deepEqual(state.commitIds, ['call_search']);
});

test('aggregates fragmented deltas for multiple tool calls', async () => {
  const first = [
    {
      type: 'tool_call_delta',
      index: 0,
      id: 'call_a',
      nameDelta: 'search',
      argumentsDelta: '{"q":"',
    },
    {
      type: 'tool_call_delta',
      index: 1,
      id: 'call_b',
      nameDelta: 'calc',
      argumentsDelta: '{"x":"2+',
    },
    {
      type: 'tool_call_delta',
      index: 0,
      nameDelta: '_tool',
      argumentsDelta: 'alpha"}',
    },
    {
      type: 'tool_call_delta',
      index: 1,
      nameDelta: '_tool',
      argumentsDelta: '2"}',
    },
    { type: 'done' },
  ];
  const { runtime, state } = harness([first, [{ type: 'done' }]], {
    results: (input) =>
      [...input.toolCalls].reverse().map((call) => ({
        callId: call.id,
        status: 'success',
        modelContent: call.id,
      })),
  });
  const result = await runtime.run(input());
  assert.deepEqual(
    state.capabilityInputs[0].toolCalls.map((call) => call.function.name),
    ['search_tool', 'calc_tool'],
  );
  assert.deepEqual(
    result.messages
      .filter((message) => message.role === 'tool')
      .map((message) => message.tool_call_id),
    ['call_a', 'call_b'],
  );
});

test('returns an error for malformed model tool calls', async () => {
  const { runtime } = harness([
    [
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'call_bad',
        argumentsDelta: '{}',
      },
      { type: 'done' },
    ],
  ]);
  const result = await runtime.run(input());
  assert.equal(result.success, false);
  assert.equal(result.finishReason, 'error');
  assert.equal(result.error, 'Malformed model tool call');
});

for (const [label, precedingEvents] of [
  ['before text output', []],
  ['after partial text output', [{ type: 'text_delta', delta: 'partial' }]],
]) {
  test(`returns an error for provider error events ${label}`, async () => {
    const { runtime } = harness([
      [...precedingEvents, { type: 'error', error: { message: 'provider timeout' } }],
    ]);
    const result = await runtime.run(input());
    assert.equal(result.success, false);
    assert.equal(result.finishReason, 'error');
    assert.equal(result.error, 'provider timeout');
  });
}

test('stops as aborted on a stream abort event', async () => {
  const { runtime } = harness([
    [
      { type: 'text_delta', delta: 'partial' },
      { type: 'abort', reason: 'user stopped' },
    ],
  ]);
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'abort');
});

test('stops as aborted when the signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const { runtime, state } = harness([
    [{ type: 'text_delta', delta: 'ignored' }, { type: 'done' }],
  ]);
  const result = await runtime.run(input({ signal: controller.signal }));
  assert.equal(result.finishReason, 'abort');
  assert.equal(
    state.progress.some((event) => event.type === 'text.delta'),
    false,
  );
});

test('records cache hit and miss usage', async () => {
  const usage = {
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18,
    cacheHitTokens: 4,
    cacheMissTokens: 6,
  };
  const { runtime, state } = harness([[{ type: 'usage', usage }, { type: 'done' }]]);
  await runtime.run(input());
  assert.deepEqual(state.trace[0].data.usage, usage);
});

test('recovers a rejected side-effect-free context overflow at most once', async () => {
  const overflow = {
    type: 'error',
    error: {
      category: 'context_overflow',
      requestOutcome: 'rejected',
      message: 'too long',
    },
  };
  const { runtime, state } = harness(
    [[overflow], [{ type: 'text_delta', delta: 'recovered' }, { type: 'done' }]],
    {
      prepare: (messages, context) =>
        context.reason === 'context_overflow' ? messages.slice(1) : messages,
    },
  );
  const result = await runtime.run(
    input({
      messages: [
        { role: 'assistant', content: 'old history' },
        { role: 'user', content: 'hello' },
      ],
    }),
  );
  assert.equal(result.success, true);
  assert.equal(state.streamInputs.length, 2);
  assert.deepEqual(
    state.preparationContexts.map((context) => context.reason),
    ['round', 'context_overflow'],
  );
  assert.equal(state.progress.filter((event) => event.type === 'round.started').length, 1);
  assert.equal(
    state.progress.filter((event) => event.data.code === 'context_overflow_recovery').length,
    1,
  );
});

test('does not loop when the bounded context overflow retry also fails', async () => {
  const overflow = {
    type: 'error',
    error: {
      category: 'context_overflow',
      requestOutcome: 'rejected',
      message: 'still too long',
    },
  };
  const { runtime, state } = harness([[overflow], [overflow], [overflow]], {
    prepare: (messages, context) =>
      context.reason === 'context_overflow' ? messages.slice(1) : messages,
  });
  const result = await runtime.run(
    input({
      messages: [
        { role: 'assistant', content: 'old history' },
        { role: 'user', content: 'hello' },
      ],
    }),
  );
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 2);
});

test('fails before replaying an unchanged context-overflow request', async () => {
  const overflow = {
    type: 'error',
    error: {
      category: 'context_overflow',
      requestOutcome: 'rejected',
      message: 'too long',
    },
  };
  const { runtime, state } = harness([[overflow], [{ type: 'done' }]]);
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'error');
  assert.match(result.error, /did not reduce/);
  assert.equal(state.streamInputs.length, 1);
});

test('fails before replaying a provider-identical request after metadata-only shrink', async () => {
  const overflow = {
    type: 'error',
    error: {
      category: 'context_overflow',
      requestOutcome: 'rejected',
      message: 'too long',
    },
  };
  const { runtime, state } = harness([[overflow], [{ type: 'done' }]], {
    prepare: (messages, context) =>
      messages.map((message) => ({
        ...message,
        __agent_context: {
          padding: context.reason === 'context_overflow' ? 'x' : 'x'.repeat(5000),
        },
      })),
  });

  const result = await runtime.run(input());

  assert.equal(result.finishReason, 'error');
  assert.match(result.error, /did not reduce/);
  assert.equal(state.streamInputs.length, 1);
});

test('fails before sanitation can reconstruct a provider-identical overflow request', async () => {
  const overflow = {
    type: 'error',
    error: {
      category: 'context_overflow',
      requestOutcome: 'rejected',
      message: 'too long',
    },
  };
  const { runtime, state } = harness([[overflow], [{ type: 'done' }]], {
    prepare: (messages, context) =>
      context.reason === 'context_overflow'
        ? messages.filter((message) => message.role !== 'tool')
        : messages,
  });

  const result = await runtime.run(
    input({
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'read', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: '工具调用记录不完整：该调用已中断，结果未知。不要把它视为成功。',
        },
      ],
    }),
  );

  assert.equal(result.finishReason, 'error');
  assert.match(result.error, /did not reduce/);
  assert.equal(state.streamInputs.length, 1);
});

test('never retries context overflow after visible model output', async () => {
  const { runtime, state } = harness([
    [
      { type: 'text_delta', delta: 'partial' },
      {
        type: 'error',
        error: {
          category: 'context_overflow',
          requestOutcome: 'rejected',
          message: 'late overflow',
        },
      },
    ],
  ]);
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 1);
});

test('retries only explicit side-effect-free rate-limit and transient rejections', async () => {
  const failures = [
    {
      type: 'error',
      error: {
        category: 'rate_limit',
        retryable: true,
        retryAfterMs: 1200,
        requestOutcome: 'rejected',
        message: 'safe rate limit',
      },
    },
    {
      type: 'error',
      error: {
        category: 'transient',
        retryable: true,
        requestOutcome: 'rejected',
        message: 'safe transient',
      },
    },
  ];
  const { runtime, state } = harness(
    [[failures[0]], [failures[1]], [{ type: 'text_delta', delta: 'recovered' }, { type: 'done' }]],
    {
      modelRetry: {
        plan: ({ retryIndex, retryAfterMs }) => ({
          delayMs: retryAfterMs || 500 * (retryIndex + 1),
          notBeforeMs: 10_000 + (retryAfterMs || 500 * (retryIndex + 1)),
        }),
        wait: async () => undefined,
      },
    },
  );

  const result = await runtime.run(input());

  assert.equal(result.finishReason, 'stop');
  assert.deepEqual(
    state.streamInputs.map((request) => request.attemptIndex),
    [0, 1, 2],
  );
  assert.deepEqual(
    state.retryPlans.map((plan) => plan.retryIndex),
    [0, 1],
  );
  assert.deepEqual(
    state.retryWaits.map((wait) => wait.attemptIndex),
    [1, 2],
  );
  assert.equal(state.progress.filter((event) => event.type === 'round.started').length, 1);
});

test('caps provider retries at two even when the platform keeps returning plans', async () => {
  const retryableFailure = {
    type: 'error',
    error: {
      category: 'rate_limit',
      retryable: true,
      requestOutcome: 'rejected',
      message: 'safe rate limit',
    },
  };
  const { runtime, state } = harness([[retryableFailure]], {
    modelRetry: {
      plan: ({ retryIndex }) => ({ delayMs: 0, notBeforeMs: retryIndex }),
      wait: async () => undefined,
    },
  });

  const result = await runtime.run(input());

  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 3);
  assert.equal(state.retryPlans.length, 2);
  assert.equal(state.retryWaits.length, 2);
});

test('never retries unknown, unproven, disabled, or partial provider failures', async () => {
  const cases = [
    [
      {
        category: 'unknown',
        retryable: true,
        requestOutcome: 'rejected',
        message: 'unknown',
      },
    ],
    [
      {
        category: 'rate_limit',
        retryable: true,
        requestOutcome: 'unknown',
        message: 'unproven',
      },
    ],
    [
      {
        category: 'transient',
        retryable: false,
        requestOutcome: 'rejected',
        message: 'disabled',
      },
    ],
    [
      {
        category: 'rate_limit',
        retryable: true,
        requestOutcome: 'rejected',
        message: 'partial',
      },
      { type: 'text_delta', delta: 'partial' },
    ],
  ];

  for (const [error, preceding] of cases) {
    const { runtime, state } = harness(
      [[...(preceding ? [preceding] : []), { type: 'error', error }]],
      {
        modelRetry: {
          plan: () => ({ delayMs: 0, notBeforeMs: 0 }),
          wait: async () => undefined,
        },
      },
    );
    const result = await runtime.run(input());
    assert.equal(result.finishReason, 'error');
    assert.equal(state.streamInputs.length, 1);
    assert.equal(state.retryPlans.length, 0);
    assert.equal(state.retryWaits.length, 0);
  }
});

test('keeps attempt indexes monotonic across overflow recovery and provider retry', async () => {
  const overflow = {
    type: 'error',
    error: {
      category: 'context_overflow',
      retryable: false,
      requestOutcome: 'rejected',
      message: 'too long',
    },
  };
  const transient = {
    type: 'error',
    error: {
      category: 'transient',
      retryable: true,
      requestOutcome: 'rejected',
      message: 'try later',
    },
  };
  const { runtime, state } = harness([[overflow], [transient], [{ type: 'done' }]], {
    prepare: (messages, context) =>
      context.reason === 'context_overflow' ? messages.slice(1) : messages,
    modelRetry: {
      plan: () => ({ delayMs: 0, notBeforeMs: 0 }),
      wait: async () => undefined,
    },
  });

  const result = await runtime.run(
    input({
      messages: [
        { role: 'assistant', content: 'old history' },
        { role: 'user', content: 'hello' },
      ],
    }),
  );

  assert.equal(result.finishReason, 'stop');
  assert.deepEqual(
    state.streamInputs.map((request) => request.attemptIndex),
    [0, 1, 2],
  );
});

test('invocation-only signal aborts a provider retry wait without dispatching the next attempt', async () => {
  const controller = new AbortController();
  const retryableFailure = {
    type: 'error',
    error: {
      category: 'transient',
      retryable: true,
      requestOutcome: 'rejected',
      message: 'try later',
    },
  };
  const { runtime, state } = harness([[retryableFailure]], {
    modelRetry: {
      plan: () => ({ delayMs: 30_000, notBeforeMs: 30_000 }),
      wait: async () => {
        const reason = new Error('user stopped');
        controller.abort(reason);
        throw reason;
      },
    },
  });

  const result = await runtime.run(
    input({
      invocation: {
        operationId: 'op_turn_retry_cancel_1',
        turnId: 'turn_retry_cancel_1',
        generation: 2,
        invocationId: 'op_turn_retry_cancel_1:g2:run',
        traceId: 'trace_retry_cancel_1',
        signal: controller.signal,
      },
    }),
  );

  assert.equal(result.finishReason, 'abort');
  assert.equal(state.streamInputs.length, 1);
  assert.equal(state.retryWaits.length, 1);
  assert.deepEqual(state.closed, ['abort']);
});

test('result exact-set rejects missing, unknown, and duplicate callIds before commit', async () => {
  const calls = [{ id: 'call_a', name: 'a' }];
  const variants = [
    { calls, results: [] },
    {
      calls,
      results: [{ callId: 'unknown', status: 'success', modelContent: 'x' }],
    },
    {
      calls,
      results: [
        { callId: 'call_a', status: 'success', modelContent: 'a' },
        { callId: 'call_a', status: 'success', modelContent: 'a2' },
      ],
    },
    {
      calls: [...calls, { id: 'call_b', name: 'b' }],
      results: [{ callId: 'call_a', status: 'success', modelContent: 'ok' }],
    },
  ];
  for (const { calls, results } of variants) {
    const { runtime, state } = harness([toolScript(calls)], { results });
    const result = await runtime.run(input());
    assert.equal(result.success, false);
    assert.match(result.error, /does not match/);
    assert.equal(state.commitIds, undefined);
    assert.equal(
      state.progress.some(
        (event) => event.type === 'capability.completed' && event.data.origin === 'external',
      ),
      false,
    );
    assert.equal(
      result.messages.some((message) => message.role === 'tool'),
      false,
    );
  }
});

test('invalid request ids fail before capability execution', async () => {
  const { runtime, state } = harness([
    toolScript([
      { id: 'duplicate', name: 'a' },
      { id: 'duplicate', name: 'b' },
    ]),
  ]);
  const result = await runtime.run(input());
  assert.match(result.error, /request callId set is invalid/);
  assert.equal(state.capabilityInputs.length, 0);
  assert.equal(
    result.messages.some((message) => message.role === 'tool'),
    false,
  );
});

test('reverse resolution order commits and appends in request order', async () => {
  const { runtime, state } = harness(
    [
      toolScript([
        { id: 'first', name: 'a' },
        { id: 'second', name: 'b' },
      ]),
      [{ type: 'done' }],
    ],
    {
      results: [
        { callId: 'second', status: 'success', modelContent: 'B' },
        { callId: 'first', status: 'success', modelContent: 'A' },
      ],
    },
  );
  const result = await runtime.run(input());
  assert.deepEqual(state.commitIds, ['first', 'second']);
  assert.deepEqual(
    result.messages
      .filter((message) => message.role === 'tool')
      .map((message) => message.tool_call_id),
    ['first', 'second'],
  );
  assert.deepEqual(
    state.progress
      .filter((event) => event.type === 'capability.completed' && event.data.origin === 'external')
      .map((event) => event.data.callId),
    ['first', 'second'],
  );
});

test('a terminating capability ends the run after its round without another model call', async () => {
  const { runtime, state } = harness([toolScript([{ id: 'ask', name: 'question_tool' }])], {
    results: [
      {
        callId: 'ask',
        status: 'success',
        modelContent: 'asked the user',
        control: { terminate: true },
      },
    ],
  });
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.success, true);
  assert.equal(state.streamInputs.length, 1);
  assert.deepEqual(state.closed, ['stop']);
  assert.equal(result.messages.at(-1).role, 'tool');
});

test('announces each tool call once its arguments start and lists names when the round completes', async () => {
  const { runtime, state } = harness(
    [
      [
        { type: 'text_delta', delta: '先看看文件。' },
        { type: 'tool_call_delta', index: 0, id: 'a', nameDelta: 'wri' },
        { type: 'tool_call_delta', index: 0, nameDelta: 'te' },
        { type: 'tool_call_delta', index: 0, argumentsDelta: '{"pa' },
        { type: 'tool_call_delta', index: 0, argumentsDelta: 'th":"x"}' },
        { type: 'tool_call_delta', index: 1, id: 'b', nameDelta: 'ls', argumentsDelta: '{}' },
        { type: 'done' },
      ],
      [{ type: 'text_delta', delta: '完成。' }, { type: 'done' }],
    ],
    {
      results: (request) =>
        request.toolCalls.map((call) => ({
          callId: call.id,
          status: 'success',
          modelContent: 'ok',
        })),
    },
  );
  await runtime.run(input());
  assert.deepEqual(
    state.progress.filter((event) => event.type === 'round.tool_call').map((event) => event.data),
    [
      { roundIndex: 0, index: 0, name: 'write' },
      { roundIndex: 0, index: 1, name: 'ls' },
    ],
  );
  assert.deepEqual(
    state.progress
      .filter((event) => event.type === 'round.completed')
      .map((event) => event.data.toolCallNames),
    [['write', 'ls'], []],
  );
  assert.deepEqual(
    state.progress
      .filter((event) => event.type === 'round.completed')
      .map((event) => event.data.malformedToolCalls),
    [false, false],
  );
});

test('marks a round whose only tool call has no name as malformed, not as tool-free', async () => {
  const { runtime, state } = harness([
    [
      { type: 'text_delta', delta: '我去查一下。' },
      { type: 'tool_call_delta', index: 0, id: 'x', argumentsDelta: '{}' },
      { type: 'done' },
    ],
  ]);
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'error');
  const completed = state.progress.filter((event) => event.type === 'round.completed');
  assert.deepEqual(
    completed.map((event) => [event.data.toolCallNames, event.data.malformedToolCalls]),
    [[[], true]],
  );
  assert.equal(state.progress.filter((event) => event.type === 'round.tool_call').length, 0);
});

test('new message arrays stay authoritative through handoff', async () => {
  const replacement = [{ role: 'user', content: 'prepared' }];
  const { runtime, state } = harness([toolScript([{ id: 'handoff', name: 'delegate' }])], {
    prepare: () => replacement,
    results: [
      {
        callId: 'handoff',
        status: 'success',
        modelContent: 'handoff',
        control: { handoff: true },
      },
    ],
    keepReasoning: true,
  });
  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'handoff');
  assert.strictEqual(result.messages, replacement);
  assert.strictEqual(state.replaced[0], replacement);
  assert.equal(state.prepared.length, 1);
  assert.equal(result.messages.length, 3);
});

test('abort after capability settle rejects every late writer', async () => {
  const controller = new AbortController();
  let releaseResult;
  let markEntered;
  const entered = new Promise((resolve) => {
    markEntered = resolve;
  });
  const { runtime, state } = harness(
    [
      toolScript([{ id: 'call_late', name: 'deferred_tool' }]),
      [{ type: 'text_delta', delta: 'must not run' }, { type: 'done' }],
    ],
    {
      results: () =>
        new Promise((resolve) => {
          releaseResult = resolve;
          markEntered();
        }),
    },
  );

  const pending = runtime.run(input({ signal: controller.signal }));
  await entered;
  controller.abort(new Error('user stopped'));
  const atAbort = {
    modelCalls: state.streamInputs.length,
    completed: state.progress.filter((event) => event.type === 'capability.completed').length,
    toolMessages: state.streamInputs[0].messages.filter((message) => message.role === 'tool')
      .length,
    prepared: state.commitIds,
    after: state.after,
  };
  releaseResult([
    {
      callId: 'call_late',
      status: 'success',
      modelContent: 'LATE',
    },
  ]);
  const result = await pending;

  assert.equal(result.finishReason, 'abort');
  assert.deepEqual(
    {
      modelCalls: state.streamInputs.length,
      completed: state.progress.filter((event) => event.type === 'capability.completed').length,
      toolMessages: result.messages.filter((message) => message.role === 'tool').length,
      prepared: state.commitIds,
      after: state.after,
    },
    atAbort,
  );
  assert.deepEqual(state.closed, ['abort']);
});

test('passes explicit root and unique child invocation context across async ports', async () => {
  const controller = new AbortController();
  const rootInvocation = {
    operationId: 'op_turn_invocation_1',
    turnId: 'turn_invocation_1',
    generation: 7,
    invocationId: 'op_turn_invocation_1:g7:run',
    traceId: 'trace_invocation_1',
    signal: controller.signal,
    prompt: 'SECRET_INVOCATION_PROMPT',
    userId: 'SECRET_USER_ID',
  };
  const { runtime, state } = harness(
    [
      toolScript([{ id: 'call_child', name: 'child_tool' }]),
      [
        {
          type: 'usage',
          usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        },
        { type: 'done' },
      ],
    ],
    {
      results: [{ callId: 'call_child', status: 'success', modelContent: 'ok' }],
      telemetry: () => undefined,
    },
  );

  const result = await runtime.run(
    input({ signal: controller.signal, invocation: rootInvocation }),
  );

  assert.equal(result.finishReason, 'stop');
  assert.deepEqual(
    {
      ...state.preparationContexts[0].invocation,
      signal: undefined,
    },
    {
      operationId: rootInvocation.operationId,
      turnId: rootInvocation.turnId,
      generation: rootInvocation.generation,
      invocationId: rootInvocation.invocationId,
      traceId: rootInvocation.traceId,
      signal: undefined,
    },
  );
  assert.equal(state.preparationContexts[0].invocation.signal, controller.signal);
  const childInputs = [...state.streamInputs, ...state.capabilityInputs];
  assert.equal(new Set(childInputs.map((entry) => entry.invocation.invocationId)).size, 3);
  for (const entry of childInputs) {
    assert.equal(entry.invocation.operationId, rootInvocation.operationId);
    assert.equal(entry.invocation.turnId, rootInvocation.turnId);
    assert.equal(entry.invocation.generation, 7);
    assert.equal(entry.invocation.traceId, rootInvocation.traceId);
    assert.equal(entry.invocation.parentInvocationId, rootInvocation.invocationId);
    assert.equal(entry.invocation.signal, controller.signal);
    assert.equal(Object.hasOwn(entry.invocation, 'prompt'), false);
    assert.equal(Object.hasOwn(entry.invocation, 'userId'), false);
  }
  assert.deepEqual(
    state.telemetry.map((event) => [event.type, event.phase, event.status]),
    [
      ['invocation.started', 'run', 'started'],
      ['invocation.started', 'model', 'started'],
      ['invocation.completed', 'model', 'succeeded'],
      ['invocation.started', 'capability', 'started'],
      ['invocation.completed', 'capability', 'succeeded'],
      ['invocation.started', 'model', 'started'],
      ['invocation.completed', 'model', 'succeeded'],
      ['invocation.completed', 'run', 'succeeded'],
    ],
  );
  assert.equal(Object.hasOwn(state.telemetry[0].invocation, 'signal'), false);
  assert.equal(JSON.stringify(state.telemetry).includes('SECRET_INVOCATION'), false);
  const usageTelemetry = state.telemetry.find(
    (event) =>
      event.type === 'invocation.completed' && event.phase === 'model' && event.totalTokens === 5,
  );
  assert.equal(usageTelemetry.inputTokens, 3);
  assert.equal(usageTelemetry.outputTokens, 2);
});

test('sync throws and async telemetry rejection leave business output byte-equivalent', async () => {
  const rootInvocation = {
    operationId: 'op_turn_passive_1',
    turnId: 'turn_passive_1',
    generation: 2,
    invocationId: 'op_turn_passive_1:g2:run',
    traceId: 'trace_passive_1',
  };
  const scripts = [[{ type: 'text_delta', delta: 'unchanged' }, { type: 'done' }]];
  const baseline = harness(structuredClone(scripts));
  const throwing = harness(structuredClone(scripts), {
    telemetry: () => {
      throw new Error('telemetry sync failure');
    },
  });
  const rejecting = harness(structuredClone(scripts), {
    telemetry: async () => {
      throw new Error('telemetry async failure');
    },
  });

  const baselineResult = await baseline.runtime.run(input({ invocation: rootInvocation }));
  const throwingResult = await throwing.runtime.run(input({ invocation: rootInvocation }));
  const rejectingResult = await rejecting.runtime.run(input({ invocation: rootInvocation }));
  await Promise.resolve();

  assert.equal(JSON.stringify(throwingResult), JSON.stringify(baselineResult));
  assert.equal(JSON.stringify(rejectingResult), JSON.stringify(baselineResult));
  assert.deepEqual(throwing.state.progress, baseline.state.progress);
  assert.deepEqual(rejecting.state.progress, baseline.state.progress);
  assert.deepEqual(throwing.state.closed, baseline.state.closed);
  assert.deepEqual(rejecting.state.closed, baseline.state.closed);
  assert.equal(throwing.state.streamInputs.length, 1);
  assert.equal(rejecting.state.streamInputs.length, 1);
});

test('invocation-only pre-abort stops before dispatch and keeps root terminal telemetry', async () => {
  const controller = new AbortController();
  controller.abort(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  const rootInvocation = {
    operationId: 'op_turn_cancel_1',
    turnId: 'turn_cancel_1',
    generation: 9,
    invocationId: 'op_turn_cancel_1:g9:run',
    traceId: 'trace_cancel_1',
    signal: controller.signal,
  };
  const { runtime, state } = harness([[{ type: 'done' }]], {
    telemetry: () => undefined,
  });

  const result = await runtime.run(input({ invocation: rootInvocation }));

  assert.equal(result.finishReason, 'abort');
  assert.equal(state.streamInputs.length, 0);
  assert.equal(state.capabilityInputs.length, 0);
  assert.deepEqual(
    state.telemetry.map((event) => [
      event.type,
      event.phase,
      event.status,
      event.invocation.generation,
    ]),
    [
      ['invocation.started', 'run', 'started', 9],
      ['invocation.completed', 'run', 'aborted', 9],
    ],
  );
  assert.equal(state.telemetry[1].roundIndex, undefined);
});

test('invocation-only streaming abort prevents late model output', async () => {
  const controller = new AbortController();
  const rootInvocation = {
    operationId: 'op_turn_stream_cancel_1',
    turnId: 'turn_stream_cancel_1',
    generation: 4,
    invocationId: 'op_turn_stream_cancel_1:g4:run',
    traceId: 'trace_stream_cancel_1',
    signal: controller.signal,
  };
  const { runtime, state } = harness(
    [
      [
        { type: 'text_delta', delta: 'before' },
        { type: 'text_delta', delta: 'late' },
        { type: 'done' },
      ],
    ],
    {
      telemetry: () => undefined,
      beforeModelEvent: ({ eventIndex }) => {
        if (eventIndex === 1) {
          controller.abort(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        }
      },
    },
  );

  const result = await runtime.run(input({ invocation: rootInvocation }));

  assert.equal(result.finishReason, 'abort');
  assert.equal(state.streamInputs.length, 1);
  assert.equal(state.streamInputs[0].signal.aborted, true);
  assert.equal(state.streamInputs[0].invocation.signal, controller.signal);
  assert.deepEqual(
    state.progress.filter((event) => event.type === 'text.delta').map((event) => event.data.delta),
    ['before'],
  );
  assert.deepEqual(
    state.telemetry.map((event) => [event.phase, event.status]),
    [
      ['run', 'started'],
      ['model', 'started'],
      ['model', 'aborted'],
      ['run', 'aborted'],
    ],
  );
});

test('primary input signal takes precedence when both cancellation fields are supplied', async () => {
  const primary = new AbortController();
  const fallback = new AbortController();
  fallback.abort(Object.assign(new Error('fallback cancelled'), { name: 'AbortError' }));
  const { runtime, state } = harness([[{ type: 'done' }]]);

  const result = await runtime.run(
    input({
      signal: primary.signal,
      invocation: {
        operationId: 'op_turn_signal_precedence_1',
        turnId: 'turn_signal_precedence_1',
        generation: 1,
        invocationId: 'op_turn_signal_precedence_1:g1:run',
        traceId: 'trace_signal_precedence_1',
        signal: fallback.signal,
      },
    }),
  );

  assert.equal(result.finishReason, 'stop');
  assert.equal(state.streamInputs[0].invocation.signal, primary.signal);
  assert.equal(state.streamInputs[0].signal.aborted, false);
});

test('invocation-only abort during capability settle prevents commit and later model calls', async () => {
  const controller = new AbortController();
  const rootInvocation = {
    operationId: 'op_turn_capability_cancel_1',
    turnId: 'turn_capability_cancel_1',
    generation: 5,
    invocationId: 'op_turn_capability_cancel_1:g5:run',
    traceId: 'trace_capability_cancel_1',
    signal: controller.signal,
  };
  const { runtime, state } = harness(
    [toolScript([{ id: 'call_cancel', name: 'write' }]), [{ type: 'done' }]],
    {
      telemetry: () => undefined,
      results: () => {
        controller.abort(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        return [{ callId: 'call_cancel', status: 'success', modelContent: 'late' }];
      },
    },
  );

  const result = await runtime.run(input({ invocation: rootInvocation }));

  assert.equal(result.finishReason, 'abort');
  assert.equal(state.streamInputs.length, 1);
  assert.equal(state.capabilityInputs.length, 1);
  assert.equal(state.capabilityInputs[0].signal, controller.signal);
  assert.equal(state.commitIds, undefined);
  assert.equal(
    result.messages.some((message) => message.role === 'tool'),
    false,
  );
  assert.equal(
    state.progress.some(
      (event) => event.type === 'capability.completed' && event.data.origin === 'external',
    ),
    false,
  );
  assert.deepEqual(
    state.telemetry.map((event) => [event.phase, event.status]),
    [
      ['run', 'started'],
      ['model', 'started'],
      ['model', 'succeeded'],
      ['capability', 'started'],
      ['capability', 'aborted'],
      ['run', 'aborted'],
    ],
  );
});

test('telemetry retains only model classification and never the provider message', async () => {
  const sentinel = 'SECRET provider body with https://private.example.test';
  const { runtime, state } = harness(
    [
      [
        {
          type: 'error',
          error: {
            code: 'MODEL_RATE_LIMIT',
            category: 'rate_limit',
            retryable: false,
            requestOutcome: 'rejected',
            message: sentinel,
          },
        },
      ],
    ],
    { telemetry: () => undefined },
  );

  const result = await runtime.run(input());

  assert.equal(result.error, sentinel);
  const serialized = JSON.stringify(state.telemetry);
  assert.equal(serialized.includes(sentinel), false);
  assert.equal(serialized.includes('private.example.test'), false);
  assert.equal(serialized.includes('MODEL_RATE_LIMIT'), true);
  assert.equal(serialized.includes('rate_limit'), true);
});

test('runtime telemetry applies its own value allowlist before the platform port', async () => {
  const privateSentinel = 'PRIVATE_TELEMETRY_SENTINEL';
  const { runtime, state } = harness(
    [
      [
        {
          type: 'error',
          error: {
            code: `RAW CODE ${privateSentinel}`,
            category: 'unknown',
            retryable: false,
            requestOutcome: 'unknown',
            message: 'safe failure',
          },
        },
      ],
    ],
    { telemetry: () => undefined },
  );

  await runtime.run(
    input({
      invocation: {
        operationId: `op_bad/${privateSentinel}`,
        turnId: `turn_bad/${privateSentinel}`,
        generation: -9,
        invocationId: `op_bad/${privateSentinel}:run`,
        parentInvocationId: `https://${privateSentinel}.example.test`,
        traceId: `trace_bad/${privateSentinel}`,
        prompt: privateSentinel,
        raw: privateSentinel,
      },
    }),
  );

  const serialized = JSON.stringify(state.telemetry);
  assert.equal(serialized.includes(privateSentinel), false);
  assert.equal(serialized.includes('https://'), false);
  assert.deepEqual(state.telemetry[0].invocation, {
    operationId: 'invalid:operation',
    turnId: 'invalid:turn',
    generation: 0,
    invocationId: 'invalid:invocation',
    parentInvocationId: 'invalid:invocation',
    traceId: 'invalid:trace',
  });
  const modelFailure = state.telemetry.find(
    (event) => event.type === 'invocation.completed' && event.phase === 'model',
  );
  assert.equal(modelFailure.code, 'INVALID_CODE');
  assert.equal(modelFailure.category, 'unknown');
  for (const event of state.telemetry) {
    assert.deepEqual(
      Object.keys(event).sort(),
      Object.keys(event)
        .filter((key) => !['prompt', 'path', 'raw', 'url'].includes(key))
        .sort(),
    );
  }
});

// ---- 厂商私有回放状态 ----

const stateRejected = {
  type: 'error',
  error: {
    code: 'provider_state_rejected',
    category: 'invalid_request',
    requestOutcome: 'rejected',
    message: 'rejected',
  },
};
const statefulHistory = () => [
  { role: 'user', content: 'first' },
  { role: 'assistant', content: 'earlier', provider_state: { marker: 'A' } },
  { role: 'user', content: 'second' },
];
const carriesState = (messages) => messages.some((message) => message.provider_state !== undefined);

test('hands the last provider_state of a turn to the assistant projection', async () => {
  const { runtime, state } = harness(
    [
      [
        { type: 'provider_state', state: { marker: 'stale' } },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'call_1',
          nameDelta: 'search',
          argumentsDelta: '{}',
        },
        { type: 'provider_state', state: { marker: 'B' } },
        { type: 'done' },
      ],
      [{ type: 'text_delta', delta: 'done' }, { type: 'done' }],
    ],
    { results: [{ callId: 'call_1', status: 'success', modelContent: 'ok' }] },
  );

  const result = await runtime.run(
    input({ tools: [{ type: 'function', function: { name: 'search' } }] }),
  );

  assert.equal(result.success, true);
  const assistant = state.sentMessages[1].find((message) => message.role === 'assistant');
  assert.deepEqual(assistant.provider_state, { marker: 'B' });
});

test('drops every provider_state and retries once when a stateful request is rejected', async () => {
  const { runtime, state } = harness([
    [stateRejected],
    [{ type: 'text_delta', delta: 'ok' }, { type: 'done' }],
  ]);

  const result = await runtime.run(input({ messages: statefulHistory() }));

  assert.equal(result.success, true);
  assert.deepEqual(
    state.streamInputs.map((request, index) => [
      request.attemptIndex,
      carriesState(state.sentMessages[index]),
    ]),
    [
      [0, true],
      [1, false],
    ],
  );
  // 删除写回运行历史（之后各轮都不再带），且只开始一次轮次
  assert.equal(state.replaced.length, 1);
  assert.equal(carriesState(state.replaced[0]), false);
  assert.equal(carriesState(result.messages), false);
  assert.equal(
    state.progress.filter((event) => event.data?.code === 'provider_state_retry').length,
    1,
  );
  assert.equal(state.progress.filter((event) => event.type === 'round.started').length, 1);
});

test('does not retry a rejection when the request carried no provider_state', async () => {
  const { runtime, state } = harness([
    [stateRejected],
    [{ type: 'text_delta', delta: 'never' }, { type: 'done' }],
  ]);

  const result = await runtime.run(input());
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 1);
});

test('retries without provider_state at most once per round', async () => {
  const { runtime, state } = harness([[stateRejected], [stateRejected], [{ type: 'done' }]]);

  const result = await runtime.run(input({ messages: statefulHistory() }));
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 2);
});

test('does not retry a provider_state rejection whose outcome is unknown', async () => {
  const { runtime, state } = harness([
    [{ ...stateRejected, error: { ...stateRejected.error, requestOutcome: 'unknown' } }],
    [{ type: 'done' }],
  ]);

  const result = await runtime.run(input({ messages: statefulHistory() }));
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 1);
});

test('never retries a provider_state rejection after visible output', async () => {
  const { runtime, state } = harness([
    [{ type: 'text_delta', delta: 'partial' }, stateRejected],
    [{ type: 'done' }],
  ]);

  const result = await runtime.run(input({ messages: statefulHistory() }));
  assert.equal(result.finishReason, 'error');
  assert.equal(state.streamInputs.length, 1);
});

test('combines the stateless retry with a following provider retry', async () => {
  const transient = {
    type: 'error',
    error: { category: 'transient', retryable: true, requestOutcome: 'rejected', message: 'busy' },
  };
  const { runtime, state } = harness(
    [[stateRejected], [transient], [{ type: 'text_delta', delta: 'ok' }, { type: 'done' }]],
    {
      modelRetry: {
        plan: () => ({ delayMs: 1, notBeforeMs: 11 }),
        wait: async () => undefined,
      },
    },
  );

  const result = await runtime.run(input({ messages: statefulHistory() }));

  assert.equal(result.success, true);
  assert.deepEqual(
    state.streamInputs.map((request, index) => [
      request.attemptIndex,
      carriesState(state.sentMessages[index]),
    ]),
    [
      [0, true],
      [1, false],
      [2, false],
    ],
  );
  assert.deepEqual(
    state.retryWaits.map((wait) => wait.attemptIndex),
    [2],
  );
});

test('combines the stateless retry with a following context-overflow recovery', async () => {
  const overflow = {
    type: 'error',
    error: { category: 'context_overflow', requestOutcome: 'rejected', message: 'too long' },
  };
  const { runtime, state } = harness(
    [[stateRejected], [overflow], [{ type: 'text_delta', delta: 'ok' }, { type: 'done' }]],
    {
      prepare: (messages, context) =>
        context.reason === 'context_overflow' ? messages.slice(1) : messages,
    },
  );

  const result = await runtime.run(input({ messages: statefulHistory() }));

  assert.equal(result.success, true);
  assert.deepEqual(
    state.streamInputs.map((request, index) => [
      request.attemptIndex,
      carriesState(state.sentMessages[index]),
    ]),
    [
      [0, true],
      [1, false],
      [2, false],
    ],
  );
  assert.deepEqual(
    state.preparationContexts.map((context) => context.reason),
    ['round', 'context_overflow'],
  );
});

test('does not dispatch the stateless retry after the run is aborted', async () => {
  const controller = new AbortController();
  const { runtime, state } = harness([[stateRejected], [{ type: 'done' }]], {
    beforeModelEvent: ({ event }) => {
      if (event === stateRejected) controller.abort();
    },
  });

  const result = await runtime.run(
    input({ messages: statefulHistory(), signal: controller.signal }),
  );

  assert.equal(result.finishReason, 'abort');
  assert.equal(state.streamInputs.length, 1);
});

test('allows another stateless retry in a later round after new state was produced', async () => {
  const { runtime, state } = harness(
    [
      [stateRejected],
      [
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'call_1',
          nameDelta: 'search',
          argumentsDelta: '{}',
        },
        { type: 'provider_state', state: { marker: 'B' } },
        { type: 'done' },
      ],
      [stateRejected],
      [{ type: 'text_delta', delta: 'ok' }, { type: 'done' }],
    ],
    { results: [{ callId: 'call_1', status: 'success', modelContent: 'ok' }] },
  );

  const result = await runtime.run(
    input({
      messages: statefulHistory(),
      tools: [{ type: 'function', function: { name: 'search' } }],
    }),
  );

  assert.equal(result.success, true);
  assert.deepEqual(state.sentMessages.map(carriesState), [true, false, true, false]);
});
