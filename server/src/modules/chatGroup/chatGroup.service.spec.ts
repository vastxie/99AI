import { IsNull } from 'typeorm';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatGroupEntity } from './chatGroup.entity';
import { ChatGroupService } from './chatGroup.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createGroup(
  overrides: Omit<Partial<ChatGroupEntity>, 'userId'> & { userId?: number | null } = {},
): ChatGroupEntity {
  return {
    id: 1,
    gid: 'g_0123456789abcdefghijklmn',
    ownerType: 'user',
    ownerKey: '7',
    userId: 7,
    visitorId: null,
    channel: 'web',
    externalThreadKey: null,
    title: '新对话',
    isSticky: false,
    isDelete: false,
    config: null,
    params: null,
    createdAt: new Date('2026-07-27T12:00:00.000Z'),
    updatedAt: new Date('2026-07-27T12:00:00.000Z'),
    ...overrides,
  } as ChatGroupEntity;
}

describe('ChatGroupService conversation contract', () => {
  let repository: any;
  let groupRepository: any;
  let logRepository: any;
  let manager: any;
  let liveSync: any;
  let service: ChatGroupService;
  let contextCheckpointStore: any;

  beforeEach(() => {
    groupRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (group: ChatGroupEntity) => group),
      count: jest.fn(),
    };
    logRepository = { count: jest.fn().mockResolvedValue(0) };
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ChatGroupEntity) return groupRepository;
        if (entity === ChatLogEntity) return logRepository;
        throw new Error('unexpected repository');
      }),
    };
    repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(async (group: ChatGroupEntity) => group),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn(async (callback: (entityManager: typeof manager) => unknown) =>
          callback(manager),
        ),
      },
    };
    liveSync = { emitToUser: jest.fn() };
    contextCheckpointStore = { invalidateGroup: jest.fn().mockResolvedValue(1) };
    service = new ChatGroupService(repository, liveSync, contextCheckpointStore);
  });

  it('creates an owned Web chat conversation with a null external key', async () => {
    repository.save.mockImplementation(async (value: Partial<ChatGroupEntity>) =>
      createGroup({ ...value }),
    );

    const result = await service.createConversation({ id: 7, role: 'user' }, {});

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'user',
        ownerKey: '7',
        channel: 'web',
        externalThreadKey: null,
      }),
    );
    expect(result).toMatchObject({ channel: 'web' });
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['gid', 'channel', 'title']));
    expect(result).not.toHaveProperty('project');
  });

  it('lets visitors own chat conversations', async () => {
    repository.save.mockImplementation(async (value: Partial<ChatGroupEntity>) =>
      createGroup({ ...value, ownerType: 'visitor', ownerKey: 'fp-1', userId: null }),
    );

    await expect(
      service.createConversation({ id: 'fp-1', role: 'visitor' }, {}),
    ).resolves.toMatchObject({});
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: 'visitor', ownerKey: 'fp-1' }),
    );
  });

  it('queries only active owner conversations without project relations', async () => {
    repository.find.mockResolvedValue([createGroup({ title: '发布版本' })]);

    await expect(service.queryConversations({ id: 7, role: 'user' })).resolves.toEqual([
      expect.objectContaining({
        gid: 'g_0123456789abcdefghijklmn',
        title: '发布版本',
      }),
    ]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { ownerType: 'user', ownerKey: '7', isDelete: false },
      order: { isSticky: 'DESC', updatedAt: 'DESC' },
    });
  });

  it('broadcasts title and sticky updates with the committed public conversation', async () => {
    const original = createGroup();
    const updated = createGroup({ title: '发布计划', isSticky: true });
    repository.findOne.mockResolvedValueOnce(original).mockResolvedValueOnce(updated);

    await expect(
      service.updateConversation(
        original.gid,
        { id: 7, role: 'user' },
        {
          title: '发布计划',
          isSticky: true,
        },
      ),
    ).resolves.toBe(true);

    expect(liveSync.emitToUser).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'conversation_updated',
        conversationGid: original.gid,
        conversation: expect.objectContaining({
          title: '发布计划',
          isSticky: true,
        }),
      }),
    );
  });

  it('derives an external Chat conversation from the verified owner and channel', async () => {
    groupRepository.findOne.mockResolvedValue(null);
    groupRepository.save.mockImplementation(async (value: Partial<ChatGroupEntity>) =>
      createGroup({
        ...value,
        id: 9,
        ownerType: 'visitor',
        ownerKey: 'bound-visitor',
        userId: null,
        visitorId: 'bound-visitor',
      }),
    );

    const result = await service.resolveExternalConversation(
      { id: 'bound-visitor', role: 'visitor' },
      'demo_bot',
    );

    expect(result).toMatchObject({
      ownerKey: 'bound-visitor',
      channel: 'demo_bot',
      externalThreadKey: 'direct',
    });
    expect(groupRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(groupRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: 'bound-visitor',
        channel: 'demo_bot',
      }),
    );
  });

  it('rereads a concurrently created external conversation after a unique conflict', async () => {
    const duplicated = createGroup({
      id: 11,
      channel: 'demo_bot',
      externalThreadKey: 'direct',
    });
    groupRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicated);
    groupRepository.save.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });

    await expect(
      service.resolveExternalConversation({ id: 7, role: 'user' }, 'demo_bot'),
    ).resolves.toBe(duplicated);
    expect(groupRepository.save).toHaveBeenCalledTimes(1);
    expect(repository.manager.transaction).toHaveBeenCalledTimes(2);
  });

  it('bounds duplicate retries when the external winner cannot be reread', async () => {
    groupRepository.findOne.mockResolvedValue(null);
    groupRepository.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

    await expect(
      service.resolveExternalConversation({ id: 7, role: 'user' }, 'demo_bot'),
    ).rejects.toThrow('创建外部渠道会话失败');
    expect(groupRepository.save).toHaveBeenCalledTimes(8);
    expect(repository.manager.transaction).toHaveBeenCalledTimes(8);
  });

  it('clears the external key and tombstones the conversation in the same locked transaction', async () => {
    const group = createGroup({
      channel: 'demo_bot',
      externalThreadKey: 'direct',
    });
    groupRepository.findOne.mockResolvedValue(group);

    await expect(service.softDeleteConversation(group.gid, { id: 7, role: 'user' })).resolves.toBe(
      true,
    );

    expect(groupRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(groupRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ externalThreadKey: null, isDelete: true }),
    );
    expect(contextCheckpointStore.invalidateGroup).toHaveBeenCalledWith(
      group.id,
      'conversation_deleted',
      manager,
    );
    expect(liveSync.emitToUser).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'conversation_updated',
        conversationGid: group.gid,
        deleted: true,
      }),
    );
  });

  it('sets the automatic title only while the read title is still the default', async () => {
    const owner = { id: 7, role: 'user' };
    repository.findOne.mockResolvedValueOnce(createGroup()).mockResolvedValue(createGroup());
    await expect(service.updateDefaultTitleByGroupId(1, owner, '旅行计划')).resolves.not.toBe(
      false,
    );
    expect(repository.update.mock.calls[0][0]).toMatchObject({ id: 1, title: '新对话' });

    // 空标题也算默认标题：比较条件用 IsNull()，写入条件不接受 null
    repository.findOne.mockResolvedValueOnce(createGroup({ title: null as any }));
    await service.updateDefaultTitleByGroupId(1, owner, '旅行计划');
    expect(repository.update.mock.calls[1][0].title).toEqual(IsNull());
  });

  it('refuses to delete a conversation the owner does not hold', async () => {
    groupRepository.findOne.mockResolvedValue(null);

    await expect(
      service.softDeleteConversation('g_0123456789abcdefghijklmn', { id: 7, role: 'user' }),
    ).rejects.toThrow('无权删除此会话');
    expect(liveSync.emitToUser).not.toHaveBeenCalled();
  });
});
