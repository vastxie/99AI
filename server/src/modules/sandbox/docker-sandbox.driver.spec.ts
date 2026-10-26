import { spawnSync } from 'node:child_process';
import { Duplex, Readable } from 'node:stream';
import type Docker from 'dockerode';
import DockerClient = require('dockerode');
import {
  DockerSandboxDriver,
  ExecStatusProbe,
  listDirCommand,
  parseFindOutput,
  settledExecInfo,
} from './docker-sandbox.driver';
import { sandboxOwnerKey, type SandboxHandle } from './sandbox.port';
import { DockerEgress } from './docker-egress';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;
declare const beforeEach: any;

/**
 * 最小 dockerode 假件：只实现驱动用到的接口。
 * exec 流用 "O:" / "E:" 前缀区分 stdout / stderr，由假 modem.demuxStream 拆分。
 */
function frame(prefix: 'O:' | 'E:', payload: Buffer | string): Buffer {
  return Buffer.concat([
    Buffer.from(prefix),
    Buffer.isBuffer(payload) ? payload : Buffer.from(payload),
  ]);
}

function fakeDocker() {
  const state: any = {
    containers: new Map<string, any>(),
    networks: new Map<string, any>(),
    nextId: 0,
    volumes: new Map<string, Record<string, string>>(),
    imageId: `sha256:${'a'.repeat(64)}`,
    execs: [] as any[],
    execScript: [] as Array<{
      out?: string;
      err?: string;
      exitCode?: number;
      /** 输出结束后还有几次 inspect 报告仍在运行（模拟 Docker 迟记退出码） */
      runningInspects?: number;
      hang?: boolean;
    }>,
  };

  function makeContainer(id: string, name: string, create: any) {
    const container: any = {
      id,
      name,
      create,
      running: false,
      networks: new Set([
        create.HostConfig.NetworkMode,
        ...Object.keys(create.NetworkingConfig?.EndpointsConfig || {}),
      ]),
      guestNetworks: new Set<string>(),
      inspect: jest.fn(async () => ({
        Id: id,
        Name: `/${name}`,
        Image: create.Image,
        Path: create.Cmd[0],
        State: { Running: container.running },
        Created: '2026-09-16T00:00:00Z',
        Config: { ...create },
        HostConfig: {
          ...create.HostConfig,
          // Docker returns JSON maps in key order, not the request's insertion order.
          Tmpfs: Object.fromEntries(
            Object.entries(create.HostConfig.Tmpfs).sort(([a], [b]) => a.localeCompare(b)),
          ),
        },
        Mounts: [
          ...Object.keys(create.HostConfig.Tmpfs).map(Destination => ({
            Type: 'tmpfs',
            Destination,
            RW: true,
          })),
          ...(create.HostConfig.Mounts || []).map((mount: any) => ({
            Type: mount.Type,
            Source: mount.Source,
            Destination: mount.Target,
            RW: !mount.ReadOnly,
            Propagation: mount.BindOptions?.Propagation,
          })),
        ],
        NetworkSettings: {
          Networks: Object.fromEntries([...container.networks].map(name => [name, {}])),
        },
        ...(container.inspectOverrides || {}),
      })),
      start: jest.fn(async () => {
        container.running = true;
        container.guestNetworks = new Set(container.networks);
      }),
      stop: jest.fn(async () => {
        container.running = false;
      }),
      remove: jest.fn(async () => {
        state.containers.delete(id);
        for (const network of state.networks.values()) delete network.Containers[id];
      }),
      exec: jest.fn(async (options: any) => {
        const scripted = state.execScript.shift() || { out: '', err: '', exitCode: 0 };
        const stdin: Buffer[] = [];
        const replay = (stream: Duplex) => {
          if (scripted.out?.length) stream.push(frame('O:', scripted.out));
          if (scripted.err?.length) stream.push(frame('E:', scripted.err));
          if (!scripted.hang) stream.push(null);
        };
        const exec = {
          options,
          stdin,
          start: jest.fn(async ({ stdin: attachStdin }: { stdin?: boolean } = {}) => {
            const stream = new Duplex({
              read() {},
              write(chunk: Buffer, _encoding: string, callback: () => void) {
                stdin.push(Buffer.from(chunk));
                callback();
              },
              // 附了 stdin 的 exec 要等宿主写完并 end() 才回放输出，和真实容器一致。
              final(callback: () => void) {
                replay(stream);
                callback();
              },
            });
            if (!attachStdin) setImmediate(() => replay(stream));
            return stream;
          }),
          inspect: jest.fn(async () =>
            (scripted.runningInspects ?? 0) > 0 && scripted.runningInspects!--
              ? { ExitCode: null, Running: true }
              : { ExitCode: scripted.exitCode ?? 0, Running: false },
          ),
        };
        state.execs.push(exec);
        return exec;
      }),
    };
    return container;
  }

  const docker: any = {
    state,
    version: jest.fn(async () => ({ Version: '28.5.0', ApiVersion: '1.51' })),
    listNetworks: jest.fn(async ({ filters }: { filters: string }) => {
      const labels = JSON.parse(filters).label || [];
      return [...state.networks.values()].filter((network: any) =>
        labels.every((pair: string) => {
          const i = pair.indexOf('=');
          return network.Labels?.[pair.slice(0, i)] === pair.slice(i + 1);
        }),
      );
    }),
    createNetwork: jest.fn(async (options: Docker.NetworkCreateOptions) => {
      state.networks.set(options.Name, { ...options, Containers: {} });
      return { id: options.Name };
    }),
    getNetwork: jest.fn((name: string) => ({
      inspect: async () => {
        const network = state.networks.get(name);
        if (!network) throw Object.assign(new Error('missing'), { statusCode: 404 });
        return network;
      },
      connect: async ({ Container }: { Container: string }) => {
        const container = state.containers.get(Container);
        if (!container) throw new Error('unknown');
        container.networks.add(name);
        state.networks.get(name).Containers[Container] = { IPv4Address: '172.30.0.2/24' };
      },
      disconnect: async ({ Container }: { Container: string }) => {
        state.containers.get(Container)?.networks.delete(name);
        delete state.networks.get(name).Containers[Container];
      },
      remove: async () => {
        state.networks.delete(name);
      },
    })),
    getImage: jest.fn(() => ({
      inspect: jest.fn(async () => ({ Id: state.imageId, Config: { Env: [] as string[] } })),
    })),
    modem: {
      demuxStream(stream: Readable, out: any, err: any) {
        stream.on('data', (chunk: Buffer) => {
          // 文件内容走同一条流，按字节判前缀，不能经 toString 往返。
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const prefix = buffer.subarray(0, 2).toString('latin1');
          if (prefix === 'O:') out.write(buffer.subarray(2));
          else if (prefix === 'E:') err.write(buffer.subarray(2));
        });
      },
    },
    listContainers: jest.fn(async ({ filters, all }: { filters: string; all: boolean }) => {
      const parsed = JSON.parse(filters);
      const wanted = parsed.name?.[0];
      return [...state.containers.values()]
        .filter(
          (c: any) =>
            (!wanted || c.name === wanted) &&
            (all || c.running) &&
            (parsed.label || []).every((label: string) => {
              const at = label.indexOf('=');
              return c.create.Labels?.[label.slice(0, at)] === label.slice(at + 1);
            }),
        )
        .map((c: any) => ({
          Id: c.id,
          Names: [`/${c.name}`],
          Labels: c.create.Labels,
          Created: Date.parse('2026-09-16T00:00:00Z') / 1000,
        }));
    }),
    createContainer: jest.fn(async (options: any) => {
      const id = `cid-${++state.nextId}`;
      const container = makeContainer(id, options.name, options);
      state.containers.set(id, container);
      for (const name of container.networks) {
        const network = state.networks.get(name);
        if (network)
          network.Containers[id] = {
            IPv4Address: options.Cmd[0] === 'node' ? '172.30.0.2/24' : '172.30.0.3/24',
          };
      }
      return container;
    }),
    getContainer: jest.fn((id: string) => {
      const container =
        state.containers.get(id) || [...state.containers.values()].find(c => c.name === id);
      if (container) return container;
      return {
        inspect: async () => {
          const error: any = new Error('no such container');
          error.statusCode = 404;
          throw error;
        },
        stop: async () => {
          const error: any = new Error('no such container');
          error.statusCode = 404;
          throw error;
        },
        remove: async () => {
          const error: any = new Error('no such container');
          error.statusCode = 404;
          throw error;
        },
      };
    }),
    createVolume: jest.fn(
      async ({ Name, Labels }: { Name: string; Labels: Record<string, string> }) => {
        if (state.volumes.has(Name)) {
          const error: any = new Error('exists');
          error.statusCode = 409;
          throw error;
        }
        state.volumes.set(Name, Labels);
      },
    ),
    getVolume: jest.fn((name: string) => ({
      inspect: async () => {
        if (!state.volumes.has(name))
          throw Object.assign(new Error('missing'), { statusCode: 404 });
        return { Driver: 'local', Options: {}, Labels: state.volumes.get(name) };
      },
      remove: async () => {
        state.volumes.delete(name);
      },
    })),
  };
  return docker;
}

const spec = {
  ownerId: 'User 42',
  memoryMb: 512,
  cpus: 1,
  pidsLimit: 256,
  networkMode: 'none',
  env: { EXTRA: '1' },
};

