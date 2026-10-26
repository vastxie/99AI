import { Logger } from '@nestjs/common';
import { UserEntity } from '@/modules/user/user.entity';
import { BadWordsService } from './badWords.service';
import { ViolationLogEntity } from './violationLog.entity';
import { QueryViolationDto } from './dto/queryViolation.dto';
import type { WhitelistEntity } from './whitelist.entity';
import {
  type VocabularyMeta,
  getVocabularyMeta,
  getVocabularyStats,
  mergeVocabularies,
  resetVocabularyLoader,
} from './vocabulary-loader';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('./vocabulary-loader', () => ({
  getVocabularyMeta: jest.fn(async (): Promise<VocabularyMeta[]> => []),
  getVocabularyStats: jest.fn(async () => ({ totalVocabularies: 0, totalWords: 0 })),
  mergeVocabularies: jest.fn(async () => new Set<string>()),
  resetVocabularyLoader: jest.fn(),
}));

function createService() {
  const whitelistEntity = {
    find: jest.fn(async (): Promise<WhitelistEntity[]> => []),
  };
  const violationLogEntity = {
    insert: jest.fn(async (data: any) => data),
    findAndCount: jest.fn(),
  };
  const userEntity = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(async (): Promise<UserEntity[]> => []),
    increment: jest.fn(async () => ({ affected: 1 })),
  };
  const transactionManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ViolationLogEntity) return violationLogEntity;
      if (entity === UserEntity) return userEntity;
      throw new Error('Unexpected transaction repository');
    }),
  };
  (violationLogEntity as any).manager = {
    transaction: jest.fn(async (callback: (manager: any) => unknown) =>
      callback(transactionManager),
    ),
  };
  // 与真实 GlobalConfigService 一致：单个键返回值本身，多个键返回对象；总开关默认打开
  const config: Record<string, string | undefined> = { isSensitiveWordFilter: '1' };
  const globalConfigService = {
    config,
    getConfigs: jest.fn(async (keys: string[]) =>
      keys.length === 1 ? config[keys[0]] : Object.fromEntries(keys.map(key => [key, config[key]])),
    ),
  };
  const redisCacheService = {
    get: jest.fn(async (): Promise<string | null> => null),
    set: jest.fn(async (): Promise<void> => undefined),
    del: jest.fn(async (): Promise<void> => undefined),
  };

  const service = new BadWordsService(
    whitelistEntity as any,
    violationLogEntity as any,
    userEntity as any,
    globalConfigService as any,
    redisCacheService as any,
  );

  return {
    service,
    whitelistEntity,
    violationLogEntity,
    userEntity,
    transactionManager,
    globalConfigService,
    redisCacheService,
  };
}

describe('violation list identity projection', () => {
  it('uses actual users and never guesses visitor identities from numeric IDs', async () => {
    const { service, violationLogEntity, userEntity } = createService();
    violationLogEntity.findAndCount.mockResolvedValue([
      [{ userId: 100000002 }, { userId: 100000001 }, { userId: 42 }, { userId: 0 }],
      4,
    ]);
    userEntity.find.mockResolvedValue([
      Object.assign(new UserEntity(), {
        id: 100000002,
        username: 'synthetic registered user',
        email: null,
        status: 1,
      }),
    ]);
    const query = Object.assign(new QueryViolationDto(), { page: 2, size: 4 });
    const result = await service.violation({ user: { id: 1, role: 'super' } } as any, query);
    expect(result.count).toBe(4);
    expect(result.rows[0]).toMatchObject({
      userInfo: {
        username: 'synthetic registered user',
        isVisitor: false,
      },
    });
    for (const row of result.rows.slice(1))
      expect(row).toMatchObject({
        userInfo: {
          username: '未知用户',
          email: null,
          isDeleted: true,
          isVisitor: false,
        },
      });
    expect(violationLogEntity.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 4, take: 4 }),
    );
  });
});

