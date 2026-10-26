import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { createFileAssetMemoryFixture } from '../../test/fixtures/file-asset-memory.fixture';
import { createMockQueryBuilder, createMockRepository } from '../../test/mocks/repository.mock';
import { FileAssetService } from './fileAsset.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const MINUTE = 60 * 1000;
const CANDIDATE_SQL = `(
          (file.status = :activeStatus AND file.expiresAt IS NOT NULL AND file.expiresAt <= :now)
          OR file.status = :failedStatus
          OR (file.status = :processingStatus AND file.updatedAt <= :staleBefore AND
            (file.origin IS NULL OR file.origin <> 'sandbox_turn' OR file.expiresAt <= :now))
        )`;

/** 记录查询构造调用的替身：断言自动清理生成的条件、参数、排序与批量 */
function recordingQuery(result: { many?: any[]; rawOne?: any }) {
  const calls: Array<[string, ...any[]]> = [];
  const builder: any = {};
  for (const name of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'take']) {
    builder[name] = (...args: any[]) => {
      calls.push([name, ...args]);
      return builder;
    };
  }
  builder.getMany = async () => result.many || [];
  builder.getRawOne = async () => result.rawOne || null;
  return { builder, calls };
}

describe('FileAssetService scheduled cleanup queries', () => {
  it('selects candidates by id range with the same condition as the manual cleanup', async () => {
    const now = new Date('2026-10-02T00:00:00Z');
    const { builder, calls } = recordingQuery({ many: [] });
    const repository = createMockRepository(jest.fn, {
      createQueryBuilder: jest.fn(() => builder),
    });
    const service = new FileAssetService(repository as any, undefined, undefined, {
      getConfigs: jest.fn().mockResolvedValue({ fileAssetCleanupBatchSize: 12 }),
    } as any);

    await expect(
      service.cleanupExpiredFilesInRange({ after: 20, upTo: 100 }, { now }),
    ).resolves.toMatchObject({ limit: 12, scanned: 0, lastId: 20, reachedEnd: true });

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('file');
    expect(calls).toEqual([
      ['addSelect', ['file.bucket', 'file.objectKey']],
      [
        'where',
        CANDIDATE_SQL,
        {
          activeStatus: 'active',
          failedStatus: 'failed',
          processingStatus: 'processing',
          now,
          staleBefore: new Date(now.getTime() - 15 * MINUTE),
        },
      ],
      ['andWhere', 'file.id > :after AND file.id <= :upTo', { after: 20, upTo: 100 }],
      ['orderBy', 'file.id', 'ASC'],
      ['take', 12],
    ]);
  });

  it('takes the scan upper bound as the largest candidate id', async () => {
    const now = new Date('2026-10-02T00:00:00Z');
    const { builder, calls } = recordingQuery({ rawOne: { maxId: '42' } });
    const repository = createMockRepository(jest.fn, {
      createQueryBuilder: jest.fn(() => builder),
    });
    const service = new FileAssetService(repository as any);

    await expect(service.getCleanupScanUpperId(now)).resolves.toBe(42);
    expect(calls[0]).toEqual(['select', 'MAX(file.id)', 'maxId']);
    expect(calls[1][0]).toBe('where');
    expect(calls[1][1]).toBe(CANDIDATE_SQL);

    const empty = recordingQuery({ rawOne: { maxId: null } });
    repository.createQueryBuilder.mockReturnValue(empty.builder);
    await expect(service.getCleanupScanUpperId(now)).resolves.toBe(0);
  });

  it('keeps the manual cleanup on its own ordering and batch', async () => {
    const take = jest.fn(() => qb);
    const orderBy = jest.fn(() => qb);
    const qb = createMockQueryBuilder({ many: [], overrides: { take, orderBy } });
    const repository = createMockRepository(jest.fn);
    repository.createQueryBuilder.mockReturnValue(qb);
    const service = new FileAssetService(repository as any, undefined, undefined, {
      getConfigs: jest.fn().mockResolvedValue({ fileAssetCleanupBatchSize: 7 }),
    } as any);

    await service.cleanupExpiredFiles(new Date());
    expect(orderBy).toHaveBeenCalledWith('file.createdAt', 'ASC');
    expect(take).toHaveBeenCalledWith(7);
    expect(qb.getConditions()).toHaveLength(1);
  });
});

