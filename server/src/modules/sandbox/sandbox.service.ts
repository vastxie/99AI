/**
 * 用户沙箱的唯一服务入口。登录用户每人一台（驱动支持时工作区是持久磁盘），访客每个对话一台。
 * 单实例内：同一台沙箱的开机、校验与回收排队进行；读写与执行拿到沙箱后可并发（同一用户的多个对话），
 * 进行中的操作阻止闲置回收。
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  SANDBOX_DRIVER,
  SandboxOperationError,
  isSandboxUserOwner,
  sandboxAccountOwner,
  sandboxOwnerKey,
  type SandboxDriver,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxFileEntry,
  type SandboxHandle,
  type SandboxListOptions,
  type SandboxReadOptions,
  type SandboxWriteOptions,
  type SandboxResourceUsage,
} from './sandbox.port';

const LOG_CONTEXT = 'Sandbox';
export const SANDBOX_POLICY_RESOLVER = 'SANDBOX_POLICY_RESOLVER';
export const SANDBOX_METER = 'SANDBOX_METER';
export const SANDBOX_DEFAULT_POLICY = 'SANDBOX_DEFAULT_POLICY';
export const SANDBOX_REAPER_INTERVAL_MS = 'SANDBOX_REAPER_INTERVAL_MS';

export interface SandboxPolicy {
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  networkMode: string;
  execTimeoutSec: number;
  maxOutputBytes: number;
  idleStopMinutes: number;
  workspaceMaxBytes: number;
  workspaceMaxInodes: number;
  /** 登录用户持久磁盘容量；启用持久磁盘时作为该用户的工作区上限 */
  diskMaxBytes: number;
  minFreeBytes: number;
  minFreeInodes: number;
  maxActiveSandboxes: number;
  maxAccountSandboxes: number;
  totalMemoryMb: number;
  pendingRetentionHours: number;
  env?: Record<string, string>;
}
export interface SandboxPolicyResolver {
  resolve(ownerId: string): Promise<Partial<SandboxPolicy> | undefined>;
}
export interface SandboxMeter {
  record(ownerId: string, usage: { execMs: number; command: string }): void | Promise<void>;
}
export type SandboxResourceStatus =
  | { state: 'degraded'; reason: string }
  | { state: 'writable' | 'limited'; usage: SandboxResourceUsage; reason?: string };
interface OwnedSandbox {
  handle: SandboxHandle;
  policy: SandboxPolicy;
  lastUsedAt: number;
  streams: number;
  /** 进行中的读写 / 执行数；大于 0 时不做闲置回收 */
  active: number;
  /** 在途操作与读取流从无到有时创建，全部结束时兑现：显式停止 / 销毁据此等待 */
  drained?: { promise: Promise<void>; resolve: () => void };
  pendingSince?: number;
}
function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new SandboxOperationError('沙箱资源配置必须为正数');
  return parsed;
}
export function readSandboxPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): SandboxPolicy {
  return {
    memoryMb: readNumber(env.SANDBOX_MEMORY_MB, 2048),
    cpus: readNumber(env.SANDBOX_CPUS, 1),
    pidsLimit: readNumber(env.SANDBOX_PIDS_LIMIT, 256),
    networkMode: (env.SANDBOX_NETWORK_MODE || 'egress').trim(),
    execTimeoutSec: readNumber(env.SANDBOX_EXEC_TIMEOUT_SEC, 120),
    maxOutputBytes: readNumber(env.SANDBOX_EXEC_MAX_OUTPUT_KB, 256) * 1024,
    idleStopMinutes: readNumber(env.SANDBOX_IDLE_STOP_MINUTES, 15),
    workspaceMaxBytes: readNumber(env.SANDBOX_WORKSPACE_MAX_MB, 1024) * 1024 * 1024,
    workspaceMaxInodes: readNumber(env.SANDBOX_WORKSPACE_MAX_INODES, 100_000),
    diskMaxBytes: readNumber(env.SANDBOX_USER_DISK_MB, 4096) * 1024 * 1024,
    minFreeBytes: readNumber(env.SANDBOX_MIN_FREE_MB, 16) * 1024 * 1024,
    minFreeInodes: readNumber(env.SANDBOX_MIN_FREE_INODES, 1000),
    maxActiveSandboxes: readNumber(env.SANDBOX_MAX_ACTIVE, 4),
    maxAccountSandboxes: readNumber(env.SANDBOX_MAX_ACCOUNT_ACTIVE, 2),
    totalMemoryMb: readNumber(env.SANDBOX_TOTAL_MEMORY_MB, 4096),
    pendingRetentionHours: readNumber(env.SANDBOX_PENDING_RETENTION_HOURS, 24),
  };
}

