import { Logger } from '@nestjs/common';
import {
  ToolOutcomeUnknownError,
  type ToolExecutionContext,
  type ToolProvider,
} from '../tool-provider.interface';
import { ToolProviderRegistry } from './tool-provider.registry';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ToolProviderRegistry exception boundary', () => {
  it('defaults missing, throwing, and unknown replay declarations to never', () => {
    const registry = new ToolProviderRegistry();
    registry.register(
      {
        canHandle: name => name === 'mcp__remote',
        getToolDefinitions: async () => [],
        execute: async () => undefined as any,
      },
      { category: 'productivity', displayName: 'mcp', description: 'fixture' },
    );
    registry.register(
      {
        canHandle: name => name === 'throws',
        getToolDefinitions: async () => [],
        execute: async () => undefined as any,
        getReplayIntent: () => {
          throw new Error('policy unavailable');
        },
      },
      { category: 'productivity', displayName: 'throws', description: 'fixture' },
    );
    expect(registry.getReplayIntent('mcp__remote', {})).toEqual({ policy: 'never' });
    expect(registry.getReplayIntent('throws', {})).toEqual({ policy: 'never' });
    expect(registry.getReplayIntent('unknown', {})).toEqual({ policy: 'never' });
  });

  it('keeps arbitrary provider failures out of tool results and all lifecycle logs', async () => {
    const privateDetail = 'synthetic confidential database storage diagnostic';
    const failure = async () => {
      throw new Error(privateDetail);
    };
    const logs = [
      jest.spyOn(Logger, 'log').mockImplementation((): void => undefined),
      jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined),
      jest.spyOn(Logger, 'error').mockImplementation((): void => undefined),
    ];
    try {
      const provider: ToolProvider = {
        canHandle: () => true,
        getToolDefinitions: failure,
        execute: failure,
        prepareTurn: failure,
        describeForSystemPrompt: failure,
        getToolCost: failure,
      };
      const registry = new ToolProviderRegistry();
      registry.register(provider, {
        category: 'productivity',
        displayName: 'fixture',
        description: 'fixture',
      });
      const context: ToolExecutionContext = { input: { messages: [], config: {}, context: {} } };
      await registry.prepareTurn(context);
      expect(await registry.collectSystemPromptSections(context)).toEqual([]);
      expect(await registry.getAllToolDefinitions(context)).toEqual([]);
      expect(await registry.getToolCost('fixture', {})).toBe(0);
      let caught: unknown;
      try {
        await registry.execute('fixture', {}, context);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ToolOutcomeUnknownError);
      expect((caught as Error).message).toContain('结果不确定');
      expect((caught as Error).message).not.toContain(privateDetail);
      expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain(privateDetail);
    } finally {
      logs.forEach(log => log.mockRestore());
    }
  });

  it.each([
    ['aborted', true],
    ['not aborted', false],
  ])(
    'logs an unknown outcome as a warning only when the run was %s',
    async (_label: string, aborted: boolean) => {
      const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
      const error = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
      try {
        const registry = new ToolProviderRegistry();
        registry.register(
          {
            canHandle: () => true,
            getToolDefinitions: async () => [],
            execute: async () => {
              throw new Error('interrupted');
            },
          },
          { category: 'productivity', displayName: 'fixture', description: 'fixture' },
        );
        const controller = new AbortController();
        if (aborted) controller.abort();
        await expect(
          registry.execute('any', {}, { signal: controller.signal } as ToolExecutionContext),
        ).rejects.toBeInstanceOf(ToolOutcomeUnknownError);
        expect(warn.mock.calls).toEqual(
          aborted ? [['工具执行被中止，结果未确认', 'ToolProviderRegistry']] : [],
        );
        expect(error.mock.calls).toEqual(
          aborted ? [] : [['工具执行结果不确定', undefined, 'ToolProviderRegistry']],
        );
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }
    },
  );
});
