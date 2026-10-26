import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFileAssetMemoryFixture } from '../../test/fixtures/file-asset-memory.fixture';
import {
  FILE_ASSET_CLEANUP_BATCH_PAUSE_MS,
  FILE_ASSET_CLEANUP_FIRST_RUN_DELAY_MS,
  FileAssetCleanupScheduler,
  resolveCleanupIntervalHours,
} from './fileAsset-cleanup.scheduler';
import { FileAssetService } from './fileAsset.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const LOG = 'FileAssetCleanupScheduler';

/**
 * 模拟数据库里的候选：id → 是否符合条件。每清理一条把时钟往前拨 minutesPerFile（用来触发软预算）；
 * failing 里的 id 清理失败（仍是候选，留给下一次完整扫描）。批量 limit 条，按 id 升序。
 */
function simulatedFiles(options: { limit?: number; minutesPerFile?: number } = {}) {
  const hooks: { onRange?: (call: number) => void; onAttempt?: (id: number) => void } = {};
  const limit = options.limit ?? 2;
  const candidates = new Map<number, boolean>();
  const failing = new Set<number>();
  const attempts: number[] = [];
  const ranges: Array<{ after: number; upTo: number }> = [];
  const service = {
    getCleanupScanUpperId: jest.fn(async () =>
      Math.max(0, ...[...candidates].filter(([, ok]) => ok).map(([id]) => id)),
    ),
    cleanupExpiredFilesInRange: jest.fn(
      async (range: { after: number; upTo: number }, opts: { shouldStop?: () => boolean }) => {
        ranges.push(range);
        hooks.onRange?.(ranges.length);
        const batch = [...candidates]
          .filter(([id, ok]) => ok && id > range.after && id <= range.upTo)
          .map(([id]) => id)
          .sort((a, b) => a - b)
          .slice(0, limit);
        let lastId = range.after;
        let failed = 0;
        let interrupted = false;
        for (const id of batch) {
          if (opts.shouldStop?.()) {
            interrupted = true;
            break;
          }
          attempts.push(id);
          hooks.onAttempt?.(id);
          if (failing.has(id)) failed += 1;
          else candidates.set(id, false);
          jest.setSystemTime(Date.now() + (options.minutesPerFile ?? 0) * MINUTE);
          lastId = id;
        }
        return {
          limit,
          scanned: batch.length,
          lastId,
          contentDeleted: 0,
          cleanupPending: 0,
          failed,
          firstError: failed ? new Error('storage refused') : undefined,
          reachedEnd: !interrupted && batch.length < limit,
        };
      },
    ),
  };
  const add = (...ids: number[]) => ids.forEach(id => candidates.set(id, true));
  return { service, candidates, failing, attempts, ranges, add, hooks };
}

/** 跑完一次运行，包括批间停顿 */
async function runToEnd(scheduler: FileAssetCleanupScheduler) {
  const run = scheduler.runOnce();
  for (let i = 0; i < 50; i++)
    await jest.advanceTimersByTimeAsync(FILE_ASSET_CLEANUP_BATCH_PAUSE_MS);
  return run;
}

describe('resolveCleanupIntervalHours', () => {
  it('defaults to 24, allows 0 to turn it off and integers up to 168', () => {
    expect(resolveCleanupIntervalHours(undefined)).toEqual({ hours: 24, invalid: false });
    expect(resolveCleanupIntervalHours('')).toEqual({ hours: 24, invalid: false });
    expect(resolveCleanupIntervalHours('0')).toEqual({ hours: 0, invalid: false });
    expect(resolveCleanupIntervalHours(' 1 ')).toEqual({ hours: 1, invalid: false });
    expect(resolveCleanupIntervalHours('168')).toEqual({ hours: 168, invalid: false });
    for (const raw of ['169', '1.5', '-1', 'daily', '1e2']) {
      expect(resolveCleanupIntervalHours(raw)).toEqual({ hours: 24, invalid: true });
    }
  });
});