describe('FileAssetService scheduled cleanup over stored rows', () => {
  let fixture: ReturnType<typeof createFileAssetMemoryFixture>;
  const now = () => new Date();

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-02T00:00:00Z') });
    fixture = createFileAssetMemoryFixture();
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** 写入一条记录与它的对象；时间相对当前（假）时钟 */
  function seed(
    id: number,
    overrides: Record<string, any> & { expiresInMin?: number | null; updatedMinAgo?: number },
  ) {
    const { expiresInMin, updatedMinAgo = 60, ...rest } = overrides;
    const fileId = `file_${String(id).padStart(24, '0')}`;
    const objectKey = `users/stor/private/${fileId}.bin`;
    fixture.rows.set(fileId, {
      id,
      fileId,
      userId: 7,
      visitorId: null,
      storageScope: 'private',
      storageProvider: 'local',
      status: 'active',
      size: 1,
      metadata: {},
      createdAt: new Date(Date.now() - 120 * MINUTE),
      updatedAt: new Date(Date.now() - updatedMinAgo * MINUTE),
      expiresAt:
        expiresInMin === undefined || expiresInMin === null
          ? (expiresInMin ?? null)
          : new Date(Date.now() + expiresInMin * MINUTE),
      bucket: null,
      objectKey,
      ...rest,
    });
    fixture.objects.set(objectKey, Buffer.from('x'));
    return fileId;
  }
  const statusOf = (fileId: string) => fixture.rows.get(fileId)?.status;

  it('cleans exactly the candidate matrix', async () => {
    const cases: Array<[string, Record<string, any>, boolean]> = [
      ['active, expired', { status: 'active', expiresInMin: -1 }, true],
      ['active, not expired', { status: 'active', expiresInMin: 10 }, false],
      ['active, kept forever', { status: 'active', expiresInMin: null }, false],
      ['failed, not expired', { status: 'failed', expiresInMin: 60 }, true],
      ['processing, stale for exactly 15 min', { status: 'processing', updatedMinAgo: 15 }, true],
      ['processing, within 15 min', { status: 'processing', updatedMinAgo: 14 }, false],
      [
        'sandbox turn, stale but not expired',
        { status: 'processing', origin: 'sandbox_turn', expiresInMin: 10 },
        false,
      ],
      [
        'sandbox turn, stale and expired',
        { status: 'processing', origin: 'sandbox_turn', expiresInMin: -1 },
        true,
      ],
      [
        'sandbox turn without expiry',
        { status: 'processing', origin: 'sandbox_turn', expiresInMin: null },
        false,
      ],
      ['deleted', { status: 'deleted', expiresInMin: -1 }, false],
      ['expired status', { status: 'expired', expiresInMin: -1 }, false],
      ['inactive', { status: 'inactive', expiresInMin: -1 }, false],
    ];
    const ids = cases.map(([, row], index) => seed(index + 1, row));

    const result = await fixture.files.cleanupExpiredFilesInRange(
      { after: 0, upTo: cases.length },
      { now: now() },
    );

    // 以对象是否被删掉判断（已是 deleted 状态的记录原样留着它的对象）
    const cleaned = cases.filter(
      (_, index) => !fixture.objects.has(fixture.rows.get(ids[index])!.objectKey),
    );
    expect(cleaned.map(([label]) => label)).toEqual(
      cases.filter(([, , expected]) => expected).map(([label]) => label),
    );
    expect(result).toMatchObject({ contentDeleted: 4, failed: 0, reachedEnd: true });
  });

  it('isolates per-file failures, keeps going and advances past them', async () => {
    const lockedOut = seed(1, { userId: 11, expiresInMin: -1 });
    const unsaved = seed(2, { userId: 12, expiresInMin: -1 });
    const storageRefused = seed(3, { userId: 13, expiresInMin: -1 });
    const fine = seed(4, { userId: 14, expiresInMin: -1 });
    // 账户 11 的锁一直拿不到
    const lockKey = (userId: number) =>
      'file-quota:' +
      createHash('sha256')
        .update(JSON.stringify([userId, null]))
        .digest('hex')
        .slice(0, 48);
    const createRunner = fixture.repository.manager.dataSource.createQueryRunner;
    fixture.repository.manager.dataSource.createQueryRunner = () => {
      const runner = createRunner();
      const query = runner.query;
      runner.query = async (sql: string, args: string[]) =>
        sql.includes('GET_LOCK') && args[0] === lockKey(11) ? [{ acquired: 0 }] : query(sql, args);
      return runner;
    };
    // 账户 12 的状态保存抛错；账户 13 的存储删除失败（返回待清理，不抛出）
    const save = fixture.repository.save.getMockImplementation();
    fixture.repository.save.mockImplementation(async (row: any) => {
      if (row.userId === 12 && row.status === 'deleted') throw new Error('db write lost');
      return save(row);
    });
    fixture.storage.deleteObject.mockImplementation(async (_scope: string, input: any) => {
      if (input.objectKey.includes(storageRefused)) throw new Error('storage refused');
      fixture.objects.delete(input.objectKey);
    });

    const result = await fixture.files.cleanupExpiredFilesInRange(
      { after: 0, upTo: 4 },
      { now: now() },
    );

    expect(result).toMatchObject({
      scanned: 4,
      lastId: 4,
      contentDeleted: 1,
      cleanupPending: 1,
      failed: 2,
      reachedEnd: true,
    });
    expect(result.firstError).toMatchObject({ message: '文件额度锁不可用，请重试。' });
    // 存储删除失败只记静态日志，不带文件 ID
    expect(Logger.warn).toHaveBeenCalledWith('清空文件内容失败，稍后重试', 'FileAssetService');
    expect(statusOf(lockedOut)).toBe('active');
    expect(statusOf(unsaved)).toBe('processing');
    expect(statusOf(storageRefused)).toBe('failed');
    expect(statusOf(fine)).toBe('deleted');

    // 最后一条失败时游标也越过它：下一批不会再从它开始
    await expect(
      fixture.files.cleanupExpiredFilesInRange({ after: 0, upTo: 1 }, { now: now() }),
    ).resolves.toMatchObject({ scanned: 1, lastId: 1, failed: 1, reachedEnd: true });
  });

  it('stops before the next file when asked and reports where it stopped', async () => {
    seed(1, { expiresInMin: -1 });
    seed(2, { expiresInMin: -1 });
    seed(3, { expiresInMin: -1 });
    let attempts = 0;
    const result = await fixture.files.cleanupExpiredFilesInRange(
      { after: 0, upTo: 3 },
      { now: now(), shouldStop: () => attempts++ >= 1 },
    );
    expect(result).toMatchObject({ scanned: 3, lastId: 1, contentDeleted: 1, reachedEnd: false });
  });

  it('only takes ids inside the range and propagates a failed candidate query', async () => {
    const low = seed(5, { expiresInMin: -1 });
    const inside = seed(9, { expiresInMin: -1 });
    const high = seed(12, { expiresInMin: -1 });
    await fixture.files.cleanupExpiredFilesInRange({ after: 5, upTo: 10 }, { now: now() });
    expect([statusOf(low), statusOf(inside), statusOf(high)]).toEqual([
      'active',
      'deleted',
      'active',
    ]);
    await expect(fixture.files.getCleanupScanUpperId(now())).resolves.toBe(12);

    fixture.repository.createQueryBuilder = () => {
      throw new Error('database unavailable');
    };
    await expect(
      fixture.files.cleanupExpiredFilesInRange({ after: 0, upTo: 12 }, { now: now() }),
    ).rejects.toThrow('database unavailable');
  });

  it('settles a file whose object was deleted before the crash once it is stale again', async () => {
    const fileId = seed(1, { expiresInMin: -1 });
    const objectKey = fixture.rows.get(fileId)!.objectKey;
    // 第一次：对象删掉了，保存「已删除」之前进程中断（这里用保存抛错模拟）
    const save = fixture.repository.save.getMockImplementation();
    fixture.repository.save.mockImplementationOnce(save).mockImplementationOnce(async () => {
      throw new Error('process killed');
    });
    const first = await fixture.files.cleanupExpiredFilesInRange(
      { after: 0, upTo: 1 },
      { now: now() },
    );
    expect(first.failed).toBe(1);
    expect(fixture.objects.has(objectKey)).toBe(false);
    expect(statusOf(fileId)).toBe('processing');

    // 重启后 5 分钟的首次运行：记录刚更新过，不到 15 分钟，不入选
    jest.advanceTimersByTime(5 * MINUTE);
    await fixture.files.cleanupExpiredFilesInRange({ after: 0, upTo: 1 }, { now: now() });
    expect(statusOf(fileId)).toBe('processing');

    // 满 15 分钟后收口：对象已不存在，按已删除处理
    jest.advanceTimersByTime(10 * MINUTE);
    await expect(
      fixture.files.cleanupExpiredFilesInRange({ after: 0, upTo: 1 }, { now: now() }),
    ).resolves.toMatchObject({ contentDeleted: 1, failed: 0 });
    expect(statusOf(fileId)).toBe('deleted');
  });
});
