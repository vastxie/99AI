import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatLogService } from '../chatLog/chatLog.service';
import { ChatTurnPersistenceService } from './chat-turn-persistence.service';
import { ChatUploadContextService } from './chat-upload-context.service';
import type { Round } from '../chatLog/types/message.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

type LogSaveHook = (log: ChatLogEntity) => Promise<void>;

function createExternalGroup(overrides: Partial<ChatGroupEntity> = {}): ChatGroupEntity {
  return {
    id: 1,
    gid: 'g_external_old000000000001',
    ownerType: 'user',
    ownerKey: '7',
    userId: 7,
    visitorId: null,
    channel: 'demo_bot',
    externalThreadKey: 'direct',
    title: 'demo_bot 对话',
    isSticky: false,
    isDelete: false,
    config: null,
    params: null,
    createdAt: new Date('2026-07-28T01:00:00.000Z'),
    updatedAt: new Date('2026-07-28T01:00:00.000Z'),
    ...overrides,
  } as ChatGroupEntity;
}

function matchesWhere(value: Record<string, any>, where: Record<string, any>): boolean {
  return Object.entries(where || {}).every(([key, expected]) => value[key] === expected);
}

describe('external turn persistence and conversation deletion race', () => {
  let groups: ChatGroupEntity[];
  let logs: ChatLogEntity[];
  let transactionTail: Promise<void>;
  let afterLogSave: LogSaveHook | undefined;
  let transaction: any;
  let groupService: ChatGroupService;
  let logService: ChatLogService;
  let turnPersistence: ChatTurnPersistenceService;

  beforeEach(() => {
    groups = [createExternalGroup()];
    logs = [];
    transactionTail = Promise.resolve();
    afterLogSave = undefined;

    const groupRepository = {
      findOne: jest.fn(async ({ where }: any) => {
        return groups.find(group => matchesWhere(group as any, where)) || null;
      }),
      save: jest.fn(async (value: Partial<ChatGroupEntity>) => {
        const existingIndex = value.id ? groups.findIndex(group => group.id === value.id) : -1;
        if (existingIndex >= 0) {
          groups[existingIndex] = {
            ...groups[existingIndex],
            ...value,
            updatedAt: new Date(),
          } as ChatGroupEntity;
          return groups[existingIndex];
        }

        const created = createExternalGroup({
          ...value,
          id: Math.max(0, ...groups.map(group => group.id)) + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        groups.push(created);
        return created;
      }),
    };

    const logRepository = {
      findOne: jest.fn(async ({ where }: any) => {
        return logs.find(log => matchesWhere(log as any, where)) || null;
      }),
      save: jest.fn(async (value: Partial<ChatLogEntity>) => {
        const saved = {
          isDelete: false,
          status: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...value,
          id: logs.length + 1,
        } as ChatLogEntity;
        logs.push(saved);
        await afterLogSave?.(saved);
        return saved;
      }),
      update: jest.fn(async ({ id }: any, patch: Partial<ChatLogEntity>) => {
        const log = logs.find(item => item.id === id);
        if (log) Object.assign(log, patch);
        return { affected: log ? 1 : 0 };
      }),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ChatGroupEntity) return groupRepository;
        if (entity === ChatLogEntity) return logRepository;
        throw new Error('unexpected repository');
      }),
    };

    transaction = jest.fn(async (callback: (entityManager: typeof manager) => unknown) => {
      const previous = transactionTail;
      let releaseCurrent!: () => void;
      transactionTail = new Promise<void>(resolve => {
        releaseCurrent = resolve;
      });
      await previous;
      try {
        return await callback(manager);
      } finally {
        releaseCurrent();
      }
    });

    groupService = new ChatGroupService(
      {
        manager: { transaction },
      } as any,
      { emitToUser: jest.fn() } as any,
    );
    logService = new ChatLogService(
      {
        manager: { transaction },
        findOne: logRepository.findOne,
        save: logRepository.save,
        update: logRepository.update,
      } as any,
      {} as any,
      groupService,
    );

    turnPersistence = new ChatTurnPersistenceService(
      { manager: { transaction } } as any,
      logService,
      new ChatUploadContextService(),
      { toPublicState: jest.fn((task: any) => task) } as any,
      {
        admitInTransaction: jest.fn(async (_manager: any, identity: any) => identity),
      } as any,
    );
  });

  function createTurnInput(group: ChatGroupEntity) {
    return {
      preflight: {
        user: { id: 7, role: 'user' },
        prompt: '并发入站消息',
        useModel: 'gpt-test',
        useModeName: 'GPT Test',
        chatUserId: 7,
        visitorId: null as string | null,
        chatChannel: 'demo_bot',
        chatGroupId: group.id,
        conversationGid: group.gid,
        body: { channelMessageId: 'wx-race-1' },
      },
      userMessage: {
        role: 'user' as const,
        content: '并发入站消息',
        rounds: [] as Round[],
        timestamp: '2026-07-28T01:01:00.000Z',
      },
    };
  }

  it('re-resolves after resolver then deletion and persists both logs only to the fresh conversation', async () => {
    const resolved = await groupService.resolveExternalConversation(
      { id: 7, role: 'user' },
      'demo_bot',
    );
    await groupService.softDeleteConversation(resolved.gid, { id: 7, role: 'user' });

    const records = await turnPersistence.writeExternalTurn(createTurnInput(resolved) as any);
    const deleted = groups.find(group => group.id === resolved.id)!;
    const replacement = groups.find(group => !group.isDelete)!;

    expect(deleted).toMatchObject({
      id: resolved.id,
      isDelete: true,
      externalThreadKey: null,
    });
    expect(replacement).toMatchObject({
      id: 2,
      ownerType: 'user',
      ownerKey: '7',
      channel: 'demo_bot',
      externalThreadKey: 'direct',
      isDelete: false,
    });
    expect(logs.filter(log => log.groupId === deleted.id)).toEqual([]);
    expect(logs.filter(log => log.groupId === replacement.id)).toEqual([
      expect.objectContaining({ direction: 'in', channelMessageId: 'wx-race-1' }),
      expect.objectContaining({ direction: 'out' }),
    ]);
    expect(records).toMatchObject({
      chatGroupId: replacement.id,
      conversationGid: replacement.gid,
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('holds the external conversation lock across inbound and assistant writes before deletion', async () => {
    const resolved = await groupService.resolveExternalConversation(
      { id: 7, role: 'user' },
      'demo_bot',
    );
    let signalInboundSaved!: () => void;
    let releaseInboundSave!: () => void;
    const inboundSaved = new Promise<void>(resolve => {
      signalInboundSaved = resolve;
    });
    const allowAssistantSave = new Promise<void>(resolve => {
      releaseInboundSave = resolve;
    });
    afterLogSave = async log => {
      if (log.direction !== 'in') return;
      signalInboundSaved();
      await allowAssistantSave;
    };

    const persistencePromise = turnPersistence.writeExternalTurn(createTurnInput(resolved) as any);
    await inboundSaved;
    let deleteFinished = false;
    const deletePromise = groupService
      .softDeleteConversation(resolved.gid, { id: 7, role: 'user' })
      .finally(() => {
        deleteFinished = true;
      });
    await Promise.resolve();

    expect(deleteFinished).toBe(false);
    expect(logs).toEqual([expect.objectContaining({ groupId: resolved.id, direction: 'in' })]);

    releaseInboundSave();
    await expect(persistencePromise).resolves.toMatchObject({
      chatGroupId: resolved.id,
      conversationGid: resolved.gid,
    });
    await expect(deletePromise).resolves.toBe(true);

    expect(logs).toEqual([
      expect.objectContaining({ groupId: resolved.id, direction: 'in' }),
      expect.objectContaining({ groupId: resolved.id, direction: 'out' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: resolved.id,
      isDelete: true,
      externalThreadKey: null,
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
