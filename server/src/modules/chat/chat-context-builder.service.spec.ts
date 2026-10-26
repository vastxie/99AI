import { ChatContextBuilderService } from './chat-context-builder.service';
import { AgentContextBuilder } from '../agent/context/agent-context-builder';
import { ContextCheckpointCoordinator } from '../agent/context/context-checkpoint-coordinator';
import { ModelMessageMapper } from '../agent/context/model-message-mapper';
import { ChatLogService } from '../chatLog/chatLog.service';
import type { SaveContextCheckpointInput } from '../contextCheckpoint/context-checkpoint.store';
import type { ModelGatewayRequest } from '../modelGateway/model-gateway.types';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatContextBuilderService source boundaries', () => {
  it('keeps owner-scoped chatlog IDs as internal-only projection metadata', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(17),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(4),
      collectContextBackfillPage: jest.fn(),
      collectRoundsForGroup: jest.fn().mockResolvedValue([
        {
          id: 10,
          role: 'user',
          content: 'old',
          message: '',
          createdAt: new Date('2026-09-09T00:00:00.000Z'),
          hasToolCalls: false,
        },
        {
          id: 11,
          role: 'assistant',
          content: 'answer',
          message: JSON.stringify({
            role: 'assistant',
            rounds: [{ text: 'answer', toolCalls: [] }],
          }),
          createdAt: new Date('2026-09-09T00:00:01.000Z'),
          hasToolCalls: false,
        },
        {
          id: 12,
          role: 'user',
          content: 'current',
          message: '',
          createdAt: new Date('2026-09-09T00:00:02.000Z'),
          hasToolCalls: false,
        },
      ]),
    };
    const service = new ChatContextBuilderService(uploadContext as any);

    const result = await service.buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 12 },
      chatLogService,
    );

    expect(result.contextBoundary).toMatchObject({
      groupId: 5,
      currentUserLogId: 12,
      sourceRevision: 17,
      sourceStartLogId: 4,
      candidateLogIds: [10, 11, 12],
    });
    expect(chatLogService.beginContextProjection.mock.invocationCallOrder[0]).toBeLessThan(
      chatLogService.collectRoundsForGroup.mock.invocationCallOrder[0],
    );
    expect(chatLogService.collectRoundsForGroup).toHaveBeenCalledWith({ id: 7 }, 5, 120, 40, 12);
    await result.contextBackfill?.loadPage({ afterLogId: 4, beforeLogId: 10, limit: 8 });
    expect(chatLogService.collectContextBackfillPage).toHaveBeenCalledWith({ id: 7 }, 5, {
      afterLogId: 4,
      beforeLogId: 10,
      limit: 8,
    });
    expect((result.messages[0] as any).__agent_context).toEqual({
      chatLogId: 10,
      required: false,
    });
    expect((result.messages.at(-1) as any).__agent_context).toEqual({
      chatLogId: 12,
      required: true,
    });
  });

  it.each(['collectRoundsForGroup', 'findFirstVisibleContextLogId'])(
    'fails closed when %s rejects',
    async (failingMethod: string) => {
      const uploadContext = {
        mergeFileRefMappings: jest.fn(),
        buildFileRefMappingFromMessages: jest.fn(),
      };
      const sourceError = new Error('source unavailable');
      const chatLogService = {
        beginContextProjection: jest.fn().mockResolvedValue(17),
        collectRoundsForGroup: jest.fn().mockResolvedValue([]),
        findFirstVisibleContextLogId: jest.fn().mockResolvedValue(4),
      };
      (chatLogService as any)[failingMethod].mockRejectedValue(sourceError);
      const service = new ChatContextBuilderService(uploadContext as any);

      await expect(
        service.buildMessageFromParentMessageId(
          {
            user: { id: 7 },
            groupId: 5,
            currentUserLogId: 12,
            systemMessage: 'policy',
          },
          chatLogService,
        ),
      ).rejects.toBe(sourceError);
      expect(uploadContext.mergeFileRefMappings).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the successful source result omits the current user log', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(17),
      collectRoundsForGroup: jest.fn().mockResolvedValue([
        {
          id: 11,
          role: 'assistant',
          content: 'previous answer',
          message: '',
          createdAt: new Date('2026-09-09T00:00:01.000Z'),
          hasToolCalls: false,
        },
      ]),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(4),
    };
    const service = new ChatContextBuilderService(uploadContext as any);

    await expect(
      service.buildMessageFromParentMessageId(
        { user: { id: 7 }, groupId: 5, currentUserLogId: 12, systemMessage: 'policy' },
        chatLogService,
      ),
    ).rejects.toThrow(/当前用户请求未出现在上下文历史中/);
  });

  it('fails closed when a source adapter returns a row beyond the current request boundary', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn(),
      buildFileRefMappingFromMessages: jest.fn(),
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(17),
      collectRoundsForGroup: jest.fn().mockResolvedValue([
        {
          id: 12,
          role: 'user',
          content: 'current',
          message: '',
          createdAt: new Date('2026-09-09T00:00:00.000Z'),
          hasToolCalls: false,
        },
        {
          id: 13,
          role: 'assistant',
          content: '',
          message: JSON.stringify({ role: 'assistant', content: '', rounds: [] }),
          createdAt: new Date('2026-09-09T00:00:01.000Z'),
          hasToolCalls: false,
        },
      ]),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(12),
    };

    await expect(
      new ChatContextBuilderService(uploadContext as any).buildMessageFromParentMessageId(
        { user: { id: 7 }, groupId: 5, currentUserLogId: 12 },
        chatLogService,
      ),
    ).rejects.toThrow(/越过当前用户请求边界/);
    expect(uploadContext.mergeFileRefMappings).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['fraction', 10.9],
    ['string', '10'],
  ])(
    'rejects an explicit invalid current user boundary: %s',
    async (_label: string, boundary: number | string) => {
      const chatLogService = {
        beginContextProjection: jest.fn(),
        collectRoundsForGroup: jest.fn(),
        findFirstVisibleContextLogId: jest.fn(),
      };

      await expect(
        new ChatContextBuilderService({} as any).buildMessageFromParentMessageId(
          { user: { id: 7 }, groupId: 5, currentUserLogId: boundary },
          chatLogService,
        ),
      ).rejects.toThrow(/当前用户请求边界无效/);
      expect(chatLogService.beginContextProjection).not.toHaveBeenCalled();
      expect(chatLogService.collectRoundsForGroup).not.toHaveBeenCalled();
    },
  );

  it('keeps the current generating assistant placeholder outside the provider-visible history', async () => {
    const currentUser = {
      id: 10,
      userId: 7,
      groupId: 5,
      direction: 'in',
      content: 'CURRENT_REQUEST',
      message: JSON.stringify({ role: 'user', content: 'CURRENT_REQUEST', rounds: [] }),
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
    };
    const currentAssistantPlaceholder = {
      id: 11,
      userId: 7,
      groupId: 5,
      direction: 'out',
      content: '',
      message: JSON.stringify({ role: 'assistant', content: '', rounds: [] }),
      status: 0,
      createdAt: new Date('2026-09-09T00:00:01.000Z'),
    };
    const repository = {
      find: jest.fn(async (options: any) => {
        const idBoundary = options?.where?.id as any;
        expect(idBoundary?._type).toBe('lessThanOrEqual');
        expect(idBoundary?._value).toBe(10);
        return [currentAssistantPlaceholder, currentUser].filter(
          row => row.id <= idBoundary._value,
        );
      }),
      findOne: jest.fn().mockResolvedValue({ id: 10 }),
    };
    const chatLogService = new ChatLogService(repository as any, {} as any, undefined, {
      beginProjection: jest.fn().mockResolvedValue(1),
    } as any);
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
    };

    const source = await new ChatContextBuilderService(
      uploadContext as any,
    ).buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 10 },
      chatLogService,
    );
    const projected = await new ContextCheckpointCoordinator({} as any, {} as any)
      .createSession({
        modelConfig: {
          protocol: 'test',
          model: 'test-model',
          apiKey: 'not-used',
          baseUrl: 'https://example.invalid',
        } as any,
        contextWindowTokens: 64_000,
      })
      .prepareInitial(source.messages);
    const providerMessages = new ModelMessageMapper().toModelMessages(
      new AgentContextBuilder().build({ messages: projected }),
    );
    const providerPayload = providerMessages.map(message => {
      const { __agent_context: _internal, ...providerMessage } = message as any;
      return providerMessage;
    });

    expect(source.contextBoundary.candidateLogIds).toEqual([10]);
    expect(providerPayload).toEqual([{ role: 'user', content: 'CURRENT_REQUEST' }]);
    expect(JSON.stringify(providerPayload)).not.toContain('历史助手消息为空');
  });

  it.each([
    ['null round', [null], undefined],
    [
      'valid text plus null round',
      [{ text: 'VALID_TEXT_FACT', toolCalls: [] }, null],
      'VALID_TEXT_FACT',
    ],
    ['null tool item', [{ text: '', toolCalls: [null] }], undefined],
    [
      'valid tool plus null tool item',
      [
        {
          text: '',
          toolCalls: [
            {
              id: 'valid_call',
              name: 'read',
              status: 'success',
              model: { content: 'VALID_TOOL_FACT' },
            },
            null,
          ],
        },
      ],
      'VALID_TOOL_FACT',
    ],
  ])(
    'preserves conservative history semantics for %s through the real collector',
    async (_label: string, historicalRounds: unknown[], siblingFact: string | undefined) => {
      const assistantRow = {
        id: 9,
        userId: 7,
        groupId: 5,
        direction: 'out',
        content: '',
        message: JSON.stringify({ role: 'assistant', content: '', rounds: historicalRounds }),
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
      };
      const currentUser = {
        id: 10,
        userId: 7,
        groupId: 5,
        direction: 'in',
        content: 'CURRENT_REQUEST',
        message: JSON.stringify({ role: 'user', content: 'CURRENT_REQUEST', rounds: [] }),
        createdAt: new Date('2026-09-09T00:00:01.000Z'),
      };
      const currentAssistantPlaceholder = {
        id: 11,
        userId: 7,
        groupId: 5,
        direction: 'out',
        content: '',
        message: JSON.stringify({ role: 'assistant', content: '', rounds: [] }),
        status: 0,
        createdAt: new Date('2026-09-09T00:00:02.000Z'),
      };
      const repository = {
        find: jest.fn(async (options: any) => {
          const boundary = options.where.id as any;
          return [currentAssistantPlaceholder, currentUser, assistantRow].filter(
            row => row.id <= boundary._value,
          );
        }),
        findOne: jest.fn().mockResolvedValue({ id: 9 }),
        createQueryBuilder: jest.fn(() => {
          const query: any = {
            where: () => query,
            andWhere: () => query,
            orderBy: () => query,
            limit: () => query,
            getMany: async () => [assistantRow],
          };
          return query;
        }),
      };
      const chatLogService = new ChatLogService(repository as any, {} as any, undefined, {
        beginProjection: jest.fn().mockResolvedValue(1),
      } as any);
      const uploadContext = {
        mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
        buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
        resolveApiToolName: jest.fn((toolCall: any) => toolCall?.name),
      };

      const source = await new ChatContextBuilderService(
        uploadContext as any,
      ).buildMessageFromParentMessageId(
        { user: { id: 7 }, groupId: 5, currentUserLogId: 10 },
        chatLogService,
      );
      const projected = await new ContextCheckpointCoordinator({} as any, {} as any)
        .createSession({
          modelConfig: {
            protocol: 'test',
            model: 'test-model',
            apiKey: 'not-used',
            baseUrl: 'https://example.invalid',
          } as any,
          contextWindowTokens: 64_000,
        })
        .prepareInitial(source.messages);
      const providerMessages = new ModelMessageMapper().toModelMessages(
        new AgentContextBuilder().build({ messages: projected }),
      );
      const serialized = JSON.stringify(providerMessages);

      expect(providerMessages.filter(message => message.role === 'user')).toHaveLength(1);
      expect(providerMessages.find(message => message.role === 'user')?.content).toBe(
        'CURRENT_REQUEST',
      );
      expect(serialized).toContain('格式不完整或执行已中断');
      if (siblingFact) expect(serialized).toContain(siblingFact);
      expect(source.contextBoundary.candidateLogIds).toEqual([9, 10]);

      const backfill = await chatLogService.collectContextBackfillPage({ id: 7, role: 'user' }, 5, {
        afterLogId: 0,
        beforeLogId: 10,
        limit: 8,
      });
      const serializedBackfill = JSON.stringify(backfill.messages);
      expect(backfill.sourceLogIds).toEqual([9]);
      expect(serializedBackfill).toContain('格式不完整或执行已中断');
      if (siblingFact) expect(serializedBackfill).toContain(siblingFact);
    },
  );

  it('keeps the explicit current request authoritative across same-second source and runtime projection', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      resolveApiToolName: jest.fn().mockReturnValue('lookup'),
    };
    const createdAt = new Date('2026-09-09T00:00:00.000Z');
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(17),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(10),
      collectRoundsForGroup: jest.fn().mockResolvedValue([
        {
          id: 12,
          role: 'user',
          content: 'CURRENT_SAME_SECOND_REQUEST',
          message: '',
          createdAt,
          hasToolCalls: false,
        },
        {
          id: 10,
          role: 'user',
          content: 'old same-second request',
          message: '',
          createdAt,
          hasToolCalls: false,
        },
        {
          id: 11,
          role: 'assistant',
          content: 'old tool answer',
          message: JSON.stringify({
            role: 'assistant',
            rounds: [
              {
                text: 'old tool answer',
                toolCalls: [
                  {
                    id: 'call_same_second',
                    name: 'lookup',
                    status: 'success',
                    output: { content: 'same-second observation' },
                  },
                ],
              },
            ],
          }),
          createdAt,
          hasToolCalls: true,
          includeToolCalls: true,
        },
      ]),
    };
    const service = new ChatContextBuilderService(uploadContext as any);

    const source = await service.buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 12 },
      chatLogService,
    );
    const projectionSession = new ContextCheckpointCoordinator({} as any, {} as any).createSession({
      modelConfig: {
        protocol: 'test',
        model: 'test-model',
        apiKey: 'not-used',
        baseUrl: 'https://example.invalid',
      } as any,
      contextWindowTokens: 64_000,
    });
    const projected = await projectionSession.prepareInitial(source.messages);
    const context = new AgentContextBuilder().build({ messages: projected });
    const modelMessages = new ModelMessageMapper().toModelMessages(context);

    expect(source.contextBoundary.candidateLogIds).toEqual([10, 11, 12]);
    expect(source.messages.map(message => (message as any).__agent_context?.chatLogId)).toEqual([
      10, 11, 11, 12,
    ]);
    expect(
      String(context.blocks.find(block => block.type === 'current_user_request')?.content),
    ).toContain('CURRENT_SAME_SECOND_REQUEST');
    expect(modelMessages.map(message => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
    expect(modelMessages.at(-1)?.content).toBe('CURRENT_SAME_SECOND_REQUEST');
  });

  it('projects empty-body success, failure, and interrupted tool facts as one complete sequence', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      resolveApiToolName: jest.fn((toolCall: any) => toolCall.toolName || toolCall.name),
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(1),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(1),
      collectRoundsForGroup: jest.fn().mockResolvedValue([
        {
          id: 1,
          role: 'assistant',
          content: '',
          message: JSON.stringify({
            role: 'assistant',
            content: '',
            rounds: [
              {
                text: '',
                toolCalls: [
                  {
                    id: 'success_call',
                    name: 'read',
                    status: 'success',
                    model: { content: 'SUCCESS_TOOL_FACT' },
                  },
                  {
                    id: 'error_call',
                    name: 'read',
                    status: 'error',
                    model: { content: 'ERROR_TOOL_FACT' },
                  },
                  {
                    id: 'loading_call',
                    name: 'read',
                    status: 'loading',
                  },
                ],
              },
            ],
          }),
          createdAt: new Date('2026-09-09T00:00:00.000Z'),
          hasToolCalls: true,
          includeToolCalls: true,
        },
        {
          id: 2,
          role: 'user',
          content: 'current',
          message: '',
          createdAt: new Date('2026-09-09T00:00:01.000Z'),
          hasToolCalls: false,
        },
      ]),
    };

    const result = await new ChatContextBuilderService(
      uploadContext as any,
    ).buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 2 },
      chatLogService,
    );

    expect(result.messages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'tool',
      'tool',
      'user',
    ]);
    expect(result.messages[0].tool_calls.map((call: { id: string }) => call.id)).toEqual([
      'success_call',
      'error_call',
      'loading_call',
    ]);
    expect(result.messages[1].content).toContain('SUCCESS_TOOL_FACT');
    expect(result.messages[2].content).toContain('ERROR_TOOL_FACT');
    expect(result.messages[3].content).toContain('结果未知');
    expect(
      result.messages.slice(0, 4).every(message => message.__agent_context?.chatLogId === 1),
    ).toBe(true);
  });

  it('replays a tool-only round saved with null text as its tool calls, not as an interruption', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      resolveApiToolName: jest.fn((toolCall: any) => toolCall.toolName || toolCall.name),
    };
    const assistantRow = {
      id: 1,
      userId: 7,
      groupId: 5,
      direction: 'out',
      content: 'FINAL_ANSWER',
      message: JSON.stringify({
        role: 'assistant',
        content: 'FINAL_ANSWER',
        rounds: [
          {
            text: null,
            toolCalls: [
              {
                id: 'tool_only_call',
                name: 'read',
                status: 'success',
                model: { content: 'TOOL_ONLY_FACT' },
              },
            ],
          },
          { text: 'FINAL_ANSWER', toolCalls: [] },
        ],
      }),
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      hasToolCalls: true,
      includeToolCalls: true,
    };
    const currentRow = {
      id: 2,
      role: 'user',
      content: 'current',
      message: '',
      createdAt: new Date('2026-09-09T00:00:01.000Z'),
      hasToolCalls: false,
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(1),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(1),
      collectRoundsForGroup: jest
        .fn()
        .mockResolvedValue([{ ...assistantRow, role: 'assistant' }, currentRow]),
    };

    const projection = await new ChatContextBuilderService(
      uploadContext as any,
    ).buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 2 },
      chatLogService,
    );

    expect(projection.messages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
    expect(projection.messages[1].content).toBe('TOOL_ONLY_FACT');
    expect(projection.messages[2].content).toBe('FINAL_ANSWER');
    expect(JSON.stringify(projection.messages)).not.toContain('格式不完整或执行已中断');
  });

  it('does not let a valid round hide a malformed sibling round from the same source row', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      resolveApiToolName: jest.fn((toolCall: any) => toolCall.toolName || toolCall.name),
    };
    const assistantRow = {
      id: 1,
      userId: 7,
      groupId: 5,
      direction: 'out',
      content: '',
      message: JSON.stringify({
        role: 'assistant',
        content: '',
        rounds: [
          {
            text: '',
            toolCalls: [
              {
                id: 'valid_call',
                name: 'read',
                status: 'success',
                model: { content: 'VALID_FACT' },
              },
            ],
          },
          { text: '', toolCalls: { hidden: 'MALFORMED_FACT' } },
        ],
      }),
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      hasToolCalls: true,
      includeToolCalls: true,
    };
    const currentRow = {
      id: 2,
      role: 'user',
      content: 'current',
      message: '',
      createdAt: new Date('2026-09-09T00:00:01.000Z'),
      hasToolCalls: false,
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(1),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(1),
      collectRoundsForGroup: jest
        .fn()
        .mockResolvedValue([{ ...assistantRow, role: 'assistant' }, currentRow]),
    };

    const mainProjection = await new ChatContextBuilderService(
      uploadContext as any,
    ).buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 2 },
      chatLogService,
    );

    expect(mainProjection.messages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
    expect(mainProjection.messages[1].content).toBe('VALID_FACT');
    expect(mainProjection.messages[2].content).toContain('格式不完整或执行已中断');
    expect(
      mainProjection.messages
        .slice(0, 3)
        .every(message => message.__agent_context?.chatLogId === 1),
    ).toBe(true);

    const repository = {
      createQueryBuilder: jest.fn(() => {
        const query: any = {
          where: () => query,
          andWhere: () => query,
          orderBy: () => query,
          limit: () => query,
          getMany: async () => [assistantRow],
        };
        return query;
      }),
    };
    const backfill = await new ChatLogService(
      repository as any,
      {} as any,
    ).collectContextBackfillPage({ id: 7, role: 'user' }, 5, {
      afterLogId: 0,
      beforeLogId: 2,
      limit: 8,
    });

    expect(backfill.sourceLogIds).toEqual([1]);
    expect(backfill.messages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(backfill.messages[1].content).toBe('VALID_FACT');
    expect(backfill.messages[2].content).toContain('格式不完整或执行已中断');
  });

  it.each([
    ['object', { hiddenToolFact: 'UNKNOWN_RESULT' }],
    ['string', 'malformed-rounds'],
    ['null', null],
  ])(
    'preserves explicit interruption semantics for a non-array %s rounds container',
    async (_label: string, malformedRounds: unknown) => {
      const uploadContext = {
        mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
        buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      };
      const assistantRow = {
        id: 1,
        userId: 7,
        groupId: 5,
        direction: 'out',
        content: 'VISIBLE_TEXT',
        message: JSON.stringify({
          role: 'assistant',
          content: 'VISIBLE_TEXT',
          rounds: malformedRounds,
        }),
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
        hasToolCalls: true,
        includeToolCalls: true,
      };
      const currentRow = {
        id: 2,
        role: 'user',
        content: 'current',
        message: '',
        createdAt: new Date('2026-09-09T00:00:01.000Z'),
        hasToolCalls: false,
      };
      const chatLogService = {
        beginContextProjection: jest.fn().mockResolvedValue(1),
        findFirstVisibleContextLogId: jest.fn().mockResolvedValue(1),
        collectRoundsForGroup: jest
          .fn()
          .mockResolvedValue([{ ...assistantRow, role: 'assistant' }, currentRow]),
      };

      const mainProjection = await new ChatContextBuilderService(
        uploadContext as any,
      ).buildMessageFromParentMessageId(
        { user: { id: 7 }, groupId: 5, currentUserLogId: 2 },
        chatLogService,
      );

      expect(mainProjection.messages[0].content).toContain('VISIBLE_TEXT');
      expect(mainProjection.messages[0].content).toContain('格式不完整或执行已中断');
      expect(mainProjection.messages[0].__agent_context?.chatLogId).toBe(1);

      const repository = {
        createQueryBuilder: jest.fn(() => {
          const query: any = {
            where: () => query,
            andWhere: () => query,
            orderBy: () => query,
            limit: () => query,
            getMany: async () => [assistantRow],
          };
          return query;
        }),
      };
      const backfill = await new ChatLogService(
        repository as any,
        {} as any,
      ).collectContextBackfillPage({ id: 7, role: 'user' }, 5, {
        afterLogId: 0,
        beforeLogId: 2,
        limit: 8,
      });

      expect(backfill.sourceLogIds).toEqual([1]);
      expect(backfill.messages[0].content).toContain('VISIBLE_TEXT');
      expect(backfill.messages[0].content).toContain('格式不完整或执行已中断');
      expect((backfill.messages[0] as any).__agent_context?.chatLogId).toBe(1);
    },
  );

  it.each([
    ['message without rounds', JSON.stringify({ role: 'assistant', content: 'LEGACY_TEXT' })],
    ['empty message', ''],
  ])('keeps a valid %s as ordinary assistant text', async (_label: string, message: string) => {
    const assistantRow = {
      id: 1,
      userId: 7,
      groupId: 5,
      direction: 'out',
      content: 'LEGACY_TEXT',
      message,
      createdAt: new Date('2026-09-09T00:00:00.000Z'),
      hasToolCalls: false,
      includeToolCalls: true,
    };
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const query: any = {
          where: () => query,
          andWhere: () => query,
          orderBy: () => query,
          limit: () => query,
          getMany: async () => [assistantRow],
        };
        return query;
      }),
    };

    const backfill = await new ChatLogService(
      repository as any,
      {} as any,
    ).collectContextBackfillPage({ id: 7, role: 'user' }, 5, {
      afterLogId: 0,
      beforeLogId: 2,
      limit: 8,
    });

    expect(backfill.messages[0].content).toBe('LEGACY_TEXT');
  });

  it('keeps an explicit unknown observation for an incomplete historical tool sequence', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      resolveApiToolName: jest.fn((toolCall: any) => toolCall.name),
    };
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(1),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(1),
      collectRoundsForGroup: jest.fn().mockResolvedValue([
        {
          id: 1,
          role: 'assistant',
          content: '',
          message: JSON.stringify({
            role: 'assistant',
            rounds: [
              {
                text: '',
                toolCalls: [{ name: 'read', status: 'success', model: { content: 'partial' } }],
              },
            ],
          }),
          createdAt: new Date('2026-09-09T00:00:00.000Z'),
          hasToolCalls: true,
          includeToolCalls: true,
        },
        {
          id: 2,
          role: 'user',
          content: 'current',
          message: '',
          createdAt: new Date('2026-09-09T00:00:01.000Z'),
          hasToolCalls: false,
        },
      ]),
    };

    const result = await new ChatContextBuilderService(
      uploadContext as any,
    ).buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 2 },
      chatLogService,
    );

    expect(result.messages.map(message => message.role)).toEqual(['assistant', 'user']);
    expect(result.messages[0].content).toContain('格式不完整或执行已中断');
    expect(result.messages[0].tool_calls).toBeUndefined();
  });

  it('preserves tool and interrupted facts through checkpoint persistence and reload', async () => {
    const uploadContext = {
      mergeFileRefMappings: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      buildFileRefMappingFromMessages: jest.fn().mockReturnValue({ version: 1, entries: [] }),
      resolveApiToolName: jest.fn((toolCall: any) => toolCall.toolName || toolCall.name),
    };
    const rows = [
      {
        id: 1,
        role: 'user',
        content: 'old-user'.padEnd(20_000, 'u'),
        message: '',
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
        hasToolCalls: false,
      },
      {
        id: 2,
        role: 'assistant',
        content: '',
        message: JSON.stringify({
          role: 'assistant',
          content: '',
          rounds: [
            {
              text: '',
              toolCalls: [
                {
                  id: 'checkpoint_tool',
                  name: 'read',
                  status: 'success',
                  model: { content: 'EMPTY_BODY_TOOL_FACT' },
                },
              ],
            },
            { text: '', toolCalls: { hidden: 'MALFORMED_FACT' } },
          ],
        }),
        createdAt: new Date('2026-09-09T00:00:01.000Z'),
        hasToolCalls: true,
        includeToolCalls: true,
      },
      {
        id: 3,
        role: 'assistant',
        content: 'VISIBLE_CONTAINER_TEXT'.padEnd(20_000, 'v'),
        message: JSON.stringify({
          role: 'assistant',
          content: 'VISIBLE_CONTAINER_TEXT'.padEnd(20_000, 'v'),
          rounds: { hiddenToolFact: 'UNKNOWN_RESULT' },
        }),
        createdAt: new Date('2026-09-09T00:00:02.000Z'),
        hasToolCalls: true,
        includeToolCalls: true,
      },
      {
        id: 4,
        role: 'assistant',
        content: 'old-assistant'.padEnd(20_000, 'a'),
        message: '',
        createdAt: new Date('2026-09-09T00:00:03.000Z'),
        hasToolCalls: false,
      },
      {
        id: 5,
        role: 'user',
        content: 'current'.padEnd(20_000, '中'),
        message: '',
        createdAt: new Date('2026-09-09T00:00:04.000Z'),
        hasToolCalls: false,
      },
    ];
    const chatLogService = {
      beginContextProjection: jest.fn().mockResolvedValue(1),
      findFirstVisibleContextLogId: jest.fn().mockResolvedValue(1),
      collectRoundsForGroup: jest.fn().mockResolvedValue(rows),
    };
    const source = await new ChatContextBuilderService(
      uploadContext as any,
    ).buildMessageFromParentMessageId(
      { user: { id: 7 }, groupId: 5, currentUserLogId: 5 },
      chatLogService,
    );
    let observedFact = false;
    let observedInterruptedRound = false;
    const gateway = {
      completeOnce: jest.fn(async (input: ModelGatewayRequest) => {
        const newHistory = String(input.messages[1].content);
        observedFact ||= newHistory.includes('EMPTY_BODY_TOOL_FACT');
        observedInterruptedRound ||= newHistory.includes('格式不完整或执行已中断');
        return {
          content: JSON.stringify({
            version: 1,
            goals: ['preserve history'],
            constraints: [],
            done: observedFact ? ['EMPTY_BODY_TOOL_FACT'] : [],
            inProgress: [],
            blocked: [],
            decisions: [],
            nextSteps: [],
            criticalContext: [],
            fileRefs: [],
            artifactRefs: [],
          }),
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        };
      }),
    };
    let state: any = null;
    const store = {
      loadValid: jest.fn(async () => state),
      replace: jest.fn(async (input: SaveContextCheckpointInput) => {
        state = {
          ...input,
          sourceRevision: input.expectedSourceRevision,
          summary: JSON.stringify(input.summary),
          valid: true,
        };
        return state;
      }),
      invalidateAtRevision: jest.fn(),
      invalidateGroup: jest.fn(),
    };
    const createSession = () =>
      new ContextCheckpointCoordinator(gateway as any, store as any).createSession({
        modelConfig: {
          protocol: 'test',
          model: 'test-model',
          apiKey: 'not-used',
          baseUrl: 'https://example.invalid',
        } as any,
        contextWindowTokens: 16_000,
        contextBoundary: source.contextBoundary,
        owner: { ownerType: 'user', ownerKey: '7' },
      });

    await createSession().prepareInitial(source.messages);
    expect(observedFact).toBe(true);
    expect(observedInterruptedRound).toBe(true);
    expect(state.compactedThroughLogId).toBeGreaterThanOrEqual(3);
    expect(state.summary).toContain('EMPTY_BODY_TOOL_FACT');
    expect(state.summary).toContain('执行已中断或结果未知');

    const reloaded = await createSession().prepareInitial(source.messages);
    expect(
      reloaded.some(message => String(message.content || '').includes('EMPTY_BODY_TOOL_FACT')),
    ).toBe(true);
    expect(
      reloaded.some(message => String(message.content || '').includes('执行已中断或结果未知')),
    ).toBe(true);
    expect(
      reloaded.some(
        message => message.role === 'tool' && message.content === 'EMPTY_BODY_TOOL_FACT',
      ),
    ).toBe(false);
  });
});