const logSpies: any[] = [];

describe('Tencent TMS product SDK', () => {
  it('constructs the real product SDK through the production factory without requesting', () => {
    const { service } = createService();
    const Client = require('tencentcloud-sdk-nodejs-tms').tms.v20201229.Client;
    const config = {
      tencentSecretId: 'synthetic-id',
      tencentSecretKey: 'synthetic-key',
      tencentRegion: 'ap-guangzhou',
    };
    const client = service['ensureTencentTmsClient'](config);

    expect(client).toBeInstanceOf(Client);
    expect(typeof client.TextModeration).toBe('function');
    expect(service['ensureTencentTmsClient'](config)).toBe(client);
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  logSpies.push(
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined),
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined),
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined),
  );
});

afterEach(() => {
  while (logSpies.length) {
    logSpies.pop().mockRestore();
  }
});

describe('BadWordsService vocabularies', () => {
  it('returns vocabulary meta and stats from the lazy loader with the admin response shape', async () => {
    const meta = [
      { id: '色情词库', name: '色情词库', description: '色情低俗相关敏感词', count: 552 },
      { id: '暴恐词库', name: '暴恐词库', description: '暴力恐怖相关敏感词', count: 178 },
    ];
    const stats = { totalVocabularies: 2, totalWords: 730 };
    (getVocabularyMeta as any).mockResolvedValue(meta);
    (getVocabularyStats as any).mockResolvedValue(stats);
    const { service } = createService();

    await expect(service.getVocabularies()).resolves.toEqual({ vocabularies: meta, stats });
  });

  it('loads only the selected vocabularies, filters the whitelist, and caches the result in Redis', async () => {
    const { service, whitelistEntity, redisCacheService } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue({
      useType: 'system',
      selectedVocabularies: ['色情词库', '暴恐词库'],
    });
    whitelistEntity.find.mockResolvedValue([{ word: '白名单词' }]);
    (mergeVocabularies as any).mockResolvedValue(new Set(['坏词', '白名单词', '另一个坏词']));

    await service.loadSystemWords();

    expect(mergeVocabularies).toHaveBeenCalledTimes(1);
    expect(mergeVocabularies).toHaveBeenCalledWith(['色情词库', '暴恐词库']);
    expect(redisCacheService.set).toHaveBeenCalledWith(
      { key: 'badWords:system', val: JSON.stringify(['坏词', '另一个坏词']) },
      60 * 60 * 24,
    );
    expect(redisCacheService.del).not.toHaveBeenCalled();
  });

  it('clears the cached system words when no vocabulary is selected', async () => {
    const { service, redisCacheService } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue({
      useType: 'system',
      selectedVocabularies: [],
    });

    await service.loadSystemWords();

    expect(mergeVocabularies).not.toHaveBeenCalled();
    expect(redisCacheService.del).toHaveBeenCalledWith({ key: 'badWords:system' });
    expect(redisCacheService.set).not.toHaveBeenCalled();
  });

  it('resets the in-process vocabulary cache before reloading', async () => {
    const { service, redisCacheService } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue(null);

    await service.reloadSystemWords();

    expect(resetVocabularyLoader).toHaveBeenCalledTimes(1);
    expect(redisCacheService.del).toHaveBeenCalledWith({ key: 'badWords:system' });
  });
});

