import { PassThrough } from 'node:stream';
import { createSandboxDriverFromEnv } from './sandbox.module';
import type {
  SandboxDriver,
  SandboxFileEntry,
  SandboxHandle,
  SandboxResourceUsage,
  SandboxSpec,
  SandboxWriteOptions,
} from './sandbox.port';
import { readSandboxPolicyFromEnv, SandboxService } from './sandbox.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function fakeDriver(): SandboxDriver & { ensure: any; exec: any; stop: any; destroy: any } {
  return {
    kind: 'fake',
    discover: jest.fn(async (): Promise<SandboxHandle[]> => []),
    verify: jest.fn(async () => 'running'),
    inspectResources: jest.fn(async () => ({
      workspaceBytes: 100,
      workspaceInodes: 10,
      freeBytes: 10 * 1024 ** 3,
      freeInodes: 100_000,
      scanComplete: true,
    })),
    ensure: jest.fn(async (spec: SandboxSpec) => ({
      id: `h-${spec.ownerId}`,
      ownerId: spec.ownerId,
      driver: 'fake',
    })),
    status: jest.fn(async () => 'running'),
    exec: jest.fn(async (_handle: SandboxHandle, command: string, options: any) => {
      options.onDispatch?.();
      return {
        exitCode: 0,
        stdout: `${command}|${options.timeoutSec}|${options.maxOutputBytes}|${JSON.stringify(options.env)}`,
        stderr: '',
        timedOut: false,
        aborted: false,
        truncated: false,
        durationMs: 42,
      };
    }),
    readFile: jest.fn(async () => Buffer.from('x')),
    openReadStream: jest.fn(),
    writeFile: jest.fn(
      async (
        _handle: SandboxHandle,
        _path: string,
        _content: Buffer | string,
        options?: SandboxWriteOptions,
      ) => {
        options?.onDispatch?.();
      },
    ),
    listDir: jest.fn(async (): Promise<SandboxFileEntry[]> => []),
    stop: jest.fn(async (): Promise<void> => undefined),
    destroy: jest.fn(async (): Promise<void> => undefined),
  } as any;
}

const policy = {
  ...readSandboxPolicyFromEnv({}),
  memoryMb: 256,
  cpus: 0.5,
  pidsLimit: 64,
  networkMode: 'none',
  execTimeoutSec: 30,
  maxOutputBytes: 1000,
  idleStopMinutes: 10,
};