describe('DockerSandboxDriver', () => {
  let docker: any;
  let driver: DockerSandboxDriver;

  beforeEach(() => {
    docker = fakeDocker();
    driver = new DockerSandboxDriver({
      docker,
      image: '99agent/sandbox:test',
      namePrefix: 'sbx-',
      user: 'sandbox',
      runtime: 'runsc',
    });
  });

  it('builds a locked-down container spec', () => {
    const options = driver.buildCreateOptions(spec, docker.state.imageId);
    expect(options.name).toBe(`sbx-s3-${sandboxOwnerKey(spec.ownerId)}`);
    expect(options.User).toBe('sandbox');
    expect(options.Cmd).toEqual(['/bin/sleep', 'infinity']);
    expect(options.Env).toEqual(expect.arrayContaining(['HOME=/workspace', 'EXTRA=1']));
    expect(options.HostConfig).toMatchObject({
      Runtime: 'runsc',
      NetworkMode: 'none',
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 1e9,
      PidsLimit: 256,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Binds: [],
      ReadonlyRootfs: true,
    });
  });

  it('ensure creates a bounded temporary container once, starts it and prepares the layout', async () => {
    const first = await driver.ensure(spec);
    const second = await driver.ensure(spec);

    expect(docker.createVolume).not.toHaveBeenCalled();
    expect(docker.createContainer.mock.calls[0][0].HostConfig.Tmpfs['/workspace']).toContain(
      'nr_inodes=100000',
    );
    expect(docker.createContainer.mock.calls[0][0].HostConfig.Tmpfs['/workspace']).toContain(
      ',exec,',
    );
    expect(docker.createContainer).toHaveBeenCalledTimes(1);
    expect(first.id).toBe(second.id);
    const container = docker.state.containers.get(first.id);
    expect(container.start).toHaveBeenCalledTimes(1);
    expect(container.exec.mock.calls[0][0].Cmd[2]).toContain('mkdir -p');
    expect(container.exec.mock.calls[0][0].Cmd[2]).toContain('/workspace/out');
    expect(await driver.status(first)).toBe('running');
  });

  it.each(['none', 'egress'])(
    'accepts Docker-reordered tmpfs maps during %s creation and reuse',
    async (networkMode: string) => {
      const policy = { ...spec, networkMode };
      const handle = await driver.ensure(policy);
      const container = docker.state.containers.get(handle.id);
      const info = await container.inspect();
      expect(Object.keys(container.create.HostConfig.Tmpfs)).toEqual(['/workspace', '/tmp']);
      expect(Object.keys(info.HostConfig.Tmpfs)).toEqual(['/tmp', '/workspace']);
      expect(await driver.verify(handle, policy)).toBe('running');
      expect(await driver.ensure(policy)).toEqual(handle);
      expect(container.start).toHaveBeenCalledTimes(1);
      expect(container.remove).not.toHaveBeenCalled();
    },
  );

  it('waits for Docker to record the exit code after the output stream ends', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ out: 'ok\n', exitCode: 0, runningInspects: 2 });
    const result = await driver.exec(handle, 'true');
    expect(result.exitCode).toBe(0);
    expect(docker.state.execs.at(-1).inspect).toHaveBeenCalledTimes(3);
  });

  it('gives up waiting for an exit code within the budget, including slow inspect calls', async () => {
    // 文件传输等终态用它；命令执行一直等到截止（见 host-side deadline 用例）
    const running = { inspect: jest.fn(async () => ({ Running: true, ExitCode: null }) as any) };
    let started = Date.now();
    expect(await settledExecInfo(running, 200)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(running.inspect.mock.calls.length).toBeGreaterThan(1);

    const hanging = { inspect: jest.fn(() => new Promise<any>(() => undefined)) };
    started = Date.now();
    expect(await settledExecInfo(hanging, 200)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('a released status probe withdraws its query, clears its timer and ignores a late answer', async () => {
    let answer: (info: any) => void = () => undefined;
    let request: AbortSignal | undefined;
    // 不理会撤回、之后才回来的查询
    const exec = {
      inspect: jest.fn(({ abortSignal }: { abortSignal?: AbortSignal }) => {
        request = abortSignal;
        return new Promise(resolve => {
          answer = resolve;
        });
      }),
    };
    jest.useFakeTimers();
    try {
      const probe = new ExecStatusProbe(exec as any, 10_000);
      void probe.probe();
      await Promise.resolve();
      expect(exec.inspect).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
      probe.release();
      expect(request?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
      answer({ Running: false, ExitCode: 0 });
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(probe.terminal).toBeUndefined();
      await probe.probe();
      expect(exec.inspect).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('exec wraps the command, demuxes output and maps exit codes', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ out: 'hello\n', err: 'warn\n', exitCode: 0 });
    const onDispatch = jest.fn();

    const result = await driver.exec(handle, 'echo hello', {
      timeoutSec: 7,
      cwd: 'out',
      env: { A: 'b' },
      onDispatch,
    });

    const container = docker.state.containers.get(handle.id);
    const call = container.exec.mock.calls.at(-1)[0];
    expect(call.Cmd[0]).toBe('/bin/bash');
    expect(call.Cmd[2]).toContain('/usr/bin/timeout -s KILL 7s /bin/bash --noprofile --norc -c');
    expect(call.Cmd[2]).toContain(`'echo hello'`);
    expect(call.WorkingDir).toBe('/workspace/out');
    expect(call.Env).toEqual([
      'NO_PROXY=localhost,127.0.0.1,::1',
      'no_proxy=localhost,127.0.0.1,::1',
      'A=b',
      'BASH_ENV=/dev/null',
    ]);
    expect(call.User).toBe('sandbox');
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: 'hello\n',
      stderr: 'warn\n',
      timedOut: false,
    });
    expect(onDispatch).toHaveBeenCalledTimes(1);

    docker.state.execScript.push({ exitCode: 137 });
    const killed = await driver.exec(handle, 'sleep 100');
    expect(killed.timedOut).toBe(true);
  });

  it('keeps loopback off the egress proxy for every command unless the caller overrides it', async () => {
    const handle = await driver.ensure(spec);
    const envOf = () => docker.state.containers.get(handle.id).exec.mock.calls.at(-1)[0].Env;
    docker.state.execScript.push({ exitCode: 0 });
    await driver.exec(handle, 'true');
    expect(envOf()).toEqual([
      'NO_PROXY=localhost,127.0.0.1,::1',
      'no_proxy=localhost,127.0.0.1,::1',
      'BASH_ENV=/dev/null',
    ]);
    docker.state.execScript.push({ exitCode: 0 });
    await driver.exec(handle, 'true', { env: { NO_PROXY: 'internal.test', no_proxy: '' } });
    expect(envOf()).toEqual(['NO_PROXY=internal.test', 'no_proxy=', 'BASH_ENV=/dev/null']);
  });

  it('reports which output stream was cut at the capture limit', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ out: 'x'.repeat(50), err: 'short\n', exitCode: 0 });
    const result = await driver.exec(handle, 'big', { maxOutputBytes: 10 });
    expect(result).toMatchObject({
      truncated: true,
      stdoutTruncated: true,
      stderrTruncated: false,
    });
    expect(result.stderr).toBe('short\n');
  });

  it('keeps the tail of both streams when the caller asks for it', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ out: '0123456789ABCDEF', err: 'abcdefghijklmnop', exitCode: 1 });
    const result = await driver.exec(handle, 'big', { maxOutputBytes: 8, outputTail: true });
    expect(result).toMatchObject({ truncated: true, stdoutTruncated: true, stderrTruncated: true });
    expect(result.stdout).toBe('01\n…（输出超过 8 字节，中间 8 字节未保留）\nABCDEF');
    expect(result.stderr).toBe('ab\n…（输出超过 8 字节，中间 8 字节未保留）\nklmnop');
  });

  describe('host-side deadline and held output', () => {
    // 截止 = 命令超时 + graceMs；取消后提前到 killSettleMs 之后
    const timing = { graceMs: 150, pollMs: 20, drainMs: 60, killSettleMs: 150, killWindowMs: 100 };
    const fast = (overrides: Record<string, number> = {}) =>
      new DockerSandboxDriver({
        docker,
        image: '99agent/sandbox:test',
        namePrefix: 'sbx-',
        user: 'sandbox',
        runtime: 'runsc',
        exitSettleMs: 100,
        execTiming: { ...timing, ...overrides },
      });
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const isKill = (options: any) => String(options?.Cmd?.[2] || '').includes('kill -KILL');
    const killCalls = (handle: any) =>
      docker.state.containers
        .get(handle.id)
        .exec.mock.calls.filter((call: any[]) => isKill(call[0]));

    /**
     * 可控的命令：输出流、主进程状态、启动与结束命令都由用例掌握。
     * state.running 决定状态查询的结果；结束命令启动时调用 onKill
     */
    function controlled(
      handle: any,
      setup: {
        start?: (stream: Duplex) => Promise<any>;
        inspect?: (signal?: AbortSignal) => Promise<any>;
        createKiller?: (options: any) => Promise<void>;
        onKill?: () => void;
      } = {},
    ) {
      const container = docker.state.containers.get(handle.id);
      const state = { running: true, exitCode: 0 };
      const stream = new Duplex({
        read() {},
        write(_chunk: Buffer, _encoding: string, callback: () => void) {
          callback();
        },
      });
      const probes = { calls: 0, inFlight: 0, maxInFlight: 0 };
      const killers: any[] = [];
      const main = {
        start: jest.fn(setup.start ? () => setup.start!(stream) : async () => stream),
        inspect: jest.fn(({ abortSignal }: { abortSignal?: AbortSignal } = {}) => {
          probes.calls++;
          probes.inFlight++;
          probes.maxInFlight = Math.max(probes.maxInFlight, probes.inFlight);
          const work = setup.inspect
            ? setup.inspect(abortSignal)
            : Promise.resolve(
                state.running
                  ? { Running: true, ExitCode: null }
                  : { Running: false, ExitCode: state.exitCode },
              );
          return work.finally(() => probes.inFlight--);
        }),
      };
      container.exec.mockImplementation(async (options: any) => {
        if (!isKill(options)) return main;
        const killer = { options, start: jest.fn(async () => setup.onKill?.()) };
        killers.push(killer);
        await setup.createKiller?.(options);
        return killer;
      });
      return { container, state, stream, main, probes, killers };
    }

    it('stops capturing soon after the main process exits while the output stays open', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      // 主进程已结束（inspect 不在运行），输出流却一直不结束：后台进程继承了输出
      docker.state.execScript.push({ out: 'started\n', exitCode: 0, hang: true });
      const started = Date.now();
      const result = await quick.exec(handle, 'server & echo started', { timeoutSec: 30 });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(result).toMatchObject({ exitCode: 0, outputHeld: true, timedOut: false });
      expect(result.stdout).toBe('started\n');
      // 不杀后台进程，只是不再等它的输出
      expect(killCalls(handle)).toHaveLength(0);
    });

    it('keeps a known exit status at the deadline: stops capturing as held and never kills', async () => {
      // 收尾比截止长：主进程在截止前结束，截止落在收尾期间
      const quick = fast({ drainMs: 5_000 });
      const handle = await quick.ensure(spec);
      const run = controlled(handle);
      setTimeout(() => (run.state.running = false), 80);
      const started = Date.now();
      const result = await quick.exec(handle, 'job & echo started', { timeoutSec: 0.05 });
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(result).toMatchObject({ exitCode: 0, outputHeld: true, timedOut: false });
      await sleep(150);
      expect(killCalls(handle)).toHaveLength(0);
    });

    it('kills the process group at the deadline and reports an unknown outcome without an exit status', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      docker.state.execScript.push({ out: 'busy\n', hang: true, runningInspects: 1_000_000 });
      const started = Date.now();
      await expect(quick.exec(handle, 'stuck', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      // 截止（50 + 150 ms）后再等 killSettleMs（150 ms）
      expect(Date.now() - started).toBeGreaterThanOrEqual(300);
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(killCalls(handle)).toHaveLength(1);
    });

    it('keeps the real exit code when the process ends right after the deadline kill', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      // 截止前一直在运行、输出也不结束；发出结束命令后才拿到终态 137：保留真实退出码，按超时处理
      const run = controlled(handle, {
        onKill: () => {
          run.state.running = false;
          run.state.exitCode = 137;
        },
      });
      const result = await quick.exec(handle, 'stuck', { timeoutSec: 0.05 });
      // 捕获是驱动停的，输出可能不完整
      expect(result).toMatchObject({ exitCode: 137, timedOut: true, outputHeld: true });
      expect(killCalls(handle)).toHaveLength(1);
    });

    it('keeps waiting for the exit status after the output ends, until the deadline', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      // 命令关掉了输出还在跑：输出结束 120 ms 后才退出，超过 exitSettleMs（100 ms）但在截止之前
      const run = controlled(handle);
      run.stream.push(null);
      setTimeout(() => (run.state.running = false), 120);
      const result = await quick.exec(handle, 'exec >&- 2>&-; sleep 0.1', { timeoutSec: 0.05 });
      expect(result).toMatchObject({ exitCode: 0, timedOut: false });
      expect(result.outputHeld).toBeUndefined();
      expect(killCalls(handle)).toHaveLength(0);
    });

    it('kills at the deadline when the exit status never comes after the output ends', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const run = controlled(handle);
      run.stream.push(null);
      const started = Date.now();
      await expect(quick.exec(handle, 'stuck', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(300);
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(killCalls(handle)).toHaveLength(1);
    });

    it('keeps one status query in flight and withdraws a stuck one before asking again', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      let withdrawn = 0;
      const run = controlled(handle, {
        // 每次查询都卡住，直到驱动撤回
        inspect: signal =>
          new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () => {
              withdrawn++;
              reject(new Error('aborted'));
            }),
          ),
      });
      setTimeout(() => run.stream.push(null), 100);
      await expect(quick.exec(handle, 'stuck status', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      expect(run.probes.maxInFlight).toBe(1);
      expect(run.probes.calls).toBeGreaterThan(2);
      // 返回时在途的那一次已经撤回，之后也不再查询
      expect(withdrawn).toBe(run.probes.calls);
      const calls = run.probes.calls;
      await sleep(200);
      expect(run.probes.calls).toBe(calls);
      expect(killCalls(handle)).toHaveLength(1);
    });

    it('retries failed status queries and does not wait on a failing kill', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      let failures = 2;
      const run = controlled(handle, {
        inspect: async () => {
          if (failures-- > 0) throw new Error('daemon busy');
          return { Running: false, ExitCode: 0 };
        },
      });
      const result = await quick.exec(handle, 'server &', { timeoutSec: 30 });
      expect(result).toMatchObject({ exitCode: 0, outputHeld: true });
      expect(run.probes.calls).toBe(3);

      const failing = controlled(handle, {
        createKiller: async () => {
          throw new Error('daemon gone');
        },
      });
      const started = Date.now();
      await expect(quick.exec(handle, 'stuck', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(failing.killers).toHaveLength(1);
    });

    it('withdraws a kill whose creation outlives its window and never starts it late', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      let killRequest: AbortSignal | undefined;
      const run = controlled(handle, {
        // 结束命令的创建不理会撤回，400 ms 后才迟到返回
        createKiller: options => {
          killRequest = options.abortSignal;
          return sleep(400) as Promise<void>;
        },
      });
      await expect(quick.exec(handle, 'stuck', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      await sleep(400);
      expect(killRequest?.aborted).toBe(true);
      expect(run.killers).toHaveLength(1);
      expect(run.killers[0].start).not.toHaveBeenCalled();
    });

    it('does not start a deadline kill once the main process ended while the kill was being created', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const run = controlled(handle, {
        // 结束命令还在创建时，主进程自己结束了
        createKiller: async () => {
          run.state.running = false;
          await sleep(60);
        },
      });
      const result = await quick.exec(handle, 'finishing', { timeoutSec: 0.05 });
      expect(result).toMatchObject({ exitCode: 0, timedOut: false, outputHeld: true });
      await sleep(100);
      expect(run.killers).toHaveLength(1);
      expect(run.killers[0].start).not.toHaveBeenCalled();
    });

    it('a cancel during a pending deadline kill still ends the process group', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const controller = new AbortController();
      const run = controlled(handle, {
        // 截止的结束命令还在创建时用户取消，随后主进程结束；两次创建都在查到终态之后才完成
        createKiller: async options => {
          if (run.killers.length === 1) {
            controller.abort();
            await sleep(20);
            run.state.running = false;
          }
          await sleep(80);
          expect(options.abortSignal).toBeDefined();
        },
      });
      const result = await quick.exec(handle, 'server & sleep 100', {
        timeoutSec: 0.05,
        signal: controller.signal,
      });
      expect(result).toMatchObject({ aborted: true, exitCode: 0 });
      await sleep(150);
      // 截止那次因已有终态不启动，取消自己的那次照样启动
      expect(run.killers).toHaveLength(2);
      expect(run.killers.filter(killer => killer.start.mock.calls.length)).toHaveLength(1);
    });

    it('ends a command whose output stream fails while it still runs, and keeps a known exit status otherwise', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const running = controlled(handle);
      setTimeout(() => running.stream.destroy(new Error('connection reset')), 50);
      await expect(quick.exec(handle, 'busy', { timeoutSec: 30 })).rejects.toThrow(
        'connection reset',
      );
      expect(running.killers).toHaveLength(1);
      await sleep(20);
      expect(running.killers[0].start).toHaveBeenCalled();

      // 主进程已经结束时出错：退出码已知，按停止捕获处理，不结束进程组
      const finished = controlled(handle);
      finished.state.running = false;
      setTimeout(() => finished.stream.destroy(new Error('connection reset')), 40);
      const result = await quick.exec(handle, 'server & echo up', { timeoutSec: 30 });
      expect(result).toMatchObject({ exitCode: 0, outputHeld: true });
      expect(finished.killers).toHaveLength(0);

      // 先出错、终态随后才查到：再查一会儿，拿到终态同样按停止捕获处理
      const racing = controlled(handle, {
        inspect: async () => ({ Running: true, ExitCode: null }),
      });
      setTimeout(() => {
        racing.stream.destroy(new Error('connection reset'));
        racing.main.inspect.mockImplementation(async () => ({ Running: false, ExitCode: 3 }));
      }, 30);
      expect(await quick.exec(handle, 'finishing', { timeoutSec: 30 })).toMatchObject({
        exitCode: 3,
        outputHeld: true,
      });
      expect(racing.killers).toHaveLength(0);
    });

    it('ends the command once when the start request fails after dispatch', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const onDispatch = jest.fn();
      const run = controlled(handle, {
        // Docker 可能已经启动了命令，只是响应连接断了
        start: async () => {
          throw new Error('socket hang up');
        },
      });
      await expect(quick.exec(handle, 'started?', { timeoutSec: 30, onDispatch })).rejects.toThrow(
        'socket hang up',
      );
      expect(onDispatch).toHaveBeenCalledTimes(1);
      expect(run.killers).toHaveLength(1);
    });

    it('withdraws a creation that misses the deadline and never dispatches or starts it', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const container = docker.state.containers.get(handle.id);
      let request: AbortSignal | undefined;
      let lateExec: any;
      container.exec.mockImplementationOnce(
        (options: any) =>
          new Promise(resolve => {
            request = options.abortSignal;
            // 不理会撤回、迟到返回的假件：驱动也不能再启动它
            setTimeout(() => {
              lateExec = { start: jest.fn(), inspect: jest.fn() };
              resolve(lateExec);
            }, 400);
          }),
      );
      const onDispatch = jest.fn();
      const started = Date.now();
      await expect(quick.exec(handle, 'never', { timeoutSec: 0.05, onDispatch })).rejects.toThrow(
        '沙箱命令启动超时，未执行',
      );
      expect(Date.now() - started).toBeLessThan(400);
      expect(request?.aborted).toBe(true);
      expect(onDispatch).not.toHaveBeenCalled();
      await sleep(500);
      expect(lateExec.start).not.toHaveBeenCalled();
      expect(killCalls(handle)).toHaveLength(0);
    });

    it('releases a stream that arrives within the window after the deadline and kills again', async () => {
      const quick = fast({ killWindowMs: 300 });
      const handle = await quick.ensure(spec);
      const late = { destroy: jest.fn() };
      controlled(handle, {
        start: () => new Promise(resolve => setTimeout(() => resolve(late), 300)),
      });
      await expect(quick.exec(handle, 'slow start', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      // 截止时先结束一次（结束命令会等进程编号文件出现），迟到的流到达、确认命令已启动时再结束一次
      expect(killCalls(handle)).toHaveLength(1);
      await sleep(250);
      expect(late.destroy).toHaveBeenCalled();
      expect(killCalls(handle)).toHaveLength(2);
    });

    it('only releases a stream that arrives after the kill window has passed', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const late = { destroy: jest.fn() };
      // 撤回后仍迟到返回的流（不理会撤回的实现）：只释放，不再发结束命令
      controlled(handle, {
        start: () => new Promise(resolve => setTimeout(() => resolve(late), 400)),
      });
      await expect(quick.exec(handle, 'slow start', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      await sleep(500);
      expect(late.destroy).toHaveBeenCalled();
      expect(killCalls(handle)).toHaveLength(1);
    });

    it('withdraws a start request that never returns once the kill window has passed', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      let request: AbortSignal | undefined;
      const run = controlled(handle, {
        // 启动请求一直不返回，撤回时拒绝（与 dockerode 传入 abortSignal 时一致）
        start: () =>
          new Promise((_resolve, reject) => {
            request = run.main.start.mock.calls.at(-1)?.[0]?.abortSignal;
            request?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      });
      await expect(quick.exec(handle, 'stuck start', { timeoutSec: 0.05 })).rejects.toThrow(
        '退出状态未知',
      );
      expect(request?.aborted).toBe(false);
      await sleep(200);
      expect(request?.aborted).toBe(true);
      expect(killCalls(handle)).toHaveLength(1);
    });

    it('cancelling before dispatch withdraws the creation and never runs the command', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const container = docker.state.containers.get(handle.id);
      let request: AbortSignal | undefined;
      container.exec.mockImplementationOnce(
        (options: any) =>
          new Promise((_resolve, reject) => {
            request = options.abortSignal;
            request!.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const controller = new AbortController();
      const onDispatch = jest.fn();
      setTimeout(() => controller.abort(), 20);
      await expect(
        quick.exec(handle, 'never', { timeoutSec: 30, signal: controller.signal, onDispatch }),
      ).rejects.toThrow('沙箱命令已取消，未执行');
      expect(request?.aborted).toBe(true);
      expect(onDispatch).not.toHaveBeenCalled();
      expect(killCalls(handle)).toHaveLength(0);

      // 创建请求不理会撤回、之后才迟到返回：取消仍立即返回，迟到的结果不启动
      let lateExec: any;
      container.exec.mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(() => {
              lateExec = { start: jest.fn(), inspect: jest.fn() };
              resolve(lateExec);
            }, 200),
          ),
      );
      const again = new AbortController();
      setTimeout(() => again.abort(), 20);
      const started = Date.now();
      await expect(
        quick.exec(handle, 'never', { timeoutSec: 30, signal: again.signal, onDispatch }),
      ).rejects.toThrow('沙箱命令已取消，未执行');
      expect(Date.now() - started).toBeLessThan(200);
      await sleep(250);
      expect(lateExec.start).not.toHaveBeenCalled();
      expect(onDispatch).not.toHaveBeenCalled();

      // 已经取消的信号：连创建请求都不发
      const calls = container.exec.mock.calls.length;
      await expect(quick.exec(handle, 'never', { signal: controller.signal })).rejects.toThrow(
        '沙箱命令已取消，未执行',
      );
      expect(container.exec.mock.calls.length).toBe(calls);
    });

    it('cancelling while the start is pending kills before and again after the stream arrives', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const order: string[] = [];
      const run = controlled(handle, {
        start: stream =>
          new Promise(resolve =>
            setTimeout(() => {
              order.push('stream');
              resolve(stream);
            }, 60),
          ),
        onKill: () => {
          order.push('kill');
          // 拿到流之前的结束命令没找到进程（还没写下编号）；拿到流之后的这次才结束了命令
          if (order.includes('stream')) {
            run.state.running = false;
            run.state.exitCode = 137;
            run.stream.push(null);
          }
        },
      });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);
      const result = await quick.exec(handle, 'sleep 100', {
        timeoutSec: 30,
        signal: controller.signal,
      });
      expect(result).toMatchObject({ aborted: true, timedOut: false, exitCode: 137 });
      // 拿到流后立即补发，输出随之自然结束，而不是等到提前的截止才停止捕获
      expect(result.outputHeld).toBeUndefined();
      expect(order).toEqual(['kill', 'stream', 'kill']);
    });

    it('cancelling while running or draining kills the process group once and returns promptly', async () => {
      const quick = fast({ drainMs: 5_000 });
      const handle = await quick.ensure(spec);
      // 运行中取消：结束命令生效，输出随之结束
      const running = controlled(handle, {
        onKill: () => {
          running.state.running = false;
          running.state.exitCode = 137;
          running.stream.push(null);
        },
      });
      const first = new AbortController();
      setTimeout(() => first.abort(), 30);
      expect(
        await quick.exec(handle, 'sleep 100', { timeoutSec: 30, signal: first.signal }),
      ).toMatchObject({ aborted: true, timedOut: false, exitCode: 137 });
      expect(running.killers).toHaveLength(1);

      // 收尾期间取消（主进程已结束、后台进程占着输出）：取消一律发出结束命令；结束脚本只结束主进程还在的组，
      // 这里主进程已经结束，脚本不发信号，输出继续被占着：截止提前到 killSettleMs 之后按停止捕获返回，保留退出码
      const draining = controlled(handle);
      draining.state.running = false;
      draining.state.exitCode = 4;
      const second = new AbortController();
      setTimeout(() => second.abort(), 80);
      let started = Date.now();
      const result = await quick.exec(handle, 'server & echo up', {
        timeoutSec: 30,
        signal: second.signal,
      });
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(result).toMatchObject({ aborted: true, exitCode: 4, outputHeld: true });
      expect(draining.killers).toHaveLength(1);

      // 结束命令不起作用：取消后最多再等两个 killSettleMs，结果未知
      const stuck = controlled(handle);
      const third = new AbortController();
      setTimeout(() => third.abort(), 30);
      started = Date.now();
      await expect(
        quick.exec(handle, 'stuck', { timeoutSec: 30, signal: third.signal }),
      ).rejects.toThrow('退出状态未知');
      expect(Date.now() - started).toBeLessThan(30 + 2 * 150 + 300);
      expect(stuck.killers).toHaveLength(1);
    });

    it('captures nothing and calls back nothing once the result is settled', async () => {
      const quick = fast();
      const handle = await quick.ensure(spec);
      const run = controlled(handle);
      run.state.running = false;
      // 释放请求之后流里仍可能有在途的数据：让假流在释放后继续交付，结果里不出现
      const release = jest.fn();
      run.stream.destroy = release as any;
      run.stream.push(frame('O:', 'early\n'));
      const result = await quick.exec(handle, 'server & echo early', { timeoutSec: 30 });
      run.stream.push(frame('O:', 'late\n'));
      await sleep(50);
      expect(release).toHaveBeenCalled();
      expect(result).toMatchObject({ outputHeld: true, stdout: 'early\n' });
    });

    it('takes delayed tail frames through the real demuxer until it stops capturing', async () => {
      docker.modem.demuxStream = new DockerClient({
        socketPath: '/nonexistent.sock',
      }).modem.demuxStream;
      const quick = fast();
      const handle = await quick.ensure(spec);
      const run = controlled(handle);
      const muxed = (type: 1 | 2, text: string) => {
        const payload = Buffer.from(text);
        const header = Buffer.alloc(8);
        header.writeUInt8(type, 0);
        header.writeUInt32BE(payload.length, 4);
        return Buffer.concat([header, payload]);
      };
      run.stream.destroy = jest.fn() as any;
      run.stream.push(muxed(1, 'head\n'));
      setTimeout(() => (run.state.running = false), 10);
      // 主进程结束后、收尾期间才到的尾帧，报头与正文分两次到（正文是多字节文字）
      const tail = muxed(2, '尾巴\n');
      setTimeout(() => run.stream.push(tail.subarray(0, 5)), 30);
      setTimeout(() => run.stream.push(tail.subarray(5)), 45);
      const result = await quick.exec(handle, 'server & echo head', { timeoutSec: 30 });
      run.stream.push(muxed(1, 'after\n'));
      await sleep(30);
      expect(result).toMatchObject({ outputHeld: true, stdout: 'head\n', stderr: '尾巴\n' });
    });
  });

  it('reads file bytes from an exec stream and refuses missing paths', async () => {
    const handle = await driver.ensure(spec);
    const content = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x0a, 0x41]);
    docker.state.execScript.push({ out: content });

    expect(await driver.readFile(handle, 'out/a.bin')).toEqual(content);
    // 读取流结束时 Docker 还没记下退出码：等到记下再判定，不误报读取失败
    docker.state.execScript.push({ out: content, runningInspects: 2 } as any);
    expect(await driver.readFile(handle, 'out/a.bin')).toEqual(content);
    const container = docker.state.containers.get(handle.id);
    const read = container.exec.mock.calls.at(-1)[0];
    expect(read.AttachStdin).toBe(false);
    expect(read.Cmd[2]).toContain("'out/a.bin'");
    expect(read.Cmd[2]).toContain('timeout -s KILL');

    docker.state.execScript.push({ out: content });
    await expect(driver.readFile(handle, 'out/a.bin', { maxBytes: 3 })).rejects.toThrow('读取上限');
    docker.state.execScript.push({ exitCode: 3 });
    await expect(driver.readFile(handle, 'out/dir')).rejects.toThrow('不是普通文件');
    docker.state.execScript.push({ exitCode: 1 });
    await expect(driver.readFile(handle, 'out/a.bin')).rejects.toThrow('读取失败');
    await expect(driver.readFile(handle, '../x')).rejects.toThrow('越出工作区');
    await expect(driver.readFile(handle, '')).rejects.toThrow('根目录');
  });

  it('reads an empty file as an empty buffer', async () => {
    const handle = await driver.ensure(spec);
    expect(await driver.readFile(handle, 'out/empty.txt')).toEqual(Buffer.alloc(0));
  });

  it('writes file bytes through bounded exec stdin with descriptor-relative path creation', async () => {
    const handle = await driver.ensure(spec);
    const onDispatch = jest.fn();
    const payload = Buffer.from([0x00, 0x01, 0xff, 0x0a]);
    await driver.writeFile(handle, 'out/nested/b.bin', payload, { mode: 0o600, onDispatch });

    const container = docker.state.containers.get(handle.id);
    const write = container.exec.mock.calls.at(-1)[0];
    expect(write.AttachStdin).toBe(true);
    expect(write.Cmd[2]).toContain("'out/nested/b.bin'");
    expect(write.Cmd[2]).toContain("'600'");
    expect(Buffer.concat(docker.state.execs.at(-1).stdin)).toEqual(payload);
    expect(onDispatch).toHaveBeenCalledTimes(1);
  });

  it('fails the write when the container command exits non-zero', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ exitCode: 1 });

    await expect(driver.writeFile(handle, 'out/b.txt', 'hello')).rejects.toThrow('写入失败');
    await expect(driver.writeFile(handle, '', 'hello')).rejects.toThrow('根目录');
  });

  it('bounds a stalled transfer and kills its process group', async () => {
    const handle = await driver.ensure(spec);
    jest.useFakeTimers();
    try {
      docker.state.execScript.push({ hang: true });
      const writing = driver.writeFile(handle, 'out/stalled', 'bytes');
      const rejected = expect(writing).rejects.toThrow('传输超时');
      await jest.advanceTimersByTimeAsync(121000);
      await rejected;
      expect(docker.state.execs.some((e: any) => e.options.Cmd[2].includes('kill -KILL'))).toBe(
        true,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a timeout, not a cancellation, when the transfer never starts', async () => {
    const handle = await driver.ensure(spec);
    const container = docker.state.containers.get(handle.id);
    container.exec.mockImplementationOnce(() => new Promise(() => undefined));
    jest.useFakeTimers();
    try {
      const writing = driver.writeFile(handle, 'out/never', 'bytes');
      const rejected = expect(writing).rejects.toThrow('沙箱文件传输超时');
      await jest.advanceTimersByTimeAsync(121000);
      await rejected;
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a stalled transfer as soon as the host aborts, without waiting for the timeout', async () => {
    const handle = await driver.ensure(spec);
    const kills = () =>
      docker.state.execs.filter((e: any) => e.options.Cmd[2].includes('kill -KILL')).length;

    const writeAbort = new AbortController();
    docker.state.execScript.push({ hang: true });
    const writing = driver.writeFile(handle, 'out/stalled', 'bytes', { signal: writeAbort.signal });
    await new Promise(resolve => setImmediate(resolve));
    writeAbort.abort();
    await expect(writing).rejects.toThrow('沙箱文件传输已取消');
    expect(kills()).toBe(1);

    const readAbort = new AbortController();
    docker.state.execScript.push({ hang: true });
    const reading = driver.readFile(handle, 'out/stalled', { signal: readAbort.signal });
    await new Promise(resolve => setImmediate(resolve));
    readAbort.abort();
    await expect(reading).rejects.toThrow('沙箱文件传输已取消');
    expect(kills()).toBe(2);

    // 已经取消的信号不再启动传输
    const execs = docker.state.execs.length;
    await expect(
      driver.writeFile(handle, 'out/x', 'y', { signal: AbortSignal.abort() }),
    ).rejects.toThrow('沙箱文件传输已取消');
    expect(docker.state.execs.length).toBe(execs);
  });

  it('kills an unfinished read when the consumer destroys the stream', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ out: 'partial', hang: true });
    const stream = await driver.openReadStream(handle, 'out/partial');
    stream.destroy();
    await new Promise(resolve => setImmediate(resolve));
    expect(docker.state.execs.some((e: any) => e.options.Cmd[2].includes('kill -KILL'))).toBe(true);
  });

  it.each(['read', 'write'])(
    'kills the transfer when %s demultiplexing throws',
    async (action: string) => {
      const handle = await driver.ensure(spec);
      docker.state.execScript.push({ hang: true });
      docker.modem.demuxStream = () => {
        throw new Error('synthetic internal failure');
      };
      await expect(
        action === 'read'
          ? driver.openReadStream(handle, 'out/file')
          : driver.writeFile(handle, 'out/file', 'data'),
      ).rejects.toThrow(action === 'read' ? '读取失败' : '写入失败');
      expect(docker.state.execs.some((e: any) => e.options.Cmd[2].includes('kill -KILL'))).toBe(
        true,
      );
    },
  );

  it('lists directories via find and parses the output', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({
      out: 'd\t4096\t1700000000.5\t/workspace/out/dir\0f\t12\t1700000001.25\t/workspace/out/a b.txt\0f\t3\t1700000002\t/workspace/out/line\nbreak.png\0',
    });
    const entries = await driver.listDir(handle, 'out');
    expect(entries).toEqual([
      { path: 'out/dir', type: 'dir', size: 4096, mtimeMs: 1700000000500 },
      { path: 'out/a b.txt', type: 'file', size: 12, mtimeMs: 1700000001250 },
      { path: 'out/line\nbreak.png', type: 'file', size: 3, mtimeMs: 1700000002000 },
    ]);
    expect(parseFindOutput('l\t0\t1\t/workspace/x\0', 10)[0].type).toBe('symlink');
    // head 多取一条用于判断截断：解析结果封顶 maxEntries，含换行的文件名只算一条
    const records = Array.from({ length: 4 }, (_, i) => `f\t1\t1\t/workspace/out/n\n${i}\0`).join(
      '',
    );
    expect(parseFindOutput(records, 3).map(entry => entry.path)).toEqual([
      'out/n\n0',
      'out/n\n1',
      'out/n\n2',
    ]);
  });

  it('lists a missing directory as empty but surfaces failed directory queries', async () => {
    const handle = await driver.ensure(spec);
    docker.state.execScript.push({ out: '', exitCode: 0 });
    await expect(driver.listDir(handle, 'artifacts/turn_x')).resolves.toEqual([]);
    const command = docker.state.execs.at(-1).options.Cmd.join(' ');
    expect(command).toContain('if [ -d ');
    expect(command).toContain('/workspace/artifacts/turn_x');
    expect(command).toContain('/usr/bin/head -z -n 501');
    // 内部命令用绝对路径：工作区里可写的 PATH 目录放了同名程序也顶替不了
    expect(command).toContain('then /usr/bin/find ');
    docker.state.execScript.push({ out: '', exitCode: 3 });
    await expect(driver.listDir(handle, 'artifacts/turn_x')).rejects.toThrow('读取沙箱目录失败');
  });

  // 用 bash 函数替身代替 find / head 真实执行生成的命令（绝对路径换回命令名才能被函数替身接管）：
  // 管道两段的状态都要检查，只放过取满后的 SIGPIPE
  it.each([
    ['a complete listing', 0, 0, 0],
    ['a listing cut off by head (find gets SIGPIPE)', 141, 0, 0],
    ['a find traversal error', 1, 0, 3],
    ['a head failure', 0, 1, 3],
    ['head killed after cutting find off', 141, 137, 3],
  ])(
    'listDir command exits %#: %s',
    (_label: string, findExit: number, headExit: number, expected: number) => {
      const stubs = `find() { printf 'f\\t1\\t1\\t/x\\0'; return ${findExit}; }; head() { cat; return ${headExit}; };`;
      const result = spawnSync(
        '/bin/bash',
        [
          '--noprofile',
          '--norc',
          '-c',
          `${stubs}\n${listDirCommand('/', 10, true)
            .replace('/usr/bin/find ', 'find ')
            .replace('/usr/bin/head ', 'head ')}`,
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(expected);
      if (expected === 0) expect(result.stdout).toBe('f\t1\t1\t/x\0');
    },
  );

  it('listDir command reports a missing directory as an empty listing', () => {
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-c', listDirCommand('/nonexistent-99agent-listdir', 10, true)],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('stop and destroy tolerate missing containers and does not create or delete legacy volumes', async () => {
    const handle = await driver.ensure(spec);
    await driver.stop(handle);
    expect(await driver.status(handle)).toBe('stopped');
    await driver.destroy(handle, { removeWorkspace: true });
    expect(docker.state.volumes.size).toBe(0);
    expect(await driver.status(handle)).toBe('missing');

    const ghost: SandboxHandle = { id: 'ghost', ownerId: 'x', driver: 'docker' };
    await expect(driver.stop(ghost)).resolves.toBeUndefined();
    await expect(driver.destroy(ghost)).resolves.toBeUndefined();
  });

  it.each([
    [
      'missing platform label',
      (c: any) => {
        delete c.create.Labels['99agent.sandbox'];
      },
    ],
    [
      'schema',
      (c: any) => {
        c.create.Labels['99agent.sandbox.schema'] = '0';
      },
    ],
    [
      'fingerprint',
      (c: any) => {
        c.create.Labels['99agent.sandbox.fingerprint'] = 'invalid';
      },
    ],
    [
      'runtime',
      (c: any) => {
        c.create.HostConfig.Runtime = 'runc';
      },
    ],
    [
      'network',
      (c: any) => {
        c.create.HostConfig.NetworkMode = 'host';
      },
    ],
    [
      'memory',
      (c: any) => {
        c.create.HostConfig.Memory *= 2;
      },
    ],
    [
      'swap',
      (c: any) => {
        c.create.HostConfig.MemorySwap = -1;
      },
    ],
    [
      'CPU',
      (c: any) => {
        c.create.HostConfig.NanoCpus = 0;
      },
    ],
    [
      'PID',
      (c: any) => {
        c.create.HostConfig.PidsLimit = 0;
      },
    ],
    [
      'privileged',
      (c: any) => {
        c.create.HostConfig.Privileged = true;
      },
    ],
    [
      'capability',
      (c: any) => {
        c.create.HostConfig.CapAdd = ['SYS_ADMIN'];
      },
    ],
    [
      'no-new-privileges',
      (c: any) => {
        c.create.HostConfig.SecurityOpt = [];
      },
    ],
    [
      'read-only root',
      (c: any) => {
        c.create.HostConfig.ReadonlyRootfs = false;
      },
    ],
    [
      'root user',
      (c: any) => {
        c.create.User = 'root';
      },
    ],
    [
      'startup command',
      (c: any) => {
        c.create.Cmd = ['sleep', 'infinity'];
      },
    ],
    [
      'command argument order',
      (c: any) => {
        c.inspectOverrides = { Config: { ...c.create, Cmd: ['infinity', '/bin/sleep'] } };
      },
    ],
    [
      'missing workspace tmpfs',
      (c: any) => {
        delete c.create.HostConfig.Tmpfs['/workspace'];
      },
    ],
    [
      'missing temporary directory tmpfs',
      (c: any) => {
        delete c.create.HostConfig.Tmpfs['/tmp'];
      },
    ],
    ...[null, [], { '/workspace': 1024, '/tmp': false }].map(value => [
      `invalid tmpfs map ${JSON.stringify(value)}`,
      (c: any) => {
        c.inspectOverrides = { HostConfig: { ...c.create.HostConfig, Tmpfs: value } };
      },
    ]),
    [
      'extra tmpfs mount',
      (c: any) => {
        c.create.HostConfig.Tmpfs['/extra'] = 'rw,size=1m';
      },
    ],
    [
      'workspace tmpfs capacity',
      (c: any) => {
        c.create.HostConfig.Tmpfs['/workspace'] = c.create.HostConfig.Tmpfs['/workspace'].replace(
          'size=1073741824',
          'size=2147483648',
        );
      },
    ],
    [
      'workspace tmpfs ownership',
      (c: any) => {
        c.create.HostConfig.Tmpfs['/workspace'] = c.create.HostConfig.Tmpfs['/workspace'].replace(
          'uid=1000',
          'uid=0',
        );
      },
    ],
    [
      'workspace execution policy',
      (c: any) => {
        c.create.HostConfig.Tmpfs['/workspace'] = c.create.HostConfig.Tmpfs['/workspace'].replace(
          ',exec',
          '',
        );
      },
    ],
    [
      'temporary directory execution policy',
      (c: any) => {
        c.create.HostConfig.Tmpfs['/tmp'] = c.create.HostConfig.Tmpfs['/tmp'].replace(
          ',noexec',
          '',
        );
      },
    ],
    [
      'extra mount',
      (c: any) => {
        c.inspectOverrides = { Mounts: [{ Type: 'bind', Destination: '/workspace', RW: true }] };
      },
    ],
    [
      'extra network',
      (c: any) => {
        c.inspectOverrides = { NetworkSettings: { Networks: { none: {}, bridge: {} } } };
      },
    ],
  ])(
    'refuses actual %s drift without starting, replacing or deleting anything',
    async (_name: string, mutate: (container: unknown) => void) => {
      const handle = await driver.ensure(spec);
      const container = docker.state.containers.get(handle.id);
      await driver.stop(handle);
      container.start.mockClear();
      mutate(container);
      await expect(driver.ensure(spec)).rejects.toThrow('基线不一致');
      expect(container.start).not.toHaveBeenCalled();
      expect(container.remove).not.toHaveBeenCalled();
      expect(docker.createContainer).toHaveBeenCalledTimes(1);
      expect(docker.state.volumes.size).toBe(0);
    },
  );

  it('pins image identity and refuses a changed tag or tampered resources', async () => {
    const handle = await driver.ensure(spec);
    expect(docker.createContainer.mock.calls[0][0].Image).toBe(docker.state.imageId);
    const container = docker.state.containers.get(handle.id);
    const info = await container.inspect();
    container.inspectOverrides = { HostConfig: { ...info.HostConfig, NanoCpus: 2e9 } };
    await expect(driver.verify(handle, spec)).rejects.toThrow('基线不一致');
    await expect(driver.verify(handle, { ...spec, cpus: 2 })).rejects.toThrow('基线不一致');
    container.inspectOverrides = undefined;
    docker.state.imageId = `sha256:${'b'.repeat(64)}`;
    await expect(driver.verify(handle, spec)).rejects.toThrow('基线不一致');
    expect(docker.createContainer).toHaveBeenCalledTimes(1);
  });

  it('accepts other created resources but never relaxes the security fields', async () => {
    const handle = await driver.ensure(spec);
    const container = docker.state.containers.get(handle.id);
    const info = await container.inspect();
    for (const drift of [{ Runtime: 'runc' }, { Privileged: true }, { NetworkMode: 'host' }]) {
      // 资源与指纹之外再改任何安全字段，都不会因为「按创建值校验」而被接受
      container.inspectOverrides = {
        HostConfig: { ...info.HostConfig, Memory: 2048 * 1024 * 1024, ...drift },
      };
      await expect(driver.verify(handle, spec)).rejects.toThrow('基线不一致');
    }
  });

  it('keeps a container on the resources it was created with until it is recreated', async () => {
    const tier = { ...spec, memoryMb: 1024, cpus: 2.01, workspaceMaxBytes: 64 * 1024 * 1024 };
    const handle = await driver.ensure(spec);
    const created = {
      memoryMb: 512,
      cpus: 1,
      workspaceMaxBytes: 1024 ** 3,
      workspaceMaxInodes: 100000,
    };
    expect(handle.resources).toEqual(created);
    await expect(driver.verify(handle, tier)).resolves.toBe('running');
    // 运行中的容器被接管时报告的是它自己的创建值，不是新档位
    await expect(driver.ensure(tier)).resolves.toMatchObject({ id: handle.id, resources: created });
    expect(docker.createContainer).toHaveBeenCalledTimes(1);

    await driver.stop(handle);
    const next = await driver.ensure(tier);
    expect(next.id).not.toBe(handle.id);
    expect(next.resources).toMatchObject({ memoryMb: 1024, cpus: 2.01 });
    const host = docker.createContainer.mock.calls[1][0].HostConfig;
    expect(host).toMatchObject({ Memory: 1024 * 1024 * 1024, NanoCpus: 2_010_000_000 });
    expect(host.Tmpfs['/workspace']).toContain(`size=${64 * 1024 * 1024},`);
    await expect(driver.verify(next, spec)).resolves.toBe('running');
  });

  it('discovers running and stopped current platform resources after driver restart', async () => {
    const current = await driver.ensure(spec);
    const stopped = await driver.ensure({ ...spec, ownerId: 'stopped' });
    await driver.stop(stopped);
    const old = await driver.ensure({ ...spec, ownerId: 'unknown' });
    docker.state.containers.get(old.id).create.Labels['99agent.sandbox.schema'] = '0';
    const restarted = new DockerSandboxDriver({
      docker,
      image: '99agent/sandbox:test',
      namePrefix: 'sbx-',
      user: 'sandbox',
      runtime: 'runsc',
    });
    // 发现只列出容器身份；实际资源由接管时的 ensure 读取
    const identity = ({ resources: _resources, ...rest }: any) => rest;
    expect(await restarted.discover()).toEqual([current, stopped].map(identity));
    expect(await restarted.verify(current, spec)).toBe('running');
    expect(docker.createContainer).toHaveBeenCalledTimes(3);
  });

  it('never adopts an unlabelled existing volume or colliding owner name', async () => {
    expect(driver.containerName('a/b')).not.toBe(driver.containerName('a_b'));
    docker.state.volumes.set(`sbx-${sandboxOwnerKey(spec.ownerId)}-ws`, {});
    await expect(driver.ensure(spec)).resolves.toMatchObject({ driver: 'docker' });
    expect(docker.createContainer).toHaveBeenCalledTimes(1);
    expect(docker.createVolume).not.toHaveBeenCalled();
    expect(docker.state.volumes.size).toBe(1);
  });

  it('uses a bounded isolated capacity probe and rejects failed or malformed measurements', async () => {
    const handle = await driver.ensure(spec);
    const usage = {
      workspaceBytes: 123,
      workspaceInodes: 4,
      freeBytes: 10000,
      freeInodes: 99,
      scanComplete: true,
    };
    docker.state.execScript.push({ out: JSON.stringify(usage) });
    expect(await driver.inspectResources(handle, 50)).toEqual(usage);
    const command = docker.state.containers.get(handle.id).exec.mock.calls.at(-1)[0].Cmd[2];
    expect(command).toContain('/usr/bin/python3 -I -c');
    expect(command).toContain('lstat');
    docker.state.execScript.push({ exitCode: 1 });
    await expect(driver.inspectResources(handle, 50)).rejects.toThrow('观测失败');
    docker.state.execScript.push({ out: JSON.stringify({ ...usage, freeBytes: -1 }) });
    await expect(driver.inspectResources(handle, 50)).rejects.toThrow('观测失败');
  });
});

