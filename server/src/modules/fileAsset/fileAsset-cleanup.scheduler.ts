import { Injectable, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { FileAssetService } from './fileAsset.service';

const LOG = 'FileAssetCleanupScheduler';
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_HOURS = 24;
const MAX_INTERVAL_HOURS = 168;
/** 启动后多久第一次运行：避开启动恢复与第一波请求 */
export const FILE_ASSET_CLEANUP_FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
/** 一次运行的软时间预算：到点后不再开始下一条，正在清理的那条可能让实际耗时超过它 */
export const FILE_ASSET_CLEANUP_RUN_BUDGET_MS = 60 * 60 * 1000;
/** 批与批之间的停顿：给上传等私有写入让出账户锁与写入队列 */
export const FILE_ASSET_CLEANUP_BATCH_PAUSE_MS = 1000;

export type FileAssetCleanupRunOutcome =
  'skipped' | 'completed' | 'budget_reached' | 'stopped' | 'query_failed';

/** FILE_ASSET_CLEANUP_INTERVAL_HOURS：默认 24，0 关闭，有效值为 1 – 168 的整数；其他值按默认并标记无效 */
export function resolveCleanupIntervalHours(raw: string | undefined): {
  hours: number;
  invalid: boolean;
} {
  const value = String(raw ?? '').trim();
  if (!value) return { hours: DEFAULT_INTERVAL_HOURS, invalid: false };
  if (/^\d+$/.test(value)) {
    const hours = Number(value);
    if (hours <= MAX_INTERVAL_HOURS) return { hours, invalid: false };
  }
  return { hours: DEFAULT_INTERVAL_HOURS, invalid: true };
}

/**
 * 过期文件自动清理：与管理端「执行过期清理」同一套候选条件与逐条清理，改为定时运行。
 * - 只在 main.ts 监听端口之后 start()；构造与模块初始化不排任何定时器（vertical:import 等 CLI 也会建应用上下文）。
 * - 一次「完整扫描」以开始时候选的最大 id 为上界，按 id 逐批前进，每条最多尝试一次；运行被软预算、停止或
 *   候选查询失败打断时，进度 { cursor, upperId } 留在进程内存里，下一次运行接着扫到原上界才重置（不跨重启保存）。
 * - 不做跨实例协调：多实例部署只在一个实例上开启（其余设 FILE_ASSET_CLEANUP_INTERVAL_HOURS=0）。
 */
@Injectable()
export class FileAssetCleanupScheduler {
  private firstTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopped = false;
  private scan: { cursor: number; upperId: number } | null = null;

  constructor(private readonly fileAssetService: FileAssetService) {}

  /** 启动后 5 分钟第一次运行，之后每隔配置的小时数运行一次；重启后重新计时 */
  start(): void {
    if (this.firstTimer || this.intervalTimer) return;
    const { hours, invalid } = resolveCleanupIntervalHours(
      process.env.FILE_ASSET_CLEANUP_INTERVAL_HOURS,
    );
    if (invalid) {
      Logger.warn('FILE_ASSET_CLEANUP_INTERVAL_HOURS 无效，按默认 24 小时运行', LOG);
    }
    if (hours === 0) {
      Logger.log('过期文件自动清理已关闭', LOG);
      return;
    }
    this.stopped = false;
    this.firstTimer = setTimeout(() => {
      this.firstTimer = null;
      if (this.stopped) return;
      this.intervalTimer = setInterval(() => void this.runOnce(), hours * HOUR_MS);
      this.intervalTimer.unref?.();
      void this.runOnce();
    }, FILE_ASSET_CLEANUP_FIRST_RUN_DELAY_MS);
    this.firstTimer.unref?.();
  }

  /** 清掉定时器并置停止标记：在途的运行在当前文件清理完后退出，不中断正在进行的删除 */
  stop(): void {
    this.stopped = true;
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.firstTimer = null;
    this.intervalTimer = null;
  }

  /** 一次运行；上一次还没结束时跳过，不重叠 */
  async runOnce(): Promise<FileAssetCleanupRunOutcome> {
    if (this.running || this.stopped) return 'skipped';
    this.running = true;
    const startedAt = Date.now();
    const overBudget = () => Date.now() - startedAt >= FILE_ASSET_CLEANUP_RUN_BUDGET_MS;
    const shouldStop = () => this.stopped || overBudget();
    let failures = 0;
    let firstError: unknown;
    let outcome: FileAssetCleanupRunOutcome;
    try {
      outcome = await this.scanUntilDone(shouldStop, batch => {
        failures += batch.failed + batch.cleanupPending;
        firstError ??= batch.firstError;
      });
    } catch (error) {
      Logger.error('过期文件自动清理：本轮因候选查询失败结束', getErrorStack(error), LOG);
      outcome = 'query_failed';
    } finally {
      this.running = false;
    }
    if (outcome === 'stopped') outcome = this.stopped ? 'stopped' : 'budget_reached';
    if (outcome === 'completed') Logger.log('过期文件自动清理：本轮完成', LOG);
    if (outcome === 'budget_reached') {
      Logger.warn('过期文件自动清理：本次运行达到软时间预算，后续运行继续扫描', LOG);
    }
    if (failures > 0) {
      Logger.error(
        '过期文件自动清理：存在清理失败的文件，后续完整扫描重试',
        getErrorStack(firstError),
        LOG,
      );
    }
    return outcome;
  }

  private async scanUntilDone(
    shouldStop: () => boolean,
    onBatch: (batch: { failed: number; cleanupPending: number; firstError: unknown }) => void,
  ): Promise<FileAssetCleanupRunOutcome> {
    if (!this.scan) {
      this.scan = { cursor: 0, upperId: await this.fileAssetService.getCleanupScanUpperId() };
    }
    while (this.scan.cursor < this.scan.upperId) {
      if (shouldStop()) return 'stopped';
      const batch = await this.fileAssetService.cleanupExpiredFilesInRange(
        { after: this.scan.cursor, upTo: this.scan.upperId },
        { shouldStop },
      );
      this.scan.cursor = batch.lastId;
      onBatch(batch);
      if (batch.reachedEnd) break;
      if (shouldStop()) return 'stopped';
      await pause(FILE_ASSET_CLEANUP_BATCH_PAUSE_MS);
    }
    this.scan = null;
    return 'completed';
  }
}

function pause(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