describe('SandboxService', () => {
  it('ensures once per owner even under concurrency and applies the resolved policy', async () => {
    const driver = fakeDriver();
    const resolver = { resolve: jest.fn(async () => ({ memoryMb: 1024, env: { PLAN: 'pro' } })) };
    const service = new SandboxService(driver, resolver, undefined, policy, 0);

    const [a, b] = await Promise.all([service.acquire('u1'), service.acquire('u1')]);
    expect(a).toEqual(b);
    expect(driver.ensure).toHaveBeenCalledTimes(1);
    expect(driver.ensure.mock.calls[0][0]).toMatchObject({
      ownerId: 'u1',
      memoryMb: 1024,
      cpus: 0.5,
      networkMode: 'none',
      env: { PLAN: 'pro' },
    });
  });

  it('execs with policy defaults, caps the timeout and meters the duration', async () => {
    const driver = fakeDriver();
    const meter = { record: jest.fn() };
    const service = new SandboxService(driver, undefined, meter, policy, 0);

    const result = await service.exec('u1', 'echo hi', { timeoutSec: 999, env: { X: '1' } });
    expect(result.stdout).toBe('echo hi|30|1000|{"X":"1"}');
    expect(meter.record).toHaveBeenCalledWith('u1', { execMs: 42, command: 'echo hi' });
  });

  it('stops idle sandboxes and re-ensures them on next use', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('u1');
    await service.acquire('u2');

    const stopped = await service.stopIdle(Date.now() + 11 * 60_000);
    expect(stopped.sort()).toEqual(['u1', 'u2']);
    expect(driver.destroy).toHaveBeenCalledTimes(2);

    await service.exec('u1', 'ls');
    expect(driver.ensure).toHaveBeenCalledTimes(3);
    service.onModuleDestroy();
  });

  it('destroys idle visitor sandboxes together with their workspace', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.exec('visitor-abc', 'true');
    await service.exec('user-1', 'true');

    const stopped = await service.stopIdle(Date.now() + policy.idleStopMinutes * 60_000 + 1);

    expect(stopped.sort()).toEqual(['user-1', 'visitor-abc']);
    expect(driver.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'visitor-abc' }),
      { removeWorkspace: true },
    );
    expect(driver.destroy).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'user-1' }), {
      removeWorkspace: true,
    });
    expect(driver.destroy).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the current policy cannot be resolved', async () => {
    const driver = fakeDriver();
    const resolver = {
      resolve: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const service = new SandboxService(driver, resolver, undefined, policy, 0);
    await expect(service.acquire('u1')).rejects.toThrow('策略不可用');
    expect(driver.ensure).not.toHaveBeenCalled();
  });

  it('revalidates actual container policy on every reuse', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('u1');
    (driver.verify as any).mockRejectedValue(new Error('current policy mismatch'));
    await expect(service.exec('u1', 'echo no')).rejects.toThrow('沙箱操作失败');
    expect(driver.exec).not.toHaveBeenCalled();
  });

  it.each([
    ['bytes', { workspaceBytes: policy.workspaceMaxBytes }],
    ['inodes', { workspaceInodes: policy.workspaceMaxInodes }],
    ['disk water', { freeBytes: policy.minFreeBytes - 1 }],
    ['inode water', { freeInodes: policy.minFreeInodes - 1 }],
    ['incomplete scan', { scanComplete: false }],
  ])(
    'rejects writes for %s limits while retaining reads and explicit stop',
    async (_name: string, exceeded: Partial<SandboxResourceUsage>) => {
      const driver = fakeDriver();
      const service = new SandboxService(driver, undefined, undefined, policy, 0);
      await service.acquire('u1');
      const baseline = await driver.inspectResources(
        { id: 'h-u1', ownerId: 'u1', driver: 'fake' },
        100,
      );
      (driver.inspectResources as any).mockResolvedValue({ ...baseline, ...exceeded });
      const onDispatch = jest.fn();
      await expect(service.exec('u1', 'cleanup', { onDispatch })).resolves.toMatchObject({
        exitCode: 0,
      });
      await expect(service.writeFile('u1', 'out/a', 'a', { onDispatch })).rejects.toThrow(
        '额度或存储低水位',
      );
      expect((await service.resourceStatus('u1')).state).toBe('limited');
      expect((await service.readFile('u1', 'out/a')).toString()).toBe('x');
      expect(await service.listDir('u1', 'out')).toEqual([]);
      expect(driver.exec).toHaveBeenCalledTimes(1);
      expect(driver.writeFile).not.toHaveBeenCalled();
      expect(onDispatch).toHaveBeenCalledTimes(1);
      await service.stop('u1');
      expect(driver.stop).toHaveBeenCalledTimes(1);
      expect(driver.destroy).not.toHaveBeenCalled();
    },
  );

  it('reports degraded measurements and rejects execution until measurements recover', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('u1');
    const baseline = await driver.inspectResources(
      { id: 'h-u1', ownerId: 'u1', driver: 'fake' },
      100,
    );
    (driver.inspectResources as any).mockRejectedValue(new Error('probe unavailable'));
    expect((await service.resourceStatus('u1')).state).toBe('degraded');
    const onDispatch = jest.fn();
    await expect(service.exec('u1', 'generate', { onDispatch })).rejects.toThrow('观测不可用');
    expect(onDispatch).not.toHaveBeenCalled();
    expect(driver.exec).not.toHaveBeenCalled();
    (driver.inspectResources as any).mockResolvedValue(baseline);
    await service.exec('u1', 'generate', { onDispatch });
    expect(driver.exec).toHaveBeenCalledTimes(1);
    expect(onDispatch).toHaveBeenCalledTimes(1);
  });

  it('checks after execution and blocks the following write when a command crosses the soft limit', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const baseline = await driver.inspectResources(
      { id: 'h-u1', ownerId: 'u1', driver: 'fake' },
      100,
    );
    driver.exec.mockImplementation(async () => {
      (driver.inspectResources as any).mockResolvedValue({
        ...baseline,
        workspaceBytes: policy.workspaceMaxBytes + 1,
      });
      return { exitCode: 0, durationMs: 10 };
    });
    await expect(service.exec('u1', 'generate')).resolves.toMatchObject({ exitCode: 0 });
    await expect(service.writeFile('u1', 'more', 'bytes')).rejects.toThrow('额度或存储低水位');
    expect(driver.exec).toHaveBeenCalledTimes(1);
  });

  it('reserves capacity atomically across owners and releases it after stop', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(
      driver,
      undefined,
      undefined,
      { ...policy, maxActiveSandboxes: 1 },
      0,
    );
    const attempts = await Promise.allSettled(['a', 'b', 'c'].map(owner => service.acquire(owner)));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(driver.ensure).toHaveBeenCalledTimes(1);
    const winner = driver.ensure.mock.calls[0][0].ownerId;
    await service.stop(winner);
    await service.acquire('next');
    expect(driver.ensure).toHaveBeenCalledTimes(2);
  });

  it('adopts verified running sandboxes on restart for admission and idle stop', async () => {
    const driver = fakeDriver();
    (driver.discover as any).mockResolvedValue([{ id: 'existing', ownerId: 'a', driver: 'fake' }]);
    (driver.ensure as any).mockResolvedValueOnce({ id: 'existing', ownerId: 'a', driver: 'fake' });
    const service = new SandboxService(
      driver,
      undefined,
      undefined,
      { ...policy, maxActiveSandboxes: 1 },
      0,
    );
    await service.onModuleInit();
    await expect(service.acquire('b')).rejects.toThrow('活跃沙箱数量');
    expect(await service.stopIdle(Date.now() + 11 * 60_000)).toEqual(['a']);
    expect(driver.destroy).toHaveBeenCalledWith(
      { id: 'existing', ownerId: 'a', driver: 'fake' },
      { removeWorkspace: true },
    );
    await service.acquire('b');
    expect(driver.ensure).toHaveBeenCalledTimes(2);
  });

  it('charges running containers by their created memory after the plan shrinks', async () => {
    const driver = fakeDriver();
    const tiers: Record<string, number> = { a: 3072, b: 3072 };
    const resolver = {
      resolve: jest.fn(async (account: string) => ({ memoryMb: tiers[account] })),
    };
    driver.ensure.mockImplementation(async (spec: SandboxSpec) => ({
      id: `h-${spec.ownerId}`,
      ownerId: spec.ownerId,
      driver: 'fake',
      resources: {
        memoryMb: spec.memoryMb,
        cpus: spec.cpus,
        workspaceMaxBytes: 1024 ** 3,
        workspaceMaxInodes: 100_000,
      },
    }));
    const service = new SandboxService(
      driver,
      resolver,
      undefined,
      { ...policy, totalMemoryMb: 4096, maxActiveSandboxes: 4, maxAccountSandboxes: 4 },
      0,
    );
    await service.acquire('a');
    tiers.a = 512;
    await service.acquire('a');
    // a 仍按创建时的 3072 MB 占用：3072 + 3072 超过 4096
    await expect(service.acquire('b')).rejects.toThrow('资源额度已满');
    expect(driver.ensure).toHaveBeenCalledTimes(1);
  });

  it('charges adopted containers by their actual memory after a restart', async () => {
    const driver = fakeDriver();
    (driver.discover as any).mockResolvedValue([{ id: 'existing', ownerId: 'a', driver: 'fake' }]);
    (driver.ensure as any).mockResolvedValueOnce({
      id: 'existing',
      ownerId: 'a',
      driver: 'fake',
      resources: {
        memoryMb: 3072,
        cpus: 1,
        workspaceMaxBytes: 1024 ** 3,
        workspaceMaxInodes: 100_000,
      },
    });
    const resolver = {
      resolve: jest.fn(async (account: string) => ({ memoryMb: account === 'a' ? 512 : 3072 })),
    };
    const service = new SandboxService(
      driver,
      resolver,
      undefined,
      { ...policy, totalMemoryMb: 4096, maxActiveSandboxes: 4, maxAccountSandboxes: 4 },
      0,
    );
    await service.onModuleInit();
    await expect(service.acquire('b')).rejects.toThrow('资源额度已满');
  });

  it('does not stop an active command and serializes explicit stop before later acquire', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    let finish!: () => void;
    let began!: () => void;
    const started = new Promise<void>(resolve => {
      began = resolve;
    });
    driver.exec.mockImplementation(async () => {
      began();
      await new Promise<void>(resolve => {
        finish = resolve;
      });
      return { exitCode: 0, durationMs: 1 };
    });
    const execution = service.exec('a', 'long-running');
    await started;
    expect(await service.stopIdle(Date.now() + 100 * 60_000)).toEqual([]);
    const stopping = service.stop('a');
    const acquiring = service.acquire('a');
    expect(driver.stop).not.toHaveBeenCalled();
    finish();
    await Promise.all([execution, stopping, acquiring]);
    expect(driver.stop).toHaveBeenCalledTimes(1);
    expect(driver.ensure).toHaveBeenCalledTimes(2);
  });

  it('caps streamed-output requests at the policy limit', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.exec('u1', 'echo hi', { maxOutputBytes: 100000 });
    expect(driver.exec.mock.calls[0][2].maxOutputBytes).toBe(policy.maxOutputBytes);
  });

  it('does not adopt or stop invalid discovered containers and counts their occupied capacity', async () => {
    const driver = fakeDriver();
    (driver.discover as any).mockResolvedValue([{ id: 'invalid', ownerId: 'a', driver: 'fake' }]);
    (driver.verify as any).mockRejectedValue(new Error('mismatch'));
    const service = new SandboxService(
      driver,
      undefined,
      undefined,
      { ...policy, maxActiveSandboxes: 1 },
      0,
    );
    await service.onModuleInit();
    expect(await service.stopIdle(Date.now() + 100 * 60_000)).toEqual([]);
    await expect(service.acquire('b')).rejects.toThrow('活跃沙箱数量');
    expect(driver.ensure).not.toHaveBeenCalled();
    expect(driver.stop).not.toHaveBeenCalled();
    expect(driver.destroy).not.toHaveBeenCalled();
  });
});