describe('isolated Docker egress wiring', () => {
  it('starts a separate proxy with both guest interfaces before each session and preserves its peer', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const a = await driver.ensure({
      ...spec,
      ownerId: 'user-7:conversation:1',
      networkMode: 'egress',
    });
    const b = await driver.ensure({
      ...spec,
      ownerId: 'user-7:conversation:2',
      networkMode: 'egress',
    });
    const proxies = [...docker.state.containers.values()].filter(
      (c: any) => c.create.Cmd[0] === 'node',
    );
    expect(proxies).toHaveLength(2);
    for (const proxy of proxies) {
      expect(proxy.guestNetworks.size).toBe(2);
      expect(proxy.guestNetworks).toEqual(proxy.networks);
      expect(proxy.start).toHaveBeenCalledTimes(1);
    }
    const first = docker.state.containers.get(a.id).create;
    const second = docker.state.containers.get(b.id).create;
    expect(first.HostConfig.NetworkMode).not.toBe(second.HostConfig.NetworkMode);
    expect(first.HostConfig.Dns).toEqual(['127.0.0.1']);
    expect(first.Env).toContain('HTTPS_PROXY=http://172.30.0.2:3128');
    // 回环例外只加在每条命令的环境里：创建参数参与指纹，这里必须保持为空
    expect(first.Env).toEqual(expect.arrayContaining(['NO_PROXY=', 'no_proxy=']));
    const network = docker.state.networks.get(first.HostConfig.NetworkMode);
    expect(network).toMatchObject({
      Internal: true,
      EnableIPv6: false,
      Options: { 'com.docker.network.bridge.gateway_mode_ipv4': 'isolated' },
    });
    expect(await driver.verify(a, { ...spec, ownerId: a.ownerId, networkMode: 'egress' })).toBe(
      'running',
    );
    await driver.destroy(a);
    expect(docker.state.networks.has(first.HostConfig.NetworkMode)).toBe(false);
    expect(docker.state.containers.has(b.id)).toBe(true);
    expect(docker.state.containers.has(proxies[0].id)).toBe(false);
    expect(docker.state.containers.has(proxies[1].id)).toBe(true);
    expect(proxies[1].start).toHaveBeenCalledTimes(1);
    expect(proxies[1].stop).not.toHaveBeenCalled();
    expect(docker.state.networks.size).toBe(2);
  });
  it('fails closed on unsupported engines and network gateway drift', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    docker.version.mockResolvedValueOnce({ Version: '27.0.0', ApiVersion: '1.47' });
    await expect(driver.ensure({ ...spec, networkMode: 'egress' })).rejects.toThrow('Docker 28+');
    expect(docker.createContainer).not.toHaveBeenCalled();
    const handle = await driver.ensure({ ...spec, networkMode: 'egress' });
    const name = docker.state.containers.get(handle.id).create.HostConfig.NetworkMode;
    docker.state.networks.get(name).Options = {};
    await expect(driver.verify(handle, { ...spec, networkMode: 'egress' })).rejects.toThrow();
  });
  it('recreates stopped tmpfs containers with a new generation and no legacy volume', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const old = await driver.ensure(spec);
    await driver.stop(old);
    const current = await driver.ensure(spec);
    expect(current.id).not.toBe(old.id);
    expect(docker.state.volumes.size).toBe(0);
  });
});

