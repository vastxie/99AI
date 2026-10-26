import { AgentRuntimeCore } from '@99agent/runtime-core';
import { AgentRuntimePlatformAdapter } from '../core/agent-runtime-platform.adapter';
import { AgentToolExecutor } from '../core/agent-tool-executor.adapter';
import {
  createAssistantTurnMessage,
  summarizeAgentLoopResult,
  toPersistedAssistantMessage,
} from '../core/agent-turn-outcome';
import { createAgentLoopEventProjector } from './agent-loop-event-projector';
import type { AgentToolCallTrace } from '../../chatLog/tool-result-payload';
import { createLayeredToolResult } from '../../chatLog/tool-result-payload';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import {
  ConversationToolProvider,
  isConversationToolName,
} from '../conversation/conversation-tool.provider';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const createStream = (chunks: any[]) =>
  (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();

const traceAdapter = {
  createRoundTrace: (roundIndex: number) => ({
    roundIndex,
    startedAt: new Date().toISOString(),
    status: 'success' as const,
    toolCalls: [] as AgentToolCallTrace[],
  }),
  summarizeModelOutput: (content: string) =>
    content ? `assistantTextChars=${content.length}` : undefined,
};

/**
 * 与 ChatTurnRun.runAgent 相同的组合：骨架消息 → 投影回调 → 循环 → 结果摘要 → 落库消息。
 * 循环本身由各用例的 execute 替身提供。
 */
async function runLoop(
  execute: (messages: any[], options: any) => Promise<any>,
  input: {
    model?: string;
    turnId?: string;
    turnStartedAt?: string;
    frontendMessageOptions?: { exposePrivateFileDownloads?: boolean };
  } = {},
) {
  const model = input.model || 'gpt-test';
  const currentMessage = createAssistantTurnMessage({
    model,
    turnId: input.turnId,
    turnStartedAt: input.turnStartedAt,
  });
  const frontendEvents: any[] = [];
  const loopResult = await execute([{ role: 'user', content: 'hi' }], {
    chatId: 'c_public',
    messageId: 'c_public',
    model,
    currentMessage,
    tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, details: [] },
    onProgress: createAgentLoopEventProjector({
      currentMessage,
      chatId: 'c_public',
      messageId: 'c_public',
      frontendMessageOptions: input.frontendMessageOptions,
      onEvent: event => frontendEvents.push(event),
    }),
  });
  const result = summarizeAgentLoopResult(loopResult, currentMessage);
  result.currentMessage = toPersistedAssistantMessage(result.currentMessage, {
    model,
    tokenUsage: result.tokenUsage,
  });
  return { result, frontendEvents, persistedMessage: JSON.stringify(result.currentMessage) };
}

