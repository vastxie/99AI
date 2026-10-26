import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import type { SandboxMeter } from '@/modules/sandbox/sandbox.service';
import { Injectable } from '@nestjs/common';
import { sandboxAccountUserId } from './commerce-sandbox-policy.resolver';

/** 按天累计，保留 90 天 */
const USAGE_TTL_SECONDS = 90 * 24 * 3600;
const DAY_MS = 24 * 3600_000;
/** 与数据库一致按东八区切日（无夏令时） */
const UTC_OFFSET_MS = 8 * 3600_000;

export interface SandboxUsageDay {
  date: string;
  execMs: number;
  count: number;
}

export interface SandboxUsageSummary {
  days: SandboxUsageDay[];
  execMs: number;
  count: number;
}

function usageDate(time: number): string {
  return new Date(time + UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** 耗时与次数同一次原子写入；任一键没有过期时间（首次写入或被逐出后重建）都补上 */
const RECORD_USAGE_SCRIPT = `
redis.call('INCRBY', KEYS[1], ARGV[1])
local count = redis.call('INCRBY', KEYS[2], 1)
for _, key in ipairs(KEYS) do
  if redis.call('TTL', key) < 0 then
    redis.call('EXPIRE', key, ARGV[2])
  end
end
return count
`;

function usageKey(date: string, userId: number, field: 'ms' | 'count'): string {
  return `sandbox:usage:${date}:${userId}:${field}`;
}

/**
 * 记录正式用户的沙箱命令用量（执行耗时与次数），只记录、不扣积分；访客不记录。
 * 内核在每次命令结束后调用，失败只告警、不影响命令结果。
 */
@Injectable()
export class CommerceSandboxMeter implements SandboxMeter {
  constructor(private readonly redisCacheService: RedisCacheService) {}

  async record(accountId: string, usage: { execMs: number }): Promise<void> {
    const userId = sandboxAccountUserId(accountId);
    if (!userId) return;
    const date = usageDate(Date.now());
    const execMs = Math.max(0, Math.round(Number(usage.execMs) || 0));
    await this.redisCacheService.runAtomicScript(
      RECORD_USAGE_SCRIPT,
      [usageKey(date, userId, 'ms'), usageKey(date, userId, 'count')],
      [String(execMs), String(USAGE_TTL_SECONDS)],
    );
  }

  /** 最近 days 天（含今天）的逐日用量，按日期升序 */
  async summary(userId: number, days = 30): Promise<SandboxUsageSummary> {
    const span = Math.min(Math.max(Math.floor(days), 1), 90);
    const now = Date.now();
    const dates = Array.from({ length: span }, (_, index) =>
      usageDate(now - (span - 1 - index) * DAY_MS),
    );
    const values = await this.redisCacheService.mget(
      dates.flatMap(date => [usageKey(date, userId, 'ms'), usageKey(date, userId, 'count')]),
    );
    const result: SandboxUsageSummary = { days: [], execMs: 0, count: 0 };
    dates.forEach((date, index) => {
      const execMs = Number(values[index * 2]) || 0;
      const count = Number(values[index * 2 + 1]) || 0;
      result.days.push({ date, execMs, count });
      result.execMs += execMs;
      result.count += count;
    });
    return result;
  }
}