describe('Docker managed resource recovery', () => {
  it('recognizes a missing container before looking up its removed network', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const egressSpec = { ...spec, networkMode: 'egress' };
    const old = await driver.ensure(egressSpec);
    const net = docker.state.containers.get(old.id).create.HostConfig.NetworkMode;
    await driver.destroy(old);
    expect(docker.state.networks.has(net)).toBe(false);
    expect(await driver.verify(old, egressSpec)).toBe('missing');
    expect((await driver.ensure(egressSpec)).id).not.toBe(old.id);
  });
  it('starts a stopped verified proxy but rejects a stopped proxy with policy drift', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const egressSpec = { ...spec, networkMode: 'egress' };
    const handle = await driver.ensure(egressSpec);
    const proxy: any = [...docker.state.containers.values()].find(
      (c: any) => c.name === `sbx-s3-egress-${sandboxOwnerKey(spec.ownerId)}`,
    );
    await proxy.stop();
    expect(await driver.verify(handle, egressSpec)).toBe('running');
    expect(proxy.running).toBe(true);
    await proxy.stop();
    proxy.create.HostConfig.Privileged = true;
    await expect(driver.verify(handle, egressSpec)).rejects.toThrow();
    expect(proxy.running).toBe(false);
  });
});

describe('Docker session creation rollback', () => {
  it.each(['create', 'start', 'initialize'])(
    'removes this session resources after %s fails and can retry',
    async (failure: string) => {
      const docker = fakeDocker();
      const driver = new DockerSandboxDriver({
        docker,
        image: 'sandbox',
        namePrefix: 'sbx-',
        runtime: 'runsc',
        user: 'sandbox',
      });
      const create = docker.createContainer.getMockImplementation();
      let injected = false;
      docker.createContainer.mockImplementation(async (options: Docker.ContainerCreateOptions) => {
        const isSession = options.Cmd![0] === '/bin/sleep';
        if (isSession && !injected && failure === 'create') {
          injected = true;
          throw new Error('synthetic create failure');
        }
        const container = await create(options);
        if (isSession && !injected) {
          injected = true;
          if (failure === 'start')
            container.start.mockRejectedValueOnce(new Error('synthetic start failure'));
          if (failure === 'initialize') docker.state.execScript.push({ exitCode: 1 });
        }
        return container;
      });
      const connected = { ...spec, networkMode: 'egress' };
      await expect(driver.ensure(connected)).rejects.toThrow();
      expect(docker.state.containers.size).toBe(0);
      expect(docker.state.networks.size).toBe(0);
      await expect(driver.ensure(connected)).resolves.toHaveProperty('id');
    },
  );

  it('cleans precisely owned orphan networks after process interruption, but refuses foreign endpoints', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const connected = { ...spec, networkMode: 'egress' };
    const first = await driver.ensure(connected);
    const networkName = docker.state.containers.get(first.id).create.HostConfig.NetworkMode;
    await docker.getContainer(first.id).remove();
    expect(docker.state.networks.has(networkName)).toBe(true);
    await driver.discover();
    expect(docker.state.networks.has(networkName)).toBe(false);
    const second = await driver.ensure(connected);
    await docker.getContainer(second.id).remove();
    docker.state.networks.get(networkName).Containers.foreign = { IPv4Address: '172.30.0.9/24' };
    await expect(driver.discover()).rejects.toThrow();
    expect(docker.state.networks.has(networkName)).toBe(true);
  });
});