/**
 * 容器的内存、CPU 与临时工作区在创建时确定，策略变化后运行中的容器仍按实际值占用资源：
 * 这些字段取驱动读到的实际值（准入记账、工作区容量判断都用它），其余字段取最新策略。
 * 持久磁盘的容量跟随最新策略（扩容在下次开机生效，缩容按新值只读）。
 */
function withHandleResources(policy: SandboxPolicy, handle: SandboxHandle): SandboxPolicy {
  return handle.resources ? { ...policy, ...handle.resources } : policy;
}

/** 旧版「登录用户每个对话一台」的归属；升级后这类容器在发现时回收 */
function isLegacyUserSession(ownerId: string): boolean {
  return /^user-[1-9][0-9]*:conversation:/u.test(ownerId);
}

@Injectable()
export class SandboxService implements OnModuleInit, OnModuleDestroy {
  private readonly retired = new Map<string, number>();
  private readonly leases = new Map<string, Set<symbol>>();
  private readonly owned = new Map<string, OwnedSandbox>();
  private readonly ownerTasks = new Map<string, Promise<void>>();
  private readonly unverifiedRunning = new Set<string>();
  private admission: Promise<void> = Promise.resolve();
  private discovery?: Promise<void>;
  private discovered = false;
  private readonly defaultPolicy: SandboxPolicy;
  private readonly reaper?: NodeJS.Timeout;