describe('sandbox configuration', () => {
  it.each([
    {},
    { ISDEV: 'false' },
    { ISDEV: ' FALSE ', NODE_ENV: ' development ' },
    { ISDEV: 'true', NODE_ENV: ' PRODUCTION ' },
  ])(
    'enforces production isolation for the actual PM2/environment configuration: %j',
    (markers: Record<string, string>) => {
      expect(() => createSandboxDriverFromEnv({ ...markers, SANDBOX_DRIVER: 'local' })).toThrow(
        '生产环境禁止',
      );
      expect(() =>
        createSandboxDriverFromEnv({ ...markers, SANDBOX_DOCKER_RUNTIME: 'runc' }),
      ).toThrow('runsc');
      // 生产默认要求用户持久磁盘：缺配置拒绝启动，临时工作区必须显式选择
      expect(() => createSandboxDriverFromEnv(markers)).toThrow('SANDBOX_USER_DISK_ROOT');
      expect(
        (createSandboxDriverFromEnv({ ...markers, SANDBOX_USER_STORAGE: 'tmpfs' }) as any).options
          .runtime,
      ).toBe('runsc');
    },
  );

  it('configures user disks only with an explicit local root and a valid storage mode', () => {
    const production = createSandboxDriverFromEnv({
      NODE_ENV: 'production',
      SANDBOX_USER_DISK_ROOT: '/var/lib/99agent/sandbox-disks',
    }) as any;
    expect(production.persistentWorkspaces).toBe(true);
    // 切回 tmpfs 但保留磁盘根目录：新沙箱用临时工作区，旧用户磁盘仍能卸载
    const switched = createSandboxDriverFromEnv({
      NODE_ENV: 'production',
      SANDBOX_USER_STORAGE: 'tmpfs',
      SANDBOX_USER_DISK_ROOT: '/var/lib/99agent/sandbox-disks',
    }) as any;
    expect(switched.persistentWorkspaces).toBe(false);
    expect(switched.options.disk).toBeDefined();
    expect(production.options.disk.workspacePath('user-1')).toMatch(
      /^\/var\/lib\/99agent\/sandbox-disks\/99agent-sbx-\/mnt\/[a-f0-9]{32}\/workspace$/u,
    );
    expect(
      (createSandboxDriverFromEnv({ NODE_ENV: 'production', SANDBOX_USER_STORAGE: 'tmpfs' }) as any)
        .persistentWorkspaces,
    ).toBe(false);
    expect((createSandboxDriverFromEnv({ ISDEV: 'true' }) as any).persistentWorkspaces).toBe(false);
    expect(
      (
        createSandboxDriverFromEnv({
          ISDEV: 'true',
          SANDBOX_USER_DISK_ROOT: '/srv/disks',
        }) as any
      ).persistentWorkspaces,
    ).toBe(true);
    expect(() =>
      createSandboxDriverFromEnv({ ISDEV: 'true', SANDBOX_USER_STORAGE: 'disk' }),
    ).toThrow('SANDBOX_USER_DISK_ROOT');
    expect(() =>
      createSandboxDriverFromEnv({ ISDEV: 'true', SANDBOX_USER_STORAGE: 'volume' }),
    ).toThrow('SANDBOX_USER_STORAGE');
    expect(() =>
      createSandboxDriverFromEnv({
        ISDEV: 'true',
        SANDBOX_USER_DISK_ROOT: '/srv/disks',
        SANDBOX_DOCKER_HOST: '10.0.0.2',
      }),
    ).toThrow('本机 Docker');
    expect(() =>
      createSandboxDriverFromEnv({ ISDEV: 'true', SANDBOX_USER_DISK_ROOT: 'relative/disks' }),
    ).toThrow('绝对路径');
    expect(() =>
      createSandboxDriverFromEnv({
        ISDEV: 'true',
        SANDBOX_USER_DISK_ROOT: '/srv/disks',
        SANDBOX_NAME_PREFIX: '../x',
      }),
    ).toThrow('SANDBOX_NAME_PREFIX');
  });

  it('reads the policy from env with defaults', () => {
    expect(readSandboxPolicyFromEnv({})).toEqual({
      memoryMb: 2048,
      cpus: 1,
      pidsLimit: 256,
      networkMode: 'egress',
      execTimeoutSec: 120,
      maxOutputBytes: 256 * 1024,
      idleStopMinutes: 15,
      workspaceMaxBytes: 1024 ** 3,
      workspaceMaxInodes: 100_000,
      diskMaxBytes: 4096 * 1024 ** 2,
      minFreeBytes: 16 * 1024 ** 2,
      minFreeInodes: 1000,
      maxActiveSandboxes: 4,
      maxAccountSandboxes: 2,
      totalMemoryMb: 4096,
      pendingRetentionHours: 24,
    });
    expect(
      readSandboxPolicyFromEnv({ SANDBOX_MEMORY_MB: '2048', SANDBOX_NETWORK_MODE: 'egress' }),
    ).toMatchObject({ memoryMb: 2048, networkMode: 'egress' });
  });

  it('refuses the local driver in production and defaults docker runtime to runsc there', () => {
    expect(() =>
      createSandboxDriverFromEnv({ SANDBOX_DRIVER: 'local', NODE_ENV: 'production' }),
    ).toThrow('生产环境禁止');
    expect(
      createSandboxDriverFromEnv({
        SANDBOX_DRIVER: 'local',
        SANDBOX_LOCAL_ROOT: '/tmp/x',
        ISDEV: 'true',
      }).kind,
    ).toBe('local');
    const production = createSandboxDriverFromEnv({
      NODE_ENV: 'production',
      SANDBOX_USER_STORAGE: 'tmpfs',
    }) as any;
    expect(production.kind).toBe('docker');
    expect(production.options.runtime).toBe('runsc');
    expect(() =>
      createSandboxDriverFromEnv({ NODE_ENV: 'production', SANDBOX_DOCKER_RUNTIME: '' }),
    ).toThrow('runsc');
    expect(() =>
      createSandboxDriverFromEnv({ NODE_ENV: 'production', SANDBOX_DOCKER_RUNTIME: 'runc' }),
    ).toThrow('runsc');
    const dev = createSandboxDriverFromEnv({ ISDEV: 'true' }) as any;
    expect(dev.options.runtime).toBeUndefined();
    expect(() => createSandboxDriverFromEnv({ SANDBOX_DRIVER: 'firecracker' })).toThrow('未知');
  });
});