describe('AgentLoop event projection and turn outcome', () => {
  it('projects an aborted runtime result as an interrupted terminal event', async () => {
    const { result, frontendEvents } = await runLoop(
      async (_messages, options) => {
        options.onProgress({ type: 'done', data: { finishReason: 'abort' } });
        return {
          success: true,
          message: options.currentMessage,
          finishReason: 'abort',
          tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 },
          toolCost: 0,
        };
      },
      { turnId: 'turn_abort', turnStartedAt: '2026-08-30T05:30:00.000Z' },
    );

    const terminal = frontendEvents.find(event => event.type === 'agent.end');
    expect(result.finishReason).toBe('abort');
    expect(result.currentMessage.turn).toMatchObject({
      id: 'turn_abort',
      status: 'interrupted',
    });
    expect(terminal).toMatchObject({
      type: 'agent.end',
      chatId: 'c_public',
      data: {
        finishReason: 'abort',
        turnStatus: 'interrupted',
        turn: { id: 'turn_abort', status: 'interrupted' },
      },
    });
    expect(JSON.parse(terminal.data.message).turn).toMatchObject({
      id: 'turn_abort',
      status: 'interrupted',
    });
  });

  it('keeps successful tool cost and usage when the final agent loop fails', async () => {
    const { result } = await runLoop(async (_messages, options) => {
      options.currentMessage.rounds = [
        {
          text: null,
          thinking: null,
          completed: false,
          toolCalls: [
            {
              id: 'call_1',
              name: 'docs / search',
              toolName: 'docs__search',
              status: 'success',
              type: 'tool',
            },
          ],
        },
      ];
      return {
        success: false,
        message: options.currentMessage,
        finishReason: 'error',
        error: '模型最终回复失败',
        tokenUsage: { totalInputTokens: 10, totalOutputTokens: 0, totalTokens: 10 },
        toolCost: 5,
      };
    });

    expect(result).toMatchObject({
      finishReason: 'error',
      errMsg: '模型最终回复失败',
      toolCost: 5,
      totalTokens: 10,
    });
    expect(result.currentMessage.rounds[0].toolCalls).toHaveLength(1);
  });

  it('persists backend-only internal file refs while frontend events stay sanitized', async () => {
    const fileId = 'file_hhhhhhhhhhhhhhhhhhhhhhhh';
    const privateFileOutput = {
      summary: `图片已经生成，预览 /api/files/${fileId}/preview`,
      files: [
        {
          id: fileId,
          fileId,
          type: 'image',
          name: 'result.png',
          mime: 'image/png',
          previewUrl: `/api/files/${fileId}/preview`,
          downloadUrl: `/api/files/${fileId}/download`,
        },
      ],
      fileAssets: [
        {
          id: fileId,
          fileId,
          type: 'image',
          name: 'asset.png',
          mime: 'image/png',
          previewUrl: `/api/files/${fileId}/preview`,
          downloadUrl: `/api/files/${fileId}/download`,
        },
      ],
      attachments: [
        {
          id: fileId,
          fileId,
          type: 'image',
          name: 'attachment.png',
          mime: 'image/png',
          previewUrl: `/api/files/${fileId}/preview`,
          downloadUrl: `/api/files/${fileId}/download`,
        },
      ],
    };
    const backendToolCall = {
      id: 'call_image_1',
      name: '图片生成',
      toolName: 'gpt_image',
      status: 'success',
      type: 'tool',
      output: privateFileOutput,
      internal: {
        fileRefs: {
          entries: [
            {
              fileRef: 'output_image_1',
              fileId,
              name: 'result.png',
              mime: 'image/png',
              type: 'image',
              origin: 'tool_output',
            },
          ],
          counters: {
            attachment: 0,
            output_image: 1,
            output_file: 0,
            previous_file: 0,
          },
        },
      },
    };

    const { frontendEvents, persistedMessage } = await runLoop(async (_messages, options) => {
      options.currentMessage.content = '图片已经生成';
      options.currentMessage.rounds = [
        {
          text: '图片已经生成',
          thinking: null,
          completed: true,
          toolCalls: [backendToolCall],
        },
      ];
      options.onProgress?.({
        type: 'tool_result',
        data: {
          roundIndex: 0,
          toolCall: {
            id: 'call_image_1',
            name: '图片生成',
            status: 'success',
            type: 'tool',
            output: privateFileOutput,
          },
        },
      });
      options.onProgress?.({ type: 'done', data: { finishReason: 'stop' } });
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'stop',
        tokenUsage: { totalInputTokens: 10, totalOutputTokens: 5, totalTokens: 15 },
        toolCost: 0,
      };
    });

    const savedToolCall = JSON.parse(persistedMessage).rounds[0].toolCalls[0];
    expect(savedToolCall.internal.fileRefs.entries[0]).toMatchObject({
      fileRef: 'output_image_1',
      fileId,
    });
    expect(JSON.stringify(savedToolCall.output)).not.toContain(fileId);
    expect(JSON.stringify(savedToolCall.output)).not.toContain(`/api/files/${fileId}/preview`);
    expect(JSON.stringify(savedToolCall.output)).not.toContain(`/api/files/${fileId}/download`);

    expect(frontendEvents.map(event => event.type)).toEqual(
      expect.arrayContaining(['tool.end', 'agent.end']),
    );
    const frontendPayload = JSON.stringify(frontendEvents);
    expect(frontendPayload).not.toContain('"internal"');
    expect(frontendPayload).not.toContain(fileId);
    expect(frontendPayload).not.toContain(`/api/files/${fileId}/preview`);
    expect(frontendPayload).not.toContain(`/api/files/${fileId}/download`);
  });

  it('hides owner private file previews in live frontend progress events', async () => {
    const fileId = 'file_ownerpreviewhhhhhhhhhhhh';
    const privateFileOutput = {
      summary: '表格已经生成',
      files: [
        {
          fileRef: 'output_file_1',
          type: 'file',
          role: 'final',
          name: 'spreadsheet.xlsx',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    };
    const backendToolCall = {
      id: 'call_file_1',
      name: '表格处理',
      status: 'success',
      type: 'tool',
      output: privateFileOutput,
      internal: {
        fileRefs: {
          entries: [
            {
              fileRef: 'output_file_1',
              fileId,
              name: 'spreadsheet.xlsx',
              mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              type: 'file',
              role: 'final',
              origin: 'tool_output',
            },
          ],
          counters: {
            attachment: 0,
            output_image: 0,
            output_file: 1,
            previous_file: 0,
          },
        },
      },
    };

    const { frontendEvents } = await runLoop(
      async (_messages, options) => {
        options.currentMessage.content = '表格已经生成';
        options.currentMessage.rounds = [
          {
            text: '表格已经生成',
            thinking: null,
            completed: true,
            toolCalls: [backendToolCall],
          },
        ];
        options.onProgress?.({
          type: 'tool_result',
          data: { roundIndex: 0, toolCall: backendToolCall },
        });
        options.onProgress?.({ type: 'done', data: { finishReason: 'stop' } });
        return {
          success: true,
          message: options.currentMessage,
          finishReason: 'stop',
          tokenUsage: { totalInputTokens: 10, totalOutputTokens: 5, totalTokens: 15 },
          toolCost: 0,
        };
      },
      { frontendMessageOptions: { exposePrivateFileDownloads: true } },
    );

    const toolResult = frontendEvents.find(event => event.type === 'tool.end');
    const finalEvent = frontendEvents.find(event => event.type === 'agent.end');
    expect(JSON.stringify(toolResult)).toContain(fileId);
    expect(JSON.stringify(toolResult)).toContain('spreadsheet.xlsx');
    expect(JSON.stringify(toolResult)).toContain('privateDownloadHidden');
    expect(JSON.stringify(toolResult)).toContain('privatePreviewHidden');
    expect(JSON.stringify(toolResult)).not.toContain(`/api/files/${fileId}/download`);
    expect(JSON.stringify(toolResult)).not.toContain(`/api/files/${fileId}/preview`);
    expect(JSON.stringify(finalEvent)).not.toContain(`/api/files/${fileId}/download`);
    expect(JSON.stringify(finalEvent)).not.toContain(`/api/files/${fileId}/preview`);
    expect(JSON.stringify(toolResult)).not.toContain('"internal"');
  });

  it('projects Runtime ToolResult assets into live tool.end events', async () => {
    const fileId = 'file_runtimefinalaaaaaaaaaaaa';
    const backendToolCall = {
      id: 'call_runtime_assets',
      name: 'External Runtime',
      status: 'success',
      type: 'tool',
      toolResult: {
        status: 'success',
        modelContent: 'Runtime internal model summary',
        display: { summary: 'Runtime 已生成文件。' },
        assets: [
          {
            fileId,
            role: 'final',
            displayName: 'report.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          },
          {
            fileId: 'file_runtimesourcebbbbbbbbbbbb',
            role: 'source',
            displayName: 'source.md',
            mimeType: 'text/markdown',
            size: 128,
          },
        ],
        trace: {
          diagnostics: {
            provider: 'external_runtime',
            runtimeTaskType: 'pdf_tools',
            runtimeOperation: 'render',
          },
        },
      },
    };

    const { frontendEvents } = await runLoop(async (_messages, options) => {
      options.currentMessage.content = 'Runtime 已生成文件。';
      options.currentMessage.rounds = [
        {
          text: 'Runtime 已生成文件。',
          thinking: null,
          completed: true,
          toolCalls: [backendToolCall],
        },
      ];
      options.onProgress?.({
        type: 'tool_result',
        data: { roundIndex: 0, toolCall: backendToolCall },
      });
      options.onProgress?.({ type: 'done', data: { finishReason: 'stop' } });
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'stop',
        tokenUsage: { totalInputTokens: 10, totalOutputTokens: 5, totalTokens: 15 },
        toolCost: 0,
      };
    });

    const toolEnd = frontendEvents.find(event => event.type === 'tool.end');
    expect(toolEnd.data.assets).toEqual([
      {
        fileId,
        role: 'final',
        displayName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
    ]);
    expect(JSON.stringify(toolEnd)).not.toContain('file_runtimesourcebbbbbbbbbbbb');
    expect(JSON.stringify(toolEnd)).not.toContain('modelContent');
  });

  it('maps Runtime ToolResult trace errors without exposing diagnostics', async () => {
    const backendToolCall = {
      id: 'call_runtime_error',
      name: 'External Runtime',
      status: 'error',
      type: 'tool',
      toolResult: {
        status: 'error',
        display: { summary: 'Runtime 执行失败。' },
        trace: {
          code: 'RUNTIME_FAILED',
          message: 'Runtime task failed safely.',
          retryable: true,
          diagnostics: {
            provider: 'external_runtime',
            runtimeLog: 'raw runtime log with Bearer LOG_SECRET',
            stdout: 'STDOUT_SECRET',
            stderr: 'STDERR_SECRET',
            stack: 'STACK_SECRET',
            rawPayload: { apiKey: 'SECRET_API_KEY' },
          },
        },
      },
    };

    const { frontendEvents } = await runLoop(async (_messages, options) => {
      options.currentMessage.content = 'Runtime 执行失败。';
      options.currentMessage.rounds = [
        {
          text: 'Runtime 执行失败。',
          thinking: null,
          completed: true,
          toolCalls: [backendToolCall],
        },
      ];
      options.onProgress?.({
        type: 'tool_result',
        data: { roundIndex: 0, toolCall: backendToolCall },
      });
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'stop',
        tokenUsage: { totalInputTokens: 10, totalOutputTokens: 5, totalTokens: 15 },
        toolCost: 0,
      };
    });

    const toolEnd = frontendEvents.find(event => event.type === 'tool.end');
    expect(toolEnd.data.error).toEqual({
      code: 'RUNTIME_FAILED',
      message: 'Runtime task failed safely.',
      retryable: true,
    });
    const serialized = JSON.stringify(toolEnd);
    expect(serialized).not.toContain('diagnostics');
    expect(serialized).not.toContain('runtimeLog');
    expect(serialized).not.toContain('STDOUT_SECRET');
    expect(serialized).not.toContain('STDERR_SECRET');
    expect(serialized).not.toContain('STACK_SECRET');
    expect(serialized).not.toContain('SECRET_API_KEY');
    expect(serialized).not.toContain('rawPayload');
  });

  it('keeps Runtime ToolResult through executor and backend events before live tool.end projection', async () => {
    const finalFileId = 'file_runtimefinalrealchain01';
    const sourceFileId = 'file_runtimesourcerealchain01';
    let streamCall = 0;
    const modelGateway = {
      stream: jest.fn(() => {
        streamCall += 1;
        if (streamCall === 1) {
          return createStream([
            {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_runtime_assets',
              nameDelta: 'runtime_success',
              argumentsDelta: '{"operation":"render"}',
            },
            {
              type: 'tool_call_delta',
              index: 1,
              id: 'call_runtime_error',
              nameDelta: 'runtime_error',
              argumentsDelta: '{"operation":"fail"}',
            },
            { type: 'done' },
          ]);
        }
        return createStream([
          { type: 'text_delta', delta: 'Runtime 处理完成。' },
          { type: 'done' },
        ]);
      }),
    };
    const registry = {
      getToolProviderInfo: jest.fn(() => ({
        metadata: {
          category: 'runtime',
          outputHint: { type: 'document' },
        },
      })),
      getDisplayName: jest.fn((toolName: string) =>
        toolName === 'runtime_success' ? 'Runtime Success' : 'Runtime Error',
      ),
      execute: jest.fn(async (toolName: string) => {
        if (toolName === 'runtime_success') {
          return {
            type: 'tool',
            name: 'External Runtime',
            status: 'success',
            output: {
              summary: 'legacy runtime output',
              stdout: 'STDOUT_SECRET',
              rawPayload: { apiKey: 'SECRET_API_KEY' },
            },
            internal: {
              diagnostics: {
                runtimeLog: 'raw runtime log with Bearer LOG_SECRET',
                stdout: 'STDOUT_SECRET',
                stderr: 'STDERR_SECRET',
                stack: 'STACK_SECRET',
                rawPayload: { apiKey: 'SECRET_API_KEY' },
              },
            },
            toolResult: {
              status: 'success',
              modelContent: 'Runtime internal model summary',
              display: { summary: 'Runtime 已生成文件。' },
              assets: [
                {
                  fileId: finalFileId,
                  role: 'final',
                  displayName: 'report.pdf',
                  mimeType: 'application/pdf',
                  size: 2048,
                },
                {
                  fileId: sourceFileId,
                  role: 'source',
                  displayName: 'source.md',
                  mimeType: 'text/markdown',
                  size: 128,
                },
              ],
              trace: {
                code: 'RUNTIME_COMPLETED',
                message: 'Runtime 能力执行完成',
                retryable: false,
                diagnostics: {
                  provider: 'external_runtime',
                  runtimeTaskType: 'pdf_tools',
                  runtimeOperation: 'render',
                },
              },
            },
          };
        }

        return {
          type: 'tool',
          name: 'External Runtime',
          status: 'error',
          output: {
            error: 'legacy runtime failed',
            runtimeLog: 'raw runtime log with Bearer LOG_SECRET',
            stdout: 'STDOUT_SECRET',
            stderr: 'STDERR_SECRET',
            stack: 'STACK_SECRET',
            rawPayload: { apiKey: 'SECRET_API_KEY' },
          },
          internal: {
            diagnostics: {
              runtimeLog: 'raw runtime log with Bearer LOG_SECRET',
              stdout: 'STDOUT_SECRET',
              stderr: 'STDERR_SECRET',
              stack: 'STACK_SECRET',
              rawPayload: { apiKey: 'SECRET_API_KEY' },
            },
          },
          toolResult: {
            status: 'error',
            modelContent: 'Runtime failed safely for model.',
            display: { summary: 'Runtime 执行失败。' },
            trace: {
              code: 'RUNTIME_FAILED',
              message: 'Runtime task failed safely.',
              retryable: true,
              diagnostics: {
                provider: 'external_runtime',
                runtimeTaskType: 'pdf_tools',
                runtimeOperation: 'render',
              },
            },
          },
        };
      }),
    };

    const { result, frontendEvents } = await runLoop(async (messages, options) => {
      const toolContext = {
        input: {
          messages,
          config: {},
          context: { options },
        },
      } as any;
      let platformAdapter!: AgentRuntimePlatformAdapter;
      const toolExecutor = new AgentToolExecutor({
        toolProviderRegistry: registry,
        withToolTrace: result => ({
          ...result,
          internal: {
            ...(result.internal || {}),
            trace: {
              callId: result.id,
              toolName: result.toolName || result.name,
              status: result.status === 'error' ? 'error' : 'success',
            },
          },
        }),
        onStart: start => platformAdapter.startExternal(start),
      });
      platformAdapter = new AgentRuntimePlatformAdapter({
        model: 'gpt-test',
        modelConfig: {
          protocol: 'openai_chat_completions',
          model: 'gpt-test',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.com/v1',
        } as any,
        options,
        currentMessage: options.currentMessage,
        toolContext,
        sanitizedNameMap: new Map([
          ['runtime_success', 'runtime_success'],
          ['runtime_error', 'runtime_error'],
        ]),
        modelGateway: modelGateway as any,
        toolExecutor,
        prepareMedia: async runtimeMessages => runtimeMessages,
        createRoundTrace: roundIndex => traceAdapter.createRoundTrace(roundIndex),
        summarizeModelOutput: traceAdapter.summarizeModelOutput,
      });
      const runtime = new AgentRuntimeCore(platformAdapter.ports);
      const runtimeResult = await runtime.run({
        model: 'gpt-test',
        messages,
        tools: [
          {
            type: 'function',
            function: {
              name: 'runtime_success',
              description: 'Runtime success',
              parameters: { type: 'object', properties: {} },
            },
          },
          {
            type: 'function',
            function: {
              name: 'runtime_error',
              description: 'Runtime error',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        maxRounds: 3,
      });
      return {
        ...runtimeResult,
        message: options.currentMessage,
        tokenUsage: options.tokenUsage,
        toolCost: options.toolCost,
      };
    });

    const backendToolCalls = result.currentMessage.rounds[0].toolCalls as any[];
    expect(backendToolCalls[0].toolResult.assets).toEqual([
      {
        fileId: finalFileId,
        role: 'final',
        displayName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
      {
        fileId: sourceFileId,
        role: 'source',
        displayName: 'source.md',
        mimeType: 'text/markdown',
        size: 128,
      },
    ]);
    expect(backendToolCalls[1].toolResult.trace).toMatchObject({
      code: 'RUNTIME_FAILED',
      message: 'Runtime task failed safely.',
      retryable: true,
    });

    const toolEnds = frontendEvents.filter(event => event.type === 'tool.end');
    const successToolEnd = toolEnds.find(event => event.toolCallId === 'call_runtime_assets');
    const errorToolEnd = toolEnds.find(event => event.toolCallId === 'call_runtime_error');

    expect(successToolEnd?.data.assets).toEqual([
      {
        fileId: finalFileId,
        role: 'final',
        displayName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
    ]);
    expect(errorToolEnd?.data.error).toEqual({
      code: 'RUNTIME_FAILED',
      message: 'Runtime task failed safely.',
      retryable: true,
    });
    expect(JSON.stringify(successToolEnd)).not.toContain(sourceFileId);
    const serializedPublicEvents = JSON.stringify(frontendEvents);
    expect(serializedPublicEvents).not.toContain('diagnostics');
    expect(serializedPublicEvents).not.toContain('runtimeLog');
    expect(serializedPublicEvents).not.toContain('STDOUT_SECRET');
    expect(serializedPublicEvents).not.toContain('STDERR_SECRET');
    expect(serializedPublicEvents).not.toContain('STACK_SECRET');
    expect(serializedPublicEvents).not.toContain('SECRET_API_KEY');
    expect(serializedPublicEvents).not.toContain('rawPayload');
    expect(serializedPublicEvents).not.toContain('modelContent');
  });

  it('keeps process notes out of the reply, presents the chosen file and ends the run on a question', async () => {
    const fileId = 'file_cleancsvdeliverable01';
    const store = new FileRefMappingStore();
    store.registerFile('file_processscriptdelivery1', { refKind: 'output_file', name: 'clean.py' });
    store.registerFile(fileId, { refKind: 'output_file', name: 'clean.csv', mime: 'text/csv' });
    const conversation = new ConversationToolProvider();
    let streamCall = 0;
    const modelGateway = {
      stream: jest.fn(() => {
        streamCall += 1;
        if (streamCall === 1) {
          return createStream([
            { type: 'text_delta', delta: '我先清洗一下数据。' },
            {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_bash',
              nameDelta: 'bash',
              argumentsDelta: '{"command":"python clean.py"}',
            },
            { type: 'done' },
          ]);
        }
        return createStream([
          { type: 'text_delta', delta: '数据已清洗，三行都有效。' },
          {
            type: 'tool_call_delta',
            index: 0,
            id: 'call_present',
            nameDelta: 'present_files',
            argumentsDelta: '{"files":[{"file":"clean.csv","caption":"清洗后的数据"}]}',
          },
          {
            type: 'tool_call_delta',
            index: 1,
            id: 'call_ask',
            nameDelta: 'ask_user',
            argumentsDelta: '{"question":"要继续画图吗？","options":["要","不要"]}',
          },
          { type: 'done' },
        ]);
      }),
    };
    const registry = {
      getToolProviderInfo: jest.fn(() => ({ metadata: { category: 'productivity' } })),
      getDisplayName: jest.fn((toolName: string) => toolName),
      execute: jest.fn(async (toolName: string, args: any, context: any) => {
        if (isConversationToolName(toolName)) return conversation.execute(toolName, args, context);
        return createLayeredToolResult({
          id: context.toolCallId,
          type: 'tool',
          toolName,
          name: toolName,
          status: 'success',
          rawOutput: { content: '[exit 0] 已清洗' },
        });
      }),
    };

    const { result, frontendEvents } = await runLoop(async (messages, options) => {
      const toolContext = {
        input: { messages, config: {}, context: { options } },
        fileRefMappingStore: store,
      } as any;
      let platformAdapter!: AgentRuntimePlatformAdapter;
      const toolExecutor = new AgentToolExecutor({
        toolProviderRegistry: registry,
        withToolTrace: toolResult => toolResult,
        onStart: start => platformAdapter.startExternal(start),
      });
      platformAdapter = new AgentRuntimePlatformAdapter({
        model: 'gpt-test',
        modelConfig: {
          protocol: 'openai_chat_completions',
          model: 'gpt-test',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.com/v1',
        } as any,
        options,
        currentMessage: options.currentMessage,
        toolContext,
        sanitizedNameMap: new Map(
          ['bash', 'present_files', 'ask_user'].map(name => [name, name] as [string, string]),
        ),
        modelGateway: modelGateway as any,
        toolExecutor,
        prepareMedia: async runtimeMessages => runtimeMessages,
        createRoundTrace: roundIndex => traceAdapter.createRoundTrace(roundIndex),
        summarizeModelOutput: traceAdapter.summarizeModelOutput,
      });
      const runtimeResult = await new AgentRuntimeCore(platformAdapter.ports).run({
        model: 'gpt-test',
        messages,
        tools: ['bash', 'present_files', 'ask_user'].map(name => ({
          type: 'function' as const,
          function: { name, description: name, parameters: { type: 'object', properties: {} } },
        })),
        maxRounds: 5,
      });
      return {
        ...runtimeResult,
        message: options.currentMessage,
        tokenUsage: options.tokenUsage,
        toolCost: options.toolCost,
      };
    });

    // 提问结束本轮：第二轮之后不再调用模型
    expect(modelGateway.stream).toHaveBeenCalledTimes(2);
    expect(result.finishReason).toBe('stop');
    expect(result.content).toBe('数据已清洗，三行都有效。\n\n要继续画图吗？\n1. 要\n2. 不要');
    expect(result.generatedText).toBe('数据已清洗，三行都有效。');
    expect(result.currentMessage.rounds.map((round: any) => round.phase)).toEqual([
      'process',
      undefined,
    ]);
    expect(
      frontendEvents
        .filter(event => event.type === 'message.phase')
        .map(event => [event.roundId, event.data.phase]),
    ).toEqual([['0', 'process']]);
    const presentEnd = frontendEvents.find(
      event => event.type === 'tool.end' && event.toolCallId === 'call_present',
    );
    expect(presentEnd.data.type).toBe('presentation');
    expect(presentEnd.data.display.json.presentation).toEqual([
      { fileId, caption: '清洗后的数据' },
    ]);
    expect(presentEnd.data.assets.map((asset: any) => asset.fileId)).toEqual([fileId]);
    const askEnd = frontendEvents.find(
      event => event.type === 'tool.end' && event.toolCallId === 'call_ask',
    );
    expect(askEnd.data.type).toBe('question');
    expect(askEnd.data.display.json.question).toEqual({
      text: '要继续画图吗？',
      options: ['要', '不要'],
    });
  });
});