describe('BadWordsService ContentFilterPort check()', () => {
  it('returns the triggered words and records the violation on hit', async () => {
    const { service, redisCacheService, violationLogEntity } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue({
      useType: 'system',
      selectedVocabularies: ['色情词库'],
    });
    redisCacheService.get.mockResolvedValue(JSON.stringify(['坏词', '别的词']));

    await expect(service.check({ text: '这句话里有坏词', userId: 100000001 })).resolves.toEqual({
      words: ['坏词'],
      violationCounted: true,
    });

    expect(violationLogEntity.insert).toHaveBeenCalledTimes(1);
    const record = violationLogEntity.insert.mock.calls[0][0];
    expect(record.userId).toBe(100000001);
    expect(record.typeOriginCn).toBe('敏感词检测');
    expect(JSON.parse(record.words)).toEqual(['坏词']);
  });

  it('returns null when nothing is hit', async () => {
    const { service, redisCacheService, violationLogEntity } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue({
      useType: 'system',
      selectedVocabularies: ['色情词库'],
    });
    redisCacheService.get.mockResolvedValue(JSON.stringify(['坏词']));

    await expect(service.check({ text: '正常内容', userId: 100000001 })).resolves.toBeNull();

    expect(violationLogEntity.insert).not.toHaveBeenCalled();
  });

  it('returns null without scanning when content filtering is not configured', async () => {
    const { service, redisCacheService, violationLogEntity } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue(null);

    await expect(service.check({ text: '这句话里有坏词', userId: 1 })).resolves.toBeNull();

    expect(redisCacheService.get).not.toHaveBeenCalled();
    expect(violationLogEntity.insert).not.toHaveBeenCalled();
  });

  it('returns null without scanning when the master switch is off', async () => {
    const { service, globalConfigService, redisCacheService } = createService();
    globalConfigService.config.isSensitiveWordFilter = '0';
    const getSensitiveConfig = jest.spyOn(service, 'getSensitiveConfig');

    await expect(service.check({ text: '这句话里有坏词', userId: 1 })).resolves.toBeNull();

    expect(getSensitiveConfig).not.toHaveBeenCalled();
    expect(redisCacheService.get).not.toHaveBeenCalled();
  });

  it('normalizes a missing userId to 0', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue(null);
    const checkBadWords = jest.spyOn(service, 'checkBadWords');

    await expect(service.check({ text: '内容' })).resolves.toBeNull();
    await expect(service.check({ text: '内容', userId: null })).resolves.toBeNull();

    expect(checkBadWords).toHaveBeenNthCalledWith(1, '内容', 0, undefined);
    expect(checkBadWords).toHaveBeenNthCalledWith(2, '内容', 0, undefined);
  });

  it('records and counts one violation across retries with the same preflight key', async () => {
    const { service, redisCacheService, violationLogEntity, userEntity } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue({
      useType: 'system',
      selectedVocabularies: ['色情词库'],
    });
    redisCacheService.get.mockResolvedValue(JSON.stringify(['坏词']));
    const preflightKey = 'a'.repeat(64);
    violationLogEntity.insert
      .mockResolvedValueOnce({ identifiers: [{ id: 1 }] })
      .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 });

    await expect(
      service.check({ text: '这句话里有坏词', userId: 100000001, idempotencyKey: preflightKey }),
    ).resolves.toMatchObject({ words: ['坏词'], violationCounted: true });
    await expect(
      service.check({ text: '这句话里有坏词', userId: 100000001, idempotencyKey: preflightKey }),
    ).resolves.toMatchObject({ words: ['坏词'], violationCounted: true });

    expect(violationLogEntity.insert).toHaveBeenCalledTimes(2);
    expect(violationLogEntity.insert.mock.calls[0][0].preflightKey).toBe(preflightKey);
    expect(userEntity.increment).toHaveBeenCalledTimes(1);
  });

  it('fails closed without exposing persistence details when an idempotent record cannot settle', async () => {
    const { service, redisCacheService, violationLogEntity, userEntity } = createService();
    jest.spyOn(service, 'getSensitiveConfig').mockResolvedValue({
      useType: 'system',
      selectedVocabularies: ['色情词库'],
    });
    redisCacheService.get.mockResolvedValue(JSON.stringify(['坏词']));
    violationLogEntity.insert.mockRejectedValue(new Error('synthetic SQL detail'));

    await expect(
      service.check({
        text: '这句话里有坏词',
        userId: 100000001,
        idempotencyKey: 'c'.repeat(64),
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: '内容安全记录失败，请稍后再试',
    });

    expect(userEntity.increment).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('记录用户违规失败', undefined, 'BadWordsService');
  });
});

