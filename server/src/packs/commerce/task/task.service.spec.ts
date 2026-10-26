import { Logger } from '@nestjs/common';
import { LessThanOrEqual } from 'typeorm';
import { TaskService } from './task.service';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('TaskService checkUserMemerExpire', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears expired memberships with a conditional update and keeps going after one failure', async () => {
    jest.spyOn(Logger, 'debug').mockImplementation((): void => undefined);
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const userBalanceEntity = {
      find: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      update: jest
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ affected: 1 }),
    };
    const service = new TaskService(userBalanceEntity as any);

    await service.checkUserMemerExpire();

    expect(userBalanceEntity.update).toHaveBeenCalledTimes(2);
    const [where, patch] = userBalanceEntity.update.mock.calls[1];
    expect(where).toEqual({ id: 2, expirationTime: expect.any(Object) });
    expect(String(where.expirationTime)).toBe(String(LessThanOrEqual(new Date())));
    expect(patch).toEqual({ expirationTime: null, packageId: 0, memberCredits: 0 });
    expect(errorSpy).toHaveBeenCalledWith(
      '清理过期会员 1 失败: db down',
      expect.anything(),
      'TaskService',
    );
  });

  it('does nothing when no membership has expired', async () => {
    const userBalanceEntity = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const service = new TaskService(userBalanceEntity as any);

    await service.checkUserMemerExpire();

    expect(userBalanceEntity.update).not.toHaveBeenCalled();
  });
});
