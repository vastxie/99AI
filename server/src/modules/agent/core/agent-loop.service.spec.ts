import { AgentLoopService, type AgentLoopOptions } from './agent-loop.service';
import { createAgentLoopEventProjector } from '../events/agent-loop-event-projector';
import { AgentRuntimeCore } from '@99agent/runtime-core';
import { ToolOutcomeUnknownError } from '../tools/tool-provider.interface';
import type { Round } from '../../chatLog/types/message.types';

type AgentLoopProgressEvent = Parameters<NonNullable<AgentLoopOptions['onProgress']>>[0];

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AgentLoopService tool execution', () => {
  /** 直接驱动 Service Tool Adapter；preflight tool_call 由 onStart 投影，与生产接线一致。 */
  const runToolCalls = (
    loop: any,
    toolCalls: any[],
    toolContext: any,
    sanitizedNameMap: Map<string, string>,
    options: any,
    currentRoundIndex: number,
  ) =>
    loop
      .createToolExecutor({
        onStart: (start: any) => {
          options.onProgress?.({
            type: 'tool_call',
            data: {
              roundIndex: start.roundIndex,
              toolCall: {
                id: start.callId,
                toolName: start.functionName,
                displayName: start.displayName,
                name: start.displayName,
                inputSummary: start.inputSummary,
                arguments: {},
                type: start.toolType,
                ...(start.outputHint ? { outputHint: start.outputHint } : {}),
              },
            },
          });
        },
      })
      .executeToolCalls({ toolCalls, toolContext, sanitizedNameMap, options, currentRoundIndex });

  const createMockStream = (chunks: any[]) =>
    (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })();

  const createToolCallStream = (content: string, callId: string, query: string) =>
    createMockStream([
      { choices: [{ delta: { content } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: callId,
                  function: {
                    name: 'search_tool',
                    arguments: JSON.stringify({ query }),
                  },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ]);

  const createFinalAnswerStream = (content: string) =>
    createMockStream([
      { choices: [{ delta: { reasoning_content: '检查证据。' } }] },
      { choices: [{ delta: { content } }] },
      {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      },
    ]);

  const normalizeMockUsage = (usage: any) =>
    usage
      ? {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          raw: usage,
        }
      : undefined;

  const mapMockOpenAIStream = async function* (stream: AsyncIterable<any>) {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
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
          };
        }
      }
      if (chunk.usage) {
        yield { type: 'usage', usage: normalizeMockUsage(chunk.usage) };
      }
    }
    yield { type: 'done' };
  };

  const createLoopService = (
    create: any,
    execute = jest.fn(),
    memoryService: any = {},
    toolDefinitions: any[] = [
      {
        type: 'function',
        function: {
          name: 'search_tool',
          description: '搜索',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    modelInfo: any = {
      key: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-test',
    },
  ) => {
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue({
        maxToolCallsPerRequest: 10,
      }),
    };
    const toolProviderRegistry = {
      prepareTurn: jest.fn().mockResolvedValue(undefined),
      finishTurn: jest.fn().mockResolvedValue(undefined),
      collectSystemPromptSections: jest.fn().mockResolvedValue([]),
      getToolCost: jest.fn().mockResolvedValue(0),
      getAllToolDefinitions: jest.fn().mockResolvedValue(toolDefinitions),
      getToolProviderInfo: jest.fn().mockReturnValue({
        metadata: {
          category: 'search',
          runtime: 'http_api',
        },
      }),
      getDisplayName: jest.fn().mockReturnValue('搜索'),
      execute: execute.mockResolvedValue({
        type: 'tool',
        name: '搜索',
        status: 'success',
        output: { content: '搜索结果摘要' },
        model: { content: '搜索结果摘要', output: { kind: 'search' } },
        display: { summary: '搜索结果摘要', kind: 'search' },
        time: Date.now(),
        duration: 1,
      }),
    };
    const modelGatewayService = {
      // 只有 Responses 协议包声明了原生联网搜索
      describeProtocol: jest.fn((protocol: string) =>
        protocol === 'demo_responses' ? { protocol, supportsNativeWebSearch: true } : undefined,
      ),
      stream: jest.fn((request: any) =>
        mapMockOpenAIStream(
          create({
            model: request.config.model,
            messages: request.messages,
            tools: request.tools,
            tool_choice: request.toolChoice,
            temperature: request.temperature,
            stream: true,
            stream_options: { include_usage: true },
            ...(request.config.additionalParams || {}),
          }),
        ),
      ),
      completeOnce: jest.fn(async (request: any) => {
        const response = create(
          {
            model: request.config.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
          },
          { signal: request.signal },
        );
        return {
          content: response.choices?.[0]?.message?.content || '',
          usage: normalizeMockUsage(response.usage),
          raw: response,
        };
      }),
    };
    const service = new AgentLoopService(
      globalConfigService as any,
      toolProviderRegistry as any,
      {
        getCurrentModelKeyInfo: jest.fn().mockResolvedValue(null),
        getDefaultModelKeyInfo: jest.fn().mockResolvedValue(modelInfo),
      } as any,
      modelGatewayService as any,
    );
    return service;
  };

  it('allows only declared host fields into the provider context', async () => {
    const service = createLoopService(jest.fn(() => createFinalAnswerStream('done')));
    const runScope = Object.freeze({});
    const options: any = {
      runScope,
      fileRefMapping: {
        entries: [
          {
            fileRef: 'previous_file_1',
            fileId: 'file_previous0000000000000001',
          },
        ],
      },
      currentMessage: {
        role: 'assistant',
        content: '',
        rounds: [],
        task: {
          taskId: 'task_canonical',
          status: 'running',
          conversationGid: 'g_0123456789abcdefghijklmn',
        },
      },
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
    };

    const result = await service.execute(
      [
        {
          role: 'user',
          content: 'answer',
          __agent_context: { chatLogId: 99, required: true },
        },
      ] as any,
      options,
    );
    const registry = (service as any).toolProviderRegistry;
    const internalOptions = registry.getAllToolDefinitions.mock.calls[0][0].input.context.options;

    expect(result.success).toBe(true);
    expect(internalOptions).not.toBe(options);
    expect(internalOptions).not.toHaveProperty('runScope');
    expect(internalOptions).not.toHaveProperty('apiKey');
    expect(internalOptions).not.toHaveProperty('baseUrl');
    expect(internalOptions).not.toHaveProperty('modelConfig');
    expect(internalOptions).not.toHaveProperty('additionalParams');
    expect(internalOptions).not.toHaveProperty('taskId');
    expect(options.runScope).toBe(runScope);
    const internalContext = registry.getAllToolDefinitions.mock.calls[0][0];
    expect(JSON.stringify(registry.prepareTurn.mock.calls[0][0].input.messages)).not.toContain(
      '__agent_context',
    );
    expect(JSON.stringify(internalContext.input.messages)).not.toContain('__agent_context');
    expect(internalContext.fileRefMappingStore.snapshot().entries).toEqual(
      options.fileRefMapping.entries,
    );
    expect(JSON.stringify(result)).not.toContain('runScope');
    expect(JSON.stringify(result)).not.toContain('lease');
  });

  it('hands off after the current tool round when a queued turn exists', async () => {
    const progressEvents: any[] = [];
    const create = jest.fn(() =>
      createToolCallStream('先处理当前工具。', 'call_search_1', 'alpha'),
    );
    const service = createLoopService(create);
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };

    const result = await service.execute([{ role: 'user', content: '查一下 alpha' }], {
      currentMessage,
      onProgress: (event: AgentLoopProgressEvent) => progressEvents.push(event),
      shouldHandoffAfterToolRound: () => true,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
    } as any);

    expect(result.finishReason).toBe('handoff');
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.message.rounds[0].completed).toBe(true);
    expect(result.message.rounds[0].toolCalls[0]).toMatchObject({
      name: '搜索',
      status: 'success',
    });
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'round_complete' }),
        expect.objectContaining({
          type: 'progress',
          data: { description: '已收到后续要求，准备进入下一轮' },
        }),
        expect.objectContaining({
          type: 'done',
          data: { finishReason: 'handoff' },
        }),
      ]),
    );
  });

  it('reports the tool round limit as a stop reason instead of a plain abort', async () => {
    const create = jest.fn(() => createToolCallStream('继续查。', 'call_search_loop', 'alpha'));
    const service = createLoopService(create);
    (service as any).globalConfigService.getConfigs.mockResolvedValue({
      maxToolCallsPerRequest: 1,
    });

    const result = await service.execute([{ role: 'user', content: '一直查' }], {
      currentMessage: { role: 'assistant', content: '', rounds: [] },
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
    } as any);

    // 轮次上限收尾仍按中断结算，但要能和用户点停区分开
    expect(result.finishReason).toBe('abort');
    expect(result.stopReason).toBe('max_rounds');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('stops before a second model request when a tool outcome is unknown', async () => {
    const create = jest.fn(() =>
      createToolCallStream('尝试执行。', 'call_unknown_effect', 'alpha'),
    );
    const service = createLoopService(create);
    const registry = (service as any).toolProviderRegistry;
    registry.execute.mockRejectedValue(new ToolOutcomeUnknownError());
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      markToolEffectUnknown: jest.fn().mockResolvedValue(undefined),
      commitToolEffect: jest.fn(),
    };

    const result = await service.execute([{ role: 'user', content: '执行工具' }], {
      currentMessage: { role: 'assistant', content: '', rounds: [] },
      operationSession,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
    } as any);

    expect(result.finishReason).toBe('error');
    expect(result.error).toContain('结果不确定');
    expect(create).toHaveBeenCalledTimes(1);
    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });

  it('keeps the runtime error fixed when persisting a tool unknown outcome fails', async () => {
    const privateDetail = 'synthetic operation store diagnostic';
    const create = jest.fn(() =>
      createToolCallStream('尝试执行。', 'call_unknown_store_failure', 'alpha'),
    );
    const service = createLoopService(create);
    const registry = (service as any).toolProviderRegistry;
    registry.execute.mockRejectedValue(new ToolOutcomeUnknownError());
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      markToolEffectUnknown: jest.fn().mockRejectedValue(new Error(privateDetail)),
      commitToolEffect: jest.fn(),
    };

    const result = await service.execute([{ role: 'user', content: '执行工具' }], {
      currentMessage: { role: 'assistant', content: '', rounds: [] },
      operationSession,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
    } as any);

    expect(result.finishReason).toBe('error');
    expect(result.error).toContain('结果不确定');
    expect(result.error).not.toContain(privateDetail);
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(create).toHaveBeenCalledTimes(1);
    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 25],
    [0, 25],
    [-1, 25],
    [1.5, 25],
    [Infinity, 25],
    [100000, 50],
    ['50', 50],
  ])(
    'constrains configured tool rounds %s to %s at the runtime boundary',
    async (configured: unknown, expected: number) => {
      const runSpy = jest
        .spyOn(AgentRuntimeCore.prototype, 'run')
        .mockResolvedValue({ success: true, finishReason: 'stop', traceStatus: 'success' });
      try {
        const service = createLoopService(jest.fn(() => createFinalAnswerStream('done')));
        (service as any).globalConfigService.getConfigs.mockResolvedValue({
          maxToolCallsPerRequest: configured,
        });
        await service.execute([{ role: 'user', content: 'hello' }], {
          currentMessage: { role: 'assistant', content: '', rounds: [] },
        } as any);
        expect(runSpy.mock.calls[0][0].maxRounds).toBe(expected);
      } finally {
        runSpy.mockRestore();
      }
    },
  );

  it.each([
    [undefined, 120],
    ['', 120],
    [0, 120],
    [-5, 120],
    ['abc', 120],
    [5, 10],
    ['45', 45],
    [300.9, 300],
    [100000, 600],
  ])(
    'waits %s seconds (configured) as %s for the first model event and caps silence at ten minutes',
    async (configured: unknown, expectedSec: number) => {
      const runSpy = jest
        .spyOn(AgentRuntimeCore.prototype, 'run')
        .mockResolvedValue({ success: true, finishReason: 'stop', traceStatus: 'success' });
      try {
        const service = createLoopService(jest.fn(() => createFinalAnswerStream('done')));
        (service as any).globalConfigService.getConfigs.mockResolvedValue({
          modelFirstResponseTimeoutSec: configured,
        });
        await service.execute([{ role: 'user', content: 'hello' }], {
          currentMessage: { role: 'assistant', content: '', rounds: [] },
        } as any);
        expect((service as any).globalConfigService.getConfigs).toHaveBeenCalledWith([
          'maxToolCallsPerRequest',
          'modelFirstResponseTimeoutSec',
        ]);
        expect(runSpy.mock.calls[0][0]).toMatchObject({
          maxRounds: 25,
          firstEventTimeoutMs: expectedSec * 1000,
          idleTimeoutMs: 600_000,
        });
      } finally {
        runSpy.mockRestore();
      }
    },
  );

  it('uses AgentRuntimeCore as the loop adapter after context preparation', async () => {
    const runSpy = jest.spyOn(AgentRuntimeCore.prototype, 'run').mockResolvedValue({
      success: true,
      finishReason: 'stop',
      traceStatus: 'success',
    });
    const service = createLoopService(
      jest.fn(() => createFinalAnswerStream('不会直接调用')),
      jest.fn(),
    );
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };

    try {
      const result = await service.execute([{ role: 'user', content: '你好' }], {
        currentMessage,
        tokenUsage: {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          details: [],
        },
      } as any);

      expect(result).toMatchObject({ success: true, finishReason: 'stop' });
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(runSpy.mock.calls[0][0]).toMatchObject({
        model: 'gpt-test',
        maxRounds: 10,
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({ name: 'search_tool' }),
          }),
        ],
      });
      expect(runSpy.mock.calls[0][0].messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
      );
    } finally {
      runSpy.mockRestore();
    }
  });

  it('passes the original model tool_call id into AgentApp execution context', async () => {
    const toolProviderRegistry = {
      prepareTurn: jest.fn().mockResolvedValue(undefined),
      finishTurn: jest.fn().mockResolvedValue(undefined),
      collectSystemPromptSections: jest.fn().mockResolvedValue([]),
      getToolCost: jest.fn().mockResolvedValue(0),
      getToolProviderInfo: jest.fn().mockReturnValue({
        metadata: {
          category: 'creative',
          outputHint: { type: 'image' },
        },
      }),
      getDisplayName: jest.fn().mockReturnValue('绘图'),
      execute: jest
        .fn()
        .mockImplementation(async (_toolName: string, _args: any, context: any) => ({
          id: context.toolCallId,
          type: 'tool',
          name: '绘图',
          status: 'success',
          input: {},
          output: { content: 'ok' },
          outputHint: { type: 'image' },
          time: Date.now(),
        })),
    };
    const service = new AgentLoopService({} as any, toolProviderRegistry as any);
    const onProgress = jest.fn();

    const results = await runToolCalls(
      service,
      [
        {
          id: 'call_original_1',
          function: {
            name: 'gpt_image',
            arguments: JSON.stringify({ prompt: 'cat' }),
          },
        },
      ],
      { input: { context: { options: { onProgress, currentMessage: { rounds: [] } } } } },
      new Map([['gpt_image', 'gpt_image']]),
      { onProgress, toolCost: 0 },
      0,
    );

    expect(toolProviderRegistry.execute).toHaveBeenCalledWith(
      'gpt_image',
      { prompt: 'cat' },
      expect.objectContaining({ toolCallId: 'call_original_1' }),
    );

    const preflightToolCall = onProgress.mock.calls.find(
      ([event]: any[]) => event?.type === 'tool_call',
    )?.[0];
    expect(preflightToolCall?.data?.toolCall?.outputHint).toBeUndefined();
    expect(results[0].internal.trace).toMatchObject({
      callId: 'call_original_1',
      toolName: 'gpt_image',
      output: { kind: 'generic' },
      status: 'success',
      durationMs: expect.any(Number),
      fileRefs: [],
    });
  });

  it('does not project media artifact hints during preflight tool_call events', async () => {
    const toolProviderRegistry = {
      prepareTurn: jest.fn().mockResolvedValue(undefined),
      finishTurn: jest.fn().mockResolvedValue(undefined),
      collectSystemPromptSections: jest.fn().mockResolvedValue([]),
      getToolCost: jest.fn().mockResolvedValue(0),
      getToolProviderInfo: jest.fn().mockReturnValue({
        metadata: {
          category: 'creative',
          outputHint: { type: 'image' },
        },
      }),
      getDisplayName: jest.fn().mockReturnValue('绘图'),
      execute: jest.fn().mockImplementation(async () => {
        throw new Error('invalid image params');
      }),
    };
    const loopService = new AgentLoopService({} as any, toolProviderRegistry as any);
    const currentMessage = {
      role: 'assistant',
      content: '',
      rounds: [] as Round[],
    };
    const frontendEvents: any[] = [];
    const onProgress = jest.fn(
      createAgentLoopEventProjector({
        currentMessage: currentMessage as any,
        chatId: '123',
        onEvent: frontendEvent => frontendEvents.push(frontendEvent),
      }),
    );

    const results = await runToolCalls(
      loopService,
      [
        {
          id: 'call_media_fast_error',
          function: {
            name: 'gpt_image',
            arguments: JSON.stringify({ prompt: 'cat', size: 'bad-size' }),
          },
        },
      ],
      { input: { context: { options: { onProgress, currentMessage } } } },
      new Map([['gpt_image', 'gpt_image']]),
      { onProgress, toolCost: 0 },
      0,
    );

    const projectedToolCall = frontendEvents.find(event => event.type === 'tool.start');
    expect(projectedToolCall?.data?.status).toBe('running');
    expect(projectedToolCall?.data?.outputHint).toBeUndefined();
    expect(results[0].internal.trace).toMatchObject({
      callId: 'call_media_fast_error',
      toolName: 'gpt_image',
      output: { kind: 'generic' },
      status: 'error',
      durationMs: expect.any(Number),
      fileRefs: [],
      errorCode: 'TOOL_EXECUTION_ERROR',
      errorSummary: expect.any(String),
    });

    expect(JSON.stringify(frontendEvents)).not.toContain('"outputHint":{"type":"image"');
  });

  it('stores tool traces under internal.trace with sanitized summaries only', () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);
    const traced = (service as any).withToolTrace({
      id: 'call_runtime_1',
      toolName: 'runtime_pdf',
      status: 'error',
      duration: 42,
      inputSummary: 'operation: merge · token: SECRET data:image/png;base64,' + 'A'.repeat(160),
      model: {
        content:
          'Runtime stdout: raw secret /api/files/file_secretsecretsecretsecret/preview Bearer abc.def',
        output: { kind: 'runtime' },
      },
      display: {
        publicError:
          'Runtime 失败 Bearer secret-token storagePath: /storage/private/output.log stderr: boom',
      },
      internal: {
        fileRefs: {
          entries: [
            {
              fileRef: 'output_file_1',
              fileId: 'file_secretsecretsecretsecret',
            },
          ],
        },
      },
    });

    expect(traced.internal.trace).toMatchObject({
      callId: 'call_runtime_1',
      toolName: 'runtime_pdf',
      output: { kind: 'runtime' },
      status: 'error',
      durationMs: 42,
      fileRefs: ['output_file_1'],
      errorCode: 'TOOL_EXECUTION_ERROR',
      errorSummary: expect.any(String),
    });
    const serializedTrace = JSON.stringify(traced.internal.trace);
    expect(serializedTrace).not.toContain('file_secretsecretsecretsecret');
    expect(serializedTrace).not.toContain('/api/files/');
    expect(serializedTrace).not.toContain('/storage/private');
    expect(serializedTrace).not.toContain('secret-token');
    expect(serializedTrace).not.toContain('token: SECRET');
    expect(serializedTrace).not.toContain('base64');
    expect(serializedTrace).not.toContain('stdout');
    expect(serializedTrace).not.toContain('stderr');
    expect(serializedTrace).not.toContain('storagePath');
  });

  it('finalizes AgentRunTrace summaries for success and aborted runs', () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };
    const options: any = {
      chatId: 'c_trace_1',
      messageId: 'c_trace_1',
      turnId: 'turn_trace_1',
      userId: 7,
      currentMessage,
      tokenUsage: {
        totalInputTokens: 3,
        totalOutputTokens: 4,
        totalTokens: 7,
        details: [],
      },
      toolCost: 2,
    };

    const trace = (service as any).ensureRunTrace(options, 'gpt-test');
    trace.rounds.push({
      roundIndex: 0,
      startedAt: new Date().toISOString(),
      status: 'success',
      toolCalls: [{ callId: 'call_1', toolName: 'tool', status: 'success' }],
    });
    (service as any).finalizeRunTrace(currentMessage, options, 'success');

    expect(currentMessage.trace).toMatchObject({
      traceId: expect.stringMatching(/^trace_/),
      cid: 'c_trace_1',
      messageId: 'c_trace_1',
      turnId: 'turn_trace_1',
      userUid: '7',
      model: 'gpt-test',
      status: 'success',
      summary: expect.objectContaining({
        roundCount: 1,
        toolCallCount: 1,
        totalTokens: 7,
        toolCost: 2,
      }),
    });
    (service as any).finalizeRunTrace(currentMessage, options, 'aborted');
    expect(currentMessage.trace.status).toBe('aborted');
  });

  it('does not leave the current round as success when an aborted run is finalized', () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };
    const options: any = {
      currentMessage,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
      toolCost: 0,
    };
    const trace = (service as any).ensureRunTrace(options, 'gpt-test');
    trace.rounds.push(
      {
        roundIndex: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success',
        toolCalls: [{ callId: 'call_1', toolName: 'tool', status: 'success' }],
      },
      {
        roundIndex: 1,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success',
        toolCalls: [],
      },
    );

    (service as any).finalizeRunTrace(currentMessage, options, 'aborted');

    expect(currentMessage.trace.status).toBe('aborted');
    expect(currentMessage.trace.rounds[0].status).toBe('success');
    expect(currentMessage.trace.rounds[1].status).toBe('skipped');
  });

  it('marks unfinished round traces as error when a run fails', () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };
    const options: any = {
      currentMessage,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
      toolCost: 0,
    };
    const trace = (service as any).ensureRunTrace(options, 'gpt-test');
    trace.rounds.push({
      roundIndex: 0,
      startedAt: new Date().toISOString(),
      status: 'success',
      toolCalls: [],
    });

    (service as any).finalizeRunTrace(currentMessage, options, 'error');

    expect(currentMessage.trace.status).toBe('error');
    expect(currentMessage.trace.rounds[0]).toMatchObject({
      status: 'error',
      endedAt: expect.any(String),
    });
  });

  it('does not leave the current round as success when a failed run is finalized', () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };
    const options: any = {
      currentMessage,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
      toolCost: 0,
    };
    const trace = (service as any).ensureRunTrace(options, 'gpt-test');
    trace.rounds.push(
      {
        roundIndex: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success',
        toolCalls: [{ callId: 'call_1', toolName: 'tool', status: 'success' }],
      },
      {
        roundIndex: 1,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success',
        toolCalls: [],
      },
    );

    (service as any).finalizeRunTrace(currentMessage, options, 'error');

    expect(currentMessage.trace.status).toBe('error');
    expect(currentMessage.trace.rounds[0].status).toBe('success');
    expect(currentMessage.trace.rounds[1].status).toBe('error');
  });

  it('builds the explicit root invocation from the durable operation fence', () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);
    const abortController = new AbortController();
    const invocation = (service as any).createRootInvocation(
      {
        turnId: 'turn_stale_input',
        abortController,
        operationSession: {
          identity: {
            operationId: 'op_turn_durable_1',
            turnId: 'turn_durable_1',
          },
          fence: { generation: 4 },
        },
      },
      'trace_durable_1',
    );

    expect(invocation).toEqual({
      operationId: 'op_turn_durable_1',
      turnId: 'turn_durable_1',
      generation: 4,
      invocationId: 'op_turn_durable_1:g4:run',
      traceId: 'trace_durable_1',
      signal: abortController.signal,
    });
    expect(invocation).not.toHaveProperty('ownerKey');
    expect(invocation).not.toHaveProperty('userId');
    expect(invocation).not.toHaveProperty('model');

    const recovered = (service as any).createRootInvocation(
      {
        turnId: 'turn_stale_input',
        abortController,
        operationSession: {
          identity: {
            operationId: 'op_turn_durable_1',
            turnId: 'turn_durable_1',
          },
          fence: { generation: 5 },
        },
      },
      'trace_durable_2',
    );
    expect(recovered).toMatchObject({
      operationId: 'op_turn_durable_1',
      turnId: 'turn_durable_1',
      generation: 5,
      invocationId: 'op_turn_durable_1:g5:run',
      traceId: 'trace_durable_2',
    });
    expect(recovered.invocationId).not.toBe(invocation.invocationId);
  });

  it('rejects blocked media URLs before sending them to the model', async () => {
    const service = new AgentLoopService({} as any, {} as any, {} as any, {} as any);

    await expect(
      (service as any).convertMediaUrlsToBase64(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'http://127.0.0.1/private.png' },
              },
            ],
          },
        ],
        true,
      ),
    ).rejects.toThrow('不允许访问内网或保留地址');
  });
});