describe('BadWordsService Tencent text moderation', () => {
  it('blocks and records Tencent text moderation risk results', async () => {
    const { service, violationLogEntity } = createService();
    const client = {
      TextModeration: jest.fn(async () => ({
        Suggestion: 'Block',
        Label: 'Porn',
        SubLabel: 'Sexual',
        Keywords: ['风险词'],
        DetailResults: [
          {
            Suggestion: 'Block',
            Label: 'Ad',
            Keywords: ['广告词'],
            HitInfos: [{ Keyword: '命中词' }],
          },
        ],
      })),
    };
    (service as any).ensureTencentTmsClient = jest.fn(() => client);

    await expect(
      service.tencentCheckBadWords(
        '这是一段风险内容',
        {
          useType: 'tencent',
          tencentSecretId: 'secret-id',
          tencentSecretKey: 'secret-key',
          tencentRegion: 'ap-guangzhou',
        },
        100000001,
      ),
    ).resolves.toEqual({
      words: ['风险词', '广告词', '命中词'],
      message: expect.stringContaining('未通过内容安全检测'),
      violationCounted: true,
    });

    expect(client.TextModeration).toHaveBeenCalledTimes(1);
    const request = client.TextModeration.mock.calls[0][0];
    expect(Buffer.from(request.Content, 'base64').toString('utf8')).toBe('这是一段风险内容');
    expect(request.Type).toBe('TEXT');
    expect(violationLogEntity.insert).toHaveBeenCalledTimes(1);

    const record = violationLogEntity.insert.mock.calls[0][0];
    expect(record.typeOriginCn).toBe('腾讯云检测');
    expect(JSON.parse(record.words)).toEqual(['风险词', '广告词', '命中词']);
    expect(JSON.parse(record.typeCn)).toEqual(expect.arrayContaining(['色情', 'Sexual', '广告']));
  });

  it('passes Tencent text moderation pass results without recording', async () => {
    const { service, violationLogEntity } = createService();
    const client = {
      TextModeration: jest.fn(async () => ({
        Suggestion: 'Pass',
        Label: 'Normal',
      })),
    };
    (service as any).ensureTencentTmsClient = jest.fn(() => client);

    await expect(
      service.tencentCheckBadWords(
        '正常内容',
        {
          useType: 'tencent',
          tencentSecretId: 'secret-id',
          tencentSecretKey: 'secret-key',
        },
        100000001,
      ),
    ).resolves.toBeNull();

    expect(violationLogEntity.insert).not.toHaveBeenCalled();
  });

  it('skips Tencent text moderation when shared Tencent credentials are missing', async () => {
    const { service, violationLogEntity } = createService();
    const ensureTencentTmsClient = jest.fn();
    (service as any).ensureTencentTmsClient = ensureTencentTmsClient;

    await expect(
      service.tencentCheckBadWords('正常内容', { useType: 'tencent' }, 100000001),
    ).resolves.toBeNull();

    expect(ensureTencentTmsClient).not.toHaveBeenCalled();
    expect(violationLogEntity.insert).not.toHaveBeenCalled();
  });

  it('uses the stable preflight key as Tencent DataId', async () => {
    const { service } = createService();
    const client = {
      TextModeration: jest.fn(async () => ({ Suggestion: 'Pass', Label: 'Normal' })),
    };
    (service as any).ensureTencentTmsClient = jest.fn(() => client);
    const preflightKey = 'b'.repeat(64);

    await service.tencentCheckBadWords(
      '正常内容',
      {
        useType: 'tencent',
        tencentSecretId: 'secret-id',
        tencentSecretKey: 'secret-key',
      },
      100000001,
      preflightKey,
    );

    expect(client.TextModeration.mock.calls[0][0].DataId).toBe(preflightKey);
  });
});