describe('per-session proxy failure isolation', () => {
  it.each(['proxy-create', 'proxy-start', 'second-network', 'post-create-inspect'])(
    'rolls back owned resources after %s and leaves a live peer unchanged',
    async (failure: string) => {
      const docker = fakeDocker();
      const driver = new DockerSandboxDriver({
        docker,
        image: 'sandbox',
        namePrefix: 'sbx-',
        runtime: 'runsc',
        user: 'sandbox',
      });
      const live = await driver.ensure({ ...spec, ownerId: 'live', networkMode: 'egress' });
      const peerIds = [...docker.state.containers.keys()];
      const peerNetworks = [...docker.state.networks.keys()];
      const getNetwork = docker.getNetwork.getMockImplementation();
      let inspectFailed = false;
      docker.getNetwork.mockImplementation((name: string) => {
        const network = getNetwork(name);
        const inspect = network.inspect;
        network.inspect = async () => {
          if (
            failure === 'post-create-inspect' &&
            !inspectFailed &&
            name.includes(sandboxOwnerKey('failed')) &&
            docker.state.networks.has(name)
          ) {
            inspectFailed = true;
            throw new Error('synthetic network inspect');
          }
          return inspect();
        };
        return network;
      });
      const create = docker.createContainer.getMockImplementation();
      docker.createContainer.mockImplementation(async (options: any) => {
        if (options.Cmd[0] === 'node' && failure === 'proxy-create')
          throw new Error('synthetic proxy create');
        const container = await create(options);
        if (options.Cmd[0] === 'node' && failure === 'proxy-start')
          container.start.mockRejectedValueOnce(new Error('synthetic proxy start'));
        return container;
      });
      const createNetwork = docker.createNetwork.getMockImplementation();
      docker.createNetwork.mockImplementation(async (options: any) => {
        if (options.Internal && failure === 'second-network')
          throw new Error('synthetic network create');
        return createNetwork(options);
      });
      await expect(
        driver.ensure({ ...spec, ownerId: 'failed', networkMode: 'egress' }),
      ).rejects.toThrow();
      expect([...docker.state.containers.keys()]).toEqual(peerIds);
      expect([...docker.state.networks.keys()]).toEqual(peerNetworks);
      expect(docker.state.containers.get(live.id).running).toBe(true);
    },
  );

  it('stops only the matching proxy and rejects an unexpected outbound endpoint before cleanup', async () => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const a = await driver.ensure({ ...spec, ownerId: 'a', networkMode: 'egress' });
    const b = await driver.ensure({ ...spec, ownerId: 'b', networkMode: 'egress' });
    const proxyA = docker.getContainer(`sbx-s3-egress-${sandboxOwnerKey('a')}`);
    const proxyB = docker.getContainer(`sbx-s3-egress-${sandboxOwnerKey('b')}`);
    await driver.stop(a);
    expect(proxyA.running).toBe(false);
    expect(proxyB.running).toBe(true);
    await docker.getContainer(a.id).remove();
    const outbound = docker.state.networks.get(proxyA.create.HostConfig.NetworkMode);
    outbound.Containers.foreign = { IPv4Address: '172.30.0.99/24' };
    await expect(driver.discover()).rejects.toThrow();
    expect(docker.state.containers.has(proxyA.id)).toBe(true);
    expect(docker.state.containers.has(b.id)).toBe(true);
  });
});