describe('FileAssetCleanupScheduler', () => {
  const originalInterval = process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS;
  let logs: { log: any; warn: any; error: any };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-02T00:00:00Z') });
    delete process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS;
    logs = {
      log: jest.spyOn(Logger, 'log').mockImplementation((): void => undefined),
      warn: jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined),
      error: jest.spyOn(Logger, 'error').mockImplementation((): void => undefined),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalInterval === undefined) delete process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS;
    else process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS = originalInterval;
  });

  describe('timing', () => {
    it('schedules nothing until start() (CLI contexts build the module too)', () => {
      const files = simulatedFiles();
      new FileAssetCleanupScheduler(files.service as any);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('schedules nothing through Nest lifecycle hooks, which CLI application contexts also run', async () => {
      const files = simulatedFiles();
      @Module({
        providers: [
          FileAssetCleanupScheduler,
          { provide: FileAssetService, useValue: files.service },
        ],
      })
      class CleanupOnlyModule {}
      const context = await NestFactory.createApplicationContext(CleanupOnlyModule, {
        logger: false,
      });
      expect(context.get(FileAssetCleanupScheduler)).toBeInstanceOf(FileAssetCleanupScheduler);
      expect(jest.getTimerCount()).toBe(0);
      await context.close();
      expect(jest.getTimerCount()).toBe(0);
      expect(files.service.getCleanupScanUpperId).not.toHaveBeenCalled();
    });

    it('runs 5 minutes after start and then every interval', async () => {
      const files = simulatedFiles();
      const scheduler = new FileAssetCleanupScheduler(files.service as any);
      scheduler.start();
      scheduler.start();

      await jest.advanceTimersByTimeAsync(FILE_ASSET_CLEANUP_FIRST_RUN_DELAY_MS - 1);
      expect(files.service.getCleanupScanUpperId).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(files.service.getCleanupScanUpperId).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(24 * HOUR - 1);
      expect(files.service.getCleanupScanUpperId).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(files.service.getCleanupScanUpperId).toHaveBeenCalledTimes(2);
      scheduler.stop();
    });

    it('honours the configured interval, turns off at 0 and falls back on invalid values', async () => {
      process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS = '2';
      const every2h = simulatedFiles();
      const a = new FileAssetCleanupScheduler(every2h.service as any);
      a.start();
      await jest.advanceTimersByTimeAsync(FILE_ASSET_CLEANUP_FIRST_RUN_DELAY_MS + 2 * HOUR);
      expect(every2h.service.getCleanupScanUpperId).toHaveBeenCalledTimes(2);
      a.stop();

      process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS = '0';
      const off = simulatedFiles();
      new FileAssetCleanupScheduler(off.service as any).start();
      expect(jest.getTimerCount()).toBe(0);
      expect(logs.log).toHaveBeenCalledWith('过期文件自动清理已关闭', LOG);

      process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS = 'daily';
      const invalid = simulatedFiles();
      const c = new FileAssetCleanupScheduler(invalid.service as any);
      c.start();
      expect(logs.warn).toHaveBeenCalledWith(
        'FILE_ASSET_CLEANUP_INTERVAL_HOURS 无效，按默认 24 小时运行',
        LOG,
      );
      await jest.advanceTimersByTimeAsync(FILE_ASSET_CLEANUP_FIRST_RUN_DELAY_MS + 24 * HOUR);
      expect(invalid.service.getCleanupScanUpperId).toHaveBeenCalledTimes(2);
      c.stop();
    });

    it('does not overlap runs and stops scheduling after stop()', async () => {
      const files = simulatedFiles();
      let release!: (value: number) => void;
      files.service.getCleanupScanUpperId.mockImplementationOnce(
        () => new Promise<number>(resolve => (release = resolve)),
      );
      const scheduler = new FileAssetCleanupScheduler(files.service as any);
      const first = scheduler.runOnce();
      await expect(scheduler.runOnce()).resolves.toBe('skipped');
      release(0);
      await expect(first).resolves.toBe('completed');

      scheduler.start();
      scheduler.stop();
      expect(jest.getTimerCount()).toBe(0);
      await expect(scheduler.runOnce()).resolves.toBe('skipped');
    });
  });

  describe('a full scan', () => {
    it('fixes the upper bound at the start; later or re-qualified low ids wait for the next scan', async () => {
      const files = simulatedFiles({ limit: 2 });
      files.add(1, 2, 3);
      files.hooks.onRange = call => {
        if (call === 1) files.add(7); // 运行期间新出现、id 更大的候选
        if (call === 2) files.add(1); // 游标已经越过、后来又成为候选的低 id
      };
      const scheduler = new FileAssetCleanupScheduler(files.service as any);

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3]);
      expect(logs.log).toHaveBeenCalledWith('过期文件自动清理：本轮完成', LOG);

      files.hooks.onRange = undefined;
      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3, 1, 7]);
    });

    it('carries the scan across runs cut by the soft budget and resets only after the original upper bound', async () => {
      // 每条清理耗时 25 分钟：一次运行在 60 分钟软预算内能开始 3 条
      const files = simulatedFiles({ limit: 2, minutesPerFile: 25 });
      files.add(1, 2, 3, 4, 5, 6, 7, 8);
      const scheduler = new FileAssetCleanupScheduler(files.service as any);

      await expect(runToEnd(scheduler)).resolves.toBe('budget_reached');
      expect(files.attempts).toEqual([1, 2, 3]);
      expect(logs.warn).toHaveBeenCalledWith(
        '过期文件自动清理：本次运行达到软时间预算，后续运行继续扫描',
        LOG,
      );

      files.add(9, 2); // 新候选与已越过的低 id：都要等这次完整扫描结束
      await expect(runToEnd(scheduler)).resolves.toBe('budget_reached');
      expect(files.attempts).toEqual([1, 2, 3, 4, 5, 6]);
      expect(files.ranges.at(-2)).toEqual({ after: 3, upTo: 8 });

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(files.service.getCleanupScanUpperId).toHaveBeenCalledTimes(1);

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 2, 9]);
      expect(files.service.getCleanupScanUpperId).toHaveBeenCalledTimes(2);
    });

    it('tries a failing file once per scan and retries it in the next scan', async () => {
      const files = simulatedFiles({ limit: 2 });
      files.add(1, 2, 3);
      files.failing.add(2);
      const scheduler = new FileAssetCleanupScheduler(files.service as any);

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3]);
      expect(logs.error).toHaveBeenCalledWith(
        '过期文件自动清理：存在清理失败的文件，后续完整扫描重试',
        expect.stringContaining('storage refused'),
        LOG,
      );

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3, 2]);
    });

    it('keeps the progress when a candidate query fails and resumes from the saved cursor', async () => {
      const files = simulatedFiles({ limit: 2 });
      files.add(1, 2, 3, 4, 5);
      const range = files.service.cleanupExpiredFilesInRange.getMockImplementation();
      files.service.cleanupExpiredFilesInRange
        .mockImplementationOnce(range)
        .mockImplementationOnce(async () => {
          throw new Error('database unavailable');
        });
      const scheduler = new FileAssetCleanupScheduler(files.service as any);

      await expect(runToEnd(scheduler)).resolves.toBe('query_failed');
      expect(logs.error).toHaveBeenCalledWith(
        '过期文件自动清理：本轮因候选查询失败结束',
        expect.stringContaining('database unavailable'),
        LOG,
      );
      expect(files.attempts).toEqual([1, 2]);

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts).toEqual([1, 2, 3, 4, 5]);
      // 第二次运行从保存的游标 2 接着扫，上界仍是开始时的 5
      expect(files.ranges).toEqual([
        { after: 0, upTo: 5 },
        { after: 2, upTo: 5 },
        { after: 4, upTo: 5 },
      ]);
      expect(files.service.getCleanupScanUpperId).toHaveBeenCalledTimes(1);

      // 取上界失败：没有进度可留，下一次重新取
      files.add(6);
      files.service.getCleanupScanUpperId.mockRejectedValueOnce(new Error('database unavailable'));
      await expect(runToEnd(scheduler)).resolves.toBe('query_failed');
      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect(files.attempts.at(-1)).toBe(6);
    });

    it('cleans stored rows end to end with the real service, batch by batch', async () => {
      const fixture = createFileAssetMemoryFixture();
      const keep: string[] = [];
      for (let id = 1; id <= 5; id++) {
        const fileId = `file_${String(id).padStart(24, '0')}`;
        fixture.rows.set(fileId, {
          id,
          fileId,
          userId: 7,
          storageScope: 'private',
          storageProvider: 'local',
          status: 'active',
          size: 1,
          metadata: {},
          createdAt: new Date(Date.now() - HOUR),
          updatedAt: new Date(Date.now() - HOUR),
          // 4 号还没到期
          expiresAt: new Date(Date.now() + (id === 4 ? HOUR : -MINUTE)),
          objectKey: `users/stor/private/${fileId}.bin`,
        });
        fixture.objects.set(`users/stor/private/${fileId}.bin`, Buffer.from('x'));
        if (id === 4) keep.push(fileId);
      }
      const range = jest.spyOn(fixture.files, 'cleanupExpiredFilesInRange');
      jest.spyOn(fixture.files as any, 'getCleanupBatchSize').mockResolvedValue(2);
      const scheduler = new FileAssetCleanupScheduler(fixture.files);

      await expect(runToEnd(scheduler)).resolves.toBe('completed');
      expect([...fixture.rows.values()].map(row => [row.id, row.status])).toEqual([
        [1, 'deleted'],
        [2, 'deleted'],
        [3, 'deleted'],
        [4, 'active'],
        [5, 'deleted'],
      ]);
      expect(fixture.objects.has(`users/stor/private/${keep[0]}.bin`)).toBe(true);
      // 第二批取到 3、5（4 未到期不是候选），游标到达上界即结束
      expect(range.mock.calls.map(([r]: any[]) => r)).toEqual([
        { after: 0, upTo: 5 },
        { after: 2, upTo: 5 },
      ]);
    });

    it('lets the current file finish after stop() and starts nothing else', async () => {
      const files = simulatedFiles({ limit: 2 });
      files.add(1, 2, 3, 4);
      const scheduler = new FileAssetCleanupScheduler(files.service as any);
      files.hooks.onAttempt = id => {
        if (id === 1) scheduler.stop();
      };

      await expect(runToEnd(scheduler)).resolves.toBe('stopped');
      expect(files.attempts).toEqual([1]);
      expect(files.service.cleanupExpiredFilesInRange).toHaveBeenCalledTimes(1);
      await expect(scheduler.runOnce()).resolves.toBe('skipped');
    });

    it('stops in the pause between batches without taking another batch', async () => {
      const files = simulatedFiles({ limit: 2 });
      files.add(1, 2, 3, 4);
      const scheduler = new FileAssetCleanupScheduler(files.service as any);

      const run = scheduler.runOnce();
      await jest.advanceTimersByTimeAsync(0);
      expect(files.attempts).toEqual([1, 2]);
      scheduler.stop();
      await jest.advanceTimersByTimeAsync(FILE_ASSET_CLEANUP_BATCH_PAUSE_MS);
      await expect(run).resolves.toBe('stopped');
      expect(files.service.cleanupExpiredFilesInRange).toHaveBeenCalledTimes(1);
    });
  });
});

describe('wiring', () => {
  const src = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

  it('starts only from main.ts after the server listens, and stops when the server closes', () => {
    const main = src('main.ts');
    const listenAt = main.indexOf('await app.listen(');
    const startAt = main.indexOf('fileAssetCleanup.start()');
    expect(listenAt).toBeGreaterThan(0);
    expect(main.indexOf('app.get(FileAssetCleanupScheduler)')).toBeGreaterThan(listenAt);
    expect(startAt).toBeGreaterThan(listenAt);
    expect(main).toContain("server.once('close', () => fileAssetCleanup.stop())");
    // 命令模式（数据库命令、vertical:import）在监听之前就 return：分支存在、分支里有 return、位置在监听之前
    for (const marker of [
      'if (databaseExitCode !== undefined) {',
      "if (process.argv[2] === 'vertical:import') {",
    ]) {
      const at = main.indexOf(marker);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(listenAt);
      expect(main.slice(at, main.indexOf('}', at))).toContain('return;');
    }
    for (const cli of [
      'modules/vertical/vertical-import.cli.ts',
      'modules/database/database.cli.ts',
    ]) {
      expect(src(cli)).not.toContain('FileAssetCleanupScheduler');
    }
  });
});