describe('conversation lifetime and aggregate admission', () => {
  it('keeps a whole-turn lease while the model is thinking and releases it once', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const lease = await service.beginTurn('user-7:conversation:1');
    expect(await service.stopIdle(Date.now() + 3600_000)).toEqual([]);
    lease.release();
    lease.release();
    expect(await service.stopIdle(Date.now() + 3600_000)).toEqual(['user-7:conversation:1']);
    expect(driver.destroy).toHaveBeenCalledTimes(1);
  });
  it('separates conversations but charges a shared account ceiling', async () => {
    const driver = fakeDriver();
    const resolver = { resolve: jest.fn(async () => ({})) };
    const service = new SandboxService(
      driver,
      resolver,
      undefined,
      { ...policy, maxAccountSandboxes: 1 },
      0,
    );
    await service.acquire('user-7:conversation:1');
    await expect(service.acquire('user-7:conversation:2')).rejects.toThrow('账号或实例');
    await service.acquire('user-8:conversation:2');
    expect(resolver.resolve).toHaveBeenCalledWith('user-7');
    expect(driver.ensure.mock.calls.map((call: [SandboxSpec]) => call[0].ownerId)).toEqual([
      'user-7:conversation:1',
      'user-8:conversation:2',
    ]);
  });
  it('retains failed delivery for a bounded window and retries failed destruction', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('user-7:conversation:1');
    (driver.listDir as any).mockResolvedValue([
      { type: 'file', path: 'pending/t/result.txt', size: 1 },
    ]);
    const start = Date.now() + 3600_000;
    expect(await service.stopIdle(start)).toEqual([]);
    driver.destroy.mockRejectedValueOnce(new Error('synthetic unavailable'));
    expect(await service.stopIdle(start + 25 * 3600_000)).toEqual([]);
    expect(await service.stopIdle(start + 25 * 3600_000)).toEqual(['user-7:conversation:1']);
  });
  it('keeps a sandbox whose workspace cannot be listed only for the bounded window', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('user-7:conversation:1');
    (driver.listDir as any).mockRejectedValue(new Error('synthetic listing failure'));
    const start = Date.now() + 3600_000;
    expect(await service.stopIdle(start)).toEqual([]);
    expect(driver.destroy).not.toHaveBeenCalled();
    expect(await service.stopIdle(start + 25 * 3600_000)).toEqual(['user-7:conversation:1']);
  });
  it('does not create a container for deletion and fences a retired conversation', async () => {
    const driver = fakeDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.retireSession('user-7:conversation:1');
    expect(driver.ensure).not.toHaveBeenCalled();
    await expect(service.exec('user-7:conversation:1', 'true')).rejects.toThrow('会话已删除');
  });
});