it('serializes repeated setup for one owner without sharing another owner proxy', async () => {
  const docker = fakeDocker();
  const egress = new DockerEgress(docker, { image: 'egress', prefix: 'sbx-', runtime: 'runsc' });
  const [a, again, b] = await Promise.all([
    egress.ensure('a'),
    egress.ensure('a'),
    egress.ensure('b'),
  ]);
  expect(again).toEqual(a);
  expect(b.network).not.toBe(a.network);
  expect(docker.createContainer).toHaveBeenCalledTimes(2);
  for (const proxy of docker.state.containers.values()) {
    expect(proxy.guestNetworks.size).toBe(2);
    expect(proxy.start).toHaveBeenCalledTimes(1);
  }
  await egress.cleanupOrphans(new Set(['b']));
  expect(docker.state.containers.size).toBe(1);
  expect(docker.state.networks.size).toBe(2);
  expect(await egress.route('b')).toEqual(b);
});

it.each(['nat-unprotected', 'routed', 'extra-option'])(
  'preserves the live workspace when outbound gateway drifts to %s',
  async (mode: string) => {
    const docker = fakeDocker();
    const driver = new DockerSandboxDriver({
      docker,
      image: 'sandbox',
      namePrefix: 'sbx-',
      runtime: 'runsc',
      user: 'sandbox',
    });
    const handle = await driver.ensure({ ...spec, networkMode: 'egress' });
    const proxy = docker.getContainer(`sbx-s3-egress-${sandboxOwnerKey(spec.ownerId)}`);
    const outbound = docker.state.networks.get(proxy.create.HostConfig.NetworkMode);
    if (mode === 'extra-option')
      outbound.Options['com.docker.network.bridge.trusted_host_interfaces'] = 'eth0';
    else outbound.Options['com.docker.network.bridge.gateway_mode_ipv4'] = mode;
    await expect(driver.destroy(handle)).rejects.toThrow();
    expect(docker.state.containers.has(handle.id)).toBe(true);
    expect(docker.state.containers.has(proxy.id)).toBe(true);
  },
);

