import { Logger } from '@nestjs/common';
import { AgentToolExecutor } from './agent-tool-executor.adapter';
import { createLayeredToolResult, getToolModelContent } from '../../chatLog/tool-result-payload';
import { buildToolInputShape, normalizeToolIntent } from '../runtime-state/operation-ledger.types';
import { ToolOutcomeUnknownError } from '../tools/tool-provider.interface';
import { ToolProviderRegistry } from '../tools/provider-registry/tool-provider.registry';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AgentToolExecutor private run context', () => {
  it('persists a validated tool intent before execute and the outcome before returning', async () => {
    const order: string[] = [];
    const execute = jest.fn(async () => {
      order.push('provider');
      return { status: 'success', type: 'tool', name: 'List', output: { content: 'ok' } };
    });
    const operationSession = {
      beginToolEffect: jest.fn(async () => {
        order.push('intent');
        return { action: 'execute', effectKey: 'tool:r0:o0' };
      }),
      commitToolEffect: jest.fn(async () => {
        order.push('outcome');
      }),
      markToolEffectUnknown: jest.fn(),
    };
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('List'),
        getReplayIntent: jest.fn().mockReturnValue({
          policy: 'safe',
          payload: { path: '', recursive: false },
        }),
      },
    });
    const results = await executor.executeToolCalls({
      toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'ls', arguments: '{}' } }],
      toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
      sanitizedNameMap: new Map([['ls', 'ls']]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
      operationSession: operationSession as any,
    });

    expect(order).toEqual(['intent', 'provider', 'outcome']);
    expect(results[0].status).toBe('success');
    expect(operationSession.beginToolEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'call_1',
        toolName: 'ls',
        replayPolicy: 'safe',
        replayPayload: { path: '', recursive: false },
        inputShape: { path: 'string', recursive: 'boolean' },
      }),
    );
  });

  it.each([
    ['{}', { path: '', recursive: false }],
    ['{"path":"."}', { path: '.', recursive: false }],
    ['{"recursive":true}', { path: '', recursive: true }],
  ])(
    'binds safe replay shape to the canonical payload for %s',
    async (argumentsJson: string, payload: { path: string; recursive: boolean }) => {
      const operationSession = {
        beginToolEffect: jest
          .fn()
          .mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
        commitToolEffect: jest.fn().mockResolvedValue(undefined),
      };
      const executor = new AgentToolExecutor({
        toolProviderRegistry: {
          execute: jest.fn().mockResolvedValue({
            status: 'success',
            type: 'tool',
            name: 'List',
            output: { content: 'ok' },
          }),
          getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
          getDisplayName: jest.fn().mockReturnValue('List'),
          getReplayIntent: jest.fn().mockReturnValue({ policy: 'safe', payload }),
        },
      });

      await executor.executeToolCalls({
        toolCalls: [
          {
            id: 'call_defaults',
            type: 'function',
            function: { name: 'ls', arguments: argumentsJson },
          },
        ],
        toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
        sanitizedNameMap: new Map([['ls', 'ls']]),
        options: { toolCost: 0 },
        currentRoundIndex: 0,
        operationSession: operationSession as any,
      });

      expect(operationSession.beginToolEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          replayPolicy: 'safe',
          replayPayload: payload,
          inputShape: { path: 'string', recursive: 'boolean' },
        }),
      );
      const admitted = normalizeToolIntent(operationSession.beginToolEffect.mock.calls[0][0]);
      const storedPayload = JSON.parse(admitted.serializedPayload!);
      const recovered = normalizeToolIntent({
        ...operationSession.beginToolEffect.mock.calls[0][0],
        replayPayload: storedPayload,
        inputShape: buildToolInputShape(storedPayload),
      });
      expect(recovered.fingerprint).toBe(admitted.fingerprint);
      expect(recovered.serializedPayload).toBe(admitted.serializedPayload);
    },
  );

  it('reuses a committed tool outcome without invoking the provider', async () => {
    const execute = jest.fn();
    const onTerminal = jest.fn();
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({
        action: 'reuse',
        effectKey: 'tool:r0:o0',
        outcome: {
          callId: 'call_reuse',
          toolName: 'ls',
          displayName: 'List',
          status: 'success',
          modelContent: 'cached result',
          toolCost: 2,
        },
      }),
    };
    const options = { toolCost: 1 };
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('List'),
        getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      },
      onTerminal,
    });
    const results = await executor.executeToolCalls({
      toolCalls: [
        { id: 'call_reuse', type: 'function', function: { name: 'ls', arguments: '{}' } },
      ],
      toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
      sanitizedNameMap: new Map([['ls', 'ls']]),
      options,
      currentRoundIndex: 0,
      operationSession: operationSession as any,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(options.toolCost).toBe(3);
    expect(JSON.stringify(results[0])).toContain('cached result');
  });

  it('marks an ambiguous tool call unknown instead of returning a fabricated result', async () => {
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      commitToolEffect: jest.fn(),
      markToolEffectUnknown: jest.fn().mockResolvedValue(undefined),
    };
    const execute = jest.fn().mockRejectedValue(new Error('supplier disappeared'));
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('Image'),
        getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      },
    });
    await expect(
      executor.executeToolCalls({
        toolCalls: [
          {
            id: 'call_unknown',
            type: 'function',
            function: { name: 'image', arguments: '{}' },
          },
        ],
        toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
        sanitizedNameMap: new Map([['image', 'image']]),
        options: { toolCost: 0 },
        currentRoundIndex: 0,
        operationSession: operationSession as any,
      }),
    ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });

  it('settles an onStart failure as interrupted before the provider is dispatched', async () => {
    const privateDetail = 'synthetic projection diagnostic';
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      commitToolEffect: jest.fn(),
      markToolEffectInterrupted: jest.fn().mockResolvedValue(undefined),
      markToolEffectUnknown: jest.fn(),
    };
    const execute = jest.fn();
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('List'),
        getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      },
      onStart: () => {
        throw new Error(privateDetail);
      },
    });

    const [result] = await executor.executeToolCalls({
      toolCalls: [
        { id: 'call_start', type: 'function', function: { name: 'ls', arguments: '{}' } },
      ],
      toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
      sanitizedNameMap: new Map([['ls', 'ls']]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
      operationSession: operationSession as any,
    });

    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(execute).not.toHaveBeenCalled();
    expect(operationSession.markToolEffectInterrupted).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.markToolEffectUnknown).not.toHaveBeenCalled();
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });

  it('settles an abort after intent as interrupted without dispatching the provider', async () => {
    const controller = new AbortController();
    const operationSession = {
      beginToolEffect: jest.fn(async () => {
        controller.abort(new Error('stop before provider dispatch'));
        return { action: 'execute', effectKey: 'tool:r0:o0' };
      }),
      commitToolEffect: jest.fn(),
      markToolEffectInterrupted: jest.fn().mockResolvedValue(undefined),
      markToolEffectUnknown: jest.fn(),
    };
    const execute = jest.fn();
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('List'),
        getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      },
    });

    await expect(
      executor.executeToolCalls({
        toolCalls: [
          { id: 'call_abort', type: 'function', function: { name: 'ls', arguments: '{}' } },
        ],
        toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
        sanitizedNameMap: new Map([['ls', 'ls']]),
        options: { toolCost: 0 },
        currentRoundIndex: 0,
        signal: controller.signal,
        operationSession: operationSession as any,
      }),
    ).rejects.toThrow('stop before provider dispatch');
    expect(execute).not.toHaveBeenCalled();
    expect(operationSession.markToolEffectInterrupted).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.markToolEffectUnknown).not.toHaveBeenCalled();
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });

  it('keeps the runtime unknown signal fixed when persisting unknown fails', async () => {
    const privateDetail = 'synthetic persistence diagnostic';
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      commitToolEffect: jest.fn(),
      markToolEffectUnknown: jest.fn().mockRejectedValue(new Error(privateDetail)),
    };
    const execute = jest.fn().mockRejectedValue(new ToolOutcomeUnknownError());
    const errorLog = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('Remote mutation'),
        getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      },
    });

    let caught: unknown;
    try {
      await executor.executeToolCalls({
        toolCalls: [
          {
            id: 'call_mark_failure',
            type: 'function',
            function: { name: 'remote_mutation', arguments: '{}' },
          },
        ],
        toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
        sanitizedNameMap: new Map([['remote_mutation', 'remote_mutation']]),
        options: { toolCost: 0 },
        currentRoundIndex: 0,
        operationSession: operationSession as any,
      });
    } catch (error) {
      caught = error;
    } finally {
      const logged = JSON.stringify(errorLog.mock.calls);
      errorLog.mockRestore();
      expect(logged).not.toContain(privateDetail);
    }

    expect(caught).toBeInstanceOf(ToolOutcomeUnknownError);
    expect((caught as Error).message).not.toContain(privateDetail);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });

  it('propagates a real Registry rejection as unknown and stops the remaining tool batch', async () => {
    const privateDetail = 'synthetic private provider diagnostic';
    const providerExecute = jest.fn().mockRejectedValue(new Error(privateDetail));
    const registry = new ToolProviderRegistry();
    const logs = [
      jest.spyOn(Logger, 'log').mockImplementation((): void => undefined),
      jest.spyOn(Logger, 'error').mockImplementation((): void => undefined),
    ];
    registry.register(
      {
        canHandle: toolName => toolName === 'mcp__fixture__mutate',
        getToolDefinitions: async () => [],
        execute: providerExecute,
      },
      { category: 'productivity', displayName: 'fixture', description: 'fixture' },
    );
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      commitToolEffect: jest.fn(),
      markToolEffectUnknown: jest.fn().mockResolvedValue(undefined),
    };
    const executor = new AgentToolExecutor({ toolProviderRegistry: registry });
    let caught: unknown;
    let logged = '';
    try {
      await executor.executeToolCalls({
        toolCalls: [
          {
            id: 'call_unknown_1',
            type: 'function',
            function: { name: 'mcp__fixture__mutate', arguments: '{}' },
          },
          {
            id: 'call_must_not_run',
            type: 'function',
            function: { name: 'mcp__fixture__mutate', arguments: '{}' },
          },
        ],
        toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
        sanitizedNameMap: new Map([['mcp__fixture__mutate', 'mcp__fixture__mutate']]),
        options: { toolCost: 0 },
        currentRoundIndex: 0,
        operationSession: operationSession as any,
      });
    } catch (error) {
      caught = error;
    } finally {
      logged = JSON.stringify(logs.flatMap(log => log.mock.calls));
      logs.forEach(log => log.mockRestore());
    }

    expect(caught).toBeInstanceOf(ToolOutcomeUnknownError);
    expect((caught as Error).message).not.toContain(privateDetail);
    expect(providerExecute).toHaveBeenCalledTimes(1);
    expect(operationSession.beginToolEffect).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
    expect(logged).not.toContain(privateDetail);
  });

  it('commits an explicit provider error instead of widening it to unknown', async () => {
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      commitToolEffect: jest.fn().mockResolvedValue(undefined),
      markToolEffectUnknown: jest.fn(),
    };
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute: jest.fn().mockResolvedValue({
          id: 'call_declared_error',
          status: 'error',
          type: 'tool',
          name: 'Remote mutation',
          output: { error: 'Server rejected the request' },
        }),
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('Remote mutation'),
        getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      },
    });

    const [result] = await executor.executeToolCalls({
      toolCalls: [
        {
          id: 'call_declared_error',
          type: 'function',
          function: { name: 'remote_mutation', arguments: '{}' },
        },
      ],
      toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
      sanitizedNameMap: new Map([['remote_mutation', 'remote_mutation']]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
      operationSession: operationSession as any,
    });

    expect(result.status).toBe('error');
    expect(operationSession.commitToolEffect).toHaveBeenCalledWith(
      'tool:r0:o0',
      expect.objectContaining({ status: 'error', toolCost: 0 }),
    );
    expect(operationSession.markToolEffectUnknown).not.toHaveBeenCalled();
  });

  it('passes caller AbortSignal only through the Platform tool context', async () => {
    const controller = new AbortController();
    const execute = jest.fn().mockResolvedValue({
      status: 'success',
      type: 'tool',
      name: 'Synthetic',
      output: { content: 'ok' },
      time: 1,
    });
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue(undefined),
        getDisplayName: jest.fn().mockReturnValue('Synthetic'),
      },
    });
    await executor.executeToolCalls({
      toolCalls: [
        {
          id: 'tool_call_signal_1',
          type: 'function',
          function: { name: 'synthetic', arguments: '{"value":1}' },
        },
      ],
      toolContext: { input: { messages: [], config: {}, context: {} } },
      sanitizedNameMap: new Map([
        ['synthetic', 'synthetic'],
        ['demo', 'demo'],
        ['first_tool', 'first_tool'],
        ['second_tool', 'second_tool'],
        ['private_file_tool', 'private_file_tool'],
        ['gpt_image', 'gpt_image'],
      ]),
      options: {},
      currentRoundIndex: 0,
      signal: controller.signal,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const [, args, context] = execute.mock.calls[0];
    expect(args).toEqual({ value: 1 });
    expect(context.signal).toBe(controller.signal);
    expect(JSON.stringify(args)).not.toContain('signal');
  });

  it.each([['read'], ['lookup']])(
    'keeps verbatim text through the executor only for primitive tools (%s)',
    async (toolName: string) => {
      // 默认净化会删掉 stack: 之后的内容、去掉标签：用来区分是否按原文规范化
      const authoritative =
        '  if (a < b) {}\nstack: Error: boom\n    at main (app.js:1:1)\n<div>kept</div>';
      const executor = new AgentToolExecutor({
        toolProviderRegistry: {
          execute: jest.fn().mockResolvedValue(
            createLayeredToolResult({
              id: 'call_text',
              type: 'tool',
              toolName,
              name: toolName,
              status: 'success',
              rawOutput: { content: authoritative },
              toolResult: { status: 'success', modelContent: authoritative },
              modelText: 'faithful',
            }),
          ),
          getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
          getDisplayName: jest.fn().mockReturnValue(toolName),
        },
      });
      const [result] = await executor.executeToolCalls({
        toolCalls: [
          { id: 'call_text', type: 'function', function: { name: toolName, arguments: '{}' } },
        ],
        toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
        sanitizedNameMap: new Map([[toolName, toolName]]),
        options: { toolCost: 0 },
        currentRoundIndex: 0,
      });
      const text = getToolModelContent(result);
      if (toolName === 'read') expect(text).toBe(authoritative);
      else expect(text).not.toContain('stack: Error');
    },
  );

  it('preserves host-issued tool identity and leaves the caller context unchanged', async () => {
    const execute = jest.fn().mockResolvedValue({
      status: 'success',
      type: 'tool',
      name: 'demo',
      output: { ok: true },
    });
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('Demo'),
      },
    });
    const originalToolContext = {
      input: {
        messages: [],
        config: {},
        context: { options: { userId: 7, turnId: 'turn_1' } },
      },
    } as any;

    await executor.executeToolCalls({
      toolCalls: [
        {
          id: 'tool_call_1',
          type: 'function',
          function: { name: 'demo', arguments: '{}' },
        },
      ],
      toolContext: originalToolContext,
      sanitizedNameMap: new Map([
        ['synthetic', 'synthetic'],
        ['demo', 'demo'],
        ['first_tool', 'first_tool'],
        ['second_tool', 'second_tool'],
        ['private_file_tool', 'private_file_tool'],
        ['gpt_image', 'gpt_image'],
      ]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
    });

    const internalContext = execute.mock.calls[0][2];
    expect(internalContext.toolCallId).toBe('tool_call_1');
    expect(internalContext.input.context.options).toEqual({ userId: 7, turnId: 'turn_1' });
    expect(originalToolContext.input.context.options).toEqual({ userId: 7, turnId: 'turn_1' });
  });

  it('preserves the Service-issued opaque run scope by reference and keeps it out of output', async () => {
    const runScope = Object.freeze({});
    const execute = jest.fn().mockResolvedValue({
      status: 'success',
      type: 'tool',
      name: 'demo',
      output: { ok: true },
    });
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('Demo'),
      },
    });

    const result = await executor.executeToolCalls({
      toolCalls: [
        {
          id: 'tool_call_private',
          type: 'function',
          function: { name: 'demo', arguments: '{}' },
        },
      ],
      toolContext: {
        input: {
          messages: [],
          config: {},
          context: { options: { runScope } },
        },
      } as any,
      sanitizedNameMap: new Map([
        ['synthetic', 'synthetic'],
        ['demo', 'demo'],
        ['first_tool', 'first_tool'],
        ['second_tool', 'second_tool'],
        ['private_file_tool', 'private_file_tool'],
        ['gpt_image', 'gpt_image'],
      ]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
    });

    expect(execute.mock.calls[0][2].input.context.options.runScope).toBe(runScope);
    expect(execute.mock.calls[0][2].toolCallId).toBe('tool_call_private');
    expect(JSON.stringify(result)).not.toContain('runScope');
  });

  it('starts each tool only after its predecessor completes', async () => {
    const releases = new Map<string, (value: any) => void>();
    const resolved: string[] = [];
    const execute = jest.fn(
      (toolName: string) =>
        new Promise(resolve => {
          releases.set(toolName, value => {
            resolved.push(toolName);
            resolve(value);
          });
        }),
    );
    const starts: any[] = [];
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn((name: string) => name),
      },
      onStart: input => starts.push(input),
    });
    const pending = executor.executeToolCalls({
      toolCalls: [
        { id: 'first', type: 'function', function: { name: 'first_tool', arguments: '{}' } },
        { id: 'second', type: 'function', function: { name: 'second_tool', arguments: '{}' } },
      ],
      toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
      sanitizedNameMap: new Map([
        ['synthetic', 'synthetic'],
        ['demo', 'demo'],
        ['first_tool', 'first_tool'],
        ['second_tool', 'second_tool'],
        ['private_file_tool', 'private_file_tool'],
        ['gpt_image', 'gpt_image'],
      ]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
    });
    await Promise.resolve();
    expect(releases.has('second_tool')).toBe(false);
    releases.get('first_tool')!({ status: 'success', type: 'tool', name: 'first', output: {} });
    await new Promise(resolve => setImmediate(resolve));
    releases.get('second_tool')!({ status: 'success', type: 'tool', name: 'second', output: {} });
    const results = await pending;

    expect(resolved).toEqual(['first_tool', 'second_tool']);
    expect(starts.map(start => start.callId)).toEqual(['first', 'second']);
    expect(results.map(result => result.id)).toEqual(['first', 'second']);
  });

  it('registers invalid JSON as terminal without Registry, identity, or cost side effects', async () => {
    const execute = jest.fn();
    const getToolProviderInfo = jest.fn();
    const getDisplayName = jest.fn();
    const resolveToolCost = jest.fn();
    const onStart = jest.fn();
    const onTerminal = jest.fn();
    const options = { toolCost: 0 };
    const executor = new AgentToolExecutor({
      toolProviderRegistry: { execute, getToolProviderInfo, getDisplayName },
      resolveToolCost,
      onStart,
      onTerminal,
    });

    const results = await executor.executeToolCalls({
      toolCalls: [
        {
          id: 'invalid_json',
          type: 'function',
          function: { name: 'private_file_tool', arguments: '{"broken":' },
        },
      ],
      toolContext: {
        input: {
          messages: [],
          config: {},
          context: { options: { userId: 7, runScope: Object.freeze({}) } },
        },
      } as any,
      sanitizedNameMap: new Map([
        ['synthetic', 'synthetic'],
        ['demo', 'demo'],
        ['first_tool', 'first_tool'],
        ['second_tool', 'second_tool'],
        ['private_file_tool', 'private_file_tool'],
        ['gpt_image', 'gpt_image'],
      ]),
      options,
      currentRoundIndex: 2,
    });

    expect(onStart).not.toHaveBeenCalled();
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith({
      callId: 'invalid_json',
      ordinal: 0,
      roundIndex: 2,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(getToolProviderInfo).not.toHaveBeenCalled();
    expect(getDisplayName).not.toHaveBeenCalled();
    expect(resolveToolCost).not.toHaveBeenCalled();
    expect(options.toolCost).toBe(0);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('error');
    expect(JSON.stringify(results[0])).toContain('工具参数解析失败');
  });

  it('cancels an unsettled supplier once with no success result or cost commit', async () => {
    const controller = new AbortController();
    const execute = jest.fn(
      (_toolName: string, _args: unknown, executionContext: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          executionContext.signal?.addEventListener(
            'abort',
            () => reject(executionContext.signal?.reason),
            { once: true },
          );
        }),
    );
    const options = { toolCost: 0 };
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn().mockReturnValue('Synthetic supplier'),
      },
      resolveToolCost: jest.fn().mockResolvedValue(7),
    });
    const pending = executor.executeToolCalls({
      toolCalls: [
        {
          id: 'tool_call_cancel_1',
          type: 'function',
          function: { name: 'gpt_image', arguments: '{"prompt":"synthetic"}' },
        },
      ],
      toolContext: { input: { messages: [], config: {}, context: {} } },
      sanitizedNameMap: new Map([
        ['synthetic', 'synthetic'],
        ['demo', 'demo'],
        ['first_tool', 'first_tool'],
        ['second_tool', 'second_tool'],
        ['private_file_tool', 'private_file_tool'],
        ['gpt_image', 'gpt_image'],
      ]),
      options,
      currentRoundIndex: 0,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort(new Error('synthetic caller cancellation'));

    await expect(pending).rejects.toThrow('synthetic caller cancellation');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][2].signal).toBe(controller.signal);
    expect(options.toolCost).toBe(0);
  });
  it('rejects raw tool names absent from the discovered capability set', async () => {
    const execute = jest.fn();
    const executor = new AgentToolExecutor({
      toolProviderRegistry: { execute, getToolProviderInfo: jest.fn(), getDisplayName: jest.fn() },
    });
    const result = await executor.executeToolCalls({
      toolCalls: [
        { id: 'unlisted', type: 'function', function: { name: 'write', arguments: '{}' } },
      ],
      toolContext: { input: { messages: [], config: {}, context: {} } },
      sanitizedNameMap: new Map(),
      options: {},
      currentRoundIndex: 0,
    });
    expect(result[0].status).toBe('error');
    expect(execute).not.toHaveBeenCalled();
  });

  it('only lets conversation tools return presentation or question results', async () => {
    const execute = jest.fn(async (toolName: string) => ({
      status: 'success',
      type: toolName === 'rogue' ? 'question' : 'presentation',
      name: toolName,
      output: { content: 'ok' },
    }));
    const executor = new AgentToolExecutor({
      toolProviderRegistry: {
        execute,
        getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
        getDisplayName: jest.fn((toolName: string) => toolName),
      },
    });
    const results = await executor.executeToolCalls({
      toolCalls: [
        { id: 'call_rogue', type: 'function', function: { name: 'rogue', arguments: '{}' } },
        {
          id: 'call_present',
          type: 'function',
          function: { name: 'present_files', arguments: '{"files":[]}' },
        },
      ],
      toolContext: { input: { messages: [], config: {}, context: { options: {} } } } as any,
      sanitizedNameMap: new Map([
        ['rogue', 'rogue'],
        ['present_files', 'present_files'],
      ]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
    });
    expect(results.map(result => result.type)).toEqual(['tool', 'presentation']);
  });
});