describe('discovered sandbox readiness', () => {
  it('retries initialization before admitting a container left running by a failed create', async () => {
    const driver = fakeDriver();
    (driver.discover as any).mockResolvedValue([{ id: 'h-a', ownerId: 'a', driver: 'fake' }]);
    (driver.ensure as any).mockRejectedValueOnce(new Error('initialization unavailable'));
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.onModuleInit();
    expect(service.isResident('a', 'h-a')).toBe(false);
    expect(driver.exec).not.toHaveBeenCalled();
    const lease = await service.beginTurn('a');
    expect(driver.ensure).toHaveBeenCalledTimes(2);
    expect(service.isResident('a', 'h-a')).toBe(true);
    lease.release();
    service.onModuleDestroy();
  });
});

describe('per-user persistent machines', () => {
  function persistentDriver() {
    const driver = fakeDriver() as any;
    driver.persistentWorkspaces = true;
    driver.ensure.mockImplementation(async (spec: SandboxSpec) => ({
      id: `h-${spec.ownerId}`,
      ownerId: spec.ownerId,
      driver: 'fake',
      ...(spec.persistent ? { persistent: true } : {}),
    }));
    return driver;
  }
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => (resolve = done));
    return { promise, resolve };
  }

  it('gives signed-in users one persistent machine sized by the disk policy', async () => {
    const driver = persistentDriver();
    const resolver = { resolve: jest.fn(async () => ({ diskMaxBytes: 8 * 1024 ** 3 })) };
    const service = new SandboxService(driver, resolver, undefined, policy, 0);
    await service.acquire('user-5');
    await service.acquire('visitor-v:conversation:9');
    expect(driver.ensure.mock.calls[0][0]).toMatchObject({
      ownerId: 'user-5',
      persistent: true,
      workspaceMaxBytes: 8 * 1024 ** 3,
    });
    expect(driver.ensure.mock.calls[1][0]).toMatchObject({
      ownerId: 'visitor-v:conversation:9',
      persistent: false,
      workspaceMaxBytes: policy.workspaceMaxBytes,
    });
    expect(service.isPersistentOwner('user-5')).toBe(true);
    expect(service.isPersistentOwner('user-5:conversation:1')).toBe(false);
  });

  it('reclaims idle persistent machines without deleting the disk or waiting for pending files', async () => {
    const driver = persistentDriver();
    driver.listDir.mockResolvedValue([
      { path: 'pending/t1/a.txt', type: 'file', size: 1, mtimeMs: 0 },
    ]);
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('user-5');
    expect(await service.stopIdle(Date.now() + 11 * 60_000)).toEqual(['user-5']);
    expect(driver.listDir).not.toHaveBeenCalled();
    expect(driver.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-5', persistent: true }),
      { removeWorkspace: false },
    );
  });

  it('runs operations from different conversations concurrently and defers idle stop until they end', async () => {
    const driver = persistentDriver();
    const gate = deferred();
    const started: string[] = [];
    driver.exec.mockImplementation(async (_handle: SandboxHandle, command: string) => {
      started.push(command);
      if (command === 'slow') await gate.promise;
      return { exitCode: 0, stdout: command, stderr: '', durationMs: 1 };
    });
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const slow = service.exec('user-5', 'slow');
    await new Promise(resolve => setImmediate(resolve));
    await expect(service.exec('user-5', 'fast')).resolves.toMatchObject({ stdout: 'fast' });
    expect(started).toEqual(['slow', 'fast']);
    expect(await service.stopIdle(Date.now() + 60 * 60_000)).toEqual([]);
    gate.resolve();
    await slow;
    expect(await service.stopIdle(Date.now() + 60 * 60_000)).toEqual(['user-5']);
  });

  it('keeps counting in-flight operations on the same record when the container is replaced', async () => {
    const driver = persistentDriver();
    const gate = deferred();
    driver.exec.mockImplementation(async (_handle: SandboxHandle, command: string) => {
      if (command === 'slow') await gate.promise;
      return { exitCode: 0, stdout: command, stderr: '', durationMs: 1 };
    });
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const slow = service.exec('user-5', 'slow');
    await new Promise(resolve => setImmediate(resolve));
    driver.verify.mockResolvedValueOnce('missing');
    await service.exec('user-5', 'again');
    expect(driver.ensure).toHaveBeenCalledTimes(2);
    expect(await service.stopIdle(Date.now() + 60 * 60_000)).toEqual([]);
    gate.resolve();
    await slow;
    expect(await service.stopIdle(Date.now() + 60 * 60_000)).toEqual(['user-5']);
  });

  it('reclaims legacy per-conversation user containers at discovery without blocking admission', async () => {
    const driver = persistentDriver();
    driver.discover.mockResolvedValue([
      { id: 'legacy', ownerId: 'user-5:conversation:3', driver: 'fake' },
      { id: 'tmpfs-user', ownerId: 'user-6', driver: 'fake' },
    ]);
    const service = new SandboxService(
      driver,
      undefined,
      undefined,
      { ...policy, maxActiveSandboxes: 1 },
      0,
    );
    await service.onModuleInit();
    expect(driver.verify).not.toHaveBeenCalled();
    expect(driver.destroy).toHaveBeenCalledWith(
      { id: 'legacy', ownerId: 'user-5:conversation:3', driver: 'fake' },
      { removeWorkspace: true },
    );
    expect(driver.destroy).toHaveBeenCalledWith(
      { id: 'tmpfs-user', ownerId: 'user-6', driver: 'fake' },
      { removeWorkspace: true },
    );
    await service.acquire('user-5');
    expect(driver.ensure).toHaveBeenCalledTimes(1);
  });

  it('keeps persistent disks when a stopped machine is found after a restart', async () => {
    const driver = persistentDriver();
    const handle = { id: 'old', ownerId: 'user-5', driver: 'fake', persistent: true };
    driver.discover.mockResolvedValue([handle]);
    driver.verify.mockResolvedValue('stopped');
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.onModuleInit();
    expect(driver.destroy).toHaveBeenCalledWith(handle, { removeWorkspace: false });
  });

  it('pauses persistent machines when the host disk is low and lets commands run when only the disk is full', async () => {
    const driver = persistentDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const full = {
      workspaceBytes: policy.diskMaxBytes,
      workspaceInodes: 900_000,
      freeBytes: 0,
      freeInodes: 10,
      scanComplete: true,
    };
    driver.inspectResources.mockResolvedValue(full);
    const status = await service.resourceStatus('user-5');
    expect(status).toMatchObject({ state: 'limited', reason: expect.stringContaining('删除') });
    await expect(service.exec('user-5', 'rm big.bin')).resolves.toMatchObject({ exitCode: 0 });
    await expect(service.writeFile('user-5', 'a', 'b')).rejects.toThrow('磁盘已满');

    driver.inspectResources.mockResolvedValue({
      workspaceBytes: 1,
      workspaceInodes: 900_000,
      freeBytes: 10 * 1024 ** 3,
      freeInodes: 100_000,
      scanComplete: true,
    });
    // 持久磁盘不按临时工作区的 inode 软上限拒绝
    expect((await service.resourceStatus('user-5')).state).toBe('writable');

    driver.inspectResources.mockResolvedValue({ ...full, freeBytes: 1024 ** 3, hostLow: true });
    expect(await service.resourceStatus('user-5')).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('宿主存储空间不足'),
    });
    await expect(service.exec('user-5', 'ls')).rejects.toThrow('宿主存储空间不足');
  });

  it('waits for in-flight operations before an explicit destroy or stop', async () => {
    const driver = persistentDriver();
    const gate = deferred();
    driver.exec.mockImplementation(async (_handle: SandboxHandle, command: string) => {
      if (command === 'slow') await gate.promise;
      return { exitCode: 0, stdout: command, stderr: '', durationMs: 1 };
    });
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const owner = 'visitor-v:conversation:3';
    const slow = service.exec(owner, 'slow');
    await new Promise(resolve => setImmediate(resolve));
    const retired = service.retireSession(owner);
    await new Promise(resolve => setImmediate(resolve));
    expect(driver.destroy).not.toHaveBeenCalled();
    gate.resolve();
    await slow;
    await retired;
    expect(driver.destroy).toHaveBeenCalledTimes(1);

    const second = deferred();
    driver.exec.mockImplementation(async () => {
      await second.promise;
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
    const running = service.exec('user-5', 'slow');
    await new Promise(resolve => setImmediate(resolve));
    const stopping = service.stop('user-5');
    await new Promise(resolve => setImmediate(resolve));
    expect(driver.stop).not.toHaveBeenCalled();
    second.resolve();
    await running;
    await stopping;
    expect(driver.stop).toHaveBeenCalledTimes(1);
  });

  it('waits for open read streams before an explicit stop', async () => {
    const driver = persistentDriver();
    const stream = new PassThrough();
    driver.openReadStream.mockResolvedValue(stream);
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    const opened = await service.openReadStream('user-5', 'out/a.bin');
    expect(opened).toBe(stream);
    const stopping = service.stop('user-5');
    await new Promise(resolve => setImmediate(resolve));
    expect(driver.stop).not.toHaveBeenCalled();
    stream.destroy();
    await stopping;
    expect(driver.stop).toHaveBeenCalledTimes(1);
  });

  it('retries pending disk releases only while the owner has no machine', async () => {
    const driver = persistentDriver();
    const pending = new Set(['user-5', 'user-6']);
    driver.pendingDiskReleases = jest.fn(() => [...pending]);
    driver.retryDiskRelease = jest.fn(async (owner: string) => {
      pending.delete(owner);
    });
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('user-5');
    await service.stopIdle(Date.now());
    expect(driver.retryDiskRelease).toHaveBeenCalledTimes(1);
    expect(driver.retryDiskRelease).toHaveBeenCalledWith('user-6');
    expect([...pending]).toEqual(['user-5']);
  });

  it('marks deleted conversations retired without touching the user machine', async () => {
    const driver = persistentDriver();
    const service = new SandboxService(driver, undefined, undefined, policy, 0);
    await service.acquire('user-5');
    await service.retireSession('user-5:conversation:3');
    expect(service.isSessionRetired('user-5:conversation:3')).toBe(true);
    expect(service.isSessionRetired('user-5:conversation:4')).toBe(false);
    expect(driver.destroy).not.toHaveBeenCalled();
    await expect(service.acquire('user-5')).resolves.toMatchObject({ ownerId: 'user-5' });
  });
});