it('preserves the live workspace when a foreign endpoint blocks removal', async () => {
  const docker = fakeDocker();
  const driver = new DockerSandboxDriver({
    docker,
    image: 'sandbox',
    namePrefix: 'sbx-',
    runtime: 'runsc',
    user: 'sandbox',
  });
  const handle = await driver.ensure({ ...spec, networkMode: 'egress' });
  const session = docker.state.containers.get(handle.id);
  docker.state.networks.get(session.create.HostConfig.NetworkMode).Containers.foreign = {
    IPv4Address: '172.30.0.99/24',
  };
  await expect(driver.destroy(handle)).rejects.toThrow();
  expect(session.remove).not.toHaveBeenCalled();
  expect(session.running).toBe(true);
});

describe('DockerSandboxDriver persistent user disks', () => {
  const userSpec = {
    ownerId: 'user-42',
    memoryMb: 1024,
    cpus: 1,
    pidsLimit: 256,
    networkMode: 'none',
    workspaceMaxBytes: 4096 * 1024 ** 2,
    persistent: true,
  };
  let docker: any;
  let disk: any;
  let calls: string[];
  let driver: DockerSandboxDriver;

  beforeEach(() => {
    docker = fakeDocker();
    calls = [];
    const createContainer = docker.createContainer;
    docker.createContainer = jest.fn(async (options: any) => {
      calls.push('create');
      return createContainer(options);
    });
    disk = {
      key: jest.fn((owner: string) => (owner === 'user-42' ? 'a'.repeat(32) : 'b'.repeat(32))),
      workspacePath: jest.fn(
        (owner: string) => `/var/lib/disks/sbx-/mnt/${disk.key(owner)}/workspace`,
      ),
      ensure: jest.fn(async (owner: string) => {
        calls.push('disk');
        return disk.workspacePath(owner);
      }),
      release: jest.fn(async () => undefined),
      releaseKey: jest.fn(async () => undefined),
      listMounted: jest.fn(async (): Promise<string[]> => []),
      usage: jest.fn(async () => ({
        workspaceBytes: 1,
        workspaceInodes: 1,
        freeBytes: 2,
        freeInodes: 2,
        scanComplete: true,
      })),
    };
    driver = new DockerSandboxDriver({
      docker,
      image: '99agent/sandbox:test',
      namePrefix: 'sbx-',
      user: 'sandbox',
      runtime: 'runsc',
      disk,
    });
  });

  it('binds only the user disk workspace with Mounts and keeps /tmp bounded', () => {
    expect(driver.persistentWorkspaces).toBe(true);
    const options = driver.buildCreateOptions(userSpec, docker.state.imageId);
    expect(options.HostConfig!.Mounts).toEqual([
      {
        Type: 'bind',
        Source: `/var/lib/disks/sbx-/mnt/${'a'.repeat(32)}/workspace`,
        Target: '/workspace',
        ReadOnly: false,
        BindOptions: { Propagation: 'rprivate' },
      },
    ]);
    expect(options.HostConfig!.Binds).toEqual([]);
    expect(Object.keys(options.HostConfig!.Tmpfs!)).toEqual(['/tmp']);
    expect(options.Labels!['99agent.sandbox.storage']).toBe('disk');
    const temporary = driver.buildCreateOptions(
      { ...userSpec, ownerId: 'visitor-v:conversation:1', persistent: false },
      docker.state.imageId,
    );
    expect(temporary.HostConfig!.Mounts).toBeUndefined();
    expect(temporary.Labels!['99agent.sandbox.storage']).toBeUndefined();
  });

  it('mounts the disk before creating the container and reuses the machine', async () => {
    const handle = await driver.ensure(userSpec);
    expect(calls).toEqual(['disk', 'create']);
    expect(disk.ensure).toHaveBeenCalledWith('user-42', 4096 * 1024 ** 2);
    expect(handle).toMatchObject({
      ownerId: 'user-42',
      persistent: true,
      resources: { memoryMb: 1024, cpus: 1 },
    });
    expect(handle.resources!.workspaceMaxBytes).toBeUndefined();
    expect(await driver.verify(handle, userSpec)).toBe('running');
    // 套餐磁盘变大不重建容器：容量在下次开机时扩容
    expect(await driver.verify(handle, { ...userSpec, workspaceMaxBytes: 8192 * 1024 ** 2 })).toBe(
      'running',
    );
    expect(await driver.ensure(userSpec)).toEqual(handle);
    expect(docker.createContainer).toHaveBeenCalledTimes(1);
  });

  it('refuses persistent specs when no user disk is configured', async () => {
    const plain = new DockerSandboxDriver({
      docker,
      image: '99agent/sandbox:test',
      namePrefix: 'sbx-',
      user: 'sandbox',
    });
    expect(plain.persistentWorkspaces).toBe(false);
    await expect(plain.ensure(userSpec)).rejects.toThrow('未配置用户磁盘');
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an extra bind',
      (mounts: any[]) => [
        ...mounts,
        { Type: 'bind', Source: '/etc', Destination: '/workspace/etc', RW: true },
      ],
    ],
    [
      'another user disk',
      (mounts: any[]) =>
        mounts.map(mount =>
          mount.Type === 'bind'
            ? { ...mount, Source: `/var/lib/disks/sbx-/mnt/${'b'.repeat(32)}/workspace` }
            : mount,
        ),
    ],
    [
      'a read-only bind',
      (mounts: any[]) =>
        mounts.map(mount => (mount.Type === 'bind' ? { ...mount, RW: false } : mount)),
    ],
    ['a missing bind', (mounts: any[]) => mounts.filter(mount => mount.Type !== 'bind')],
  ])('rejects a machine with %s', async (_label: string, change: (mounts: any[]) => any[]) => {
    const handle = await driver.ensure(userSpec);
    const container = docker.state.containers.get(handle.id);
    const info = await container.inspect();
    container.inspectOverrides = { Mounts: change(info.Mounts) };
    await expect(driver.verify(handle, userSpec)).rejects.toThrow('沙箱配置与当前基线不一致');
  });

  it('rejects a changed bind propagation or host mount source in the container config', async () => {
    const handle = await driver.ensure(userSpec);
    const container = docker.state.containers.get(handle.id);
    const info = await container.inspect();
    container.inspectOverrides = {
      HostConfig: {
        ...info.HostConfig,
        Mounts: [{ ...info.HostConfig.Mounts[0], Source: '/srv/elsewhere' }],
      },
    };
    await expect(driver.verify(handle, userSpec)).rejects.toThrow('沙箱配置与当前基线不一致');
    container.inspectOverrides = {
      HostConfig: {
        ...info.HostConfig,
        Mounts: [{ ...info.HostConfig.Mounts[0], BindOptions: { Propagation: 'rshared' } }],
      },
    };
    await expect(driver.verify(handle, userSpec)).rejects.toThrow('沙箱配置与当前基线不一致');
  });

  it('unmounts but never deletes the disk when the machine stops or is destroyed', async () => {
    const handle = await driver.ensure(userSpec);
    await driver.destroy(handle, { removeWorkspace: true });
    expect(disk.release).toHaveBeenCalledWith('user-42');
    expect(docker.state.containers.size).toBe(0);
    const again = await driver.ensure(userSpec);
    await driver.stop(again);
    expect(disk.release).toHaveBeenCalledTimes(2);
  });

  it('rolls back a fresh mount when container creation fails', async () => {
    docker.createContainer.mockRejectedValueOnce(new Error('create failed'));
    await expect(driver.ensure(userSpec)).rejects.toThrow('create failed');
    expect(disk.release).toHaveBeenCalledWith('user-42');
  });

  it('unmounts when the helper mounted the disk but then reported a failure', async () => {
    disk.ensure.mockRejectedValueOnce(new Error('workspace check failed after mount'));
    await expect(driver.ensure(userSpec)).rejects.toThrow('after mount');
    expect(docker.createContainer).not.toHaveBeenCalled();
    expect(disk.release).toHaveBeenCalledWith('user-42');
  });

  it('keeps a failed unmount for retry instead of failing the removal', async () => {
    const handle = await driver.ensure(userSpec);
    disk.release.mockRejectedValueOnce(new Error('busy'));
    await expect(driver.destroy(handle)).resolves.toBeUndefined();
    expect(docker.state.containers.size).toBe(0);
    expect(driver.pendingDiskReleases()).toEqual(['user-42']);
    await driver.retryDiskRelease('user-42');
    expect(disk.release).toHaveBeenCalledTimes(2);
    expect(driver.pendingDiskReleases()).toEqual([]);
    // 创建失败后卸载也失败：同样记入待重试
    docker.createContainer.mockRejectedValueOnce(new Error('create failed'));
    disk.release.mockRejectedValueOnce(new Error('busy'));
    await expect(driver.ensure(userSpec)).rejects.toThrow('create failed');
    expect(driver.pendingDiskReleases()).toEqual(['user-42']);
    // 再次成功开机即重新占用磁盘，不再卸载
    await driver.ensure(userSpec);
    expect(driver.pendingDiskReleases()).toEqual([]);
  });

  it('still unmounts old user disks after switching new machines to tmpfs', async () => {
    const handle = await driver.ensure(userSpec);
    const switched = new DockerSandboxDriver({
      docker,
      image: '99agent/sandbox:test',
      namePrefix: 'sbx-',
      user: 'sandbox',
      runtime: 'runsc',
      disk,
      persistentUsers: false,
    });
    expect(switched.persistentWorkspaces).toBe(false);
    await expect(switched.ensure(userSpec)).rejects.toThrow('未配置用户磁盘');
    await switched.destroy(handle);
    expect(disk.release).toHaveBeenCalledWith('user-42');
    disk.listMounted.mockResolvedValue(['c'.repeat(32)]);
    await switched.discover();
    expect(disk.releaseKey).toHaveBeenCalledWith('c'.repeat(32));
  });

  it('reports disk usage from the file system and discovers persistent machines', async () => {
    const handle = await driver.ensure(userSpec);
    expect(await driver.inspectResources(handle, 10)).toMatchObject({ scanComplete: true });
    expect(disk.usage).toHaveBeenCalledWith('user-42');
    disk.listMounted.mockResolvedValue(['a'.repeat(32), 'c'.repeat(32)]);
    const [found] = await driver.discover();
    expect(found).toMatchObject({ id: handle.id, ownerId: 'user-42', persistent: true });
    // 只卸载没有容器的遗留挂载，而且只在首次发现时做
    expect(disk.releaseKey).toHaveBeenCalledTimes(1);
    expect(disk.releaseKey).toHaveBeenCalledWith('c'.repeat(32));
    await driver.discover();
    expect(disk.listMounted).toHaveBeenCalledTimes(1);
  });
});