  constructor(
    @Inject(SANDBOX_DRIVER) private readonly driver: SandboxDriver,
    @Optional()
    @Inject(SANDBOX_POLICY_RESOLVER)
    private readonly policyResolver?: SandboxPolicyResolver,
    @Optional() @Inject(SANDBOX_METER) private readonly meter?: SandboxMeter,
    @Optional() @Inject(SANDBOX_DEFAULT_POLICY) defaultPolicy?: SandboxPolicy,
    @Optional() @Inject(SANDBOX_REAPER_INTERVAL_MS) reaperIntervalMs?: number,
  ) {
    this.defaultPolicy = defaultPolicy ?? readSandboxPolicyFromEnv();
    const interval = reaperIntervalMs ?? 60_000;
    if (interval > 0) {
      this.reaper = setInterval(() => {
        void this.stopIdle().catch(() => Logger.warn('沙箱闲置回收失败。', LOG_CONTEXT));
      }, interval);
      this.reaper.unref?.();
    }
  }
  /** 登录用户整机归属且驱动支持时，工作区是持久磁盘 */
  isPersistentOwner(ownerId: string): boolean {
    return this.driver.persistentWorkspaces === true && isSandboxUserOwner(ownerId);
  }
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureDiscovered();
    } catch {
      Logger.warn('沙箱发现不可用，沙箱操作将拒绝至连接恢复。', LOG_CONTEXT);
    }
  }
  onModuleDestroy(): void {
    if (this.reaper) clearInterval(this.reaper);
  }

  async resolvePolicy(ownerId: string): Promise<SandboxPolicy> {
    let override: Partial<SandboxPolicy> | undefined;
    try {
      override = await this.policyResolver?.resolve(sandboxAccountOwner(ownerId));
    } catch {
      throw new SandboxOperationError('沙箱策略不可用，已拒绝执行');
    }
    const policy = { ...this.defaultPolicy, ...override };
    for (const key of [
      'memoryMb',
      'cpus',
      'pidsLimit',
      'execTimeoutSec',
      'maxOutputBytes',
      'idleStopMinutes',
      'workspaceMaxBytes',
      'workspaceMaxInodes',
      'diskMaxBytes',
      'minFreeBytes',
      'minFreeInodes',
      'maxActiveSandboxes',
      'maxAccountSandboxes',
      'totalMemoryMb',
      'pendingRetentionHours',
    ] as const) {
      if (!Number.isFinite(policy[key]) || policy[key] <= 0)
        throw new SandboxOperationError('沙箱资源策略无效');
    }
    if (policy.pendingRetentionHours > 24)
      throw new SandboxOperationError('待交付文件恢复窗口不能超过 24 小时');
    if (!['none', 'egress'].includes(policy.networkMode)) {
      throw new SandboxOperationError('沙箱网络策略无效');
    }
    return this.isPersistentOwner(ownerId)
      ? { ...policy, workspaceMaxBytes: policy.diskMaxBytes }
      : policy;
  }

  /** 仅供宿主缓存清理；不创建、不触碰 Docker 资源。 */
  isResident(ownerId: string, generation: string): boolean {
    return this.owned.get(ownerId)?.handle.id === generation;
  }

  async beginTurn(ownerId: string): Promise<{ handle: SandboxHandle; release: () => void }> {
    const token = Symbol();
    const leases = this.leases.get(ownerId) ?? new Set<symbol>();
    leases.add(token);
    this.leases.set(ownerId, leases);
    const release = () => {
      leases.delete(token);
      if (!leases.size) this.leases.delete(ownerId);
      const owned = this.owned.get(ownerId);
      if (owned) owned.lastUsedAt = Date.now();
    };
    try {
      const handle = await this.withOwned(ownerId, async owned => owned.handle);
      return { handle, release };
    } catch (error) {
      release();
      throw error;
    }
  }
  private async hasPendingFiles(owned: OwnedSandbox): Promise<boolean> {
    for (const path of ['out', 'pending']) {
      const entries = await this.driver.listDir(owned.handle, path, {
        recursive: true,
        maxEntries: 1001,
      });
      if (entries.length >= 1001 || entries.some(entry => entry.type === 'file')) return true;
    }
    owned.pendingSince = undefined;
    return false;
  }
  async acquire(ownerId: string): Promise<SandboxHandle> {
    return this.withOwned(ownerId, async owned => {
      await this.assertWritable(owned);
      return owned.handle;
    });
  }
  async exec(
    ownerId: string,
    command: string,
    options: SandboxExecOptions = {},
  ): Promise<SandboxExecResult> {
    return this.withOwned(ownerId, async owned => {
      const resources = await this.inspectResourceStatus(owned);
      if (resources.state === 'degraded') throw new SandboxOperationError(resources.reason);
      // Docker 的硬容量上限仍生效；允许满额环境执行清理和成果回收。
      const result = await this.driver.exec(owned.handle, command, {
        ...options,
        timeoutSec: Math.min(
          options.timeoutSec ?? owned.policy.execTimeoutSec,
          owned.policy.execTimeoutSec,
        ),
        maxOutputBytes: Math.min(
          options.maxOutputBytes ?? owned.policy.maxOutputBytes,
          owned.policy.maxOutputBytes,
        ),
        env: { ...(owned.policy.env || {}), ...(options.env || {}) },
      });
      try {
        await this.meter?.record(sandboxAccountOwner(ownerId), {
          execMs: result.durationMs,
          command,
        });
      } catch {
        Logger.warn('沙箱用量记录失败。', LOG_CONTEXT);
      }
      return result;
    });
  }
  async readFile(ownerId: string, path: string, options?: SandboxReadOptions): Promise<Buffer> {
    return this.withOwned(ownerId, owned => this.driver.readFile(owned.handle, path, options));
  }
  async openReadStream(ownerId: string, path: string): Promise<Readable> {
    return this.withOwned(ownerId, async owned => {
      const stream = await this.driver.openReadStream(owned.handle, path);
      this.enterBusy(owned, 'streams');
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          this.leaveBusy(owned, 'streams');
          owned.lastUsedAt = Date.now();
        }
      };
      stream.once('end', release).once('close', release).once('error', release);
      return stream;
    });
  }
  async writeFile(
    ownerId: string,
    path: string,
    content: Buffer | string,
    options?: SandboxWriteOptions,
  ): Promise<void> {
    return this.withOwned(ownerId, async owned => {
      await this.assertWritable(
        owned,
        typeof content === 'string' ? Buffer.byteLength(content) : content.length,
      );
      await this.driver.writeFile(owned.handle, path, content, options);
      await this.assertWritable(owned);
    });
  }
  async listDir(
    ownerId: string,
    path: string,
    options?: SandboxListOptions,
  ): Promise<SandboxFileEntry[]> {
    return this.withOwned(ownerId, owned => this.driver.listDir(owned.handle, path, options));
  }
  async resourceStatus(ownerId: string): Promise<SandboxResourceStatus> {
    return this.withOwned(ownerId, owned => this.inspectResourceStatus(owned));
  }
  async stop(ownerId: string): Promise<void> {
    await this.ensureDiscovered();
    return this.withOwner(ownerId, async () => {
      const owned = this.owned.get(ownerId);
      if (!owned) return;
      await this.operationsDrained(owned);
      await this.driver.stop(owned.handle);
      this.owned.delete(ownerId);
    });
  }
  /** 对话已删除：登录用户的整机仍在，但该对话不能再使用它 */
  isSessionRetired(sessionId: string): boolean {
    return this.retired.has(sessionId);
  }
  /** 已鉴权的会话删除入口；不为删除操作创建容器，失败交给定时回收重试。 */
  async retireSession(ownerId: string): Promise<void> {
    this.retired.set(ownerId, Date.now() + 24 * 3600_000);
    await this.ensureDiscovered();
    await this.withOwner(ownerId, async () => {
      const owned = this.owned.get(ownerId);
      if (!owned) return;
      await this.operationsDrained(owned);
      await this.driver.destroy(owned.handle, { removeWorkspace: !owned.handle.persistent });
      this.owned.delete(ownerId);
    });
  }
  async stopIdle(now = Date.now()): Promise<string[]> {
    await this.ensureDiscovered();
    for (const [owner, deadline] of this.retired) {
      if (this.owned.has(owner)) {
        try {
          await this.retireSession(owner);
        } catch {
          Logger.warn('已删除会话的沙箱回收待重试。', LOG_CONTEXT);
        }
      } else if (now > deadline && !this.leases.get(owner)?.size) this.retired.delete(owner);
    }
    // 驱动回滚时没能卸载的持久磁盘：在该归属的排队锁内重试，且只在它当前没有沙箱时卸载
    for (const ownerId of this.driver.pendingDiskReleases?.() ?? []) {
      try {
        await this.withOwner(ownerId, async () => {
          if (!this.owned.has(ownerId)) await this.driver.retryDiskRelease?.(ownerId);
        });
      } catch {
        Logger.warn('用户磁盘卸载待重试。', LOG_CONTEXT);
      }
    }
    const stopped: string[] = [];
    for (const [ownerId, candidate] of this.owned) {
      if (
        this.ownerTasks.has(ownerId) ||
        candidate.streams ||
        candidate.active ||
        this.leases.get(ownerId)?.size
      )
        continue;
      await this.withOwner(ownerId, async () => {
        const owned = this.owned.get(ownerId);
        if (
          !owned ||
          owned.streams ||
          owned.active ||
          this.leases.get(ownerId)?.size ||
          now - owned.lastUsedAt < owned.policy.idleStopMinutes * 60_000
        )
          return;
        try {
          // 持久磁盘上的待交付文件随盘保留，回收容器不会丢；临时工作区才需要等待恢复窗口。
          // 查不了目录时按有待交付处理：等恢复窗口结束照常回收，不因持续出错一直占着名额
          const pending =
            !owned.handle.persistent && (await this.hasPendingFiles(owned).catch(() => true));
          if (pending) {
            owned.pendingSince ??= owned.handle.createdAt || now;
            if (now - owned.pendingSince < owned.policy.pendingRetentionHours * 3600_000) return;
          }
          await this.driver.destroy(owned.handle, { removeWorkspace: !owned.handle.persistent });
          this.owned.delete(ownerId);
          stopped.push(ownerId);
        } catch {
          Logger.warn('停止闲置沙箱失败。', LOG_CONTEXT);
        }
      });
    }
    return stopped;
  }
  private async inspectResourceStatus(
    owned: OwnedSandbox,
    incomingBytes = 0,
  ): Promise<SandboxResourceStatus> {
    let usage: SandboxResourceUsage;
    try {
      usage = await this.driver.inspectResources(owned.handle, owned.policy.workspaceMaxInodes);
    } catch {
      return { state: 'degraded', reason: '沙箱容量观测不可用，已拒绝写入，请管理员检查存储。' };
    }
    if (usage.hostLow)
      return {
        state: 'degraded',
        reason: '宿主存储空间不足，已暂停沙箱写入与执行，请管理员清理或扩容。',
      };
    const p = owned.policy;
    const limited =
      !usage.scanComplete ||
      usage.workspaceBytes + incomingBytes >= p.workspaceMaxBytes ||
      // 持久磁盘的文件数由文件系统自身的 inode 上限约束（下方低水位检查）
      (!owned.handle.persistent && usage.workspaceInodes >= p.workspaceMaxInodes) ||
      usage.freeBytes - incomingBytes < p.minFreeBytes ||
      usage.freeInodes < p.minFreeInodes;
    return limited
      ? {
          state: 'limited',
          usage,
          reason: owned.handle.persistent
            ? '磁盘已满或超出套餐容量，已拒绝写入文件；删除不需要的文件后可继续。'
            : isSandboxUserOwner(owned.handle.ownerId)
              ? '工作区已满，已拒绝写入文件；删除不需要的文件后可继续。'
              : '沙箱已达到工作区额度或存储低水位，已拒绝写入；仍可读取文件，请管理员清理或扩容。',
        }
      : { state: 'writable', usage };
  }
  private async assertWritable(owned: OwnedSandbox, incomingBytes = 0): Promise<void> {
    const status = await this.inspectResourceStatus(owned, incomingBytes);
    if (status.state !== 'writable') throw new SandboxOperationError(status.reason);
  }
  private async withOwner<T>(ownerId: string, operation: () => Promise<T>): Promise<T> {
    sandboxOwnerKey(ownerId);
    const previous = this.ownerTasks.get(ownerId) ?? Promise.resolve();
    const task = previous.then(operation);
    const settled = task.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    this.ownerTasks.set(ownerId, settled);
    try {
      return await task;
    } catch (error) {
      if (error instanceof SandboxOperationError) throw error;
      throw new SandboxOperationError('沙箱操作失败，请管理员检查沙箱服务。');
    } finally {
      if (this.ownerTasks.get(ownerId) === settled) this.ownerTasks.delete(ownerId);
    }
  }
  /** 开机与校验按归属排队；拿到沙箱后的读写与执行可并发，active 计数阻止期间的闲置回收。 */
  private async withOwned<T>(
    ownerId: string,
    operation: (owned: OwnedSandbox) => Promise<T>,
  ): Promise<T> {
    await this.ensureDiscovered();
    const owned = await this.withOwner(ownerId, async () => {
      const acquired = await this.acquireOwned(ownerId);
      this.enterBusy(acquired, 'active');
      acquired.lastUsedAt = Date.now();
      return acquired;
    });
    try {
      return await operation(owned);
    } catch (error) {
      if (error instanceof SandboxOperationError) throw error;
      throw new SandboxOperationError('沙箱操作失败，请管理员检查沙箱服务。');
    } finally {
      owned.lastUsedAt = Date.now();
      this.leaveBusy(owned, 'active');
    }
  }

  private enterBusy(owned: OwnedSandbox, kind: 'active' | 'streams'): void {
    if (owned.active + owned.streams === 0) {
      let resolve!: () => void;
      const promise = new Promise<void>(done => (resolve = done));
      owned.drained = { promise, resolve };
    }
    owned[kind]++;
  }

  private leaveBusy(owned: OwnedSandbox, kind: 'active' | 'streams'): void {
    owned[kind]--;
    if (owned.active + owned.streams === 0) {
      owned.drained?.resolve();
      owned.drained = undefined;
    }
  }

  /**
   * 显式停止 / 销毁前等待在途读写、执行与读取流结束（调用方持有该归属的排队锁，期间不会有新操作
   * 取得沙箱）：不在命令执行或文件传输途中删除容器或卸载磁盘。读取流由调用方负责消费或销毁。
   */
  private async operationsDrained(owned: OwnedSandbox): Promise<void> {
    while (owned.active + owned.streams > 0 && owned.drained) await owned.drained.promise;
  }
  private async acquireOwned(ownerId: string): Promise<OwnedSandbox> {
    if (this.retired.has(ownerId)) throw new SandboxOperationError('会话已删除，沙箱不可再使用');
    const policy = await this.resolvePolicy(ownerId);
    const persistent = this.isPersistentOwner(ownerId);
    const existing = this.owned.get(ownerId);
    if (
      existing &&
      (await this.driver.verify(existing.handle, { ownerId, ...policy, persistent })) === 'running'
    ) {
      existing.policy = withHandleResources(policy, existing.handle);
      return existing;
    }
    const task = this.admission.then(async () => {
      if (
        !existing &&
        this.owned.size + this.unverifiedRunning.size >=
          Math.min(this.defaultPolicy.maxActiveSandboxes, policy.maxActiveSandboxes)
      ) {
        throw new SandboxOperationError('活跃沙箱数量已达上限，请稍后重试或由管理员调整容量');
      }
      const others = [...this.owned.values()].filter(value => value.handle.ownerId !== ownerId);
      if (
        this.unverifiedRunning.size ||
        others.filter(
          value => sandboxAccountOwner(value.handle.ownerId) === sandboxAccountOwner(ownerId),
        ).length >= Math.min(policy.maxAccountSandboxes, this.defaultPolicy.maxAccountSandboxes) ||
        others.reduce((total, value) => total + value.policy.memoryMb, 0) + policy.memoryMb >
          Math.min(policy.totalMemoryMb, this.defaultPolicy.totalMemoryMb)
      ) {
        throw new SandboxOperationError('账号或实例的沙箱资源额度已满，请等待闲置环境回收');
      }
      let handle: SandboxHandle;
      try {
        handle = await this.driver.ensure({ ownerId, ...policy, persistent });
      } catch (error) {
        this.discovered = false;
        throw error;
      }
      const owned = this.adopt(ownerId, existing, handle, policy);
      this.unverifiedRunning.delete(handle.id);
      return owned;
    });
    this.admission = task.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    return task;
  }
  /**
   * 记录新句柄。已有记录原地更新：进行中的操作与读取流在结束时回减的是同一条记录的计数，
   * 换代后的沙箱不会因计数错位而永远不被回收或被提前回收。
   */
  private adopt(
    ownerId: string,
    existing: OwnedSandbox | undefined,
    handle: SandboxHandle,
    policy: SandboxPolicy,
  ): OwnedSandbox {
    const owned = existing ?? {
      handle,
      policy: withHandleResources(policy, handle),
      lastUsedAt: Date.now(),
      streams: 0,
      active: 0,
    };
    owned.handle = handle;
    owned.policy = withHandleResources(policy, handle);
    owned.lastUsedAt = Date.now();
    owned.pendingSince = undefined;
    this.owned.set(ownerId, owned);
    return owned;
  }
  private async ensureDiscovered(): Promise<void> {
    if (this.discovered) return;
    if (!this.discovery) {
      this.discovery = (async () => {
        const handles = await this.driver.discover();
        this.unverifiedRunning.clear();
        let failed = false;
        for (const handle of handles) {
          this.unverifiedRunning.add(handle.id);
          try {
            // 升级前「每对话一台」的登录用户容器与存储方式已变的容器：只回收容器，持久磁盘不动
            if (
              isLegacyUserSession(handle.ownerId) ||
              Boolean(handle.persistent) !== this.isPersistentOwner(handle.ownerId)
            ) {
              await this.driver.destroy(handle, { removeWorkspace: !handle.persistent });
              this.unverifiedRunning.delete(handle.id);
              continue;
            }
            const policy = await this.resolvePolicy(handle.ownerId);
            const persistent = Boolean(handle.persistent);
            const state = await this.driver.verify(handle, {
              ownerId: handle.ownerId,
              ...policy,
              persistent,
            });
            if (state !== 'running') {
              if (state === 'stopped')
                await this.driver.destroy(handle, { removeWorkspace: !persistent });
              this.unverifiedRunning.delete(handle.id);
              continue;
            }
            // A prior process may have died after create/start but before workspace initialization.
            const known = this.owned.get(handle.ownerId);
            const ready =
              known?.handle.id === handle.id
                ? known.handle
                : await this.driver.ensure({ ownerId: handle.ownerId, ...policy, persistent });
            this.adopt(handle.ownerId, known, ready, policy);
            this.unverifiedRunning.delete(handle.id);
          } catch {
            failed = true;
            Logger.warn('发现配置不匹配的沙箱，已拒绝接管，请管理员检查。', LOG_CONTEXT);
          }
        }
        this.discovered = !failed;
      })()
        .catch(() => {
          throw new SandboxOperationError('沙箱发现不可用，请管理员检查沙箱服务。');
        })
        .finally(() => {
          this.discovery = undefined;
        });
    }
    return this.discovery;
  }
}
