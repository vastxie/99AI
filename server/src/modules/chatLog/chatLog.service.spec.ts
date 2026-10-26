import { HttpStatus } from '@nestjs/common';
import { ChatLogService } from './chatLog.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatLogService owner scoping', () => {
  const createRepository = () => ({
    findOne: jest.fn().mockResolvedValue({ id: 1 }),
  });

  it('refuses to read messages for an identity without an id', async () => {
    const repository = createRepository();
    const service = new ChatLogService(repository as any, {} as any);

    for (const user of [
      undefined,
      {},
      { role: 'user' },
      { id: 0, role: 'user' },
      { id: 'abc', role: 'user' },
      { role: 'visitor' },
      { id: ' ', role: 'visitor' },
    ]) {
      await expect(service.findFirstVisibleContextLogId(user, 3)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    }
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('scopes reads to the registered user or the visitor', async () => {
    const repository = createRepository();
    const service = new ChatLogService(repository as any, {} as any);

    await service.findFirstVisibleContextLogId({ id: 7, role: 'user' }, 3);
    await service.findFirstVisibleContextLogId({ id: '7', role: 'user' }, 3);
    await service.findFirstVisibleContextLogId({ id: 'visitor:abc', role: 'visitor' }, 3);

    expect(repository.findOne.mock.calls.map(([options]: any[]) => options.where)).toEqual([
      { userId: 7, groupId: 3, isDelete: false },
      { userId: 7, groupId: 3, isDelete: false },
      { visitorId: 'visitor:abc', groupId: 3, isDelete: false },
    ]);
  });
});

describe('ChatLogService turn replacement', () => {
  function setup(target: { id: number } | null, counts: { running?: number; later?: number } = {}) {
    const repository = {
      findOne: jest.fn().mockResolvedValue(target),
      update: jest.fn().mockResolvedValue({ affected: 3 }),
      // 第一次 count 查未结束的回合，第二次查后续提问数
      count: jest
        .fn()
        .mockResolvedValueOnce(counts.running ?? 0)
        .mockResolvedValueOnce(counts.later ?? 0),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const checkpoints = { invalidateGroup: jest.fn().mockResolvedValue(undefined) };
    const service = new ChatLogService({} as any, {} as any, undefined, checkpoints as any);
    return { repository, manager, checkpoints, service };
  }

  const input = {
    user: { id: 7, role: 'user' },
    groupId: 3,
    cid: 'c_0123456789abcdefghij',
  };

  it('soft-deletes the question and everything after it inside the given transaction', async () => {
    const { repository, manager, checkpoints, service } = setup({ id: 40 }, { later: 2 });
    await expect(
      service.replaceFromCidInTransaction(manager as any, { ...input, expectedLaterTurns: 2 }),
    ).resolves.toBe(3);

    // 起点必须是这个会话里还在的提问（direction=in），不能是回答
    expect(repository.findOne.mock.calls[0][0]).toEqual({
      where: {
        cid: 'c_0123456789abcdefghij',
        userId: 7,
        groupId: 3,
        isDelete: false,
        direction: 'in',
      },
      select: { id: true },
    });
    const [where, patch] = repository.update.mock.calls[0];
    expect(where).toMatchObject({ userId: 7, groupId: 3 });
    expect(where.id.value).toBe(40);
    expect(patch).toEqual({ isDelete: true });
    expect(checkpoints.invalidateGroup).toHaveBeenCalledWith(3, 'source_range_deleted', manager);
  });

  it('refuses when the question is already gone instead of silently appending a new turn', async () => {
    const { repository, manager, checkpoints, service } = setup(null);
    await expect(
      service.replaceFromCidInTransaction(manager as any, {
        ...input,
        user: { id: 'visitor:abc', role: 'visitor' },
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'REPLACE_TARGET_GONE' },
    });
    expect(repository.findOne.mock.calls[0][0].where).toMatchObject({ visitorId: 'visitor:abc' });
    expect(repository.update).not.toHaveBeenCalled();
    expect(checkpoints.invalidateGroup).not.toHaveBeenCalled();
  });

  it('refuses while a turn in the replaced range is still running', async () => {
    const { repository, manager, service } = setup({ id: 40 }, { running: 1 });
    await expect(service.replaceFromCidInTransaction(manager as any, input)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'TURN_RUNNING' },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('counts only generating turns in range and later questions after the start, scoped to the owner', async () => {
    const { repository, manager, service } = setup({ id: 40 }, { later: 2 });
    await service.assertReplaceableInTransaction(manager as any, {
      ...input,
      expectedLaterTurns: 2,
    });

    const [running, later] = repository.count.mock.calls.map(([options]: any[]) => options.where);
    expect(running).toMatchObject({ userId: 7, groupId: 3, isDelete: false, status: 2 });
    expect(running.id.type).toBe('moreThanOrEqual');
    expect(running.id.value).toBe(40);
    expect(later).toMatchObject({ userId: 7, groupId: 3, isDelete: false, direction: 'in' });
    expect(later.id.type).toBe('moreThan');
    expect(later.id.value).toBe(40);
    // 只检查，不删除
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('skips the later-turn count when the request did not confirm a number', async () => {
    const { repository, manager, service } = setup({ id: 40 }, { later: 9 });
    await expect(
      service.assertReplaceableInTransaction(manager as any, input),
    ).resolves.toBeUndefined();
    expect(repository.count).toHaveBeenCalledTimes(1);
  });

  it('refuses when more turns follow than the user confirmed, and reports the real count', async () => {
    const { repository, manager, service } = setup({ id: 40 }, { later: 5 });
    await expect(
      service.replaceFromCidInTransaction(manager as any, { ...input, expectedLaterTurns: 1 }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'REPLACE_RANGE_CHANGED', data: { laterTurns: 5 } },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
});
