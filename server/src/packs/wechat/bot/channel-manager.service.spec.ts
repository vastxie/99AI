import { HttpException, Logger } from '@nestjs/common';
import { createMockRepository } from '@/test/mocks/repository.mock';
import { BotChannel } from './bot-channel.config';
import { ChannelManagerService } from './channel-manager.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChannelManagerService', () => {
  it('projects channel users without credential or sync fields', async () => {
    const boundAt = new Date('2026-06-03T06:00:00.000Z');
    const repository = createMockRepository(jest.fn, {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 11,
            userId: 7,
            channel: BotChannel.WEIXIN,
            status: 1,
            channelUserId: 'wx_user_1',
            boundAt,
            accessToken: 'encrypted-token',
            contextToken: 'context-token',
            syncState: 'sync-state',
            extraConfig: { private: true },
          },
        ],
        1,
      ]),
    });
    const redis = {};
    const service = new ChannelManagerService(repository as any, redis as any);

    const [rows, count] = await service.findChannelUsers(BotChannel.WEIXIN, 1, 20);

    expect(count).toBe(1);
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          userId: true,
          channel: true,
          status: true,
          channelUserId: true,
          boundAt: true,
        },
      }),
    );
    expect(rows).toEqual([
      {
        id: 11,
        userId: 7,
        channel: BotChannel.WEIXIN,
        status: 1,
        channelUserId: 'wx_user_1',
        boundAt,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('encrypted-token');
    expect(JSON.stringify(rows)).not.toContain('context-token');
    expect(JSON.stringify(rows)).not.toContain('sync-state');
  });

  const bindConfig = {
    accessToken: 'encrypted-token',
    baseUrl: 'https://ilinkai.weixin.qq.com',
    channelUserId: 'wx_user_1',
  };

  it('creates and saves a new binding when the user has none', async () => {
    const repository = createMockRepository(jest.fn, {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values: any) => ({ ...values })),
      save: jest.fn(async (entity: any) => ({ ...entity, id: 1 })),
    });
    const service = new ChannelManagerService(repository as any, {} as any);

    await expect(service.bindChannel(7, BotChannel.WEIXIN, bindConfig)).resolves.toMatchObject({
      id: 1,
      userId: 7,
      channel: BotChannel.WEIXIN,
      status: 1,
      ...bindConfig,
    });

    expect(repository.findOne).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, channel: BotChannel.WEIXIN, status: 1, ...bindConfig }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('re-saves the binding written concurrently after a unique-key race', async () => {
    const existing = { id: 3, userId: 7, channel: BotChannel.WEIXIN, status: 0 };
    const repository = createMockRepository(jest.fn, {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
      create: jest.fn((values: any) => ({ ...values })),
      save: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
        )
        .mockImplementationOnce(async (entity: any) => entity),
    });
    const service = new ChannelManagerService(repository as any, {} as any);

    const result = await service.bindChannel(7, BotChannel.WEIXIN, bindConfig);

    expect(result).toBe(existing);
    expect(result).toMatchObject({ id: 3, status: 1, ...bindConfig });
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('fails with an explicit conflict when the duplicate binding was deleted concurrently', async () => {
    const repository = createMockRepository(jest.fn, {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values: any) => ({ ...values })),
      save: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' })),
    });
    const service = new ChannelManagerService(repository as any, {} as any);
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);

    const rejection = service.bindChannel(7, BotChannel.WEIXIN, bindConfig);

    await expect(rejection).rejects.toBeInstanceOf(HttpException);
    await expect(rejection).rejects.toMatchObject({
      status: 409,
      message: '渠道绑定状态已变化，请重试',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('并发删除'),
      'ChannelManagerService',
    );
    warnSpy.mockRestore();
  });
});
